#!/usr/bin/env node
/**
 * The scenario and invariant registries (`tools/scenarios/README.md`).
 *
 *   node tools/scenarios/cli.mjs check [--run | --suite phone=<out> --suite tools=<out>] [--baseline f] [--write-baseline f]
 *   node tools/scenarios/cli.mjs impact [--diff <git revision range>=HEAD] [--files a,b] [--suite ...]
 *   node tools/scenarios/cli.mjs list
 *
 * Exit status: 0 clean · 1 a scenario is failing, unproven or regressed (or a registry is malformed, or an impacted invariant is not held) · 2 unusable input.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { derive, impact, indexSuites, summarise, validateInvariants, validateScenarios, TESTED } from "./lib.mjs";

const args = process.argv.slice(2);
const command = args[0];
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const root = flag("--root") ? resolve(flag("--root")) : resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const all = (name) => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));

function load() {
  const invPath = join(root, "docs/invariants/INVARIANTS.json");
  const invDoc = JSON.parse(readFileSync(invPath, "utf8"));
  const errors = validateInvariants(invDoc);
  const ids = new Set((invDoc.invariants ?? []).map((i) => i.id));
  const dir = join(root, "docs/scenarios");
  const scenarios = [];
  const seen = new Set();
  for (const f of existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".json")).sort() : []) {
    const doc = JSON.parse(readFileSync(join(dir, f), "utf8"));
    for (const e of validateScenarios(doc, ids, seen)) errors.push(`${f}: ${e}`);
    scenarios.push(...(doc.scenarios ?? []).map((s) => ({ ...s, domain: doc.domain })));
  }
  return { invariants: invDoc.invariants ?? [], scenarios, errors };
}

function suites() {
  const runs = {};
  for (const spec of all("--suite")) {
    const [kind, file] = spec.split("=");
    if (!kind || !file || !existsSync(file)) {
      console.error(`scenarios: cannot read suite output ${spec}`);
      process.exit(2);
    }
    runs[kind] = readFileSync(file, "utf8");
  }
  if (args.includes("--run")) {
    runs.phone = spawnSync("bash", [join(root, "apps/pixel/orb/tests/run.sh")], { encoding: "utf8", maxBuffer: 1 << 28 }).stdout;
    runs.tools = spawnSync("node", ["--test", "--test-reporter=spec", ...readdirSync(join(root, "tools")).map((d) => join(root, "tools", d, "tests")).filter(existsSync).flatMap((d) => readdirSync(d).filter((n) => n.endsWith(".test.mjs")).map((n) => join(d, n)))], { encoding: "utf8", maxBuffer: 1 << 28 }).stdout;
  }
  return indexSuites(runs);
}

function changed() {
  const files = flag("--files");
  if (files) return files.split(",").filter(Boolean);
  const range = flag("--diff") ?? "HEAD";
  return execFileSync("git", ["diff", "--name-only", range], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
}

const { invariants, scenarios, errors } = load();
let failed = false;
for (const e of errors) {
  console.log(`REGISTRY ${e}`);
  failed = true;
}

if (command === "list") {
  console.log(`${invariants.length} invariants, ${scenarios.length} scenarios`);
  for (const s of scenarios) console.log(`  ${s.id} [${s.risk}] ${s.category.padEnd(11)} ${s.name}`);
} else if (command === "check") {
  const have = suites();
  const baselinePath = flag("--baseline");
  const baseline = baselinePath && existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : {};
  const derived = derive(scenarios, have, baseline);
  const s = summarise(derived);
  for (const d of derived) {
    if (d.state === TESTED) continue;
    console.log(`${d.state.toUpperCase().padEnd(9)} ${d.id} ${d.name}${d.missing.length ? `  (not run: ${d.missing.length})` : ""}${d.failing.length ? `  (failing: ${d.failing.length})` : ""}`);
  }
  console.log(`scenarios ${s.total}: tested ${s.tested} · draft ${s.draft} · failing ${s.failing} · unproven ${s.unproven} · regressed ${s.regressed}   high-risk proven ${s.highTested}/${s.high}`);
  if (!s.ok) failed = true;
  const out = flag("--write-baseline");
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(Object.fromEntries(derived.map((d) => [d.id, d.state])), null, 1) + "\n");
  }
} else if (command === "impact") {
  const files = changed();
  const have = suites();
  const ran = Object.keys(have).length > 0;
  const r = impact(files, invariants, scenarios, have);
  console.log(`changed files ${files.length} · invariants threatened ${r.threatened.length} · scenarios affected ${r.affected.length}${ran ? "" : "  (no suite output given: held-ness not checked)"}`);
  for (const t of r.threatened) console.log(`  ${t.id} ${!ran ? "held by " + t.heldBy + " checks" : t.held ? "held" : "NOT HELD"}${ran && t.unheld.length ? ` (${t.unheld.length} of ${t.heldBy} checks not shown passing)` : ""} — ${t.statement}`);
  for (const a of r.affected) console.log(`  ${a.id} [${a.risk}] ${a.name}${a.byFiles ? "" : " (via an invariant)"}`);
  if (r.threatened.some((t) => t.heldBy === 0 || (ran && !t.held))) failed = true;
} else {
  console.error("usage: cli.mjs check|impact|list");
  process.exit(2);
}
process.exit(failed ? 1 : 0);
