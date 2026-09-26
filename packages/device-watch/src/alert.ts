/**
 * The two events that make the loop close: something was surfaced, and answered.
 *
 * `DECISIONS.md` DR-5 in miniature — *a gate that records only what passed
 * cannot demonstrate what it stopped.* Here nothing is gated; what is recorded
 * instead is whether the person cared. A dismissal is the most valuable event in
 * this package, because §7 R6 says *false positives cost trust, and trust is the
 * product*, and a rule nobody can measure for false positives is a rule nobody
 * can improve.
 */
export const ALERT_RAISED_TYPE = "orb.alert.raised";
export const ALERT_RAISED_SCHEMA = { id: ALERT_RAISED_TYPE, version: 1 } as const;
export const ALERT_ANSWERED_TYPE = "orb.alert.answered";
export const ALERT_ANSWERED_SCHEMA = { id: ALERT_ANSWERED_TYPE, version: 1 } as const;

/** What was surfaced, and about which reading. */
export interface AlertRaised {
  /** The rule that raised it, so a reader can find out what it was watching for. */
  readonly rule: string;
  readonly kind: string;
  readonly gained: readonly string[];
  readonly lost: readonly string[];
  /**
   * The Observation this came from.
   *
   * Also carried in the event's `causes`, and duplicated here for one reason:
   * `causes` is lineage the journal owns and can be absent on an envelope whose
   * payload is not held, while this is the alert's own account of itself. They
   * are the same fact seen from two sides, not two facts.
   */
  readonly observation: string;
}

/**
 * How a person answered.
 *
 * `acknowledged` and `dismissed` are recorded identically and **treated
 * identically** by everything downstream — DR-8. The difference is preserved for
 * a reader, and deliberately does nothing yet.
 */
export type AlertAnswer = "acknowledged" | "dismissed";

export interface AlertAnswered {
  /** The alert event this answers. Also in `causes`. */
  readonly alert: string;
  readonly answer: AlertAnswer;
}
