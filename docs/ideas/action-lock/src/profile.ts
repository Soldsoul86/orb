// "Your normal": a profile built from your own transaction history, used to
// judge new actions against your habits instead of generic thresholds. Pure.

import type { Txn } from './import/types.ts';
import type { Thresholds } from './severity.ts';

export interface PayeeStats {
  readonly key: string;
  readonly name: string;
  readonly count: number;
  readonly total: number;
  readonly median: number;
  readonly max: number;
  readonly first: number;
  readonly last: number;
}

export interface Profile {
  readonly version: 1;
  readonly builtAt: number;
  /** Minutes east of UTC used for hours of day (India: 330). */
  readonly tzOffsetMinutes: number;
  readonly range: { readonly from: number; readonly to: number } | null;
  readonly debits: { readonly count: number; readonly p50: number; readonly p90: number; readonly p99: number; readonly max: number };
  readonly credits: { readonly count: number; readonly total: number };
  /** Payees you have paid, most frequent first. */
  readonly payees: readonly PayeeStats[];
  /** Number of payments started in each local hour 0–23. */
  readonly hourly: readonly number[];
  /** The longest stretch of hours in which you (almost) never pay; null until there is enough history. */
  readonly quietHours: { readonly from: number; readonly to: number } | null;
}

/** Enough payments to say what is unusual for you. */
export const MIN_HISTORY = 30;

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i]!;
}

export function localHour(at: number, tzOffsetMinutes: number): number {
  return new Date(at + tzOffsetMinutes * 60_000).getUTCHours();
}

/**
 * The same payment often appears twice: in the bank SMS and in Google Pay.
 * Within 15 minutes, the same reference, or the same amount and direction from
 * two different sources, is one payment; the copy with a UPI ID is kept.
 */
export function mergeDuplicates(txns: readonly Txn[]): Txn[] {
  const sorted = [...txns].sort((a, b) => a.at - b.at);
  const kept: Txn[] = [];
  const window = 15 * 60_000;
  for (const t of sorted) {
    // Twins are close in time; only look back through the last 15 minutes.
    let twin = -1;
    for (let i = kept.length - 1; i >= 0 && kept[i]!.at >= t.at - window; i--) {
      const k = kept[i]!;
      const sameRef = t.ref !== undefined && k.ref === t.ref;
      const sameMove = k.direction === t.direction && k.amount === t.amount && k.source !== t.source;
      if (sameRef || sameMove) {
        twin = i;
        break;
      }
    }
    if (twin < 0) kept.push(t);
    else if (kept[twin]!.vpa === undefined && t.vpa !== undefined) kept[twin] = t;
  }
  return kept;
}

function longestQuietRun(hourly: readonly number[], total: number): { from: number; to: number } | null {
  if (total < MIN_HISTORY) return null;
  const quiet = hourly.map((n) => n <= total * 0.01);
  if (quiet.every(Boolean)) return null;
  let best: { from: number; len: number } | null = null;
  for (let start = 0; start < 24; start++) {
    if (!quiet[start] || quiet[(start + 23) % 24]) continue; // runs start after a busy hour
    let len = 0;
    while (len < 24 && quiet[(start + len) % 24]) len++;
    if (best === null || len > best.len) best = { from: start, len };
  }
  return best === null || best.len < 3 ? null : { from: best.from, to: (best.from + best.len) % 24 };
}

export function buildProfile(txns: readonly Txn[], builtAt: number, tzOffsetMinutes = 330): Profile {
  const all = mergeDuplicates(txns);
  const debits = all.filter((t) => t.direction === 'debit');
  const credits = all.filter((t) => t.direction === 'credit');
  const amounts = debits.map((t) => t.amount).sort((a, b) => a - b);

  const byPayee = new Map<string, Txn[]>();
  for (const t of debits) byPayee.set(t.key, [...(byPayee.get(t.key) ?? []), t]);
  const payees = [...byPayee.entries()]
    .map(([key, ts]): PayeeStats => {
      const a = ts.map((t) => t.amount).sort((x, y) => x - y);
      return {
        key,
        name: ts[ts.length - 1]!.counterparty,
        count: ts.length,
        total: a.reduce((s, x) => s + x, 0),
        median: quantile(a, 0.5),
        max: a[a.length - 1]!,
        first: ts[0]!.at,
        last: ts[ts.length - 1]!.at,
      };
    })
    .sort((x, y) => y.count - x.count || y.total - x.total);

  const hourly = Array.from({ length: 24 }, () => 0);
  for (const t of debits) hourly[localHour(t.at, tzOffsetMinutes)]!++;

  return {
    version: 1,
    builtAt,
    tzOffsetMinutes,
    range: all.length === 0 ? null : { from: all[0]!.at, to: all[all.length - 1]!.at },
    debits: {
      count: debits.length,
      p50: quantile(amounts, 0.5),
      p90: quantile(amounts, 0.9),
      p99: quantile(amounts, 0.99),
      max: amounts[amounts.length - 1] ?? 0,
    },
    credits: { count: credits.length, total: credits.reduce((s, t) => s + t.amount, 0) },
    payees,
    hourly,
    quietHours: longestQuietRun(hourly, debits.length),
  };
}

/** Have you paid this UPI ID or name before, according to your history? */
export function knowsPayee(profile: Profile, recipient: string): boolean {
  const r = recipient.trim().toLowerCase();
  return profile.payees.some((p) => p.key.toLowerCase() === r || p.name.toLowerCase() === r);
}

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/**
 * Severity thresholds from your history. Until there is enough history the
 * generic defaults apply, so a new install is never less careful.
 */
export function personalThresholds(profile: Profile, fallback: Thresholds): Thresholds {
  if (profile.debits.count < MIN_HISTORY) return fallback;
  const { p50, p90 } = profile.debits;
  const quiet = profile.quietHours;
  return {
    largeAmount(amount) {
      // Unusual for you: well above your 90th percentile, and not trivially small.
      if (amount < Math.max(3 * p90, 2_000)) return null;
      const times = p50 > 0 ? Math.round(amount / p50) : 0;
      return times >= 2 ? `${rupees(amount)} is ${times}× your usual payment (${rupees(p50)}).` : `${rupees(amount)} is larger than almost all your payments.`;
    },
    unusualHour(hour) {
      if (quiet === null) return fallback.unusualHour(hour);
      const inQuiet = quiet.from <= quiet.to ? hour >= quiet.from && hour < quiet.to : hour >= quiet.from || hour < quiet.to;
      return inQuiet ? `You rarely pay between ${hh(quiet.from)} and ${hh(quiet.to)}.` : null;
    },
  };
}
