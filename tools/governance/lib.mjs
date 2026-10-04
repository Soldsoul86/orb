/**
 * The governance check's pure core (`docs/ENGINEERING_SYSTEM.md` §3.5): every changed file belongs to one **class**; a class may carry a **gate**; a change to a
 * gated file needs a matching **approval record**. A report, not a lock: it makes an unnoticed weakening of a rule impossible to miss.
 */
import { globToRegExp } from "../scenarios/lib.mjs";

export const GATES = ["PROTOCOL_APPROVAL", "DESIGN_APPROVAL", "SECURITY_APPROVAL", "RELEASE_APPROVAL"];
export const CLASSES = ["CONSTITUTIONAL", "PROTOCOL", "CONTRACT", "DECISION", "DOMAIN", "TEST", "TOOL", "GENERATED", "DEVICE", "SECURITY"];

export function validateClasses(doc) {
  const errors = [];
  for (const [name, c] of Object.entries(doc.classes ?? {})) {
    if (!CLASSES.includes(name)) errors.push(`unknown class ${name}`);
    if (c.gate !== null && c.gate !== undefined && !GATES.includes(c.gate)) errors.push(`class ${name}: gate must be null or one of ${GATES.join(", ")}`);
  }
  for (const [i, r] of (doc.rules ?? []).entries()) {
    if (typeof r.glob !== "string" || r.glob === "") errors.push(`rule ${i}: needs a glob`);
    if (!(r.class in (doc.classes ?? {}))) errors.push(`rule ${i} (${r.glob}): class ${r.class} is not declared`);
    if (r.watch !== undefined && r.watch !== "manifest-permissions") errors.push(`rule ${i} (${r.glob}): unknown watch ${r.watch}`);
  }
  if (!Array.isArray(doc.rules) || doc.rules.length === 0) errors.push("needs rules");
  if (!doc.selfGoverning || doc.selfGoverning.length === 0) errors.push("needs selfGoverning (the files whose change is always flagged)");
  return errors;
}

export function validateApprovals(doc) {
  const errors = [];
  for (const [i, a] of (doc.approvals ?? []).entries()) {
    if (!GATES.includes(a.gate)) errors.push(`approval ${i}: gate must be one of ${GATES.join(", ")}`);
    if (!Array.isArray(a.paths) || a.paths.length === 0) errors.push(`approval ${i}: needs paths`);
    if (typeof a.ref !== "string" || a.ref === "") errors.push(`approval ${i}: needs a ref (the decision that approved it)`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date ?? "")) errors.push(`approval ${i}: needs a date`);
    if (a.until !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(a.until)) errors.push(`approval ${i}: until must be a date`);
  }
  if (!Array.isArray(doc.approvals)) errors.push("approvals must be an array");
  return errors;
}

/** The class of a file: the first rule whose glob matches. A file no rule names is DOMAIN, ungated, and said so. */
export function classify(file, doc) {
  for (const r of doc.rules) {
    if (globToRegExp(r.glob).test(file)) return { class: r.class, gate: doc.classes[r.class].gate ?? null, watch: r.watch, rule: r.glob };
  }
  return { class: "DOMAIN", gate: null, rule: null };
}

/** Whether an approval covers a file on a date (ISO). */
export function covered(file, gate, approvals, today) {
  return approvals.filter((a) => a.gate === gate && a.date <= today && (a.until === undefined || a.until >= today) && a.paths.some((p) => globToRegExp(p).test(file)));
}

/**
 * Checks a change set. `ctx.permissionsChanged(file)` says whether a watched manifest's permissions differ (a manifest edit that adds only an activity is not a
 * security change). Returns per-class counts, the files needing an approval that has none, the generated files touched, and whether a self-governing file changed.
 */
export function check(files, classesDoc, approvalsDoc, ctx) {
  const byClass = {};
  const unapproved = [];
  const approved = [];
  const generated = [];
  const unclassified = [];
  for (const file of files) {
    const c = classify(file, classesDoc);
    byClass[c.class] = (byClass[c.class] ?? 0) + 1;
    if (c.rule === null) unclassified.push(file);
    if (c.class === "GENERATED") generated.push(file);
    if (!c.gate) continue;
    if (c.watch === "manifest-permissions" && !ctx.permissionsChanged(file)) continue;
    const cover = covered(file, c.gate, approvalsDoc.approvals, ctx.today);
    (cover.length > 0 ? approved : unapproved).push({ file, class: c.class, gate: c.gate, refs: cover.map((a) => a.ref) });
  }
  const selfGoverning = files.filter((f) => classesDoc.selfGoverning.some((g) => globToRegExp(g).test(f)));
  return { files: files.length, byClass, unapproved, approved, generated, unclassified, selfGoverning, ok: unapproved.length === 0 };
}

/** The `uses-permission`, `uses-feature` and `queries` entries of a manifest, as a sorted list: what a security review would look at. */
export function permissionsOf(manifest) {
  const text = manifest.replace(/<!--[\s\S]*?-->/g, "");
  const found = [];
  for (const m of text.matchAll(/<(uses-permission[a-z-]*|uses-feature|queries|package|intent)\b[^>]*>/g)) found.push(m[0].replace(/\s+/g, " "));
  return found.sort();
}
