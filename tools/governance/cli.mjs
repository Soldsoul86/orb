#!/usr/bin/env node
/**
 * The governance check (`tools/governance/README.md`).
 *
 *   node tools/governance/cli.mjs check [--diff <range>=HEAD] [--files a,b] [--today YYYY-MM-DD] [--root dir]
 *
 * Exit status: 0 every gated change has an approval record · 1 an unapproved gated change, or a malformed registry · 2 unusable input.
 * A change to a self-governing file (the class table, the approvals, the registries) is always printed, approved or not.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { check, permissionsOf, validateApprovals, validateClasses } from "./lib.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const root = flag("--root") ? resolve(flag("--root")) : resolve(dirname(fileURLToPath(import.meta.url)), "../..");
if (args[0] !== "check") {
  console.error("usage: cli.mjs check [--diff range] [--files a,b] [--today date]");
  process.exit(2);
}

const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
let classesDoc, approvalsDoc;
try {
  classesDoc = JSON.parse(readFileSync(join(root, "docs/FILE_CLASSES.json"), "utf8"));
  approvalsDoc = JSON.parse(readFileSync(join(root, "docs/APPROVALS.json"), "utf8"));
} catch {
  console.error("governance: cannot read docs/FILE_CLASSES.json and docs/APPROVALS.json");
  process.exit(2);
}
const errors = [...validateClasses(classesDoc), ...validateApprovals(approvalsDoc)];
for (const e of errors) console.log(`REGISTRY ${e}`);

const range = flag("--diff") ?? "HEAD";
let files;
try {
  files = flag("--files") ? flag("--files").split(",").filter(Boolean) : [...new Set([...git("diff", "--name-only", range).split("\n"), ...git("ls-files", "--others", "--exclude-standard").split("\n")])].filter(Boolean);
} catch {
  console.error("governance: cannot read the change set from git");
  process.exit(2);
}
const base = range.includes("..") ? range.split("..")[0] : range;
const today = flag("--today") ?? new Date().toISOString().slice(0, 10);
const ctx = {
  today,
  permissionsChanged: (file) => {
    try {
      const before = permissionsOf(git("show", `${base}:${file}`));
      const after = permissionsOf(readFileSync(join(root, file), "utf8"));
      return JSON.stringify(before) !== JSON.stringify(after);
    } catch {
      return true;   // cannot compare: treat as changed
    }
  },
};
const r = check(files, classesDoc, approvalsDoc, ctx);
console.log(`changed files ${r.files} · ${Object.entries(r.byClass).map(([k, v]) => `${k} ${v}`).join(" · ") || "none"}`);
for (const u of r.unapproved) console.log(`UNAPPROVED ${u.class} ${u.file} needs ${u.gate}`);
for (const a of r.approved) console.log(`approved   ${a.class} ${a.file} by ${a.refs.join(", ")}`);
for (const g of r.generated) console.log(`GENERATED  ${g} (never hand-edited; the build writes it)`);
for (const s of r.selfGoverning) console.log(`SELF-GOVERNING ${s} changed: review required whatever the approvals say`);
if (r.unclassified.length) console.log(`unclassified (treated as DOMAIN, ungated): ${r.unclassified.length}`);
console.log(`gated: ${r.approved.length + r.unapproved.length} · approved ${r.approved.length} · unapproved ${r.unapproved.length}`);
process.exit(r.ok && errors.length === 0 ? 0 : 1);
