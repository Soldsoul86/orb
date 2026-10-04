/**
 * Tests for the scenario and invariant registries' tooling: parsing suite output, the derived state, validation, impact, and the command line on a toy repository.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DRAFT, FAILING, REGRESSED, TESTED, UNPROVEN, derive, globToRegExp, impact, indexSuites, normalise, parseSuite, stateOf, summarise, touches, validateInvariants, validateScenarios } from "../lib.mjs";

const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "cli.mjs");
const realRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const PHONE = `
  a group
    ok   first check
    ok   second check · with a dot
    FAIL third check
           expected: 1
           actual:   2
  another group
    ok   first check

  12 checks, 1 failed
    - a group / third check
`.replace("·", "?");
const TOOLS = `✔ tool one (1.2ms)\n✖ tool two (0.4ms)\nℹ tests 2\n✔ tool three (10ms)\n`;

test("normalise compares names as the phone prints them: any non-ASCII character is a question mark", () => {
  assert.equal(normalise("a · b — c"), "a ? b ? c");
  assert.equal(normalise("  spaced   out "), "spaced out");
});

test("parseSuite reads the phone harness, with groups, passes and failures, and ignores its summary", () => {
  const r = parseSuite("phone", PHONE);
  assert.deepEqual(r.map((x) => [x.group, x.name, x.ok]), [
    ["a group", "first check", true], ["a group", "second check ? with a dot", true], ["a group", "third check", false], ["another group", "first check", true],
  ]);
});

test("a summary line is not a group: a check after it keeps the group it was in", () => {
  const r = parseSuite("phone", "  g\n    ok   a\n\n  5 checks, 0 failed\n    ok   b\n");
  assert.deepEqual(r.map((x) => [x.group, x.name]), [["g", "a"], ["g", "b"]]);
});

test("parseSuite reads the node spec reporter", () => {
  assert.deepEqual(parseSuite("tools", TOOLS).map((x) => [x.name, x.ok]), [["tool one", true], ["tool two", false], ["tool three", true]]);
  assert.throws(() => parseSuite("elsewhere", ""), /unknown suite/);
});

const suites = () => indexSuites({ phone: PHONE, tools: TOOLS });
const scen = (proof, extra = {}) => ({ id: "X-001", name: "n", risk: "high", proof, ...extra });

test("state is derived: draft with no proof, tested when every named check ran and passed", () => {
  assert.equal(stateOf(scen([]), suites()).state, DRAFT);
  assert.equal(stateOf(scen(undefined), suites()).state, DRAFT);
  assert.equal(stateOf(scen([{ suite: "phone", check: "first check" }, { suite: "tools", check: "tool one" }]), suites()).state, TESTED);
});

test("a failing proof fails the scenario; a proof that did not run leaves it unproven; both say which", () => {
  const failing = stateOf(scen([{ suite: "phone", check: "first check" }, { suite: "phone", check: "third check" }]), suites());
  assert.equal(failing.state, FAILING);
  assert.deepEqual(failing.failing, ["third check"]);
  const gone = stateOf(scen([{ suite: "phone", check: "first check" }, { suite: "phone", check: "deleted check" }]), suites());
  assert.equal(gone.state, UNPROVEN);
  assert.deepEqual(gone.missing, ["deleted check"]);
  assert.equal(stateOf(scen([{ suite: "tools", check: "tool one" }]), indexSuites({ phone: PHONE })).state, UNPROVEN, "a suite that was not run proves nothing");
  assert.equal(stateOf(scen([{ suite: "phone", check: "third check" }, { suite: "phone", check: "deleted check" }]), suites()).state, FAILING, "failing outranks unproven");
});

test("a group disambiguates a check name; the same name in two groups must all pass", () => {
  assert.equal(stateOf(scen([{ suite: "phone", group: "another group", check: "first check" }]), suites()).state, TESTED);
  assert.equal(stateOf(scen([{ suite: "phone", group: "nowhere", check: "first check" }]), suites()).state, UNPROVEN);
  const dup = indexSuites({ phone: "  g1\n    ok   same\n  g2\n    FAIL same\n" });
  assert.equal(stateOf(scen([{ suite: "phone", check: "same" }]), dup).state, FAILING);
});

test("a skipped or renamed test is a missing proof, not a pass", () => {
  assert.equal(stateOf(scen([{ suite: "phone", check: "first check (renamed)" }]), suites()).state, UNPROVEN);
});

test("regressed means tested before and not now; draft is never regressed", () => {
  const broken = scen([{ suite: "phone", check: "third check" }]);
  assert.equal(stateOf(broken, suites(), TESTED).state, REGRESSED);
  assert.equal(stateOf(broken, suites(), undefined).state, FAILING);
  assert.equal(stateOf(broken, suites(), FAILING).state, FAILING);
  assert.equal(stateOf(scen([]), suites(), TESTED).state, DRAFT);
});

test("summarise counts states and the share of high-risk scenarios proven; only failing, unproven or regressed make it not ok", () => {
  const d = derive([
    scen([{ suite: "phone", check: "first check" }], { id: "A-001" }),
    scen([], { id: "A-002", risk: "low" }),
    scen([{ suite: "phone", check: "third check" }], { id: "A-003" }),
    scen([{ suite: "phone", check: "nope" }], { id: "A-004", risk: "medium" }),
  ], suites());
  const s = summarise(d);
  assert.deepEqual([s.total, s.tested, s.draft, s.failing, s.unproven, s.regressed, s.high, s.highTested, s.ok], [4, 1, 1, 1, 1, 0, 2, 1, false]);
  assert.equal(summarise(d.filter((x) => x.state === TESTED || x.state === DRAFT)).ok, true, "drafts alone do not fail the check");
});

const goodInv = { id: "I-001", statement: "s", source: "x", threatenedBy: ["a/**"], heldBy: [{ suite: "phone", check: "c" }] };
const goodScenario = { id: "M-001", name: "n", category: "happy", risk: "high", invariants: ["I-001"], files: ["a/**"], given: ["g"], when: ["w"], then: ["t"], mustNot: ["m"], proof: [{ suite: "phone", check: "c" }] };

test("an invariant needs an id, a statement, a source and files that threaten it; a held-by entry needs a suite", () => {
  assert.deepEqual(validateInvariants({ invariants: [goodInv] }), []);
  assert.match(validateInvariants({ invariants: [{ ...goodInv, id: "bad" }] }).join(), /id must look like/);
  assert.match(validateInvariants({ invariants: [goodInv, goodInv] }).join(), /duplicate/);
  assert.match(validateInvariants({ invariants: [{ ...goodInv, statement: " " }] }).join(), /statement/);
  assert.match(validateInvariants({ invariants: [{ ...goodInv, source: undefined }] }).join(), /source/);
  assert.match(validateInvariants({ invariants: [{ ...goodInv, threatenedBy: [] }] }).join(), /threatenedBy/);
  assert.match(validateInvariants({ invariants: [{ ...goodInv, heldBy: [{ suite: "x", check: "c" }] }] }).join(), /heldBy/);
  assert.match(validateInvariants({}).join(), /array/);
});

test("a scenario must be complete: given, when, then, something it must not do, an invariant, files; and its references must exist", () => {
  const ids = new Set(["I-001"]);
  assert.deepEqual(validateScenarios({ domain: "D", scenarios: [goodScenario] }, ids), []);
  for (const [field, pattern] of [["given", /given/], ["when", /when/], ["then", /then/], ["mustNot", /mustNot/], ["invariants", /invariant/], ["files", /files/]]) {
    assert.match(validateScenarios({ domain: "D", scenarios: [{ ...goodScenario, [field]: [] }] }, ids).join(), pattern, field);
  }
  assert.match(validateScenarios({ domain: "D", scenarios: [{ ...goodScenario, invariants: ["I-999"] }] }, ids).join(), /unknown invariant/);
  assert.match(validateScenarios({ domain: "D", scenarios: [{ ...goodScenario, category: "odd" }] }, ids).join(), /category/);
  assert.match(validateScenarios({ domain: "D", scenarios: [{ ...goodScenario, risk: "huge" }] }, ids).join(), /risk/);
  assert.match(validateScenarios({ domain: "D", scenarios: [{ ...goodScenario, id: "m1" }] }, ids).join(), /id must look like/);
  assert.match(validateScenarios({ domain: "D", scenarios: [{ ...goodScenario, proof: [{ suite: "nowhere", check: "c" }] }] }, ids).join(), /proof/);
  assert.match(validateScenarios({ domain: "D", scenarios: [{ ...goodScenario, device: {} }] }, ids).join(), /DEVICE_LOOP/);
  assert.match(validateScenarios({ scenarios: [goodScenario] }, ids).join(), /domain/);
  const seen = new Set();
  validateScenarios({ domain: "D", scenarios: [goodScenario] }, ids, seen);
  assert.match(validateScenarios({ domain: "E", scenarios: [goodScenario] }, ids, seen).join(), /duplicate/);
});

test("globs: ** crosses directories, * stays in one, ? is one character, dots are dots", () => {
  assert.ok(globToRegExp("a/**").test("a/b/c.txt"));
  assert.ok(globToRegExp("a/*.java").test("a/B.java"));
  assert.ok(!globToRegExp("a/*.java").test("a/b/B.java"));
  assert.ok(globToRegExp("a/?.x").test("a/b.x"));
  assert.ok(!globToRegExp("a/?.x").test("a/bc.x"));
  assert.ok(!globToRegExp("a/?.x").test("a//.x"), "? is one character that is not a slash");
  assert.ok(!globToRegExp("a.b").test("axb"));
  assert.ok(globToRegExp("**/x.md").test("deep/er/x.md"));
  assert.deepEqual(touches(["src/**"], ["src/a", "docs/b"]), ["src/a"]);
});

test("impact names the invariants a change threatens, whether each is still held, and the scenarios it touches", () => {
  const inv = [
    { id: "I-001", statement: "one", threatenedBy: ["a/**"], heldBy: [{ suite: "phone", check: "first check" }] },
    { id: "I-002", statement: "two", threatenedBy: ["a/**"], heldBy: [{ suite: "phone", check: "third check" }] },
    { id: "I-003", statement: "three", threatenedBy: ["b/**"], heldBy: [{ suite: "phone", check: "first check" }] },
    { id: "I-004", statement: "four", threatenedBy: ["a/**"], heldBy: [] },
    { id: "I-005", statement: "five", threatenedBy: ["a/**"], heldBy: [{ suite: "phone", check: "first check" }, { suite: "phone", check: "third check" }] },
  ];
  const scenarios = [
    { id: "S-001", name: "by file", risk: "high", files: ["a/x"], invariants: ["I-003"] },
    { id: "S-002", name: "by invariant", risk: "low", files: ["z/**"], invariants: ["I-001"] },
    { id: "S-003", name: "untouched", risk: "low", files: ["z/**"], invariants: ["I-003"] },
  ];
  const r = impact(["a/x"], inv, scenarios, suites());
  assert.deepEqual(r.threatened.map((t) => [t.id, t.held, t.heldBy]), [["I-001", true, 1], ["I-002", false, 1], ["I-004", false, 0], ["I-005", false, 2]]);
  assert.deepEqual(r.threatened[1].unheld, ["third check"]);
  assert.deepEqual(r.affected.map((a) => [a.id, a.byFiles]), [["S-001", true], ["S-002", false]]);
  assert.deepEqual(impact(["unrelated"], inv, scenarios, suites()), { threatened: [], affected: [] });
});

function toy(scenarioOverride = {}) {
  const dir = mkdtempSync(join(tmpdir(), "orb-scen-"));
  mkdirSync(join(dir, "docs/invariants"), { recursive: true });
  mkdirSync(join(dir, "docs/scenarios"), { recursive: true });
  writeFileSync(join(dir, "docs/invariants/INVARIANTS.json"), JSON.stringify({ invariants: [goodInv] }));
  writeFileSync(join(dir, "docs/scenarios/d.json"), JSON.stringify({ domain: "D", scenarios: [{ ...goodScenario, proof: [{ suite: "phone", check: "first check" }], ...scenarioOverride }] }));
  writeFileSync(join(dir, "phone.out"), PHONE);
  return dir;
}
const run = (dir, ...args) => spawnSync("node", [cli, ...args, "--root", dir], { encoding: "utf8" });

test("the command line: check exits 0 when proven, 1 when a proof fails or has gone, and prints which", () => {
  const dir = toy();
  try {
    const ok = run(dir, "check", "--suite", `phone=${join(dir, "phone.out")}`);
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /scenarios 1: tested 1 · draft 0 · failing 0 · unproven 0 · regressed 0   high-risk proven 1\/1/);
    writeFileSync(join(dir, "docs/scenarios/d.json"), JSON.stringify({ domain: "D", scenarios: [{ ...goodScenario, proof: [{ suite: "phone", check: "vanished" }] }] }));
    const gone = run(dir, "check", "--suite", `phone=${join(dir, "phone.out")}`);
    assert.equal(gone.status, 1);
    assert.match(gone.stdout, /UNPROVEN\s+M-001/);
    writeFileSync(join(dir, "docs/scenarios/d.json"), JSON.stringify({ domain: "D", scenarios: [{ ...goodScenario, proof: [{ suite: "phone", check: "third check" }] }] }));
    assert.match(run(dir, "check", "--suite", `phone=${join(dir, "phone.out")}`).stdout, /FAILING\s+M-001/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the command line: a baseline turns a lost proof into a regression", () => {
  const dir = toy();
  try {
    const base = join(dir, "state", "base.json");
    assert.equal(run(dir, "check", "--suite", `phone=${join(dir, "phone.out")}`, "--write-baseline", base).status, 0);
    assert.deepEqual(JSON.parse(readFileSync(base, "utf8")), { "M-001": "tested" });
    writeFileSync(join(dir, "docs/scenarios/d.json"), JSON.stringify({ domain: "D", scenarios: [{ ...goodScenario, proof: [{ suite: "phone", check: "third check" }] }] }));
    const r = run(dir, "check", "--suite", `phone=${join(dir, "phone.out")}`, "--baseline", base);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /REGRESSED\s+M-001/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the command line: a malformed registry fails with the reason; an unreadable suite file is refused", () => {
  const dir = toy({ mustNot: [] });
  try {
    const r = run(dir, "check", "--suite", `phone=${join(dir, "phone.out")}`);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /REGISTRY d\.json: scenario M-001: needs mustNot/);
    assert.equal(run(dir, "check", "--suite", `phone=${join(dir, "missing.out")}`).status, 2);
    assert.equal(run(dir, "nonsense").status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the command line: impact lists threatened invariants and affected scenarios for the files given", () => {
  const dir = toy();
  try {
    const r = run(dir, "impact", "--files", "a/x.java", "--suite", `phone=${join(dir, "phone.out")}`);
    assert.equal(r.status, 1, "check is a named check that exists in the toy suite? no: I-001 is held by 'c', which did not run");
    assert.match(r.stdout, /invariants threatened 1 · scenarios affected 1/);
    assert.match(r.stdout, /I-001 NOT HELD/);
    const quiet = run(dir, "impact", "--files", "zzz");
    assert.equal(quiet.status, 0);
    assert.match(quiet.stdout, /invariants threatened 0 · scenarios affected 0/);
    const noRun = run(dir, "impact", "--files", "a/x.java");
    assert.match(noRun.stdout, /held-ness not checked/);
    assert.equal(noRun.status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the repository's own registries are well formed: every id unique, every reference real, no scenario incomplete", () => {
  const r = spawnSync("node", [cli, "list", "--root", realRoot], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout);
  assert.ok(!/^REGISTRY/m.test(r.stdout));
  assert.match(r.stdout, /^\d+ invariants, \d+ scenarios$/m);
});
