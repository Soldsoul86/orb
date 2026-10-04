/**
 * The scenario and invariant registries' pure core (`tools/scenarios/DESIGN.md`, `docs/ENGINEERING_SYSTEM.md` §3.1–3.2): validation, the **derived** state of a
 * scenario from the proof it names, and impact (which invariants and scenarios a set of changed files puts at risk). No file, git or clock access happens here.
 *
 * A scenario is never itself proof. The chain is scenario → named checks → their passing result in a suite run → the commit the run was made on.
 */

export const CATEGORIES = ["happy", "boundary", "adversarial", "privacy", "recovery", "evolution"];
export const RISKS = ["high", "medium", "low"];
export const SUITES = ["phone", "tools"];

export const DRAFT = "draft";
export const TESTED = "tested";
export const FAILING = "failing";
export const UNPROVEN = "unproven";
export const REGRESSED = "regressed";

const plain = (s) => s.replace(/[^\x00-\x7f]/g, "?");

/** Names are compared as the suites print them: the phone's JVM prints any non-ASCII character as `?`. */
export const normalise = (name) => plain(String(name)).replace(/\s+/g, " ").trim();

/**
 * Reads a suite run into `[{group, name, ok}]`. `phone`: the Java harness (`  group` headings, `    ok   name` and `    FAIL name` lines).
 * `tools`: `node --test --test-reporter=spec` (`✔ name (1.2ms)` and `✖ name (1.2ms)`).
 */
export function parseSuite(kind, text) {
  const out = [];
  if (kind === "phone") {
    let group = "";
    for (const line of text.split("\n")) {
      const heading = /^ {2}(\S.*)$/.exec(line);
      const check = /^ {4}(ok {3}|FAIL )(.*)$/.exec(line);
      if (check) out.push({ group, name: normalise(check[2]), ok: check[1].startsWith("ok") });
      else if (heading && !/^\d+ checks,/.test(heading[1])) group = normalise(heading[1]);
    }
  } else if (kind === "tools") {
    for (const line of text.split("\n")) {
      const m = /^\s*(✔|✖)\s+(.*?)\s+\(\d+(?:\.\d+)?ms\)\s*$/.exec(line);
      if (m) out.push({ group: "", name: normalise(m[2]), ok: m[1] === "✔" });
    }
  } else {
    throw new Error(`unknown suite kind ${kind}`);
  }
  return out;
}

/** `suite name → results`. */
export function indexSuites(runs) {
  return Object.fromEntries(Object.entries(runs).map(([kind, text]) => [kind, parseSuite(kind, text)]));
}

function matches(proof, results) {
  const name = normalise(proof.check);
  const group = proof.group === undefined ? undefined : normalise(proof.group);
  return results.filter((r) => r.name === name && (group === undefined || r.group === group));
}

/** One proof entry: `found` (how many results carry that name), `failing` (how many of those failed). */
export function proofStatus(proof, suites) {
  const results = suites[proof.suite];
  if (!results) return { found: 0, failing: 0, suiteMissing: true };
  const hit = matches(proof, results);
  return { found: hit.length, failing: hit.filter((r) => !r.ok).length, suiteMissing: false };
}

/**
 * The state of a scenario, derived and never typed: `draft` (names no proof), `failing` (a named check ran and failed), `unproven` (a named check did not run:
 * deleted, renamed, or its suite was not run), `tested` (every named check ran and passed). `regressed` is `tested` before and not now (given `previous`).
 */
export function stateOf(scenario, suites, previous) {
  const proofs = scenario.proof ?? [];
  if (proofs.length === 0) return { state: DRAFT, missing: [], failing: [] };
  const missing = [];
  const failing = [];
  for (const p of proofs) {
    const s = proofStatus(p, suites);
    if (s.found === 0) missing.push(p.check);
    else if (s.failing > 0) failing.push(p.check);
  }
  let state = failing.length > 0 ? FAILING : missing.length > 0 ? UNPROVEN : TESTED;
  if (state !== TESTED && previous === TESTED) state = REGRESSED;
  return { state, missing, failing };
}

export function derive(scenarios, suites, baseline = {}) {
  return scenarios.map((s) => ({ id: s.id, name: s.name, risk: s.risk, ...stateOf(s, suites, baseline[s.id]) }));
}

export function summarise(derived) {
  const counts = { total: derived.length, [TESTED]: 0, [DRAFT]: 0, [FAILING]: 0, [UNPROVEN]: 0, [REGRESSED]: 0 };
  for (const d of derived) counts[d.state]++;
  const high = derived.filter((d) => d.risk === "high");
  return { ...counts, high: high.length, highTested: high.filter((d) => d.state === TESTED).length, ok: counts[FAILING] + counts[UNPROVEN] + counts[REGRESSED] === 0 };
}

const idOf = /^[A-Z][A-Z0-9]*-\d{3}$/;
const invariantId = /^I-\d{3}$/;
const nonEmpty = (a) => Array.isArray(a) && a.length > 0 && a.every((x) => typeof x === "string" && x.trim() !== "");

export function validateInvariants(doc) {
  const errors = [];
  const seen = new Set();
  for (const [i, inv] of (doc.invariants ?? []).entries()) {
    const at = `invariant ${inv.id ?? i}`;
    if (!invariantId.test(inv.id ?? "")) errors.push(`${at}: id must look like I-001`);
    if (seen.has(inv.id)) errors.push(`${at}: duplicate id`);
    seen.add(inv.id);
    if (typeof inv.statement !== "string" || inv.statement.trim() === "") errors.push(`${at}: needs a statement`);
    if (typeof inv.source !== "string" || inv.source.trim() === "") errors.push(`${at}: needs a source (the article, contract or decision it comes from)`);
    if (!Array.isArray(inv.threatenedBy) || inv.threatenedBy.length === 0) errors.push(`${at}: needs threatenedBy globs`);
    for (const p of inv.heldBy ?? []) {
      if (!SUITES.includes(p.suite) || typeof p.check !== "string") errors.push(`${at}: a heldBy entry needs a suite (${SUITES.join(", ")}) and a check`);
    }
  }
  if (!Array.isArray(doc.invariants)) errors.push("invariants must be an array");
  return errors;
}

export function validateScenarios(doc, invariantIds, allIds = new Set()) {
  const errors = [];
  const domain = doc.domain;
  if (typeof domain !== "string" || domain === "") errors.push("a scenario file needs a domain");
  for (const [i, s] of (doc.scenarios ?? []).entries()) {
    const at = `scenario ${s.id ?? i}`;
    if (!idOf.test(s.id ?? "")) errors.push(`${at}: id must look like M-001`);
    if (allIds.has(s.id)) errors.push(`${at}: duplicate id`);
    allIds.add(s.id);
    if (typeof s.name !== "string" || s.name.trim() === "") errors.push(`${at}: needs a name`);
    if (!CATEGORIES.includes(s.category)) errors.push(`${at}: category must be one of ${CATEGORIES.join(", ")}`);
    if (!RISKS.includes(s.risk)) errors.push(`${at}: risk must be one of ${RISKS.join(", ")}`);
    for (const k of ["given", "when", "then"]) if (!nonEmpty(s[k])) errors.push(`${at}: needs ${k}`);
    if (!nonEmpty(s.mustNot)) errors.push(`${at}: needs mustNot (a scenario with nothing it must not do is incomplete)`);
    if (!nonEmpty(s.invariants)) errors.push(`${at}: names no invariant`);
    for (const inv of s.invariants ?? []) if (!invariantIds.has(inv)) errors.push(`${at}: unknown invariant ${inv}`);
    if (!Array.isArray(s.files) || s.files.length === 0) errors.push(`${at}: needs files (globs of the code it exercises)`);
    for (const p of s.proof ?? []) {
      if (!SUITES.includes(p.suite) || typeof p.check !== "string" || p.check.trim() === "") errors.push(`${at}: a proof needs a suite (${SUITES.join(", ")}) and a check`);
    }
    if (s.device !== undefined && typeof s.device.section !== "string") errors.push(`${at}: device proof must cite a DEVICE_LOOP section`);
  }
  if (!Array.isArray(doc.scenarios)) errors.push("scenarios must be an array");
  return errors;
}

/** A glob: `**` any path, `*` within a segment, `?` one character. */
export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      i++;
      if (glob[i + 1] === "/") {   // `**/` is any directories, or none
        re += "(?:.*/)?";
        i++;
      } else re += ".*";
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

export const touches = (globs, files) => files.filter((f) => globs.some((g) => globToRegExp(g).test(f)));

/**
 * Given changed files: the invariants whose `threatenedBy` they match (and whether each still has a `heldBy` check that exists and passes), and the scenarios whose
 * `files` or invariants they touch.
 */
export function impact(files, invariants, scenarios, suites) {
  const threatened = [];
  for (const inv of invariants) {
    const hit = touches(inv.threatenedBy, files);
    if (hit.length === 0) continue;
    const held = (inv.heldBy ?? []).map((p) => ({ check: p.check, ...proofStatus(p, suites) }));
    threatened.push({
      id: inv.id,
      statement: inv.statement,
      files: hit.length,
      held: held.length > 0 && held.every((h) => h.found > 0 && h.failing === 0),
      heldBy: held.length,
      unheld: held.filter((h) => h.found === 0 || h.failing > 0).map((h) => h.check),
    });
  }
  const ids = new Set(threatened.map((t) => t.id));
  const affected = scenarios
    .filter((s) => touches(s.files ?? [], files).length > 0 || (s.invariants ?? []).some((i) => ids.has(i)))
    .map((s) => ({ id: s.id, name: s.name, risk: s.risk, byFiles: touches(s.files ?? [], files).length > 0 }));
  return { threatened, affected };
}
