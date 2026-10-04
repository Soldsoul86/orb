/**
 * The slice machinery's pure core (`docs/ENGINEERING_SYSTEM.md` §3.3–3.4): a slice's budget and scope, the context pack, the change report and its status.
 * No git, file or clock access happens here; the report is a pure function of what the command line gathers, so the same inputs give the same report.
 */
import { globToRegExp } from "../scenarios/lib.mjs";

/** The stop conditions every slice carries (`/slice` states them; the report says which are met). */
export const STOP_CONDITIONS = [
  "a design conflict",
  "a change to a constitutional or protocol file without an approval record",
  "an unknown privacy implication",
  "a new permission, feature or query",
  "ambiguous protocol semantics",
  "three consecutive failed repairs",
  "a behavioural change in the ledger or the fit that the slice's scenarios do not explain",
];

/** Files a slice may always touch: its own records and the registers that record work. */
export const ALWAYS_ALLOWED = [
  "artifacts/**", "docs/slices/**", "docs/scenarios/**", "docs/DECISIONS.md", "docs/DECISIONS_PENDING.md", "docs/LEARNINGS.md", "docs/STATE.md", "docs/DEVICE_LOOP.md",
  "docs/ARCHITECTURAL_DEBT.md", "docs/SETTLED.md", "tools/mutate/lists/**",
];

export function validateSlice(slice) {
  const errors = [];
  if (!/^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*$/.test(slice.id ?? "")) errors.push("id must look like MONEY-B");
  for (const k of ["title", "design", "base"]) if (typeof slice[k] !== "string" || slice[k] === "") errors.push(`needs ${k}`);
  if (!Array.isArray(slice.decisions) || slice.decisions.some((d) => !/^DR-\d+$/.test(d))) errors.push("decisions must be a list of DR-n");
  if (!Array.isArray(slice.scenarios)) errors.push("scenarios must be a list of scenario ids");
  if (!Array.isArray(slice.invariants)) errors.push("invariants must be a list of invariant ids");
  if (!slice.scope || !Array.isArray(slice.scope.files) || slice.scope.files.length === 0) errors.push("scope.files must list the globs in scope");
  const b = slice.budget ?? {};
  for (const k of ["maxFiles", "maxLines", "maxFailedRuns"]) if (!Number.isInteger(b[k]) || b[k] <= 0) errors.push(`budget.${k} must be a positive integer`);
  const need = slice.required ?? [];
  if (!Array.isArray(need) || need.some((r) => !["phone", "tools", "mutation", "fit"].includes(r))) errors.push("required must list phone, tools, mutation, fit");
  return errors;
}

/** `git diff --numstat` plus untracked line counts → `{file, added, removed}`. Binary files (`-`) count as a file with no lines. */
export function parseNumstat(text) {
  return text.split("\n").filter(Boolean).map((line) => {
    const [a, d, ...rest] = line.split("\t");
    return { file: rest.join("\t"), added: a === "-" ? 0 : Number(a), removed: d === "-" ? 0 : Number(d) };
  });
}

/** The budget against a change, and which files are outside the slice's scope. Generated files are listed but not counted against it. */
export function budgetCheck(changes, slice, isGenerated) {
  const counted = changes.filter((c) => !isGenerated(c.file));
  const lines = counted.reduce((n, c) => n + c.added + c.removed, 0);
  const allowed = [...slice.scope.files, ...ALWAYS_ALLOWED, ...(slice.scope.alsoAllowed ?? [])].map(globToRegExp);
  const outside = counted.map((c) => c.file).filter((f) => !allowed.some((re) => re.test(f)));
  const over = [];
  if (counted.length > slice.budget.maxFiles) over.push(`files ${counted.length} > ${slice.budget.maxFiles}`);
  if (lines > slice.budget.maxLines) over.push(`lines ${lines} > ${slice.budget.maxLines}`);
  return { files: counted.length, lines, outside, over, ok: over.length === 0 && outside.length === 0 };
}

/** One decision's section out of `DECISIONS.md`: from its `## DR-n` heading to the next. Null if absent. */
export function decisionSection(markdown, id) {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^## ${id}\\b`).test(l));
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  if (end < 0) end = lines.length;
  return lines.slice(start, end).join("\n").trim();
}

/** Open decision-queue entries that name this slice. Titles and ids only. */
export function pendingFor(markdown, sliceId) {
  const body = markdown.split(/\n## Open\n/).pop();
  return body.split(/\n(?=## PD-)/).filter((b) => /^## PD-\d{3}/.test(b) && new RegExp(`\\*\\*Slice:\\*\\* ${sliceId}\\b`).test(b))
    .map((b) => ({ id: /^## (PD-\d{3})/.exec(b)[1], title: /^## PD-\d{3} — (.+)$/m.exec(b)?.[1] ?? "" }));
}

/** `N checks, M failed` from the phone harness. */
export function phoneSummary(text) {
  const m = /^\s*(\d+) checks, (\d+) failed/m.exec(text);
  return m ? { checks: Number(m[1]), failed: Number(m[2]) } : null;
}

/** `ℹ tests N` and `ℹ fail M` from `node --test --test-reporter=spec`. */
export function toolsSummary(text) {
  const t = /^ℹ tests (\d+)/m.exec(text);
  const f = /^ℹ fail (\d+)/m.exec(text);
  return t && f ? { checks: Number(t[1]), failed: Number(f[1]) } : null;
}

/** The probe's `dispositions` line → `{LOOP: n, …}`; null if absent. */
export function fitDispositions(text) {
  const m = /^dispositions (.+?)\s+sum (\d+) of (\d+)/m.exec(text);
  if (!m) return null;
  const out = {};
  for (const part of m[1].trim().split(/\s{2,}/)) {
    const [k, v] = part.split("=");
    out[k] = Number(v);
  }
  return { counts: out, total: Number(m[3]) };
}

/** Change per disposition between two fits, as signed counts. */
export function fitDelta(before, after) {
  if (!before || !after) return null;
  const out = {};
  for (const k of new Set([...Object.keys(before.counts), ...Object.keys(after.counts)])) out[k] = (after.counts[k] ?? 0) - (before.counts[k] ?? 0);
  return out;
}

export const BLOCKED = "BLOCKED";
export const INCOMPLETE = "INCOMPLETE";
export const REVIEW = "REVIEW REQUIRED";

/**
 * The status, from the model gathered. `BLOCKED` when anything the slice must not ship with is wrong; `INCOMPLETE` when proof the slice requires was not supplied;
 * otherwise `REVIEW REQUIRED`. It is never "ready": a person always reads the report.
 */
export function statusOf(m) {
  const blockers = [];
  if (m.budget && !m.budget.ok) blockers.push(...m.budget.over.map((o) => `budget: ${o}`), ...(m.budget.outside.length ? [`${m.budget.outside.length} file(s) outside the slice's scope`] : []));
  if (m.governance && m.governance.unapproved.length) blockers.push(`${m.governance.unapproved.length} gated change(s) without an approval record`);
  for (const [kind, s] of Object.entries(m.suites ?? {})) if (s && s.failed > 0) blockers.push(`${kind} suite: ${s.failed} failed`);
  const bad = (m.scenarios?.derived ?? []).filter((d) => ["failing", "unproven", "regressed"].includes(d.state));
  if (bad.length) blockers.push(`${bad.length} scenario(s) failing, unproven or regressed`);
  const notHeld = (m.impact?.threatened ?? []).filter((t) => t.heldBy === 0 || (m.suitesRun && !t.held));
  if (notHeld.length) blockers.push(`${notHeld.length} threatened invariant(s) not shown held`);
  if (m.mutation && (m.mutation.alive > 0 || m.mutation.missing > 0)) blockers.push(`mutation: ${m.mutation.alive} alive, ${m.mutation.missing} missing`);
  if (m.permissions && m.permissions.changed) blockers.push("permissions changed (needs a security approval)");
  const missing = (m.required ?? []).filter((r) => !m.supplied.includes(r));
  if (blockers.length) return { status: BLOCKED, reasons: blockers };
  if (missing.length) return { status: INCOMPLETE, reasons: missing.map((r) => `required proof not supplied: ${r}`) };
  const notes = [];
  if (m.governance?.selfGoverning.length) notes.push(`${m.governance.selfGoverning.length} self-governing file(s) changed`);
  if (m.pending?.length) notes.push(`${m.pending.length} open decision(s)`);
  const drafts = (m.scenarios?.derived ?? []).filter((d) => d.state === "draft" && m.scenarios.inSlice.includes(d.id));
  if (drafts.length) notes.push(`${drafts.length} draft scenario(s) in this slice`);
  return { status: REVIEW, reasons: notes };
}

const signed = (n) => (n > 0 ? `+${n}` : String(n));

/** The change report, as markdown. Counts, names and paths only. */
export function renderReport(m) {
  const s = statusOf(m);
  const L = [];
  L.push(`# Change report — ${m.slice.id}: ${m.slice.title}`);
  L.push("");
  L.push(`Commit ${m.head}${m.dirty ? " (working tree has uncommitted changes)" : ""} · base ${m.base} · ${m.date}`);
  L.push("");
  L.push(`**Status: ${s.status}**`);
  for (const r of s.reasons) L.push(`- ${r}`);
  L.push("");
  L.push("## What changed");
  L.push(`- Files ${m.budget.files} · lines +${m.changes.reduce((n, c) => n + c.added, 0)} −${m.changes.reduce((n, c) => n + c.removed, 0)} · budget ${m.slice.budget.maxFiles} files / ${m.slice.budget.maxLines} lines${m.budget.over.length ? ` — OVER (${m.budget.over.join("; ")})` : ""}`);
  L.push(`- By class: ${Object.entries(m.governance.byClass).map(([k, v]) => `${k} ${v}`).join(" · ") || "none"}`);
  if (m.budget.outside.length) L.push(`- Outside the slice's scope (${m.budget.outside.length}): ${m.budget.outside.slice(0, 12).join(", ")}${m.budget.outside.length > 12 ? ", …" : ""}`);
  if (m.governance.generated.length) L.push(`- Generated files in the change (never hand-edited): ${m.governance.generated.length}`);
  L.push("");
  L.push("## Gates");
  L.push(`- Gated changes ${m.governance.approved.length + m.governance.unapproved.length} · approved ${m.governance.approved.length} · unapproved ${m.governance.unapproved.length}`);
  for (const u of m.governance.unapproved) L.push(`  - UNAPPROVED ${u.class} ${u.file} needs ${u.gate}`);
  for (const a of m.governance.approved) L.push(`  - ${a.class} ${a.file} — ${a.refs.join(", ")}`);
  for (const f of m.governance.selfGoverning) L.push(`  - SELF-GOVERNING ${f} changed: review required whatever the approvals say`);
  L.push("");
  L.push("## Scenarios");
  const d = m.scenarios.derived;
  const count = (st) => d.filter((x) => x.state === st).length;
  L.push(`- Registry ${d.length}: tested ${count("tested")} · draft ${count("draft")} · failing ${count("failing")} · unproven ${count("unproven")} · regressed ${count("regressed")}`);
  const high = d.filter((x) => x.risk === "high");
  L.push(`- High-risk proven ${high.filter((x) => x.state === "tested").length}/${high.length}`);
  L.push(`- In this slice ${m.scenarios.inSlice.length}: ${m.scenarios.inSlice.map((id) => `${id} ${d.find((x) => x.id === id)?.state ?? "missing"}`).join(", ") || "none"}`);
  L.push(`- Affected by the change (${m.impact.affected.length}): ${m.impact.affected.map((a) => a.id).join(", ") || "none"}`);
  L.push("");
  L.push("## Invariants");
  L.push(`- Threatened ${m.impact.threatened.length}${m.suitesRun ? ` · held ${m.impact.threatened.filter((t) => t.held).length} · not held ${m.impact.threatened.filter((t) => !t.held).length}` : " (suites not supplied: held-ness not checked)"}`);
  for (const t of m.impact.threatened) L.push(`  - ${t.id} ${m.suitesRun ? (t.held ? "held" : "NOT HELD") : `${t.heldBy} checks`} — ${t.statement}`);
  L.push("");
  L.push("## Proof");
  for (const [k, label] of [["phone", "Phone suite"], ["tools", "Tool tests"]]) {
    const x = m.suites[k];
    L.push(`- ${label}: ${x ? `${x.checks} checks, ${x.failed} failed` : "NOT SUPPLIED"}`);
  }
  L.push(`- Mutation: ${m.mutation ? `killed ${m.mutation.killed} · alive ${m.mutation.alive} · equivalent ${m.mutation.equivalent} · missing ${m.mutation.missing} · invalid ${m.mutation.invalid} of ${m.mutation.total}` : "NOT SUPPLIED"}`);
  L.push("");
  L.push("## Fit");
  if (!m.fit) L.push("- NOT SUPPLIED");
  else {
    L.push(`- Dispositions (${m.fit.total} service messages; coverage, not accuracy): ${Object.entries(m.fit.counts).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
    L.push(m.fitDelta ? `- Change from the last report: ${Object.entries(m.fitDelta).map(([k, v]) => `${k} ${signed(v)}`).join(" · ")}${Object.values(m.fitDelta).every((v) => v === 0) ? " (unchanged)" : ""}` : "- No earlier report to compare with");
  }
  L.push("");
  L.push("## Permissions");
  L.push(m.permissions.changed ? `- CHANGED: added ${m.permissions.added.length}, removed ${m.permissions.removed.length}${[...m.permissions.added.map((x) => `\n  - + ${x}`), ...m.permissions.removed.map((x) => `\n  - − ${x}`)].join("")}` : "- Unchanged");
  L.push("");
  L.push("## Privacy");
  const priv = d.filter((x) => m.scenarios.privacy.includes(x.id));
  L.push(`- Privacy scenarios proven ${priv.filter((x) => x.state === "tested").length}/${priv.length}`);
  L.push("");
  L.push("## Decisions");
  L.push(`- Approved designs this slice rests on: ${m.slice.decisions.join(", ") || "none"}`);
  L.push(`- Open: ${m.pending.length ? m.pending.map((p) => `${p.id} (${p.title})`).join("; ") : "none"}`);
  L.push("");
  L.push("## Stop conditions");
  for (const c of STOP_CONDITIONS) L.push(`- ${c}: ${m.stops.includes(c) ? "MET" : "not met"}`);
  L.push("");
  L.push("## Known limitations");
  for (const x of m.slice.limitations ?? []) L.push(`- ${x}`);
  if (!(m.slice.limitations ?? []).length) L.push("- none recorded");
  L.push("");
  return L.join("\n");
}

/** Which stop conditions the gathered facts show were met. */
export function stopsMet(m) {
  const met = [];
  if (m.governance.unapproved.some((u) => u.class === "CONSTITUTIONAL" || u.class === "PROTOCOL")) met.push(STOP_CONDITIONS[1]);
  if (m.permissions.changed) met.push(STOP_CONDITIONS[3]);
  if (m.fitDelta && m.slice.expectFitChange !== true && Object.values(m.fitDelta).some((v) => v !== 0)) met.push(STOP_CONDITIONS[6]);
  return met;
}

/** The context pack: the slice's own documents, and nothing else. */
export function renderContext(slice, parts) {
  const L = [`# Context pack — ${slice.id}: ${slice.title}`, "", "*Only what this slice needs. If something you need is not here, say so and stop; do not widen your reading.*", ""];
  L.push("## The slice", "", "```json", JSON.stringify(slice, null, 1), "```", "");
  L.push("## Stop conditions", "", ...STOP_CONDITIONS.map((c) => `- ${c}`), "");
  L.push(`## Design — ${slice.design}`, "", parts.design, "");
  for (const [id, text] of Object.entries(parts.decisions)) L.push(`## Decision ${id}`, "", text ?? "(not found in DECISIONS.md)", "");
  L.push("## Invariants in play", "", "```json", JSON.stringify(parts.invariants, null, 1), "```", "");
  L.push("## Scenarios in play", "", "```json", JSON.stringify(parts.scenarios, null, 1), "```", "");
  L.push("## File classes and gates", "", ...parts.classes.map((c) => `- ${c}`), "");
  L.push("## Open decisions that name this slice", "", parts.pending.length ? parts.pending.map((p) => `- ${p.id} — ${p.title}`).join("\n") : "none", "");
  L.push("## Files in scope", "", ...parts.files.map((f) => `- ${f}`), "");
  return L.join("\n");
}
