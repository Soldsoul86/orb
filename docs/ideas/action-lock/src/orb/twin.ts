// Orb's model of you, built from what the phone observed and what you told it. Pure.
//
// Terms follow the Orb kernel contracts (contracts/*.md):
//   · Observation / Fact — what the sensors read: "₹3,10,338 from GIOTTUS on 1 Sep".
//     Android already keeps that history (SMS, call log); it is read, not copied.
//   · Entity — a person, organisation or account, resolved from many observations.
//   · Belief — an interpretation with a confidence and a reason: "GIOTTUS pays you
//     a salary (0.8, because 14 monthly credits)".
//   · Your answer — an Event in Orb's own journal. It never edits a belief; the
//     twin is rebuilt from the observations plus every answer, so any answer can
//     be changed later by answering again.
//   · Twin — the result: recomputable at any time, never the source of truth.
//
// Nothing here is certain: a belief you confirmed is held at 0.99, not 1.

import { mergeDuplicates } from '../profile.ts';
import type { ImportResult } from '../import/run.ts';
import { UNNAMED_KEY, type Txn } from '../import/types.ts';
import { displayMerchant, type Subscription } from '../subscriptions.ts';

const DAY = 86_400_000;

// ── Events ─────────────────────────────────────────────────────────────────

/** Your answer to a question: the only thing Orb itself records. Append-only. */
export interface AnswerEvent {
  readonly kind: 'answer';
  readonly id: string;
  readonly at: number;
  readonly question: string;
  readonly value: string;
}

export function answer(question: string, value: string, at: number, seq: number): AnswerEvent {
  return { kind: 'answer', id: `a${at}-${seq}`, at, question, value };
}

// ── The twin ───────────────────────────────────────────────────────────────

export type EntityKind = 'person' | 'organisation' | 'account';

export interface Moment {
  readonly at: number;
  readonly amount: number;
  readonly direction: 'debit' | 'credit';
}

export interface Entity {
  readonly id: string;
  readonly kind: EntityKind;
  readonly name: string;
  /** The contact this name matches, if any. */
  readonly contact?: string;
  readonly paidOut: number;
  readonly paidIn: number;
  readonly count: number;
  readonly first: number;
  readonly last: number;
  /** Most recent money moments, newest first (the entity's timeline). */
  readonly timeline: readonly Moment[];
  /** What you said this entity is to you ("family", "employer"…), if you did. */
  readonly relation?: string;
}

export interface Belief {
  readonly id: string;
  /** Entity id, or "you" for beliefs about you. */
  readonly about: string;
  readonly text: string;
  /** In [0, 1]; never 0 or 1. */
  readonly confidence: number;
  /** Why Orb thinks so, in words, pointing at the evidence. */
  readonly because: string;
  readonly source: 'observed' | 'you';
}

export interface Option {
  readonly value: string;
  readonly label: string;
}

export interface Question {
  readonly id: string;
  readonly about: string;
  readonly text: string;
  readonly because: string;
  readonly options: readonly Option[];
  /** How much answering it changes: higher is asked first. */
  readonly score: number;
}

export interface BriefItem {
  readonly kind: 'money' | 'due' | 'security' | 'question';
  readonly text: string;
}

export interface Twin {
  readonly builtAt: number;
  readonly entities: readonly Entity[];
  readonly beliefs: readonly Belief[];
  /** Waiting for you, most valuable first. */
  readonly questions: readonly Question[];
  /** Questions already answered, so an answer can be changed later (by answering again). */
  readonly answeredQuestions: readonly (Question & { readonly answer: string })[];
  readonly answered: number;
  /** Money out in the last 30 days by what the payee is to you. */
  readonly spendByRelation: readonly { readonly relation: string; readonly amount: number }[];
  readonly brief: readonly BriefItem[];
}

// ── Entities ───────────────────────────────────────────────────────────────

const ORG =
  /\b(?:LTD|LIMITED|PVT|PRIVATE|LLP|INC|CORP|TECHNOLOGIES|TECHNOLOGY|SERVICES|SOLUTIONS|SYSTEMS|BANK|INDIA|ENTERPRISES?|TRADERS|STORES?|MART|FOODS?|RETAIL|INTERNET|PAYMENTS?|INSURANCE|FINANCE|CAPITAL|HOSPITAL|PHARMACY|RESTAURANT|CAFE|HOTEL|TRAVELS?|MOTORS|NETFLIX|AMAZON|SWIGGY|ZOMATO|GOOGLE|APPLE|JIO|AIRTEL|INTEREST)\b/i;
const letters = (s: string) => s.toLowerCase().replace(/@.*$/, '').replace(/[^a-z]/g, '');

function kindOf(t: Txn): EntityKind {
  if (/^Account /.test(t.counterparty)) return 'account';
  if (ORG.test(t.counterparty)) return 'organisation';
  // Merchant UPI IDs ("swiggy@icici", "paytmqr…@paytm") rather than a person's name.
  if (t.vpa !== undefined && t.counterparty === t.vpa) return 'organisation';
  if (/\d{3,}/.test(t.counterparty)) return 'organisation';
  return 'person';
}

/** Is this payee you? Names match when one begins the other, over at least 6 letters ("Hariharan V" / "Hariharan Viswanathan"). */
export function isSelf(name: string, selfNames: readonly string[]): boolean {
  const n = letters(name);
  return n.length >= 6 && selfNames.some((s) => {
    const l = letters(s);
    return l.length >= 6 && (n.startsWith(l) || l.startsWith(n));
  });
}

function entitiesOf(txns: readonly Txn[], people: readonly string[]): Entity[] {
  const byKey = new Map<string, Txn[]>();
  for (const t of txns) if (t.unnamed !== true && t.key !== UNNAMED_KEY) byKey.set(t.key, [...(byKey.get(t.key) ?? []), t]);
  const contacts = new Map(people.map((p) => [letters(p), p]));
  return [...byKey.entries()].map(([key, ts]) => {
    const sorted = [...ts].sort((a, b) => a.at - b.at);
    const last = sorted[sorted.length - 1]!;
    const n = letters(last.counterparty);
    const contact = n.length >= 8 ? contacts.get(n) : undefined;
    return {
      id: key,
      kind: kindOf(last),
      name: last.counterparty,
      ...(contact !== undefined ? { contact } : {}),
      paidOut: sorted.filter((t) => t.direction === 'debit').reduce((s, t) => s + t.amount, 0),
      paidIn: sorted.filter((t) => t.direction === 'credit').reduce((s, t) => s + t.amount, 0),
      count: sorted.length,
      first: sorted[0]!.at,
      last: last.at,
      timeline: sorted
        .slice(-20)
        .reverse()
        .map((t) => ({ at: t.at, amount: t.amount, direction: t.direction })),
    };
  });
}

// ── Rules: observations → beliefs and questions ───────────────────────────

interface Candidate {
  readonly belief: Belief;
  readonly question?: Omit<Question, 'id' | 'about'>;
  /** What each answer means: the belief text held once you answer. */
  readonly meaning: Readonly<Record<string, string>>;
  /** The relation an answer gives the entity, if any. */
  readonly relation?: Readonly<Record<string, string>>;
}

const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const day = (ms: number) => new Date(ms + 330 * 60_000).toISOString().slice(0, 10);
const shortDate = (ms: number) => new Date(ms + 330 * 60_000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const median = (xs: readonly number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** Regular large credits in most months: a salary or other steady income. */
function incomeRule(e: Entity, txns: readonly Txn[]): Candidate | null {
  const credits = txns.filter((t) => t.key === e.id && t.direction === 'credit');
  const months = new Set(credits.map((t) => day(t.at).slice(0, 7)));
  if (credits.length < 3 || months.size < 3) return null;
  const usual = median(credits.map((t) => t.amount));
  if (usual < 10_000) return null;
  const steady = credits.filter((t) => Math.abs(t.amount - usual) <= usual * 0.25).length / credits.length;
  if (steady < 0.6) return null;
  const dayOfMonth = median(credits.map((t) => new Date(t.at + 330 * 60_000).getUTCDate()));
  const confidence = Math.min(0.9, 0.5 + months.size * 0.04);
  return {
    belief: {
      id: `income:${e.id}`,
      about: e.id,
      text: `${e.name} pays you about ${rupees(usual)} a month, usually around day ${dayOfMonth}`,
      confidence,
      because: `${credits.length} credits in ${months.size} months`,
      source: 'observed',
    },
    question: {
      text: `Is the ~${rupees(usual)} a month from ${e.name} your salary?`,
      because: `${credits.length} credits in ${months.size} months, usually around day ${dayOfMonth}`,
      options: [
        { value: 'salary', label: 'Yes, my salary' },
        { value: 'other_income', label: 'Other income' },
        { value: 'not_mine', label: 'Not income' },
      ],
      score: 1_000 + usual / 1_000,
    },
    meaning: {
      salary: `${e.name} is your employer and pays your salary (about ${rupees(usual)} around day ${dayOfMonth})`,
      other_income: `${e.name} pays you regular income (about ${rupees(usual)} a month)`,
      not_mine: `The money from ${e.name} is not your income`,
    },
    relation: { salary: 'employer', other_income: 'income' },
  };
}

const RELATIONS: readonly Option[] = [
  { value: 'me', label: 'Me (my own account)' },
  { value: 'family', label: 'Family' },
  { value: 'friend', label: 'Friend' },
  { value: 'landlord', label: 'Landlord / rent' },
  { value: 'work', label: 'Work' },
  { value: 'service', label: 'A service I pay' },
  { value: 'other', label: 'Other' },
];

/** People you move a lot of money with: who are they to you? */
function relationRule(e: Entity, regular?: Subscription): Candidate | null {
  if (e.kind !== 'person') return null;
  const total = e.paidOut + e.paidIn;
  if (e.count < 5 && total < 20_000) return null;
  const since = new Date(e.first + 330 * 60_000).getUTCFullYear();
  const because =
    `${e.count} payments since ${since}: ${rupees(e.paidOut)} sent, ${rupees(e.paidIn)} received` +
    (regular !== undefined ? `; about ${rupees(regular.usualAmount)} ${regular.cycle}` : '') +
    (e.contact ? `; in your contacts as "${e.contact}"` : '');
  return {
    belief: { id: `relation:${e.id}`, about: e.id, text: `${e.name} is someone close to you`, confidence: Math.min(0.8, 0.4 + e.count / 100), because, source: 'observed' },
    question: { text: `Who is ${e.name} to you?`, because, options: RELATIONS, score: 200 + total / 1_000 },
    meaning: Object.fromEntries(RELATIONS.map((o) => [o.value, `${e.name}: ${o.label.toLowerCase()}`])),
    relation: Object.fromEntries(RELATIONS.map((o) => [o.value, o.value === 'me' ? 'you' : o.value])),
  };
}

/** A large payment to someone paid only once: worth knowing what it was. */
function oneOffRule(e: Entity, txns: readonly Txn[]): Candidate | null {
  const out = txns.filter((t) => t.key === e.id && t.direction === 'debit');
  if (out.length !== 1 || out[0]!.amount < 20_000) return null;
  const t = out[0]!;
  const options: Option[] = [
    { value: 'purchase', label: 'A purchase' },
    { value: 'loan_given', label: 'A loan I gave' },
    { value: 'deposit', label: 'Rent or deposit' },
    { value: 'investment', label: 'Investment' },
    { value: 'own_account', label: 'My own account' },
    { value: 'unknown', label: "I don't recognise it" },
  ];
  return {
    belief: { id: `oneoff:${e.id}`, about: e.id, text: `${rupees(t.amount)} to ${e.name} on ${shortDate(t.at)} was a one-off`, confidence: 0.6, because: `the only payment to ${e.name}`, source: 'observed' },
    question: { text: `${rupees(t.amount)} to ${e.name} on ${shortDate(t.at)}: what was it?`, because: `the only payment ever to ${e.name}`, options, score: 300 + t.amount / 1_000 },
    meaning: Object.fromEntries(options.map((o) => [o.value, `${rupees(t.amount)} to ${e.name}: ${o.label.toLowerCase()}`])),
    relation: { own_account: 'own account', loan_given: 'owes you', deposit: 'landlord', investment: 'investment' },
  };
}

function candidates(r: ImportResult, entities: readonly Entity[], txns: readonly Txn[]): Candidate[] {
  const out: Candidate[] = [];
  const p = r.profile;
  const regular = new Map(p.subscriptions.filter((s) => s.status === 'active').map((s) => [s.key, s]));
  for (const e of entities) {
    if (e.relation === 'you') continue;
    const c = incomeRule(e, txns) ?? relationRule(e, regular.get(e.id)) ?? oneOffRule(e, txns);
    if (c !== null) out.push(c);
  }
  // Regular payments to a person (rent, family support) are asked about as
  // "who is this person", not as a subscription to cancel.
  const person = new Set(entities.filter((e) => e.kind === 'person').map((e) => e.id));

  for (const a of p.autopays.filter((x) => x.status === 'active')) {
    const name = a.likelyMerchant ?? displayMerchant(a.merchant);
    const because = `autopay${a.amount !== undefined ? ` up to ${rupees(a.amount)}` : ''}${a.frequency ? `, ${a.frequency}` : ''}; last message ${shortDate(a.lastEventAt)}`;
    out.push({
      belief: { id: `autopay:${a.merchant}`, about: 'you', text: `You still want the autopay to ${name}`, confidence: 0.6, because, source: 'observed' },
      question: {
        text: `Still want the autopay to ${name}?`,
        because,
        options: [
          { value: 'keep', label: 'Keep it' },
          { value: 'cancel', label: 'Cancel it' },
          { value: 'unknown', label: "Don't recognise it" },
        ],
        score: 300 + (a.amount ?? 0) / 100,
      },
      meaning: {
        keep: `You want the autopay to ${name}`,
        cancel: `Cancel the autopay to ${name}: open your UPI app → Autopay → ${name} → Cancel`,
        unknown: `You don't recognise the autopay to ${name}: cancel it in your UPI app and tell your bank`,
      },
    });
  }

  for (const s of p.subscriptions.filter((x) => x.status === 'active' && !person.has(x.key))) {
    const because = `${s.count} charges of about ${rupees(s.usualAmount)}, ${s.cycle}${s.from === 'mail' ? ' (from mail receipts)' : ''}`;
    out.push({
      belief: { id: `subscription:${s.key}`, about: 'you', text: `You still use ${s.name}`, confidence: 0.7, because, source: 'observed' },
      question: {
        text: `Still using ${s.name} (${rupees(s.usualAmount)} ${s.cycle})?`,
        because,
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'cancel', label: 'No, cancel it' },
        ],
        score: 250 + s.monthly / 100,
      },
      meaning: { yes: `You use ${s.name}`, cancel: `Cancel ${s.name} before ${shortDate(s.nextDueAt)} (next charge)` },
    });
  }

  for (const u of r.calls?.persistentUnknown ?? []) {
    const because = `${u.calls} calls from a number not in your contacts, last on ${shortDate(u.last)}`;
    out.push({
      belief: { id: `caller:${u.number}`, about: 'you', text: `${u.number} is someone you don't know`, confidence: 0.6, because, source: 'observed' },
      question: {
        text: `${u.number} called you ${u.calls} times. Do you know them?`,
        because,
        options: [
          { value: 'spam', label: 'Spam / scam' },
          { value: 'known', label: 'I know them' },
        ],
        score: 150 + u.calls,
      },
      meaning: { spam: `${u.number} is spam: block it (Phone → Recents → Block)`, known: `You know ${u.number}; save it as a contact` },
    });
  }

  for (const a of r.phone?.notFromPlay ?? []) {
    const because = a.installer === 'com.google.android.packageinstaller' ? 'installed from an .apk file, not the Play Store' : `installed by ${a.installer ?? 'an unknown source'}`;
    out.push({
      belief: { id: `app:${a.id}`, about: 'you', text: `You installed ${a.name} yourself`, confidence: 0.6, because, source: 'observed' },
      question: {
        text: `Did you install ${a.name} yourself?`,
        because,
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ],
        score: 800,
      },
      meaning: { yes: `You installed ${a.name}`, no: `Uninstall ${a.name}: you didn't install it (Settings → Apps → ${a.name} → Uninstall)` },
    });
  }

  if (p.screenOff !== undefined) {
    const off = p.screenOff;
    const because = `off your phone between ${hh(off.from)} and ${hh(off.to)} on most days`;
    out.push({
      belief: { id: 'sleep', about: 'you', text: `You sleep between ${hh(off.from)} and ${hh(off.to)}`, confidence: 0.6, because, source: 'observed' },
      question: {
        text: `Are you usually asleep between ${hh(off.from)} and ${hh(off.to)}?`,
        because,
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ],
        score: 100,
      },
      meaning: { yes: `You sleep ${hh(off.from)}–${hh(off.to)}: payments then are held longer`, no: `${hh(off.from)}–${hh(off.to)} is not your sleep time` },
    });
  }
  return out;
}

// ── Build ──────────────────────────────────────────────────────────────────

/** The twin, from what the sensors read and every answer you gave. Same inputs, same twin. */
export function buildTwin(r: ImportResult, answers: readonly AnswerEvent[], now: number): Twin {
  const txns = mergeDuplicates(r.txns);
  // Transfers to your own name are to yourself: labelled "you" without asking.
  const base = entitiesOf(txns, r.profile.people ?? []).map((e) => (e.kind !== 'organisation' && isSelf(e.name, r.selfNames ?? []) ? { ...e, relation: 'you' } : e));
  // The latest answer to each question wins; earlier ones stay in the journal.
  const latest = new Map<string, AnswerEvent>();
  for (const a of [...answers].sort((x, y) => x.at - y.at)) latest.set(a.question, a);

  const beliefs: Belief[] = [];
  const questions: Question[] = [];
  const answeredQuestions: (Question & { answer: string })[] = [];
  const relations = new Map<string, string>();
  for (const c of candidates(r, base, txns)) {
    const qid = c.belief.id;
    const a = latest.get(qid);
    // Your own words ("note:my cousin's rent share") when no option fits.
    const note = a?.value.startsWith('note:') ? a.value.slice(5).trim() : undefined;
    if (a !== undefined && (c.meaning[a.value] !== undefined || (note !== undefined && note !== ''))) {
      const subject = c.belief.about === 'you' ? '' : `${base.find((e) => e.id === c.belief.about)?.name ?? c.belief.about}: `;
      const text = note !== undefined ? `${subject}${note}` : c.meaning[a.value]!;
      beliefs.push({ ...c.belief, text, confidence: 0.99, because: `you said so on ${shortDate(a.at)} (${c.belief.because})`, source: 'you' });
      const rel = note !== undefined ? (c.relation !== undefined ? note.toLowerCase() : undefined) : c.relation?.[a.value];
      if (rel !== undefined && c.belief.about !== 'you') relations.set(c.belief.about, rel);
      if (c.question !== undefined) answeredQuestions.push({ id: qid, about: c.belief.about, ...c.question, answer: a.value });
    } else {
      beliefs.push(c.belief);
      if (c.question !== undefined) questions.push({ id: qid, about: c.belief.about, ...c.question });
    }
  }
  const entities = base
    .map((e) => (relations.has(e.id) ? { ...e, relation: relations.get(e.id)! } : e))
    .sort((a, b) => b.paidOut + b.paidIn - (a.paidOut + a.paidIn));

  const since = now - 30 * DAY;
  const spend = new Map<string, number>();
  for (const t of txns) {
    if (t.direction !== 'debit' || t.at < since) continue;
    const rel = relations.get(t.key) ?? (t.unnamed ? 'not named' : 'not labelled yet');
    spend.set(rel, (spend.get(rel) ?? 0) + t.amount);
  }

  return {
    builtAt: now,
    entities,
    beliefs,
    questions: questions.sort((a, b) => b.score - a.score),
    answeredQuestions,
    answered: answeredQuestions.length,
    spendByRelation: [...spend.entries()].map(([relation, amount]) => ({ relation, amount })).sort((a, b) => b.amount - a.amount),
    brief: briefOf(r, entities, beliefs, questions.length, txns, now),
  };
}

function briefOf(r: ImportResult, entities: readonly Entity[], beliefs: readonly Belief[], waiting: number, txns: readonly Txn[], now: number): BriefItem[] {
  const out: BriefItem[] = [];
  const p = r.profile;

  // Income: when the next one is due, or whether it arrived.
  for (const b of beliefs.filter((x) => x.id.startsWith('income:') && !/not your income/.test(x.text))) {
    const e = entities.find((x) => x.id === b.about);
    const credits = e?.timeline.filter((m) => m.direction === 'credit') ?? [];
    const last = credits[0];
    if (e === undefined || last === undefined) continue;
    const usual = median(credits.map((m) => m.amount));
    // The main (usual-sized) payment decides what to expect next; smaller extras are mentioned as such.
    const main = credits.find((m) => Math.abs(m.amount - usual) <= usual * 0.25) ?? last;
    const next = main.at + 30.44 * DAY;
    const extra = last !== main ? ` Latest: ${rupees(last.amount)} on ${shortDate(last.at)}.` : '';
    out.push({
      kind: 'money',
      text:
        now - main.at < 20 * DAY
          ? `${e.name}: ${rupees(main.amount)} arrived on ${shortDate(main.at)}.${extra}`
          : next < now - 3 * DAY
            ? `${e.name}: the usual ~${rupees(usual)} was expected around ${shortDate(next)} and hasn't arrived.${extra}`
            : `${e.name}: next ~${rupees(usual)} expected around ${shortDate(next)}.${extra}`,
    });
  }

  // Spending in the last 7 days against your usual week.
  const week = txns.filter((t) => t.direction === 'debit' && t.at >= now - 7 * DAY && t.at <= now);
  if (week.length > 0 && p.range !== null) {
    const weeks = Math.max(1, (p.range.to - p.range.from) / (7 * DAY));
    const usual = txns.filter((t) => t.direction === 'debit').reduce((s, t) => s + t.amount, 0) / weeks;
    const spent = week.reduce((s, t) => s + t.amount, 0);
    out.push({ kind: 'money', text: `Spent ${rupees(spent)} in the last 7 days (${week.length} payments); a usual week is about ${rupees(usual)}.` });
  }

  // Charges coming in the next 7 days.
  const soon = (at: number | undefined) => at !== undefined && at >= now - DAY && at <= now + 7 * DAY;
  const persons = new Set(entities.filter((e) => e.kind === 'person').map((e) => e.id));
  for (const s of p.subscriptions.filter((x) => x.status === 'active' && soon(x.nextDueAt))) {
    if (persons.has(s.key)) {
      const e = entities.find((x) => x.id === s.key)!;
      out.push({ kind: 'due', text: `Your usual ${rupees(s.usualAmount)} to ${e.relation ? `${e.name} (${e.relation})` : e.name} is due around ${shortDate(s.nextDueAt)}.` });
      continue;
    }
    out.push({ kind: 'due', text: `${s.name}: about ${rupees(s.usualAmount)} due around ${shortDate(s.nextDueAt)}.` });
  }
  for (const a of p.autopays.filter((x) => x.status === 'active' && soon(x.nextDebitAt))) {
    out.push({ kind: 'due', text: `Autopay to ${a.likelyMerchant ?? displayMerchant(a.merchant)}${a.amount !== undefined ? ` (up to ${rupees(a.amount)})` : ''} on ${shortDate(a.nextDebitAt!)}.` });
  }

  // Security: only what needs doing.
  const serious = r.phone?.findings.filter((f) => f.level === 'serious') ?? [];
  for (const f of serious) out.push({ kind: 'security', text: f.text });
  if (r.scamCount > 0) out.push({ kind: 'security', text: `${r.scamCount} likely scam message${r.scamCount === 1 ? '' : 's'} in your SMS: don't tap ${r.scamCount === 1 ? 'its link' : 'their links'}.` });

  if (waiting > 0) out.push({ kind: 'question', text: `${waiting} question${waiting === 1 ? '' : 's'} waiting: each answer makes Orb more useful.` });
  return out;
}
