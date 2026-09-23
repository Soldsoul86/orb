// "Your normal": a profile built from your own transaction history, used to
// judge new actions against your habits instead of generic thresholds. Pure.

import type { InstalledApps } from './import/apps.ts';
import type { Txn } from './import/types.ts';
import type { Thresholds } from './severity.ts';
import { detectSubscriptions, nameAutopays, sameMerchant, summariseAutopays, type Autopay, type MandateEvent, type Subscription } from './subscriptions.ts';

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
  /** Recurring charges found in your payments. */
  readonly subscriptions: readonly Subscription[];
  /** Autopays and e-mandates from bank SMS. */
  readonly autopays: readonly Autopay[];
  /** Payment, bank, crypto and screen-sharing apps on the phone, when synced. */
  readonly apps?: InstalledApps;
  /** Contact names, when synced: a payee with the same name is pointed out. */
  readonly people?: readonly string[];
  /** Hours you are almost never on your phone, from screen time. */
  readonly screenOff?: { readonly from: number; readonly to: number };
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
 * two different sources, or a second alert that names no payee, is one payment;
 * the copy with a payee name and UPI ID is kept.
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
      // Some banks send two SMS for one transfer, one of them naming no payee
      // ("…credit via :4054604678"): the same amount, same way, minutes apart.
      const secondAlert = k.direction === t.direction && k.amount === t.amount && (k.unnamed === true || t.unnamed === true);
      if (sameRef || sameMove || secondAlert) {
        twin = i;
        break;
      }
    }
    if (twin < 0) kept.push(t);
    else if ((kept[twin]!.vpa === undefined && t.vpa !== undefined) || (kept[twin]!.unnamed === true && t.unnamed !== true)) kept[twin] = t;
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
  // Between 3 and 14 hours: shorter is noise, longer means the times are not spread enough to tell.
  return best === null || best.len < 3 || best.len > 14 ? null : { from: best.from, to: (best.from + best.len) % 24 };
}

export function buildProfile(
  txns: readonly Txn[],
  builtAt: number,
  tzOffsetMinutes = 330,
  mandates: readonly MandateEvent[] = [],
): Profile {
  const all = mergeDuplicates(txns);
  const debits = all.filter((t) => t.direction === 'debit');
  const credits = all.filter((t) => t.direction === 'credit');
  const amounts = debits.map((t) => t.amount).sort((a, b) => a - b);

  const byPayee = new Map<string, Txn[]>();
  for (const t of debits) if (t.unnamed !== true) byPayee.set(t.key, [...(byPayee.get(t.key) ?? []), t]);
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
    // "Lapsed" is judged against your latest data, not today: an export from
    // last month must not make every subscription look cancelled.
    subscriptions: detectSubscriptions(all, all.length === 0 ? builtAt : all[all.length - 1]!.at),
    autopays: nameAutopays(
      summariseAutopays(mandates, mandates.reduce((m, e) => Math.max(m, e.at), all.length === 0 ? 0 : all[all.length - 1]!.at)),
      all,
    ),
  };
}

const onlyLetters = (s: string) => s.toLowerCase().replace(/@.*$/, '').replace(/[^a-z]/g, '');

/**
 * Your history of paying this UPI ID or name, if any. Bank SMS mostly give
 * names ("RAVIKUMAR M") while UPI links give IDs, so both are tried; names
 * match exactly, or when one long name begins the other ("RAVIKUMAR M" and
 * "Ravikumar Murthy"), never on short fragments.
 */
export function findPayee(profile: Profile, recipient: string, name?: string): PayeeStats | undefined {
  const r = recipient.trim().toLowerCase();
  const byId = profile.payees.find((p) => p.key.toLowerCase() === r || p.name.toLowerCase() === r);
  if (byId !== undefined || name === undefined || name.trim() === '') return byId;
  const n = name.trim().toLowerCase();
  const exact = profile.payees.find((p) => p.name.toLowerCase() === n || p.key.toLowerCase() === n);
  if (exact !== undefined) return exact;
  const ln = onlyLetters(name);
  if (ln.length < 8) return undefined;
  return profile.payees.find((p) => {
    const lp = onlyLetters(p.name);
    return lp.length >= 8 && (lp.startsWith(ln) || ln.startsWith(lp));
  });
}

/** Have you paid this UPI ID or name before, according to your history? */
export function knowsPayee(profile: Profile, recipient: string, name?: string): boolean {
  return findPayee(profile, recipient, name) !== undefined;
}

/** A contact with exactly this name (8+ letters), if any. Not proof: anyone can register a common name. */
export function findContact(profile: Profile, name: string | undefined): string | undefined {
  if (name === undefined || profile.people === undefined) return undefined;
  const n = onlyLetters(name);
  if (n.length < 8) return undefined;
  return profile.people.find((p) => onlyLetters(p) === n);
}

const inHours = (hour: number, r: { from: number; to: number }) => (r.from <= r.to ? hour >= r.from && hour < r.to : hour >= r.from || hour < r.to);

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/**
 * Severity thresholds from your history. Until there is enough history the
 * generic defaults apply, so a new install is never less careful.
 */
export function personalThresholds(profile: Profile, fallback: Thresholds): Thresholds {
  const subscriptionChange = (recipient: string, amount: number): string | null => {
    const s = profile.subscriptions.find((x) => x.key.toLowerCase() === recipient.trim().toLowerCase() || sameMerchant(x.name, recipient));
    if (s === undefined || Math.abs(amount - s.usualAmount) <= s.usualAmount * 0.05) return null;
    return `${s.name} usually charges ${rupees(s.usualAmount)} ${s.cycle}; this is ${rupees(amount)}.`;
  };
  const off = profile.screenOff;
  const offPhone = (hour: number) => (off !== undefined && inHours(hour, off) ? `You're usually off your phone between ${hh(off.from)} and ${hh(off.to)}.` : null);
  // Subscriptions and screen time need little history, so they apply even with a short one.
  if (profile.debits.count < MIN_HISTORY) return { ...fallback, unusualHour: (h) => offPhone(h) ?? fallback.unusualHour(h), subscriptionChange };
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
      if (quiet === null) return offPhone(hour) ?? fallback.unusualHour(hour);
      return inHours(hour, quiet) ? `You rarely pay between ${hh(quiet.from)} and ${hh(quiet.to)}.` : offPhone(hour);
    },
    subscriptionChange,
  };
}
