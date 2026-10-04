/**
 * Mutation-testing harness — the pure part (`tools/mutate/DESIGN.md`).
 *
 * A mutant replaces the first occurrence of `old` with `new` in one file. A good test suite fails on every mutant.
 * Everything here is a function of its arguments: no file system, no processes, no clock — so it can be tested without running a suite.
 */

/** @typedef {{file: string, old: string, new: string, equivalent?: string, note?: string}} Mutant */

export const KILLED = "killed";
export const ALIVE = "alive";
export const MISSING = "missing";
export const INVALID = "invalid";
export const EQUIVALENT = "equivalent";

/** The source with the first occurrence of `m.old` replaced, or null if `m.old` is not there. */
export function apply(source, m) {
  const at = source.indexOf(m.old);
  if (at < 0) return null;
  return source.slice(0, at) + m.new + source.slice(at + m.old.length);
}

/**
 * What a run of the test command means for a mutant.
 * - `invalid`: the mutant did not build — it says nothing about the tests.
 * - `killed`: the suite ran and failed.
 * - `alive`: the suite ran and passed — a missing test, or an equivalent mutant.
 * @param {{exitCode: number|null, output: string}} run
 * @param {{pass: RegExp, fail: RegExp, build: RegExp}} patterns
 */
export function classify(run, patterns) {
  const out = run.output;
  const ran = patterns.pass.test(out) || /\b\d+ checks?, \d+ failed/.test(out) || patterns.fail.test(out);
  if (!ran && patterns.build.test(out)) return INVALID;
  if (patterns.fail.test(out)) return KILLED;
  if (run.exitCode !== 0) return patterns.build.test(out) ? INVALID : KILLED;
  return patterns.pass.test(out) ? ALIVE : KILLED; // a suite that did not say it passed has not passed
}

/** Indexes assigned to worker `k` of `n`: round-robin, so a long list spreads evenly. */
export function share(total, n, k) {
  const out = [];
  for (let i = k; i < total; i += n) out.push(i);
  return out;
}

/** Counts by outcome. An alive mutant that carries an `equivalent` reason is counted as equivalent, not alive. */
export function summarise(results) {
  const counts = { [KILLED]: 0, [ALIVE]: 0, [MISSING]: 0, [INVALID]: 0, [EQUIVALENT]: 0 };
  for (const r of results) {
    if (r.outcome === ALIVE && r.mutant.equivalent) counts[EQUIVALENT]++;
    else counts[r.outcome]++;
  }
  const attempted = counts[KILLED] + counts[ALIVE] + counts[EQUIVALENT];
  return { ...counts, attempted, total: results.length };
}

/** Whether the run is clean: nothing alive, and no mutant whose `old` text has gone missing (a stale list proves nothing). Invalid ones are reported but do not fail. */
export function clean(summary) {
  return summary[ALIVE] === 0 && summary[MISSING] === 0;
}

/** Validates a list file's shape; returns the mutants or throws with the first thing wrong. */
export function parseList(json) {
  const list = Array.isArray(json) ? json : json && json.mutants;
  if (!Array.isArray(list)) throw new Error("a mutation list is an array, or an object with a `mutants` array");
  list.forEach((m, i) => {
    for (const k of ["file", "old", "new"]) {
      if (typeof m[k] !== "string") throw new Error(`mutant ${i}: \`${k}\` must be a string`);
    }
    if (m.old === m.new) throw new Error(`mutant ${i}: \`old\` and \`new\` are the same, so it changes nothing`);
    if (m.old === "") throw new Error(`mutant ${i}: \`old\` is empty`);
  });
  return list;
}
