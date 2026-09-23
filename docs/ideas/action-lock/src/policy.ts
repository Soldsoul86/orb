import { stricter } from './gate.ts';
import type { Action, Analysis, Context, Gate, Policy, Rule, RuleMatch } from './types.ts';

/** Starting policy. The user changes all of it. */
export const DEFAULT_POLICY: Policy = {
  defaults: {
    0: { mode: 'pass', holdSeconds: 0 },
    1: { mode: 'countdown', holdSeconds: 2 },
    2: { mode: 'countdown', holdSeconds: 10 },
    3: { mode: 'unlock', holdSeconds: 30 },
    4: { mode: 'second_person', holdSeconds: 300 },
  },
  rules: [],
  criticalFloor: 'unlock',
  loosenDelaySeconds: 24 * 60 * 60,
};

function inHours(hour: number, hours: { from: number; to: number }): boolean {
  return hours.from <= hours.to
    ? hour >= hours.from && hour < hours.to
    : hour >= hours.from || hour < hours.to;
}

export function matches(match: RuleMatch, action: Action, context: Context): boolean {
  const amount = action.amount ?? 0;
  if (match.kinds !== undefined && !match.kinds.includes(action.kind)) return false;
  if (match.recipients !== undefined && !match.recipients.includes(action.recipient)) return false;
  if (match.newRecipient !== undefined && match.newRecipient !== context.newRecipient) return false;
  if (match.minAmount !== undefined && amount < match.minAmount) return false;
  if (match.maxAmount !== undefined && amount > match.maxAmount) return false;
  if (match.hours !== undefined && !inHours(context.localHour, match.hours)) return false;
  return true;
}

export function firstMatchingRule(policy: Policy, action: Action, context: Context): Rule | undefined {
  return policy.rules.find((r) => matches(r.match, action, context));
}

/** The gate a single policy gives an action. Pure. */
export function decide(policy: Policy, action: Action, context: Context, analysis: Analysis): Gate {
  const rule = firstMatchingRule(policy, action, context);
  const base = rule !== undefined ? rule.gate : policy.defaults[analysis.level];
  if (analysis.level < 4) return base;
  return stricter(base, { mode: policy.criticalFloor, holdSeconds: policy.defaults[4].holdSeconds });
}

/** The user's policy over time: the active one plus at most one pending change. */
export interface PolicyState {
  readonly active: Policy;
  readonly pending?: { readonly policy: Policy; readonly effectiveAt: number };
}

/** Promote a pending change once its time has come. Pure. */
export function settle(state: PolicyState, now: number): PolicyState {
  if (state.pending !== undefined && now >= state.pending.effectiveAt) {
    return { active: state.pending.policy };
  }
  return state;
}

/**
 * The gate under the user's policy at time `now`. While a change is pending,
 * the stricter of old and new applies: tightening is instant, loosening waits.
 */
export function decideAt(
  state: PolicyState,
  now: number,
  action: Action,
  context: Context,
  analysis: Analysis,
): Gate {
  const settled = settle(state, now);
  const current = decide(settled.active, action, context, analysis);
  if (settled.pending === undefined) return current;
  return stricter(current, decide(settled.pending.policy, action, context, analysis));
}
