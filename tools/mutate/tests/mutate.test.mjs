import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ALIVE, EQUIVALENT, INVALID, KILLED, MISSING, apply, classify, clean, parseList, share, summarise } from "../lib.mjs";

const patterns = { pass: /\d+ checks, 0 failed/, fail: /\bFAIL\b|\d+ checks, [1-9]\d* failed/, build: /: error:/ };
const cli = fileURLToPath(new URL("../mutate.mjs", import.meta.url));

test("apply replaces the first occurrence only, and says when there is none", () => {
  assert.equal(apply("a b a", { old: "a", new: "X" }), "X b a");
  assert.equal(apply("abc", { old: "z", new: "y" }), null);
  assert.equal(apply("a\nb", { old: "a\nb", new: "c" }), "c");
});

test("classify: a passing suite leaves the mutant alive; a failing one kills it; a build error is invalid", () => {
  assert.equal(classify({ exitCode: 0, output: "  42 checks, 0 failed\n" }, patterns), ALIVE);
  assert.equal(classify({ exitCode: 1, output: "    FAIL a thing\n  42 checks, 1 failed" }, patterns), KILLED);
  assert.equal(classify({ exitCode: 1, output: "X.java:3: error: ';' expected" }, patterns), INVALID);
  assert.equal(classify({ exitCode: 1, output: "Exception in thread main" }, patterns), KILLED);
  assert.equal(classify({ exitCode: 0, output: "" }, patterns), KILLED, "a suite that did not say it passed has not passed");
  assert.equal(classify({ exitCode: 0, output: "9 checks, 0 failed\nFAIL one" }, patterns), KILLED, "a FAIL line is a kill even if the summary is cheerful");
});

test("share is round-robin and covers every index exactly once", () => {
  const all = [0, 1, 2].flatMap((k) => share(7, 3, k)).sort((a, b) => a - b);
  assert.deepEqual(all, [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(share(5, 2, 1), [1, 3]);
  assert.deepEqual(share(0, 4, 0), []);
});

test("summarise counts equivalents apart, and only live non-equivalent mutants make a run unclean", () => {
  const m = (extra = {}) => ({ file: "f", old: "a", new: "b", ...extra });
  const s = summarise([
    { outcome: KILLED, mutant: m() }, { outcome: ALIVE, mutant: m({ equivalent: "same behaviour" }) },
    { outcome: MISSING, mutant: m() }, { outcome: INVALID, mutant: m() },
  ]);
  assert.deepEqual([s.killed, s.alive, s[EQUIVALENT], s.missing, s.invalid, s.attempted, s.total], [1, 0, 1, 1, 1, 2, 4]);
  assert.equal(clean(s), false, "a mutant whose text went missing is not clean");
  assert.equal(clean(summarise([{ outcome: KILLED, mutant: m() }, { outcome: ALIVE, mutant: m({ equivalent: "x" }) }, { outcome: INVALID, mutant: m() }])), true);
  assert.equal(clean(summarise([{ outcome: ALIVE, mutant: m() }])), false);
  assert.equal(clean(summarise([{ outcome: MISSING, mutant: m() }])), false);
});

test("parseList accepts an array or { mutants } and refuses what cannot work", () => {
  assert.equal(parseList([{ file: "f", old: "a", new: "b" }]).length, 1);
  assert.equal(parseList({ mutants: [{ file: "f", old: "a", new: "b" }] }).length, 1);
  assert.throws(() => parseList({}), /array/);
  assert.throws(() => parseList([{ file: "f", old: "a" }]), /new/);
  assert.throws(() => parseList([{ file: "f", old: "a", new: "a" }]), /changes nothing/);
  assert.throws(() => parseList([{ file: "f", old: "", new: "a" }]), /empty/);
});

/** A tiny project whose "suite" checks two lines of a file, so the harness can be run end to end. */
function project(passes = true) {
  const dir = mkdtempSync(join(tmpdir(), "orb-mutate-test-"));
  mkdirSync(join(dir, "proj"));
  writeFileSync(join(dir, "proj", "x.txt"), "a=1\nb=2\n# a note nothing checks\n");
  writeFileSync(join(dir, "proj", "test.sh"), `#BUILD\n${passes ? "" : "exit_now=1\n"}grep -q 'a=1' x.txt && grep -q 'b=2' x.txt && echo "2 checks, 0 failed" || { echo "    FAIL a value"; echo "2 checks, 1 failed"; exit 1; }\n`);
  writeFileSync(join(dir, "config.json"), JSON.stringify({ root: dir, copy: ["proj"], cwd: "proj", test: "sh test.sh 2>&1", pass: "\\d+ checks, 0 failed", fail: "\\bFAIL\\b|\\d+ checks, [1-9]\\d* failed", build: ": error:" }));
  return dir;
}

function runCli(dir, mutants, extra = []) {
  writeFileSync(join(dir, "list.json"), JSON.stringify({ mutants }));
  return spawnSync("node", [cli, "--config", join(dir, "config.json"), "--list", join(dir, "list.json"), "--workers", "2", ...extra], { encoding: "utf8" });
}

test("end to end: kills what the suite checks, reports what it does not, never touches the real tree", () => {
  const dir = project();
  const r = runCli(dir, [
    { file: "x.txt", old: "a=1", new: "a=9" },                       // checked: killed
    { file: "x.txt", old: "b=2", new: "b=3" },                       // checked: killed
    { file: "x.txt", old: "a note nothing checks", new: "another" }, // unchecked: alive
    { file: "x.txt", old: "not there at all", new: "x" },            // missing
    { file: "test.sh", old: "#BUILD", new: "echo 'T.java:1: error: no' >&2; exit 1 #" }, // does not build: invalid
  ]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /killed 2 · alive 1 · equivalent 0 · missing 1 · invalid 1 · of 5/);
  assert.match(r.stdout, /ALIVE\s+#2 x\.txt/);
  assert.match(r.stdout, /MISSING #3/);
  assert.equal(readFileSync(join(dir, "proj", "x.txt"), "utf8"), "a=1\nb=2\n# a note nothing checks\n", "the real file is untouched");
});

test("an alive mutant documented as equivalent leaves the run clean", () => {
  const dir = project();
  const r = runCli(dir, [{ file: "x.txt", old: "a note nothing checks", new: "another", equivalent: "a comment" }, { file: "x.txt", old: "a=1", new: "a=2" }]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /killed 1 · alive 0 · equivalent 1/);
});

test("the baseline must pass, or the run means nothing", () => {
  const dir = project();
  writeFileSync(join(dir, "proj", "x.txt"), "a=0\nb=2\n");
  const r = runCli(dir, [{ file: "x.txt", old: "b=2", new: "b=3" }]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /baseline does not pass/);
});

test("--only picks a range", () => {
  const dir = project();
  const r = runCli(dir, [{ file: "x.txt", old: "a=1", new: "a=9" }, { file: "x.txt", old: "b=2", new: "b=9" }, { file: "x.txt", old: "a note nothing checks", new: "q" }], ["--only", "0-1"]);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /killed 2 · alive 0 .* of 2/);
});

test("a list with a mutant that no longer applies is not clean, and --verify finds it without running the suite", () => {
  const dir = project();
  const list = [{ file: "x.txt", old: "a=1", new: "a=9" }, { file: "x.txt", old: "gone", new: "x" }];
  const run = runCli(dir, list);
  assert.equal(run.status, 1, run.stdout);
  const verify = runCli(dir, list, ["--verify"]);
  assert.equal(verify.status, 1);
  assert.match(verify.stdout, /MISSING #1/);
  assert.match(verify.stdout, /verify: 1 of 2 mutants still apply/);
  const fine = runCli(dir, [list[0]], ["--verify"]);
  assert.equal(fine.status, 0);
  assert.match(fine.stdout, /verify: 1 of 1/);
});
