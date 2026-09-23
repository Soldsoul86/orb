// Subscriptions and autopays found in your history. Pure.
//
// Two sources:
//   · Recurring payments: the same payee, a similar amount, at a steady cycle.
//   · Autopay / e-mandate SMS: set up, upcoming debit, cancelled.

import type { Txn } from './import/types.ts';

export type Cycle = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

const DAY = 86_400_000;
const CYCLES: readonly { readonly cycle: Cycle; readonly days: number; readonly tolerance: number; readonly minCount: number }[] = [
  { cycle: 'weekly', days: 7, tolerance: 1.5, minCount: 4 },
  { cycle: 'monthly', days: 30.44, tolerance: 4, minCount: 3 },
  { cycle: 'quarterly', days: 91.31, tolerance: 8, minCount: 3 },
  { cycle: 'yearly', days: 365.25, tolerance: 15, minCount: 2 },
];

export interface Subscription {
  readonly key: string;
  readonly name: string;
  readonly cycle: Cycle;
  readonly count: number;
  /** The amount it usually charges. */
  readonly usualAmount: number;
  readonly lastAmount: number;
  readonly lastAt: number;
  readonly nextDueAt: number;
  /** Cost per month, whatever the cycle. */
  readonly monthly: number;
  readonly status: 'active' | 'lapsed';
  /** The latest charge differs from the usual one. */
  readonly priceChange?: { readonly from: number; readonly to: number; readonly at: number };
  /** The latest charge came after a long gap: something you may have thought was cancelled. */
  readonly restartedAfterDays?: number;
}

export interface MandateEvent {
  readonly at: number;
  readonly event: 'created' | 'upcoming' | 'executed' | 'revoked';
  readonly merchant: string;
  readonly amount?: number;
  readonly frequency?: string;
  /** For "will be debited on …" notices: when. */
  readonly dueAt?: number;
}

export interface Autopay {
  readonly merchant: string;
  readonly createdAt?: number;
  readonly amount?: number;
  readonly frequency?: string;
  readonly nextDebitAt?: number;
  readonly lastEventAt: number;
  /** dormant: no message about it for 60 days before your latest data. */
  readonly status: 'active' | 'dormant' | 'revoked';
}

/** An autopay with no message for this long is treated as dormant, not active. */
export const DORMANT_AFTER_DAYS = 60;

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

const near = (a: number, b: number, pct: number) => Math.abs(a - b) <= b * pct;

/** Is this group of payments to one payee a subscription? Returns its shape, or null. */
function asSubscription(ts: readonly Txn[], now: number): Subscription | null {
  if (ts.length < 2) return null;
  const at = ts.map((t) => t.at);
  const gaps = at.slice(1).map((x, i) => (x - at[i]!) / DAY);

  // Amounts must be steady: most within 20% of the median (earlier ones, if the price just changed).
  const amounts = ts.map((t) => t.amount);
  const earlier = amounts.length > 2 ? amounts.slice(0, -1) : amounts;
  const usual = median(earlier);
  if (earlier.filter((a) => near(a, usual, 0.2)).length / earlier.length < 0.7) return null;

  let best: { spec: (typeof CYCLES)[number]; fit: number } | null = null;
  for (const spec of CYCLES) {
    if (ts.length < spec.minCount) continue;
    // A gap of about 2 cycles still fits (one charge missing from the history).
    const fits = gaps.filter((g) => [1, 2].some((k) => Math.abs(g - k * spec.days) <= spec.tolerance * k)).length;
    const fit = fits / gaps.length;
    if (fit >= 0.75 && (best === null || fit > best.fit)) best = { spec, fit };
  }
  if (best === null) {
    // A restart after a long gap spoils the fit; judge the cycle on the charges before it.
    const lastGap = gaps[gaps.length - 1]!;
    if (ts.length >= 4 && gaps.slice(0, -1).length > 0) {
      const before = asSubscription(ts.slice(0, -1), ts[ts.length - 2]!.at);
      if (before !== null && lastGap > 2.5 * CYCLES.find((c) => c.cycle === before.cycle)!.days) {
        return withLatest(before, ts[ts.length - 1]!, usual, now, Math.round(lastGap));
      }
    }
    return null;
  }

  const { spec } = best;
  const last = ts[ts.length - 1]!;
  const lastGap = gaps[gaps.length - 1]!;
  const restarted = lastGap > 2.5 * spec.days ? Math.round(lastGap) : undefined;
  return withLatest(
    {
      key: last.key,
      name: last.counterparty,
      cycle: spec.cycle,
      count: ts.length,
      usualAmount: usual,
      lastAmount: last.amount,
      lastAt: last.at,
      nextDueAt: last.at + spec.days * DAY,
      monthly: (usual * 30.44) / spec.days,
      status: 'active',
    },
    last,
    usual,
    now,
    restarted,
  );
}

function withLatest(s: Subscription, last: Txn, usual: number, now: number, restartedAfterDays?: number): Subscription {
  const spec = CYCLES.find((c) => c.cycle === s.cycle)!;
  const nextDueAt = last.at + spec.days * DAY;
  const lapsed = now > nextDueAt + 2 * spec.tolerance * DAY;
  return {
    ...s,
    count: s.count + (s.lastAt === last.at ? 0 : 1),
    lastAmount: last.amount,
    lastAt: last.at,
    nextDueAt,
    status: lapsed ? 'lapsed' : 'active',
    ...(!near(last.amount, usual, 0.05) ? { priceChange: { from: usual, to: last.amount, at: last.at } } : {}),
    ...(restartedAfterDays !== undefined ? { restartedAfterDays } : {}),
  };
}

/** Recurring payments in your history, most expensive per month first. */
export function detectSubscriptions(txns: readonly Txn[], now: number): Subscription[] {
  const byKey = new Map<string, Txn[]>();
  for (const t of txns) if (t.direction === 'debit') byKey.set(t.key, [...(byKey.get(t.key) ?? []), t]);
  const found: Subscription[] = [];
  for (const ts of byKey.values()) {
    const s = asSubscription([...ts].sort((a, b) => a.at - b.at), now);
    if (s !== null) found.push(s);
  }
  return found.sort((a, b) => b.monthly - a.monthly);
}

/** PhonePe and others use hashed UPI IDs for autopays; show them as unnamed rather than as gibberish. */
export function displayMerchant(merchant: string): string {
  const hashed = merchant.match(/^[0-9a-f]{20,}@([a-z]+)$/i);
  return hashed ? `Unnamed autopay (…@${hashed[1]!.toLowerCase()})` : merchant;
}

const letters = (s: string) => s.toLowerCase().replace(/@.*$/, '').replace(/[^a-z]/g, '');

/** Loose match between a mandate's merchant ("NETFLIX") and a payee ("netflix.upi@icici", "Netflix India"). */
export function sameMerchant(a: string, b: string): boolean {
  const x = letters(a);
  const y = letters(b);
  return x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x));
}

/** The latest state of each autopay, from its SMS events, as of `asOf` (your latest data). */
export function summariseAutopays(
  events: readonly MandateEvent[],
  asOf: number = events.reduce((m, e) => Math.max(m, e.at), 0),
): Autopay[] {
  const byMerchant = new Map<string, MandateEvent[]>();
  for (const e of [...events].sort((a, b) => a.at - b.at)) {
    const key = [...byMerchant.keys()].find((k) => sameMerchant(k, e.merchant)) ?? e.merchant;
    byMerchant.set(key, [...(byMerchant.get(key) ?? []), e]);
  }
  return [...byMerchant.entries()].map(([merchant, es]) => {
    const created = es.filter((e) => e.event === 'created').pop();
    const upcoming = es.filter((e) => e.event === 'upcoming').pop();
    const last = es[es.length - 1]!;
    const amount = created?.amount ?? upcoming?.amount;
    const frequency = created?.frequency ?? upcoming?.frequency;
    return {
      merchant,
      lastEventAt: last.at,
      status: last.event === 'revoked' ? 'revoked' : asOf - last.at > DORMANT_AFTER_DAYS * DAY ? 'dormant' : 'active',
      ...(created !== undefined ? { createdAt: created.at } : {}),
      ...(amount !== undefined ? { amount } : {}),
      ...(frequency !== undefined ? { frequency } : {}),
      ...(upcoming !== undefined ? { nextDebitAt: upcoming.dueAt ?? upcoming.at } : {}),
    };
  });
}
