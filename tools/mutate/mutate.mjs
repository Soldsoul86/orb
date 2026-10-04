#!/usr/bin/env node
/**
 * Mutation-testing harness for Orb (`tools/mutate/README.md`).
 *
 *   node tools/mutate/mutate.mjs --list tools/mutate/lists/par2.json [--config tools/mutate/orb-app.json] [--workers 4] [--only 0-9] [--json out.json]
 *   node tools/mutate/mutate.mjs --list <list> --verify      only check that every mutant still applies to the current source (no suite is run)
 *
 * Copies the project into isolated workspaces (the real tree is never touched), proves the baseline passes, applies each mutant in turn, runs the suite
 * and classifies the result. Exit status: 0 clean, 1 if any mutant is alive, 2 if the baseline fails or the arguments are wrong.
 */
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ALIVE, EQUIVALENT, INVALID, KILLED, MISSING, apply, classify, clean, parseList, share, summarise } from "./lib.mjs";

const here = resolve(fileURLToPath(new URL("../../", import.meta.url)));

function args(argv) {
  const out = { workers: 4, config: join(here, "tools/mutate/orb-app.json") };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list") out.list = argv[++i];
    else if (a === "--config") out.config = resolve(argv[++i]);
    else if (a === "--workers") out.workers = Number(argv[++i]);
    else if (a === "--only") out.only = argv[++i];
    else if (a === "--json") out.json = argv[++i];
    else if (a === "--keep") out.keep = true;
    else if (a === "--verify") out.verify = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!out.list) throw new Error("--list is required");
  return out;
}

function workspace(config, root, name) {
  const dir = join(root, name);
  const repo = config.root ? resolve(config.root) : here;
  for (const rel of config.copy) {
    const from = join(repo, rel);
    if (!existsSync(from)) continue;
    cpSync(from, join(dir, rel), { recursive: true, filter: (p) => !/(^|\/)(build|node_modules|\.git)(\/|$)/.test(p.slice(from.length)) && !p.endsWith(".apk") });
  }
  return dir;
}

function run(config, dir) {
  return new Promise((done) => {
    const child = spawn("sh", ["-c", config.test], { cwd: join(dir, config.cwd), stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("close", (exitCode) => done({ exitCode, output }));
  });
}

async function main() {
  const a = args(process.argv.slice(2));
  const config = JSON.parse(readFileSync(a.config, "utf8"));
  const patterns = { pass: new RegExp(config.pass), fail: new RegExp(config.fail), build: new RegExp(config.build) };
  const mutants = parseList(JSON.parse(readFileSync(resolve(a.list), "utf8")));
  let picked = mutants.map((m, i) => i);
  if (a.only) {
    const [from, to] = a.only.split("-").map(Number);
    picked = picked.filter((i) => i >= from && i <= (to ?? from));
  }
  if (a.verify) {
    const repo = config.root ? resolve(config.root) : here;
    let missing = 0;
    for (const i of picked) {
      const path = join(repo, config.cwd, mutants[i].file);
      const source = existsSync(path) ? readFileSync(path, "utf8") : null;
      if (source === null || apply(source, mutants[i]) === null) {
        missing++;
        console.log(`MISSING #${i} ${mutants[i].file}: ${mutants[i].old.slice(0, 90).replace(/\n/g, " ")}`);
      }
    }
    console.log(`verify: ${picked.length - missing} of ${picked.length} mutants still apply`);
    process.exitCode = missing === 0 ? 0 : 1;
    return;
  }
  const root = mkdtempSync(join(tmpdir(), "orb-mutate-"));
  try {
    const workers = Math.max(1, Math.min(a.workers, picked.length || 1));
    const dirs = Array.from({ length: workers }, (_, k) => workspace(config, root, `w${k}`));
    const base = await run(config, dirs[0]);
    if (!patterns.pass.test(base.output) || base.exitCode !== 0) {
      console.error("The baseline does not pass; a mutation run would mean nothing.\n" + base.output.split("\n").slice(-12).join("\n"));
      process.exitCode = 2;
      return;
    }
    const results = new Array(mutants.length);
    await Promise.all(dirs.map(async (dir, k) => {
      for (const at of share(picked.length, workers, k)) {
        const i = picked[at];
        const m = mutants[i];
        const path = join(dir, config.cwd, m.file);
        const pristine = existsSync(path) ? readFileSync(path, "utf8") : null;
        const mutated = pristine === null ? null : apply(pristine, m);
        if (mutated === null) { results[i] = { index: i, mutant: m, outcome: MISSING }; continue; }
        writeFileSync(path, mutated);
        try {
          const r = await run(config, dir);
          results[i] = { index: i, mutant: m, outcome: classify(r, patterns), evidence: r.output.split("\n").filter((l) => patterns.fail.test(l)).slice(0, 2) };
        } finally {
          writeFileSync(path, pristine);
        }
      }
    }));
    const done = results.filter(Boolean);
    const summary = summarise(done);
    for (const r of done) {
      if (r.outcome === ALIVE && !r.mutant.equivalent) console.log(`ALIVE   #${r.index} ${r.mutant.file}: ${r.mutant.old.slice(0, 90).replace(/\n/g, " ")}  =>  ${r.mutant.new.slice(0, 50).replace(/\n/g, " ")}`);
      if (r.outcome === MISSING) console.log(`MISSING #${r.index} ${r.mutant.file}: ${r.mutant.old.slice(0, 90).replace(/\n/g, " ")}`);
      if (r.outcome === INVALID) console.log(`INVALID #${r.index} ${r.mutant.file}: does not build`);
    }
    console.log(`killed ${summary[KILLED]} · alive ${summary[ALIVE]} · equivalent ${summary[EQUIVALENT]} · missing ${summary[MISSING]} · invalid ${summary[INVALID]} · of ${summary.total}`);
    if (a.json) writeFileSync(a.json, JSON.stringify({ summary, results: done }, null, 1));
    process.exitCode = clean(summary) ? 0 : 1;
  } finally {
    if (!a.keep) rmSync(root, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 2;
});
