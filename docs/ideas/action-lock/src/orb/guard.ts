// The pay guard: how the lock treats a payment it sees on a UPI app's pay
// screen (PhonePe, Google Pay), just before you tap Pay. Pure.
//
// The Orb app builds a GuardTable from your model whenever it changes and
// saves it; the Accessibility service on the phone looks up the payee and
// amount it reads on screen and applies decideGuard. The service carries a
// Kotlin copy of decideGuard (GuardRules.kt); both are checked against the
// same cases (test/guard-vectors.json) so they cannot drift apart.

import type { Profile } from '../profile.ts';
import type { Twin } from './twin.ts';

/** Relations you confirmed that let larger payments to someone pass without a wait. */
const TRUSTED = new Set(['family', 'you', 'own account']);

export interface GuardPayee {
  /** Letters of the name, lower-case: how names on screen are matched. */
  readonly key: string;
  readonly name: string;
  /** The UPI ID, when your history has it: PIN screens sometimes show only that. */
  readonly vpa?: string;
  readonly count: number;
  readonly usual: number;
  readonly max: number;
  /** Payments up to this amount pass with no wait. */
  readonly passUpTo: number;
  readonly relation?: string;
}

export interface GuardTable {
  readonly version: 1;
  readonly builtAt: number;
  /** A payment at or above this needs your fingerprint (for someone new) or a long wait. */
  readonly largeAmount: number;
  /** Your usual payment, for the reason text. */
  readonly usual: number;
  /** Hours you rarely pay or are usually off your phone: [from, to), wrapping midnight. */
  readonly quiet: { readonly from: number; readonly to: number } | null;
  readonly payees: readonly GuardPayee[];
}

export interface GuardScreen {
  /** Payee name as the pay screen shows it ("TARUN SHARMA"). */
  readonly name?: string;
  readonly amount: number;
  readonly hour: number;
  /** A phone or WhatsApp call is going on: scammers keep people on the line while they pay. */
  readonly onCall?: boolean;
  /** The payment started from a request someone sent (collect / "approve"), not from you. */
  readonly fromRequest?: boolean;
}

export interface GuardDecision {
  /** pass: no overlay; wait: overlay with a countdown; confirm: countdown, then fingerprint. */
  readonly mode: 'pass' | 'wait' | 'confirm';
  readonly seconds: number;
  readonly reasons: readonly string[];
}

export const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

export function buildGuardTable(profile: Profile, twin: Twin | null, now: number): GuardTable {
  const { p50, p90 } = profile.debits;
  const largeAmount = Math.max(3 * p90, 5_000);
  const relation = new Map((twin?.entities ?? []).filter((e) => e.relation !== undefined).map((e) => [e.id, e.relation!]));
  const payees: GuardPayee[] = profile.payees
    .filter((p) => letters(p.name).length >= 3)
    .slice(0, 3_000)
    .map((p) => {
      const rel = relation.get(p.key);
      // Up to twice the most you've ever paid them passes; more for people you confirmed.
      const passUpTo = rel !== undefined && TRUSTED.has(rel) ? Math.max(2 * p.max, largeAmount * 4) : Math.max(2 * p.max, p50);
      return { key: letters(p.name), name: p.name, ...(p.key.includes('@') ? { vpa: p.key.toLowerCase() } : {}), count: p.count, usual: p.median, max: p.max, passUpTo: Math.round(passUpTo), ...(rel !== undefined ? { relation: rel } : {}) };
    });
  return {
    version: 1,
    builtAt: now,
    largeAmount: Math.round(largeAmount),
    usual: Math.round(p50),
    quiet: profile.quietHours ?? profile.screenOff ?? null,
    payees,
  };
}

/** A payee on screen matches when the letters are equal, or one long name begins the other. */
export function findGuardPayee(table: GuardTable, name: string | undefined): GuardPayee | undefined {
  if (name === undefined) return undefined;
  if (name.includes('@')) return table.payees.find((p) => p.vpa === name.trim().toLowerCase());
  const n = letters(name);
  if (n.length < 3) return undefined;
  const exact = table.payees.find((p) => p.key === n);
  if (exact !== undefined || n.length < 8) return exact;
  return table.payees.find((p) => p.key.length >= 8 && (p.key.startsWith(n) || n.startsWith(p.key)));
}

export function decideGuard(table: GuardTable, screen: GuardScreen): GuardDecision {
  const reasons: string[] = [];
  let seconds = 0;
  let confirm = false;
  const p = findGuardPayee(table, screen.name);
  const large = screen.amount >= table.largeAmount;

  if (p === undefined) {
    reasons.push(screen.name === undefined ? "Orb couldn't read who this payment is to." : `You've never paid ${screen.name} before.`);
    seconds = 10;
    if (large) {
      confirm = true;
      seconds = 30;
      reasons.push(`${rupees(screen.amount)} is a large amount; your usual payment is ${rupees(table.usual)}.`);
    }
  } else if (screen.amount > p.passUpTo) {
    seconds = large ? 30 : 10;
    confirm = large && !(p.relation !== undefined && TRUSTED.has(p.relation));
    reasons.push(`${rupees(screen.amount)} is more than you've paid ${p.name} before (most: ${rupees(p.max)}, usually ${rupees(p.usual)}).`);
  }

  // Pressure signals only make an unusual payment stricter; a usual payment still passes.
  const unusual = seconds > 0;
  if (screen.fromRequest === true) {
    reasons.push('This payment started from a request someone sent you. You never need your PIN to receive money.');
    seconds = Math.max(seconds, 30);
    confirm = true;
  }
  if (screen.onCall === true && (unusual || screen.fromRequest === true)) {
    reasons.push("You're on a call. Scammers keep people on the phone while they pay; hang up first if you can.");
    seconds += 20;
    confirm = confirm || p === undefined;
  }

  const q = table.quiet;
  if (q !== null && (q.from <= q.to ? screen.hour >= q.from && screen.hour < q.to : screen.hour >= q.from || screen.hour < q.to)) {
    if (seconds > 0 || screen.amount >= table.usual * 3) {
      seconds += 10;
      reasons.push(`It's ${hh(screen.hour)}: you rarely pay between ${hh(q.from)} and ${hh(q.to)}.`);
    }
  }

  return { mode: seconds === 0 ? 'pass' : confirm ? 'confirm' : 'wait', seconds, reasons };
}
