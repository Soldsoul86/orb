#!/usr/bin/env node
/**
 * Slices: the context pack, the budget, and the change report (`tools/slice/README.md`).
 *
 *   node tools/slice/cli.mjs context <ID> [--out file]
 *   node tools/slice/cli.mjs budget  <ID> [--base rev]
 *   node tools/slice/cli.mjs report  <ID> [--base rev] [--suite phone=f] [--suite tools=f] [--mutation f.json] [--fit f] [--root dir]
 *
 * Exit status: 0 · 1 the budget is exceeded, or the report's status is BLOCKED · 2 unusable input.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { check as governanceCheck, classify, permissionsOf, validateApprovals, validateClasses } from "../governance/lib.mjs";
import { derive, globToRegExp, impact, indexSuites, validateInvariants, validateScenarios } from "../scenarios/lib.mjs";
import { BLOCKED, budgetCheck, decisionSection, fitDelta, fitDispositions, parseNumstat, pendingFor, phoneSummary, renderContext, renderReport, statusOf, stopsMet, toolsSummary, validateSlice } from "./lib.mjs";

const args = process.argv.slice(2);
const [command, id] = args;
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const all = (name) => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));
const root = flag("--root") ? resolve(flag("--root")) : resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fail = (message, code = 2) => {
  console.error(`slice: ${message}`);
  process.exit(code);
};
if (!["context", "budget", "report"].includes(command) || !id) fail("usage: cli.mjs context|budget|report <ID> [...]");

const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const read = (p) => readFileSync(join(root, p), "utf8");
const json = (p) => JSON.parse(read(p));

let slice;
try {
  slice = json(`docs/slices/${id}.json`);
} catch {
  fail(`cannot read docs/slices/${id}.json`);
}
const sliceErrors = validateSlice(slice);
if (sliceErrors.length) fail(`docs/slices/${id}.json: ${sliceErrors.join("; ")}`);

function registries() {
  const invDoc = json("docs/invariants/INVARIANTS.json");
  const errors = validateInvariants(invDoc);
  const ids = new Set(invDoc.invariants.map((i) => i.id));
  const scenarios = [];
  const seen = new Set();
  const dir = join(root, "docs/scenarios");
  for (const f of existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".json")).sort() : []) {
    const doc = JSON.parse(readFileSync(join(dir, f), "utf8"));
    errors.push(...validateScenarios(doc, ids, seen));
    scenarios.push(...doc.scenarios);
  }
  return { invariants: invDoc.invariants, scenarios, errors };
}

const base = flag("--base") ?? slice.base;
function changeSet() {
  const tracked = parseNumstat(git("diff", "--numstat", base));
  const known = new Set(tracked.map((c) => c.file));
  const untracked = git("ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean).filter((f) => !known.has(f));
  const extra = untracked.map((f) => {
    let lines = 0;
    try {
      lines = readFileSync(join(root, f), "utf8").split("\n").length;
    } catch {
      lines = 0;
    }
    return { file: f, added: lines, removed: 0 };
  });
  return [...tracked, ...extra];
}

if (command === "context") {
  const { invariants, scenarios } = registries();
  const classes = json("docs/FILE_CLASSES.json");
  const decisions = read("docs/DECISIONS.md");
  const wantedScenarios = scenarios.filter((s) => slice.scenarios.includes(s.id));
  const parts = {
    design: read(slice.design),
    decisions: Object.fromEntries(slice.decisions.map((d) => [d, decisionSection(decisions, d)])),
    invariants: invariants.filter((i) => slice.invariants.includes(i.id)),
    scenarios: wantedScenarios,
    classes: Object.entries(classes.classes).map(([k, v]) => `${k}: ${v.gate ?? "no gate"} — ${v.about}`),
    pending: existsSync(join(root, "docs/DECISIONS_PENDING.md")) ? pendingFor(read("docs/DECISIONS_PENDING.md"), slice.id) : [],
    files: git("ls-files").split("\n").filter(Boolean).filter((f) => slice.scope.files.some((g) => globToRegExp(g).test(f))),
  };
  const out = renderContext(slice, parts);
  if (flag("--out")) {
    mkdirSync(dirname(resolve(flag("--out"))), { recursive: true });
    writeFileSync(resolve(flag("--out")), out);
    console.log(`context pack ${out.split("\n").length} lines → ${flag("--out")}`);
  } else console.log(out);
  process.exit(0);
}

const classesDoc = json("docs/FILE_CLASSES.json");
const approvalsDoc = json("docs/APPROVALS.json");
const changes = changeSet();
const isGenerated = (f) => classify(f, classesDoc).class === "GENERATED";
const budget = budgetCheck(changes, slice, isGenerated);

if (command === "budget") {
  console.log(`files ${budget.files}/${slice.budget.maxFiles} · lines ${budget.lines}/${slice.budget.maxLines} · outside scope ${budget.outside.length}`);
  for (const o of budget.over) console.log(`OVER ${o}`);
  for (const f of budget.outside) console.log(`OUTSIDE ${f}`);
  process.exit(budget.ok ? 0 : 1);
}

// report
const errors = [...validateClasses(classesDoc), ...validateApprovals(approvalsDoc)];
const reg = registries();
errors.push(...reg.errors);
if (errors.length) fail(`registries are malformed: ${errors[0]}`);
const files = changes.map((c) => c.file);
const permissionsDelta = () => {
  const added = [];
  const removed = [];
  for (const f of files.filter((x) => classify(x, classesDoc).watch === "manifest-permissions")) {
    let before = [];
    try {
      before = permissionsOf(git("show", `${base}:${f}`));
    } catch {
      before = [];
    }
    const after = existsSync(join(root, f)) ? permissionsOf(read(f)) : [];
    added.push(...after.filter((x) => !before.includes(x)));
    removed.push(...before.filter((x) => !after.includes(x)));
  }
  return { added, removed, changed: added.length + removed.length > 0 };
};
const permissions = permissionsDelta();
const today = git("log", "-1", "--format=%cs").trim();
const governance = governanceCheck(files, classesDoc, approvalsDoc, { today: new Date().toISOString().slice(0, 10), permissionsChanged: () => permissions.changed });

const runs = {};
for (const spec of all("--suite")) {
  const [kind, file] = spec.split("=");
  if (!existsSync(file)) fail(`cannot read suite output ${spec}`);
  runs[kind] = readFileSync(file, "utf8");
}
const suites = indexSuites(runs);
const suitesRun = Object.keys(suites).length > 0;
const baselinePath = join(root, "artifacts/state/scenarios.json");
const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : {};
const derived = derive(reg.scenarios, suites, baseline);
const imp = impact(files, reg.invariants, reg.scenarios, suites);
const mutationFile = flag("--mutation");
const mutation = mutationFile && existsSync(mutationFile) ? JSON.parse(readFileSync(mutationFile, "utf8")).summary : null;
const fitText = flag("--fit") && existsSync(flag("--fit")) ? readFileSync(flag("--fit"), "utf8") : null;
const fit = fitText ? fitDispositions(fitText) : null;

const head = git("rev-parse", "--short", "HEAD").trim();
const dirty = git("status", "--porcelain", "--", ".", ":(exclude)artifacts").trim() !== "";   // a report does not make the tree it reports on dirty
const reportDir = join(root, "artifacts/reports");
const earlier = existsSync(reportDir) ? readdirSync(reportDir).filter((n) => n.startsWith(`${slice.id}-`) && n.endsWith(".md")).sort() : [];
let previousFit = null;
for (const name of earlier.reverse()) {
  const m = /^- Dispositions \(\d+ service messages[^)]*\): (.+)$/m.exec(readFileSync(join(reportDir, name), "utf8"));
  if (m) {
    const counts = Object.fromEntries(m[1].split(" · ").map((p) => [p.slice(0, p.lastIndexOf(" ")), Number(p.slice(p.lastIndexOf(" ") + 1))]));
    previousFit = { counts, total: 0 };
    break;
  }
}

const supplied = [];
if (runs.phone) supplied.push("phone");
if (runs.tools) supplied.push("tools");
if (mutation) supplied.push("mutation");
if (fit) supplied.push("fit");
const model = {
  slice, head, base: git("rev-parse", "--short", base).trim(), dirty, date: today, changes, budget, governance, permissions,
  suites: { phone: runs.phone ? phoneSummary(runs.phone) : null, tools: runs.tools ? toolsSummary(runs.tools) : null }, suitesRun,
  scenarios: { derived, inSlice: slice.scenarios, privacy: reg.scenarios.filter((s) => s.category === "privacy").map((s) => s.id) },
  impact: imp, mutation, fit, fitDelta: fitDelta(previousFit, fit), supplied, required: slice.required ?? [],
  pending: existsSync(join(root, "docs/DECISIONS_PENDING.md")) ? pendingFor(read("docs/DECISIONS_PENDING.md"), slice.id) : [],
};
model.stops = stopsMet(model);
const text = renderReport(model);
const name = `${slice.id}-${head}${dirty ? "-dirty" : ""}.md`;
const target = join(reportDir, name);
if (existsSync(target) && !dirty) fail(`${name} already exists: a report for a commit is never overwritten`);
mkdirSync(reportDir, { recursive: true });
writeFileSync(target, text);
console.log(`${statusOf(model).status} — artifacts/reports/${name}`);
for (const r of statusOf(model).reasons) console.log(`  ${r}`);
process.exit(statusOf(model).status === BLOCKED ? 1 : 0);
