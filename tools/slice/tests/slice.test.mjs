/**
 * Tests for the slice machinery: validation, budget and scope, decision extraction, summaries, the report's status and rendering, and the command line on a toy repository.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ALWAYS_ALLOWED, BLOCKED, INCOMPLETE, REVIEW, STOP_CONDITIONS, budgetCheck, decisionSection, fitDelta, fitDispositions, parseNumstat, pendingFor, phoneSummary, renderContext, renderReport, statusOf, stopsMet, toolsSummary, validateSlice } from "../lib.mjs";

const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "cli.mjs");
const slice = () => ({
  id: "TEST-A", title: "A test slice", design: "docs/DESIGN.md", base: "HEAD", decisions: ["DR-1"], scenarios: ["T-001"], invariants: ["I-001"],
  scope: { files: ["src/**"] }, budget: { maxFiles: 3, maxLines: 100, maxFailedRuns: 3 }, required: ["phone"], limitations: ["a known limit"],
});

test("a slice file needs an id, a design, a base, decisions, scenarios, invariants, a scope and a positive budget", () => {
  assert.deepEqual(validateSlice(slice()), []);
  for (const [field, value, pattern] of [["id", "bad id", /id must/], ["design", "", /design/], ["base", undefined, /base/], ["decisions", ["x"], /decisions/], ["scenarios", "T-001", /scenarios/],
    ["invariants", undefined, /invariants/], ["scope", { files: [] }, /scope/], ["budget", { maxFiles: 0, maxLines: 5, maxFailedRuns: 3 }, /maxFiles/], ["required", ["magic"], /required/]]) {
    assert.match(validateSlice({ ...slice(), [field]: value }).join(), pattern, field);
  }
});

test("parseNumstat reads added and removed lines and counts a binary file as a file with no lines", () => {
  assert.deepEqual(parseNumstat("3\t1\tsrc/a.java\n-\t-\tx.apk\n\n10\t0\tdir/with space.md\n"), [
    { file: "src/a.java", added: 3, removed: 1 }, { file: "x.apk", added: 0, removed: 0 }, { file: "dir/with space.md", added: 10, removed: 0 },
  ]);
});

test("the budget counts files and lines, ignores generated files, and names every file outside the scope", () => {
  const gen = (f) => f.endsWith(".apk");
  const ok = budgetCheck([{ file: "src/a", added: 10, removed: 5 }, { file: "orb.apk", added: 0, removed: 0 }], slice(), gen);
  assert.deepEqual([ok.files, ok.lines, ok.ok], [1, 15, true]);
  const edge = budgetCheck([1, 2, 3].map((i) => ({ file: `src/${i}`, added: 50, removed: 0 })).slice(0, 2).concat([{ file: "src/3", added: 0, removed: 0 }]), slice(), gen);
  assert.deepEqual([edge.files, edge.lines, edge.ok], [3, 100, true], "exactly the budget is within it");
  assert.equal(budgetCheck([1, 2, 3, 4].map((i) => ({ file: `src/${i}`, added: 1, removed: 0 })), slice(), gen).over[0], "files 4 > 3");
  assert.equal(budgetCheck([{ file: "src/a", added: 99, removed: 2 }], slice(), gen).over[0], "lines 101 > 100");
  const stray = budgetCheck([{ file: "elsewhere/x", added: 1, removed: 0 }, { file: "src/y", added: 1, removed: 0 }], slice(), gen);
  assert.deepEqual(stray.outside, ["elsewhere/x"]);
  assert.equal(stray.ok, false);
  for (const f of ["artifacts/reports/x.md", "docs/slices/TEST-A.json", "docs/scenarios/m.json", "docs/DECISIONS.md", "tools/mutate/lists/x.json"]) {
    assert.equal(budgetCheck([{ file: f, added: 1, removed: 0 }], slice(), gen).outside.length, 0, f);
  }
  assert.ok(ALWAYS_ALLOWED.length > 0);
  assert.equal(budgetCheck([{ file: "extra/z", added: 1, removed: 0 }], { ...slice(), scope: { files: ["src/**"], alsoAllowed: ["extra/**"] } }, gen).outside.length, 0);
});

const DECISIONS = "# D\n\n## DR-10 — ten\n\nbody ten\n\n## DR-1 — one\n\nbody one\n\n## DR-2 — two\n\nlast\n";
test("a decision's section runs from its heading to the next, DR-1 is not DR-10, and a missing one is null", () => {
  assert.equal(decisionSection(DECISIONS, "DR-1"), "## DR-1 — one\n\nbody one");
  assert.equal(decisionSection(DECISIONS, "DR-10"), "## DR-10 — ten\n\nbody ten");
  assert.equal(decisionSection(DECISIONS, "DR-2"), "## DR-2 — two\n\nlast");
  assert.equal(decisionSection(DECISIONS, "DR-99"), null);
});

test("pending decisions are found by the slice they name, and only among the open ones", () => {
  const md = "# P\n\n```\n## PD-000 — example\n- **Slice:** TEST-A\n```\n\n## Open\n\n## PD-001 — first\n\n- **Slice:** TEST-A\n\n## PD-002 — second\n\n- **Slice:** OTHER\n\n## PD-003 — third\n\n- **Slice:** TEST-A\n";
  assert.deepEqual(pendingFor(md, "TEST-A"), [{ id: "PD-001", title: "first" }, { id: "PD-003", title: "third" }]);
  assert.deepEqual(pendingFor(md, "NONE"), []);
  assert.deepEqual(pendingFor(md.replace(/TEST-A/g, "TEST-AB"), "TEST-A"), [], "a slice id is not a prefix match");
  assert.deepEqual(pendingFor("# P\n\n## Open\n\n*(none)*\n", "TEST-A"), []);
});

test("suite summaries and the fit dispositions are read from the tools' own output", () => {
  assert.deepEqual(phoneSummary("noise\n  3314 checks, 2 failed\n"), { checks: 3314, failed: 2 });
  assert.equal(phoneSummary("nothing"), null);
  assert.deepEqual(toolsSummary("ℹ tests 24\nℹ suites 0\nℹ pass 23\nℹ fail 1\n"), { checks: 24, failed: 1 });
  assert.equal(toolsSummary("nothing"), null);
  const fit = fitDispositions("dispositions LOOP=1379  CLOSURE_CANDIDATE=20  LEDGER_ONLY=6074  NOT_A_LOOP=11997  AMBIGUOUS=119  UNMAPPABLE=4044  sum 23633 of 23633 ok  (coverage)\n");
  assert.deepEqual(fit, { counts: { LOOP: 1379, CLOSURE_CANDIDATE: 20, LEDGER_ONLY: 6074, NOT_A_LOOP: 11997, AMBIGUOUS: 119, UNMAPPABLE: 4044 }, total: 23633 });
  assert.equal(fitDispositions("no such line"), null);
  assert.deepEqual(fitDelta({ counts: { A: 5, B: 1 } }, { counts: { A: 7, C: 2 } }), { A: 2, B: -1, C: 2 });
  assert.equal(fitDelta(null, fit), null);
});

const governance = (extra = {}) => ({ files: 2, byClass: { DOMAIN: 2 }, unapproved: [], approved: [], generated: [], unclassified: [], selfGoverning: [], ok: true, ...extra });
const model = (extra = {}) => ({
  slice: slice(), head: "abc1234", base: "def5678", dirty: false, date: "2026-10-04",
  changes: [{ file: "src/a", added: 10, removed: 2 }], budget: { files: 1, lines: 12, outside: [], over: [], ok: true }, governance: governance(),
  permissions: { added: [], removed: [], changed: false }, suites: { phone: { checks: 10, failed: 0 }, tools: null }, suitesRun: true,
  scenarios: { derived: [{ id: "T-001", state: "tested", risk: "high" }, { id: "T-002", state: "draft", risk: "low" }], inSlice: ["T-001"], privacy: ["T-001"] },
  impact: { threatened: [{ id: "I-001", statement: "a law", heldBy: 1, held: true }], affected: [{ id: "T-001" }] },
  mutation: { killed: 5, alive: 0, equivalent: 1, missing: 0, invalid: 0, total: 6 }, fit: { counts: { LOOP: 3, LEDGER_ONLY: 2 }, total: 5 }, fitDelta: { LOOP: 0, LEDGER_ONLY: 0 },
  supplied: ["phone", "mutation", "fit"], required: ["phone"], pending: [], stops: [], ...extra,
});

test("status: BLOCKED for anything the slice must not ship with, INCOMPLETE for proof not supplied, otherwise review required — never ready", () => {
  assert.equal(statusOf(model()).status, REVIEW);
  assert.equal(statusOf(model({ budget: { files: 9, lines: 1, outside: [], over: ["files 9 > 3"], ok: false } })).status, BLOCKED);
  assert.equal(statusOf(model({ budget: { files: 1, lines: 1, outside: ["x"], over: [], ok: false } })).status, BLOCKED);
  assert.equal(statusOf(model({ governance: governance({ unapproved: [{ file: "f", class: "PROTOCOL", gate: "PROTOCOL_APPROVAL" }] }) })).status, BLOCKED);
  assert.equal(statusOf(model({ suites: { phone: { checks: 10, failed: 1 }, tools: null } })).status, BLOCKED);
  assert.equal(statusOf(model({ mutation: { killed: 5, alive: 1, equivalent: 0, missing: 0, invalid: 0, total: 6 } })).status, BLOCKED);
  assert.equal(statusOf(model({ mutation: { killed: 5, alive: 0, equivalent: 0, missing: 1, invalid: 0, total: 6 } })).status, BLOCKED);
  assert.equal(statusOf(model({ permissions: { added: ["x"], removed: [], changed: true } })).status, BLOCKED);
  const failing = model();
  failing.scenarios.derived[0].state = "regressed";
  assert.equal(statusOf(failing).status, BLOCKED);
  assert.equal(statusOf(model({ impact: { threatened: [{ id: "I-9", statement: "s", heldBy: 0, held: false }], affected: [] } })).status, BLOCKED);
  assert.equal(statusOf(model({ impact: { threatened: [{ id: "I-9", statement: "s", heldBy: 1, held: false }], affected: [] } })).status, BLOCKED);
  const unrun = statusOf(model({ suitesRun: false, impact: { threatened: [{ id: "I-9", statement: "s", heldBy: 1, held: false }], affected: [] } }));
  assert.equal(unrun.status, REVIEW, "held-ness cannot fail when no suite was supplied; the missing proof is INCOMPLETE's job");
  const incomplete = statusOf(model({ required: ["phone", "tools", "fit"], supplied: ["phone", "fit"] }));
  assert.deepEqual([incomplete.status, incomplete.reasons], [INCOMPLETE, ["required proof not supplied: tools"]]);
  assert.equal(statusOf(model({ budget: { files: 9, lines: 1, outside: [], over: ["x"], ok: false }, required: ["tools"], supplied: [] })).status, BLOCKED, "blocked outranks incomplete");
});

test("review-required says why: self-governing files, open decisions, draft scenarios in the slice", () => {
  const m = model({ governance: governance({ selfGoverning: ["docs/APPROVALS.json"] }), pending: [{ id: "PD-001", title: "q" }] });
  m.scenarios.inSlice = ["T-001", "T-002"];
  const s = statusOf(m);
  assert.equal(s.status, REVIEW);
  assert.deepEqual(s.reasons, ["1 self-governing file(s) changed", "1 open decision(s)", "1 draft scenario(s) in this slice"]);
});

test("stop conditions are met by an unapproved protocol change, a new permission, and an unexplained fit change", () => {
  assert.deepEqual(stopsMet(model({ fitDelta: { LOOP: 0 } })), []);
  assert.deepEqual(stopsMet(model({ governance: governance({ unapproved: [{ class: "PROTOCOL" }] }) })), [STOP_CONDITIONS[1]]);
  assert.deepEqual(stopsMet(model({ governance: governance({ unapproved: [{ class: "DOMAIN" }] }) })), []);
  assert.deepEqual(stopsMet(model({ permissions: { added: ["a"], removed: [], changed: true } })), [STOP_CONDITIONS[3]]);
  assert.deepEqual(stopsMet(model({ fitDelta: { LOOP: 2 } })), [STOP_CONDITIONS[6]]);
  assert.deepEqual(stopsMet({ ...model({ fitDelta: { LOOP: 2 } }), slice: { ...slice(), expectFitChange: true } }), []);
  assert.deepEqual(stopsMet(model({ fitDelta: { LOOP: 0 } })), []);
});

test("the report states the status first, then what changed, gates, scenarios, invariants, proof, fit, permissions, privacy, decisions, stops and limits", () => {
  const text = renderReport(model({ fitDelta: { LOOP: 1, LEDGER_ONLY: 0 } }));
  for (const heading of ["# Change report — TEST-A: A test slice", "**Status: REVIEW REQUIRED**", "## What changed", "## Gates", "## Scenarios", "## Invariants", "## Proof", "## Fit", "## Permissions", "## Privacy", "## Decisions", "## Stop conditions", "## Known limitations"]) {
    assert.ok(text.includes(heading), heading);
  }
  assert.ok(text.includes("Files 1 · lines +10 −2"));
  assert.ok(text.includes("High-risk proven 1/1"));
  assert.ok(text.includes("Phone suite: 10 checks, 0 failed"));
  assert.ok(text.includes("Tool tests: NOT SUPPLIED"));
  assert.ok(text.includes("Mutation: killed 5 · alive 0 · equivalent 1 · missing 0 · invalid 0 of 6"));
  assert.ok(text.includes("LOOP +1 · LEDGER_ONLY 0"));
  assert.ok(text.includes("- a known limit"));
  assert.ok(text.includes("a design conflict: not met"));
  assert.equal(renderReport(model({ fitDelta: { LOOP: 1, LEDGER_ONLY: 0 } })), text, "the same inputs give the same report");
});

test("a blocked report names the blocker, an unsupplied proof is shown as such, a permission change lists the entries", () => {
  const text = renderReport(model({ fit: null, fitDelta: null, mutation: null, permissions: { added: ["<uses-permission INTERNET>"], removed: [], changed: true }, stops: [STOP_CONDITIONS[3]],
    governance: governance({ unapproved: [{ file: "docs/X.md", class: "PROTOCOL", gate: "PROTOCOL_APPROVAL" }], selfGoverning: ["docs/APPROVALS.json"] }) }));
  assert.ok(text.includes("**Status: BLOCKED**"));
  assert.ok(text.includes("UNAPPROVED PROTOCOL docs/X.md needs PROTOCOL_APPROVAL"));
  assert.ok(text.includes("Mutation: NOT SUPPLIED"));
  assert.ok(text.includes("## Fit\n- NOT SUPPLIED"));
  assert.ok(text.includes("CHANGED: added 1, removed 0\n  - + <uses-permission INTERNET>"));
  assert.ok(text.includes("a new permission, feature or query: MET"));
  assert.ok(text.includes("SELF-GOVERNING docs/APPROVALS.json"));
});

test("the context pack holds the slice's documents and says to stop rather than widen", () => {
  const pack = renderContext(slice(), { design: "THE DESIGN", decisions: { "DR-1": "## DR-1\n\nbody", "DR-7": null }, invariants: [{ id: "I-001" }], scenarios: [{ id: "T-001" }], classes: ["DOMAIN: no gate — x"], pending: [{ id: "PD-001", title: "q" }], files: ["src/a"] });
  for (const piece of ["Context pack — TEST-A", "do not widen your reading", "THE DESIGN", "## Decision DR-1", "(not found in DECISIONS.md)", '"I-001"', '"T-001"', "DOMAIN: no gate", "PD-001 — q", "- src/a", ...STOP_CONDITIONS]) {
    assert.ok(pack.includes(piece), piece);
  }
});

function toyRepo() {
  const dir = mkdtempSync(join(tmpdir(), "orb-slice-"));
  const git = (...a) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd: dir, stdio: "ignore" });
  git("init", "-q");
  for (const d of ["docs/invariants", "docs/scenarios", "docs/slices", "src"]) mkdirSync(join(dir, d), { recursive: true });
  writeFileSync(join(dir, "docs/DESIGN.md"), "# the design\n");
  writeFileSync(join(dir, "docs/DECISIONS.md"), DECISIONS);
  writeFileSync(join(dir, "docs/FILE_CLASSES.json"), JSON.stringify({
    classes: { PROTOCOL: { gate: "PROTOCOL_APPROVAL" }, GENERATED: { gate: null }, DOMAIN: { gate: null } },
    rules: [{ glob: "docs/DESIGN.md", class: "PROTOCOL" }, { glob: "artifacts/**", class: "GENERATED" }, { glob: "**", class: "DOMAIN" }], selfGoverning: ["docs/APPROVALS.json"] }));
  writeFileSync(join(dir, "docs/APPROVALS.json"), JSON.stringify({ approvals: [] }));
  writeFileSync(join(dir, "docs/invariants/INVARIANTS.json"), JSON.stringify({ invariants: [{ id: "I-001", statement: "a law", source: "x", threatenedBy: ["src/**"], heldBy: [{ suite: "phone", check: "it holds" }] }] }));
  writeFileSync(join(dir, "docs/scenarios/t.json"), JSON.stringify({ domain: "T", scenarios: [{ id: "T-001", name: "a scenario", category: "happy", risk: "high", invariants: ["I-001"], files: ["src/**"], given: ["g"], when: ["w"], then: ["t"], mustNot: ["m"], proof: [{ suite: "phone", check: "it holds" }] }] }));
  writeFileSync(join(dir, "docs/slices/TEST-A.json"), JSON.stringify(slice()));
  writeFileSync(join(dir, "src/a.txt"), "one\n");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  return { dir, git };
}
const run = (dir, ...args) => spawnSync("node", [cli, ...args, "--root", dir], { encoding: "utf8" });
const aux = (dir) => {
  const a = `${dir}-aux`;
  mkdirSync(a, { recursive: true });
  return a;
};
const PHONE_OK = "  g\n    ok   it holds\n\n  1 checks, 0 failed\n";

test("the command line: context writes the pack; budget passes inside the scope and fails outside it", () => {
  const { dir } = toyRepo();
  try {
    const out = join(aux(dir), "pack.md");
    assert.equal(run(dir, "context", "TEST-A", "--out", out).status, 0);
    const pack = readFileSync(out, "utf8");
    assert.ok(pack.includes("# the design") && pack.includes("## Decision DR-1") && pack.includes("body one") && pack.includes("a scenario") && pack.includes("- src/a.txt"));
    writeFileSync(join(dir, "src/a.txt"), "one\ntwo\n");
    const ok = run(dir, "budget", "TEST-A");
    assert.equal(ok.status, 0, ok.stdout);
    assert.match(ok.stdout, /files 1\/3 · lines 1\/100 · outside scope 0/);
    writeFileSync(join(dir, "stray.txt"), "x\n");
    const bad = run(dir, "budget", "TEST-A");
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /OUTSIDE stray\.txt/);
    assert.equal(run(dir, "budget", "NOPE").status, 2);
    assert.equal(run(dir, "wrong", "TEST-A").status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(`${dir}-aux`, { recursive: true, force: true });
  }
});

test("the command line: a report is written for the commit, says what is missing, and a commit's report is never overwritten", () => {
  const { dir, git } = toyRepo();
  try {
    writeFileSync(join(dir, "src/a.txt"), "one\ntwo\n");
    writeFileSync(join(aux(dir), "phone.out"), PHONE_OK);
    const first = run(dir, "report", "TEST-A", "--suite", `phone=${join(aux(dir), "phone.out")}`);
    assert.equal(first.status, 0, first.stdout + first.stderr);
    assert.match(first.stdout, /^REVIEW REQUIRED — artifacts\/reports\/TEST-A-[0-9a-f]+-dirty\.md/);
    const [name] = readdirSync(join(dir, "artifacts/reports"));
    const text = readFileSync(join(dir, "artifacts/reports", name), "utf8");
    assert.ok(text.includes("Phone suite: 1 checks, 0 failed") && text.includes("TEST-A: A test slice") && text.includes("T-001 tested") && text.includes("I-001 held"));
    assert.equal(run(dir, "report", "TEST-A", "--suite", `phone=${join(aux(dir), "phone.out")}`).status, 0, "a dirty report may be rewritten");
    git("add", "-A");
    git("commit", "-q", "-m", "work");
    const clean = run(dir, "report", "TEST-A", "--base", "HEAD~1", "--suite", `phone=${join(aux(dir), "phone.out")}`);
    assert.equal(clean.status, 0, clean.stdout + clean.stderr);
    assert.ok(existsSync(join(dir, "artifacts/reports")) && readdirSync(join(dir, "artifacts/reports")).some((n) => !n.includes("dirty")));
    const again = run(dir, "report", "TEST-A", "--base", "HEAD~1", "--suite", `phone=${join(aux(dir), "phone.out")}`);
    assert.equal(again.status, 2);
    assert.match(again.stderr, /never overwritten/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(`${dir}-aux`, { recursive: true, force: true });
  }
});

test("the command line: a failing suite and an unapproved protocol edit block the report; a missing required proof makes it incomplete", () => {
  const { dir } = toyRepo();
  try {
    writeFileSync(join(dir, "src/a.txt"), "one\ntwo\n");
    writeFileSync(join(aux(dir), "phone.out"), "  g\n    FAIL it holds\n\n  1 checks, 1 failed\n");
    const failing = run(dir, "report", "TEST-A", "--suite", `phone=${join(aux(dir), "phone.out")}`);
    assert.equal(failing.status, 1);
    assert.match(failing.stdout, /^BLOCKED/);
    writeFileSync(join(aux(dir), "phone.out"), PHONE_OK);
    writeFileSync(join(dir, "docs/DESIGN.md"), "# changed\n");
    const gated = run(dir, "report", "TEST-A", "--suite", `phone=${join(aux(dir), "phone.out")}`);
    assert.equal(gated.status, 1);
    assert.match(gated.stdout, /gated change\(s\) without an approval record/);
    writeFileSync(join(dir, "docs/DESIGN.md"), "# the design\n");
    const none = run(dir, "report", "TEST-A");
    assert.match(none.stdout, /^(BLOCKED|INCOMPLETE)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(`${dir}-aux`, { recursive: true, force: true });
  }
});
