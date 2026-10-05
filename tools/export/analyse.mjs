#!/usr/bin/env node
/**
 * Analyses a device export — counts and names only (`tools/export/DESIGN.md`).
 *
 *   node tools/export/analyse.mjs <export.txt>                       summary: chain, builds, faults, counts by type, latest fit report
 *   node tools/export/analyse.mjs <export.txt> --since <earlier.txt> what changed since an earlier export of the same lane
 *   node tools/export/analyse.mjs <export.txt> --check <preds.json>  bounds on event counts from a prediction file
 *   node tools/export/analyse.mjs <export.txt> --keys <type>         the field names (never values) of one event type
 *   node tools/export/analyse.mjs <export.txt> --tally <type>        per field: the counts of a closed vocabulary's values, else how many distinct values (never the values)
 *
 * Exit status: 0 clean, 1 a chain break or a failed check, 2 the file could not be used.
 */
import { readFileSync } from "node:fs";
import { parse, chain, typeCounts, builds, faults, latestReports, payloadKeys, tally, diff, check } from "./lib.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const file = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
if (!file) {
  console.error("usage: analyse.mjs <export.txt> [--since earlier.txt] [--check predictions.json] [--keys type] [--tally type]");
  process.exit(2);
}

const load = (path) => {
  try {
    return parse(readFileSync(path, "utf8"));
  } catch {
    console.error(`analyse: cannot read ${path}`);
    process.exit(2);
  }
};

const now = load(file);
if (now.events.length === 0) {
  console.error("analyse: no journal events in that file");
  process.exit(2);
}

let failed = false;
const c = chain(now.events);
if (!c.ok) failed = true;

const since = flag("--since");
const checks = flag("--check");
const keysOf = flag("--keys");
const tallyOf = flag("--tally");

if (tallyOf) {
  console.log(JSON.stringify(tally(now.events, tallyOf)));
} else if (keysOf) {
  console.log(payloadKeys(now.events, keysOf).join(" ") || "(none)");
} else if (since) {
  const d = diff(load(since).events, now.events);
  console.log(`events +${d.added}  new builds [${d.newBuilds.join(", ")}]`);
  for (const [type, n] of Object.entries(d.changed)) console.log(`  ${n > 0 ? "+" : ""}${n} ${type}`);
} else {
  const f = faults(now.events);
  console.log(`events ${c.events}  chain ${c.ok ? "ok" : "BROKEN"} (link breaks ${c.linkBreaks}, payload mismatches ${c.payloadMismatches}, sealed ${c.sealed})  unparseable lines ${now.unparseable}`);
  const b = builds(now.events);
  console.log(`builds ${b.length}, latest ${b.length ? b[b.length - 1] : "none"}  crashes ${f.crashed}  caught faults ${f.caught}`);
  for (const [type, n] of Object.entries(typeCounts(now.events))) console.log(`  ${String(n).padStart(5)} ${type}`);
  for (const [type, counts] of Object.entries(latestReports(now.events))) {
    console.log(`latest ${type}:`);
    console.log("  " + Object.entries(counts).map(([k, v]) => `${k}=${v}`).join("  "));
  }
}

if (checks) {
  let predictions;
  try {
    predictions = JSON.parse(readFileSync(checks, "utf8"));
  } catch {
    console.error(`analyse: cannot read predictions ${checks}`);
    process.exit(2);
  }
  const r = check(now.events, predictions);
  for (const x of r.results) console.log(`${x.ok ? "ok  " : "FAIL"} ${x.id} ${x.type} = ${x.n}`);
  if (!r.ok) failed = true;
}

process.exit(failed ? 1 : 0);
