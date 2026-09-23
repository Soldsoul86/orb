import type { Action, Analysis, Context, Finding, Severity } from './types.ts';

/**
 * Anything that can judge how serious an action is. The rule-based analyzer
 * below is one implementation; a decision model can be another.
 */
export interface SeverityAnalyzer {
  analyze(action: Action, context: Context): Analysis;
}

/** Feedback is shown only from this level up. */
export const FEEDBACK_THRESHOLD: Severity = 2;
export const LARGE_AMOUNT = 10_000;

const SECRET_PATTERNS: readonly RegExp[] = [
  /\b(otp|one[- ]time (pass(word|code)|code)|verification code|pin)\b[^\d]{0,20}\d{4,8}\b/i,
  /\b\d{4,8}\b[^\d]{0,20}\b(is your|otp|code)\b/i,
  /\bpass(word)?\s*[:=]\s*\S+/i,
  /\b(sk|pk)[-_][A-Za-z0-9_-]{16,}\b/, // API secret keys
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key id
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/, // GitHub tokens
];

function containsSecret(text: string | undefined): boolean {
  return text !== undefined && SECRET_PATTERNS.some((p) => p.test(text));
}

/**
 * The judgements that depend on who the user is. The defaults are generic;
 * a personal profile replaces them with "your usual" (see profile.ts).
 */
export interface Thresholds {
  /** Feedback sentence if this amount is unusually large for the user, else null. */
  largeAmount(amount: number): string | null;
  /** Feedback sentence if this local hour is unusual for the user, else null. */
  unusualHour(hour: number): string | null;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  largeAmount: (amount) => (amount >= LARGE_AMOUNT ? 'This is a large amount.' : null),
  unusualHour: (hour) => (hour < 6 ? 'It\'s late at night — make sure this isn\'t a rushed decision.' : null),
};

function findingsFor(action: Action, context: Context, th: Thresholds): Finding[] {
  const found: Finding[] = [];
  const add = (code: string, level: Severity, modifier: boolean, feedback: string): void => {
    found.push({ code, level, modifier, feedback });
  };
  const isPayment = action.kind === 'payment';

  if (containsSecret(action.text)) {
    add('secret', 4, false, 'This contains what looks like a one-time code, password or key. Once sent, it can\'t be taken back.');
  }
  if (isPayment && context.onCallWithUnknown) {
    add('payment_on_call', 4, false, 'You\'re on a call with an unknown number. Scammers often ask for payments during calls.');
  }
  if (isPayment && context.newRecipient) {
    add('new_payee', 2, false, 'You\'ve never paid this person before.');
  }
  if (!isPayment && context.newRecipient) {
    add('new_recipient', 1, false, 'You haven\'t sent anything to this recipient before.');
  }
  if (isPayment && !context.newRecipient) {
    add('known_payee', (action.amount ?? 0) < 1_000 ? 0 : 1, false, '');
  }
  const large = isPayment ? th.largeAmount(action.amount ?? 0) : null;
  if (large !== null) add('large_amount', 1, true, large);
  const hour = th.unusualHour(context.localHour);
  if (hour !== null) add('late_night', 1, true, hour);
  if (action.kind === 'delete' || action.kind === 'post') {
    add('public_or_destructive', 1, false, 'This can\'t be quietly undone.');
  }
  return found;
}

function clamp(level: number): Severity {
  return Math.max(0, Math.min(4, level)) as Severity;
}

/** Deterministic analyzer: same thresholds, action and context → same analysis. */
export function createAnalyzer(thresholds: Thresholds): SeverityAnalyzer {
  return {
    analyze(action, context) {
      return analyzeWith(thresholds, action, context);
    },
  };
}

export const ruleBasedAnalyzer: SeverityAnalyzer = createAnalyzer(DEFAULT_THRESHOLDS);

function analyzeWith(th: Thresholds, action: Action, context: Context): Analysis {
  const findings = findingsFor(action, context, th);
  const base = findings.filter((f) => !f.modifier).reduce((m, f) => Math.max(m, f.level), 0);
  const bonus = findings.filter((f) => f.modifier).reduce((s, f) => s + f.level, 0);
  const level = clamp(base + bonus);
  const feedback =
    level >= FEEDBACK_THRESHOLD ? findings.filter((f) => f.level > 0 && f.feedback !== '').map((f) => f.feedback) : [];
  return { level, findings, feedback };
}
