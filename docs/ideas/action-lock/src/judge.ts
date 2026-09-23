// How the lock would treat one payment, given your profile. Pure.
// Used by the phone app and by `npm run check`.

import { decide, PHONE_POLICY } from './policy.ts';
import { findContact, findPayee, personalThresholds, type PayeeStats, type Profile } from './profile.ts';
import { createAnalyzer, DEFAULT_THRESHOLDS, ruleBasedAnalyzer, type SeverityAnalyzer } from './severity.ts';
import type { Analysis, Gate, Policy } from './types.ts';

/** Judges against your history when a profile is loaded, generic rules otherwise. */
export function analyzerFor(profile: Profile | null): SeverityAnalyzer {
  return profile === null ? ruleBasedAnalyzer : createAnalyzer(personalThresholds(profile, DEFAULT_THRESHOLDS));
}

export interface PaymentQuestion {
  readonly kind: 'payment' | 'mandate';
  /** UPI ID. */
  readonly to: string;
  /** Payee name, if the link or form has one. */
  readonly name?: string;
  readonly amount: number;
  readonly localHour: number;
  readonly onCallWithUnknown?: boolean;
  /** Paid through the lock before (from its own history). */
  readonly knownLocally?: boolean;
}

export interface Judgement {
  readonly analysis: Analysis;
  readonly gate: Gate;
  /** Your history with this payee, when the profile knows them. */
  readonly payee?: PayeeStats;
  readonly newRecipient: boolean;
  readonly personal: boolean;
  /** A contact with the payee's name. Shown, but it does not make the payee known: names can be shared. */
  readonly contact?: string;
}

export function judge(profile: Profile | null, q: PaymentQuestion, policy: Policy = PHONE_POLICY): Judgement {
  const payee = profile === null ? undefined : findPayee(profile, q.to, q.name);
  const newRecipient = !(q.knownLocally === true || payee !== undefined);
  const action = { id: 'check', agentId: 'You', kind: q.kind, recipient: q.to, amount: q.amount } as const;
  const context = { localHour: q.localHour, newRecipient, onCallWithUnknown: q.onCallWithUnknown === true };
  const analysis = analyzerFor(profile).analyze(action, context);
  const contact = profile === null || payee !== undefined ? undefined : findContact(profile, q.name);
  return {
    analysis,
    gate: decide(policy, action, context, analysis),
    ...(payee !== undefined ? { payee } : {}),
    newRecipient,
    personal: profile !== null,
    ...(contact !== undefined ? { contact } : {}),
  };
}
