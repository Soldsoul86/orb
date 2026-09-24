// The reasoning layer: when rules aren't enough, a model is asked, and only
// ever to propose. Pure; the shell (app.ts, the Android bridge) runs the model.
//
// Kernel contracts (contracts/): Reasoner (anything that turns a prompt into
// text), ModelRouter (which one runs this task), InferenceRecord (what was
// asked, of which model, what it said, what changed: kept as history).
//
// Privacy: facts are built on the phone and masked before any model sees them.
// People and accounts become labels ("person A"); only the phone knows who
// they are, and labels are mapped back on the phone. A cloud model runs only
// for a task you approved, and never gets raw messages, numbers or names.

import type { ImportResult } from '../import/run.ts';
import { mergeDuplicates } from '../profile.ts';
import type { Twin } from './twin.ts';

const DAY = 86_400_000;

export type ModelKind = 'on_device' | 'cloud' | 'rules';

export interface ModelInfo {
  readonly kind: ModelKind;
  /** e.g. "Google AICore", "Claude (via the app you shared to)", "Orb rules". */
  readonly provider: string;
  readonly name: string;
}

export const RULES: ModelInfo = { kind: 'rules', provider: 'Orb', name: 'rules' };

/** Which model runs a task: on the phone if it can; the cloud only with your yes for this task; else rules. */
export function routeModel(onDevice: ModelInfo | null, cloudApproved: boolean, cloud: ModelInfo): ModelInfo {
  if (onDevice !== null) return onDevice;
  if (cloudApproved) return cloud;
  return RULES;
}

// ── Facts, masked ──────────────────────────────────────────────────────────

export interface MaskedFacts {
  readonly facts: readonly string[];
  /** Label → real name. Stays on the phone. */
  readonly labels: Readonly<Record<string, string>>;
}

const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const letter = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `Z${i}`);

export interface GuardSummary {
  readonly paused: number;
  readonly notPaid: number;
  readonly messagesPaused: number;
}

/**
 * This week against your usual, as short masked sentences. People and
 * accounts are labelled; organisations (merchants, employers) keep their names
 * because they identify no one.
 */
export function baselineFacts(r: ImportResult, twin: Twin, now: number, guard: GuardSummary = { paused: 0, notPaid: 0, messagesPaused: 0 }): MaskedFacts {
  const labels: Record<string, string> = {};
  const reverse = new Map<string, string>();
  const kindOf = new Map(twin.entities.map((e) => [e.id, e]));
  const label = (key: string, name: string): string => {
    const e = kindOf.get(key);
    if (e !== undefined && e.kind === 'organisation') return name;
    const existing = reverse.get(key);
    if (existing !== undefined) return existing;
    const l = `${e?.kind === 'account' ? 'account' : 'person'} ${letter(reverse.size)}`;
    reverse.set(key, l);
    labels[l] = name;
    return l;
  };

  const txns = mergeDuplicates(r.txns).filter((t) => t.direction === 'debit');
  const facts: string[] = [];
  const range = r.profile.range;
  const sum = (from: number, to: number) => txns.filter((t) => t.at >= from && t.at < to).reduce((s, t) => s + t.amount, 0);
  if (range !== null) {
    const weeks = Math.max(1, (range.to - range.from) / (7 * DAY));
    const usualWeek = txns.reduce((s, t) => s + t.amount, 0) / weeks;
    facts.push(`Spent ${rupees(sum(now - 7 * DAY, now))} in the last 7 days; a usual week is ${rupees(usualWeek)}.`);
    const last30 = sum(now - 30 * DAY, now);
    const prev30 = sum(now - 60 * DAY, now - 30 * DAY);
    if (prev30 > 0) facts.push(`Spent ${rupees(last30)} in the last 30 days, against ${rupees(prev30)} in the 30 days before.`);
  }

  // Who got the most this month, and who is new.
  const month = txns.filter((t) => t.at >= now - 30 * DAY && t.unnamed !== true);
  const byKey = new Map<string, { name: string; total: number; count: number }>();
  for (const t of month) {
    const e = byKey.get(t.key) ?? { name: t.counterparty, total: 0, count: 0 };
    byKey.set(t.key, { name: e.name, total: e.total + t.amount, count: e.count + 1 });
  }
  const top = [...byKey.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 5);
  for (const [key, v] of top) {
    const rel = kindOf.get(key)?.relation;
    facts.push(`${label(key, v.name)}${rel ? ` (${rel})` : ''}: ${rupees(v.total)} in ${v.count} payment${v.count === 1 ? '' : 's'} this month.`);
  }
  const firstSeen = new Map<string, number>();
  for (const t of txns) firstSeen.set(t.key, Math.min(firstSeen.get(t.key) ?? Infinity, t.at));
  const fresh = [...byKey.entries()].filter(([key]) => (firstSeen.get(key) ?? 0) >= now - 30 * DAY).sort((a, b) => b[1].total - a[1].total).slice(0, 5);
  if (fresh.length > 0) facts.push(`New this month: ${fresh.map(([key, v]) => `${label(key, v.name)} (${rupees(v.total)})`).join(', ')}.`);

  const subs = r.profile.subscriptions.filter((s) => s.status === 'active');
  if (subs.length > 0) facts.push(`Regular payments: ${subs.slice(0, 6).map((s) => `${label(s.key, s.name)} ${rupees(s.usualAmount)} ${s.cycle}`).join(', ')}.`);
  const autopays = r.profile.autopays.filter((a) => a.status === 'active').length;
  if (autopays > 0) facts.push(`${autopays} autopays are active.`);
  if (guard.paused > 0) facts.push(`The pay guard paused ${guard.paused} payment${guard.paused === 1 ? '' : 's'} this week; ${guard.notPaid} were not made.`);
  if (guard.messagesPaused > 0) facts.push(`The message guard paused ${guard.messagesPaused} message${guard.messagesPaused === 1 ? '' : 's'} this week.`);
  if (r.calls && r.calls.persistentUnknown.length > 0) facts.push(`${r.calls.persistentUnknown.length} unknown number${r.calls.persistentUnknown.length === 1 ? '' : 's'} keep${r.calls.persistentUnknown.length === 1 ? 's' : ''} calling.`);
  if (twin.questions.length > 0) facts.push(`${twin.questions.length} questions are waiting for the user.`);
  return { facts, labels };
}

// ── The task ───────────────────────────────────────────────────────────────

export const BASELINE_TEMPLATE = 'weekly-baseline/1';

/** The prompt, exactly as a model sees it (and as you see it before approving a cloud run). */
export function baselinePrompt(f: MaskedFacts): string {
  return [
    "You help one person understand their own money week. Facts about this week, from their phone (people are labelled 'person A' etc.):",
    ...f.facts.map((x) => `- ${x}`),
    '',
    'Reply with JSON only, no other text:',
    '{"notes":[{"text":"one short sentence about what changed or is worth watching","about":"a label from the facts, or none"}],"questions":[{"text":"one short question worth asking them","about":"a label, or none"}]}',
    'At most 4 notes and 2 questions. Use only the facts given. Do not give financial advice. Keep labels exactly as written.',
  ].join('\n');
}

export interface Proposal {
  readonly kind: 'note' | 'question';
  readonly text: string;
  /** The real name, mapped back on the phone, if the note is about someone. */
  readonly about?: string;
}

/**
 * Checks a model's reply and maps labels back to real names. Anything that
 * isn't valid JSON of the expected shape, mentions a label the facts didn't
 * contain, or is too long is dropped: a model's reply is never trusted as is.
 */
export function readReply(reply: string, f: MaskedFacts): Proposal[] {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(reply.slice(start, end + 1));
  } catch {
    return [];
  }
  const out: Proposal[] = [];
  const take = (items: unknown, kind: Proposal['kind'], max: number) => {
    if (!Array.isArray(items)) return;
    for (const it of items.slice(0, max)) {
      if (typeof it !== 'object' || it === null) continue;
      const text = (it as { text?: unknown }).text;
      const about = (it as { about?: unknown }).about;
      if (typeof text !== 'string' || text.trim() === '' || text.length > 240) continue;
      // Every "person X" / "account X" mentioned must be one we gave.
      const mentioned = text.match(/\b(?:person|account) [A-Z]\d*\b/g) ?? [];
      if (mentioned.some((m) => f.labels[m] === undefined)) continue;
      const real = mentioned.reduce((s, m) => s.replaceAll(m, f.labels[m]!), text.trim());
      const aboutReal = typeof about === 'string' ? f.labels[about] ?? (f.facts.some((x) => x.includes(about)) && about !== 'none' ? about : undefined) : undefined;
      out.push({ kind, text: real, ...(aboutReal !== undefined ? { about: aboutReal } : {}) });
    }
  };
  const o = parsed as { notes?: unknown; questions?: unknown };
  take(o.notes, 'note', 4);
  take(o.questions, 'question', 2);
  return out;
}

/** Without a model: the same facts, turned into notes by fixed rules. */
export function rulesBaseline(r: ImportResult, now: number): Proposal[] {
  const txns = mergeDuplicates(r.txns).filter((t) => t.direction === 'debit');
  const sum = (from: number, to: number) => txns.filter((t) => t.at >= from && t.at < to).reduce((s, t) => s + t.amount, 0);
  const out: Proposal[] = [];
  const last30 = sum(now - 30 * DAY, now);
  const prev30 = sum(now - 60 * DAY, now - 30 * DAY);
  if (prev30 > 0 && Math.abs(last30 - prev30) / prev30 >= 0.3) {
    out.push({ kind: 'note', text: `You spent ${rupees(last30)} in the last 30 days, ${last30 > prev30 ? 'up' : 'down'} ${Math.round((Math.abs(last30 - prev30) / prev30) * 100)}% on the 30 days before.` });
  }
  const firstSeen = new Map<string, number>();
  for (const t of txns) firstSeen.set(t.key, Math.min(firstSeen.get(t.key) ?? Infinity, t.at));
  const fresh = txns.filter((t) => t.unnamed !== true && (firstSeen.get(t.key) ?? 0) >= now - 30 * DAY && t.at >= now - 30 * DAY);
  const freshTotal = new Map<string, { name: string; total: number }>();
  for (const t of fresh) freshTotal.set(t.key, { name: t.counterparty, total: (freshTotal.get(t.key)?.total ?? 0) + t.amount });
  const big = [...freshTotal.values()].filter((v) => v.total >= 5_000).sort((a, b) => b.total - a.total);
  for (const v of big.slice(0, 2)) out.push({ kind: 'note', text: `New this month: ${rupees(v.total)} to ${v.name}.`, about: v.name });
  return out;
}

// ── History ────────────────────────────────────────────────────────────────

/** One model run, kept as history (reasoning.jsonl). The prompt and reply are the masked ones. */
export interface InferenceRecord {
  readonly kind: 'inference';
  readonly id: string;
  readonly at: number;
  readonly task: string;
  readonly template: string;
  readonly model: ModelInfo;
  readonly prompt: string;
  readonly reply: string;
  readonly proposals: readonly Proposal[];
  /** For a cloud run: when you approved sending the prompt. */
  readonly approvedAt?: number;
}

export function inferenceRecord(task: string, model: ModelInfo, f: MaskedFacts, reply: string, at: number, approvedAt?: number): InferenceRecord {
  return {
    kind: 'inference',
    id: `i${at}`,
    at,
    task,
    template: BASELINE_TEMPLATE,
    model,
    prompt: baselinePrompt(f),
    reply,
    proposals: readReply(reply, f),
    ...(approvedAt !== undefined ? { approvedAt } : {}),
  };
}
