/**
 * Tests for the export analyser, on synthetic exports built with a real hash chain. No real export is read.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, chain, typeCounts, builds, faults, latestReports, payloadKeys, tally, diff, check } from "../lib.mjs";

const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "analyse.mjs");
const canon = (v) =>
  Array.isArray(v) ? `[${v.map(canon).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}` : JSON.stringify(v);
const sha = (s) => createHash("sha256").update(s).digest("hex");

/** Builds events with a valid chain from [type, payload] pairs. */
function journal(pairs) {
  let previous = null;
  return pairs.map(([type, payload], i) => {
    const hash = sha(`${i}:${type}:${previous}`);
    const e = { type, payload, integrity: { hash, payloadHash: sha(canon(payload)), previous } };
    previous = hash;
    return e;
  });
}
const text = (events) => events.map((e) => JSON.stringify(e)).join("\n") + "\n";
const SECRET = "SECRETVALUE-do-not-print";

const sample = () =>
  journal([
    ["orb.process.start", { versionCode: 10 }],
    ["orb.sender.judged", { key: "abc", verdict: "quiet", note: SECRET }],
    ["orb.process.start", { versionCode: 11 }],
    ["orb.loop.fit.reported", { opens: 3, closes: 2, note: SECRET }],
    ["orb.loop.fit.reported", { opens: 5, closes: 4 }],
    ["orb.fault.caught", { where: SECRET }],
  ]);

test("parse keeps events and counts, never quotes, what it cannot read", () => {
  const r = parse(text(sample()) + "not json\n{\"no\":\"type\"}\n   \n\n");
  assert.equal(r.events.length, 6);
  assert.equal(r.unparseable, 2);
});

test("a clean chain verifies; a removed event, a swapped one and an edited payload are each caught", () => {
  const events = sample();
  assert.deepEqual(chain(events), { events: 6, linkBreaks: 0, payloadMismatches: 0, sealed: 0, ok: true });
  const removed = events.filter((_, i) => i !== 2);
  assert.equal(chain(removed).linkBreaks, 1);
  assert.equal(chain(removed).ok, false);
  const swapped = [events[0], events[2], events[1], ...events.slice(3)];
  assert.ok(chain(swapped).linkBreaks >= 1);
  const edited = structuredClone(events);
  edited[1].payload.verdict = "clear";
  assert.equal(chain(edited).payloadMismatches, 1);
  assert.equal(chain(edited).linkBreaks, 0);
  assert.equal(chain(edited).ok, false);
});

test("a sealed payload is counted, not judged", () => {
  const events = sample();
  events[1] = { ...events[1], payload: { sealed: true } };
  const c = chain(events);
  assert.equal(c.sealed, 1);
  assert.equal(c.payloadMismatches, 0);
});

test("an export that does not begin at the start of a lane still reports its first link as broken", () => {
  assert.equal(chain(sample().slice(2)).linkBreaks, 1);
});

test("counts by type, builds in order without repeats, and fault counts", () => {
  const events = sample();
  events.push(...journal([["orb.process.start", { versionCode: 11 }], ["orb.process.start", { versionCode: "not a number" }], ["orb.process.crashed", {}], ["orb.process.crashed", {}]]));
  // (the appended chain restarts; typeCounts does not care about links)
  assert.equal(typeCounts(events)["orb.process.start"], 4);
  assert.deepEqual(builds(events), [10, 11]);
  assert.deepEqual(faults(events), { crashed: 2, caught: 1 });
  assert.deepEqual(Object.keys(typeCounts(events)), Object.keys(typeCounts(events)).sort());
});

test("only the latest numeric report is shown, only its numbers, and only for types on the closed list", () => {
  const r = latestReports(sample());
  assert.deepEqual(r, { "orb.loop.fit.reported": { opens: 5, closes: 4 } });
  const withText = sample();
  withText.push(...journal([["orb.loop.fit.reported", { opens: 1, label: SECRET }]]));
  assert.ok(!JSON.stringify(latestReports(withText)).includes(SECRET));
  assert.throws(() => latestReports(sample(), ["orb.sender.judged"]), /not a numeric report/);
});

test("payloadKeys names fields and never values", () => {
  const keys = payloadKeys(sample(), "orb.sender.judged");
  assert.deepEqual(keys, ["key", "note", "verdict"]);
});

test("diff reports per-type changes and new builds, and nothing that did not change", () => {
  const a = sample();
  const b = journal([...a.map((e) => [e.type, e.payload]), ["orb.sender.judged", {}], ["orb.process.start", { versionCode: 12 }]]);
  const d = diff(a, b);
  assert.equal(d.added, 2);
  assert.deepEqual(d.changed, { "orb.process.start": 1, "orb.sender.judged": 1 });
  assert.deepEqual(d.newBuilds, [12]);
  assert.deepEqual(diff(a, a).changed, {});
});

test("check enforces min and max, each optional, and fails when any one fails", () => {
  const events = sample();
  const r = check(events, { checks: [
    { id: "P1", type: "orb.process.start", min: 2, max: 2 },
    { id: "P2", type: "orb.sender.judged", min: 1 },
    { id: "P3", type: "orb.process.crashed", max: 0 },
  ] });
  assert.equal(r.ok, true);
  assert.equal(check(events, { checks: [{ id: "P4", type: "orb.process.start", max: 1 }] }).ok, false);
  assert.equal(check(events, { checks: [{ id: "P5", type: "orb.process.crashed", min: 1 }] }).ok, false);
  assert.equal(check(events, {}).ok, true);
});

test("the command line: summary exits 0, a broken chain exits 1, an unreadable file exits 2, and no payload value is printed", () => {
  const dir = mkdtempSync(join(tmpdir(), "orb-export-"));
  try {
    const good = join(dir, "good.txt");
    writeFileSync(good, text(sample()));
    const ok = spawnSync("node", [cli, good], { encoding: "utf8" });
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /chain ok/);
    assert.match(ok.stdout, /builds 2, latest 11/);
    assert.ok(!ok.stdout.includes(SECRET), "a payload value was printed");

    const bad = join(dir, "bad.txt");
    writeFileSync(bad, text(sample().filter((_, i) => i !== 1)));
    const broken = spawnSync("node", [cli, bad], { encoding: "utf8" });
    assert.equal(broken.status, 1);
    assert.match(broken.stdout, /chain BROKEN/);

    assert.equal(spawnSync("node", [cli, join(dir, "missing.txt")], { encoding: "utf8" }).status, 2);
    const empty = join(dir, "empty.txt");
    writeFileSync(empty, "");
    assert.equal(spawnSync("node", [cli, empty], { encoding: "utf8" }).status, 2);
    assert.equal(spawnSync("node", [cli], { encoding: "utf8" }).status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the command line: --check exits 1 on a failed prediction, --since and --keys print counts and names", () => {
  const dir = mkdtempSync(join(tmpdir(), "orb-export-"));
  try {
    const all = journal([["orb.process.start", { versionCode: 10 }], ["orb.sender.judged", { key: "abc", verdict: "quiet", note: SECRET }], ["orb.sender.judged", {}]]);
    const earlier = join(dir, "a.txt");
    const later = join(dir, "b.txt");
    writeFileSync(earlier, text(all.slice(0, 2)));
    writeFileSync(later, text(all));
    const preds = join(dir, "p.json");
    writeFileSync(preds, JSON.stringify({ checks: [{ id: "P9", type: "orb.sender.judged", min: 5 }] }));
    const failing = spawnSync("node", [cli, later, "--check", preds], { encoding: "utf8" });
    assert.equal(failing.status, 1);
    assert.match(failing.stdout, /FAIL P9/);
    const since = spawnSync("node", [cli, later, "--since", earlier], { encoding: "utf8" });
    assert.equal(since.status, 0);
    assert.match(since.stdout, /\+1 orb\.sender\.judged/);
    const keys = spawnSync("node", [cli, later, "--keys", "orb.sender.judged"], { encoding: "utf8" });
    assert.equal(keys.stdout.trim(), "key note verdict");
    assert.ok(!keys.stdout.includes(SECRET));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("tally counts closed-vocabulary values and only the number of distinct values of anything else", () => {
  const events = [
    { type: "x.judged", payload: { verdict: "paid", missed: false, obligation: "aaaa", sender: "SECRETBANK" } },
    { type: "x.judged", payload: { verdict: "paid", missed: true, obligation: "bbbb", sender: "SECRETBANK" } },
    { type: "x.judged", payload: { verdict: "notThis", missed: false, obligation: "bbbb", sender: "OTHER" } },
    { type: "y.other", payload: { verdict: "ignored" } },
  ];
  const t = tally(events, "x.judged");
  assert.deepEqual(t.verdict, { paid: 2, notThis: 1 });
  assert.deepEqual(t.missed, { false: 2, true: 1 });
  assert.equal(t.obligation, "2 distinct");
  assert.equal(t.sender, "2 distinct");
  assert.ok(!JSON.stringify(t).includes("SECRET"));
  assert.ok(!JSON.stringify(t).includes("ignored"));
  const sneaky = tally([{ type: "x", payload: { verdict: "a free text sentence with spaces" } }], "x");
  assert.equal(sneaky.verdict, "1 distinct");
});
