/**
 * Tests for the governance check: classes, gates, approvals, the manifest-permissions watch, self-governing files, and the command line on a toy git repository.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { check, classify, covered, permissionsOf, validateApprovals, validateClasses } from "../lib.mjs";

const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "cli.mjs");
const realRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const classes = {
  classes: { CONSTITUTIONAL: { gate: "PROTOCOL_APPROVAL" }, SECURITY: { gate: "SECURITY_APPROVAL" }, PROTOCOL: { gate: "PROTOCOL_APPROVAL" }, GENERATED: { gate: null }, TEST: { gate: null }, TOOL: { gate: null }, DOMAIN: { gate: null } },
  rules: [
    { glob: "CLAUDE.md", class: "CONSTITUTIONAL" },
    { glob: "app/Manifest.xml", class: "SECURITY", watch: "manifest-permissions" },
    { glob: "**/*.jks", class: "SECURITY" },
    { glob: "docs/PROTO.md", class: "PROTOCOL" },
    { glob: "docs/fixtures/**", class: "PROTOCOL" },
    { glob: "**/*.apk", class: "GENERATED" },
    { glob: "**/tests/**", class: "TEST" },
    { glob: "tools/**", class: "TOOL" },
    { glob: "**", class: "DOMAIN" },
  ],
  selfGoverning: ["docs/APPROVALS.json", "tools/governance/**"],
};
const approval = (extra = {}) => ({ gate: "PROTOCOL_APPROVAL", paths: ["docs/PROTO.md"], ref: "DR-9", by: "operator", date: "2026-10-01", ...extra });
const ctx = (changed = true) => ({ today: "2026-10-04", permissionsChanged: () => changed });

test("a file's class is the first rule that matches; a file no rule names is DOMAIN and says it was not named", () => {
  assert.equal(classify("CLAUDE.md", classes).class, "CONSTITUTIONAL");
  assert.equal(classify("tools/x/tests/a.mjs", classes).class, "TEST", "tests outrank tools only if listed first");
  assert.equal(classify("tools/x/a.mjs", classes).class, "TOOL");
  assert.equal(classify("deep/dir/app.apk", classes).class, "GENERATED");
  assert.equal(classify("app.apk", classes).class, "GENERATED", "** / matches no directory too");
  assert.equal(classify("deep/key.jks", classes).gate, "SECURITY_APPROVAL");
  const lone = classify("src/a.java", classes);
  assert.deepEqual([lone.class, lone.gate, lone.rule], ["DOMAIN", null, "**"]);
  assert.equal(classify("src/a.java", { ...classes, rules: classes.rules.slice(0, -1) }).rule, null);
});

test("a gated change with no approval is unapproved; with one that covers it, approved and citing the decision", () => {
  const none = check(["docs/PROTO.md"], classes, { approvals: [] }, ctx());
  assert.equal(none.ok, false);
  assert.deepEqual(none.unapproved.map((u) => [u.file, u.gate]), [["docs/PROTO.md", "PROTOCOL_APPROVAL"]]);
  const some = check(["docs/PROTO.md"], classes, { approvals: [approval()] }, ctx());
  assert.equal(some.ok, true);
  assert.deepEqual(some.approved[0].refs, ["DR-9"]);
});

test("an approval is for its gate, its paths and its dates", () => {
  const files = ["docs/PROTO.md"];
  const run = (a) => check(files, classes, { approvals: [a] }, ctx()).ok;
  assert.equal(run(approval({ gate: "SECURITY_APPROVAL" })), false, "another gate does not cover it");
  assert.equal(run(approval({ paths: ["docs/OTHER.md"] })), false, "another path does not");
  assert.equal(run(approval({ date: "2026-10-05" })), false, "an approval from the future does not");
  assert.equal(run(approval({ until: "2026-10-03" })), false, "an expired approval does not");
  assert.equal(run(approval({ until: "2026-10-04" })), true, "the last day counts");
  assert.equal(covered("docs/PROTO.md", "PROTOCOL_APPROVAL", [approval(), approval({ ref: "DR-10" })], "2026-10-04").length, 2);
});

test("ungated classes never need an approval; generated files are listed; unclassified files are counted", () => {
  const r = check(["tools/a.mjs", "x/tests/t.mjs", "orb.apk", "src/new.java"], classes, { approvals: [] }, ctx());
  assert.equal(r.ok, true);
  assert.deepEqual(r.generated, ["orb.apk"]);
  assert.deepEqual(r.byClass, { TOOL: 1, TEST: 1, GENERATED: 1, DOMAIN: 1 });
  assert.equal(check(["src/new.java"], { ...classes, rules: classes.rules.slice(0, -1) }, { approvals: [] }, ctx()).unclassified.length, 1);
});

test("a manifest gates only when its permissions differ; a keystore always does", () => {
  assert.equal(check(["app/Manifest.xml"], classes, { approvals: [] }, ctx(false)).ok, true, "an added activity is not a security change");
  assert.equal(check(["app/Manifest.xml"], classes, { approvals: [] }, ctx(true)).ok, false);
  assert.equal(check(["x/orb.jks"], classes, { approvals: [] }, ctx(false)).ok, false);
});

test("permissionsOf lists permissions, features, queries and intents, ignores comments and order", () => {
  const a = '<manifest><!-- <uses-permission android:name="INTERNET"/> --><uses-permission android:name="A"/><uses-feature android:name="F"/><queries><package android:name="p"/></queries><activity android:name=".X"/></manifest>';
  const b = '<manifest><queries><package android:name="p"/></queries><uses-feature android:name="F"/><uses-permission android:name="A"/><activity android:name=".Y"/><activity android:name=".Z"/></manifest>';
  assert.deepEqual(permissionsOf(a), permissionsOf(b));
  assert.ok(permissionsOf(a).some((x) => x.includes("uses-permission")));
  assert.ok(!permissionsOf(a).some((x) => x.includes("INTERNET")), "a commented permission is not a permission");
  assert.notDeepEqual(permissionsOf(a), permissionsOf(a.replace('name="A"', 'name="B"')));
});

test("a change to a self-governing file is always flagged, approved or not", () => {
  const r = check(["docs/APPROVALS.json", "tools/governance/lib.mjs", "tools/other/x.mjs"], classes, { approvals: [] }, ctx());
  assert.deepEqual(r.selfGoverning, ["docs/APPROVALS.json", "tools/governance/lib.mjs"]);
});

test("the tables are validated: unknown class, bad gate, undeclared rule class, bad approval", () => {
  assert.deepEqual(validateClasses(classes), []);
  assert.match(validateClasses({ ...classes, classes: { ...classes.classes, ODD: { gate: null } } }).join(), /unknown class/);
  assert.match(validateClasses({ ...classes, classes: { ...classes.classes, TEST: { gate: "NOPE" } } }).join(), /gate must be/);
  assert.match(validateClasses({ ...classes, rules: [{ glob: "a", class: "MISSING" }] }).join(), /not declared/);
  assert.match(validateClasses({ ...classes, rules: [{ glob: "a", class: "TEST", watch: "x" }] }).join(), /unknown watch/);
  assert.match(validateClasses({ ...classes, selfGoverning: [] }).join(), /selfGoverning/);
  assert.deepEqual(validateApprovals({ approvals: [approval()] }), []);
  assert.match(validateApprovals({ approvals: [approval({ gate: "X" })] }).join(), /gate/);
  assert.match(validateApprovals({ approvals: [approval({ paths: [] })] }).join(), /paths/);
  assert.match(validateApprovals({ approvals: [approval({ ref: "" })] }).join(), /ref/);
  assert.match(validateApprovals({ approvals: [approval({ date: "yesterday" })] }).join(), /date/);
  assert.match(validateApprovals({ approvals: [approval({ until: "soon" })] }).join(), /until/);
  assert.match(validateApprovals({}).join(), /array/);
});

function toyRepo() {
  const dir = mkdtempSync(join(tmpdir(), "orb-gov-"));
  const git = (...a) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd: dir, stdio: "ignore" });
  git("init", "-q");
  mkdirSync(join(dir, "docs"), { recursive: true });
  mkdirSync(join(dir, "app"));
  writeFileSync(join(dir, "docs/FILE_CLASSES.json"), JSON.stringify(classes));
  writeFileSync(join(dir, "docs/APPROVALS.json"), JSON.stringify({ approvals: [] }));
  writeFileSync(join(dir, "docs/PROTO.md"), "v1\n");
  writeFileSync(join(dir, "app/Manifest.xml"), '<manifest><uses-permission android:name="A"/></manifest>');
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  return { dir, git };
}
const run = (dir, ...args) => spawnSync("node", [cli, "check", "--root", dir, "--today", "2026-10-04", ...args], { encoding: "utf8" });

test("the command line on a repository: an unapproved protocol edit fails; recording its approval passes and is flagged self-governing", () => {
  const { dir } = toyRepo();
  try {
    writeFileSync(join(dir, "docs/PROTO.md"), "v2\n");
    const fail = run(dir);
    assert.equal(fail.status, 1, fail.stdout);
    assert.match(fail.stdout, /UNAPPROVED PROTOCOL docs\/PROTO\.md needs PROTOCOL_APPROVAL/);
    writeFileSync(join(dir, "docs/APPROVALS.json"), JSON.stringify({ approvals: [approval()] }));
    const ok = run(dir);
    assert.equal(ok.status, 0, ok.stdout);
    assert.match(ok.stdout, /approved\s+PROTOCOL docs\/PROTO\.md by DR-9/);
    assert.match(ok.stdout, /SELF-GOVERNING docs\/APPROVALS\.json changed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the command line on a repository: a manifest edit gates only when a permission changes; a new untracked file is seen", () => {
  const { dir } = toyRepo();
  try {
    writeFileSync(join(dir, "app/Manifest.xml"), '<manifest><uses-permission android:name="A"/><activity android:name=".New"/></manifest>');
    assert.equal(run(dir).status, 0, "an activity alone is not a security change");
    writeFileSync(join(dir, "app/Manifest.xml"), '<manifest><uses-permission android:name="A"/><uses-permission android:name="INTERNET"/></manifest>');
    const r = run(dir);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /UNAPPROVED SECURITY app\/Manifest\.xml needs SECURITY_APPROVAL/);
    writeFileSync(join(dir, "docs/untracked.md"), "x");
    assert.match(run(dir).stdout, /changed files 2/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the command line: a malformed table fails; a missing one is refused; --files checks named files", () => {
  const { dir } = toyRepo();
  try {
    assert.match(run(dir, "--files", "docs/PROTO.md").stdout, /UNAPPROVED PROTOCOL/);
    writeFileSync(join(dir, "docs/APPROVALS.json"), JSON.stringify({ approvals: [approval({ ref: "" })] }));
    const bad = run(dir, "--files", "tools/x.mjs");
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /REGISTRY approval 0: needs a ref/);
    rmSync(join(dir, "docs/FILE_CLASSES.json"));
    assert.equal(run(dir).status, 2);
    assert.equal(spawnSync("node", [cli, "wrong"], { encoding: "utf8" }).status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the repository's own tables are well formed, and every protocol document it names exists", () => {
  const c = JSON.parse(readFileSync(join(realRoot, "docs/FILE_CLASSES.json"), "utf8"));
  const a = JSON.parse(readFileSync(join(realRoot, "docs/APPROVALS.json"), "utf8"));
  assert.deepEqual(validateClasses(c), []);
  assert.deepEqual(validateApprovals(a), []);
  for (const r of c.rules) if (!r.glob.includes("*")) assert.ok(readFileSyncExists(join(realRoot, r.glob)), `${r.glob} is named by a rule but does not exist`);
});

function readFileSyncExists(p) {
  try {
    readFileSync(p);
    return true;
  } catch {
    return false;
  }
}
