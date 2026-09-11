/**
 * The position state machine.
 *
 * A pure transition table. Every transition the executor may make is listed
 * here; anything else is a defect and is refused rather than applied. This is
 * what makes "there is exactly one authoritative exit transition" checkable
 * rather than merely intended.
 */
import type { PositionState } from "./model.js";

/** The events that can move a position between states. */
export type PositionTransition =
  /** The exchange confirmed a position exists. */
  | "ENTRY_CONFIRMED"
  /** The entry did not produce a position. */
  | "ENTRY_REJECTED"
  /** The sentinel is now watching this position. */
  | "MONITORING_ATTACHED"
  /** The feed died, or the executor entered its degraded state. */
  | "MONITORING_LOST"
  /** An exit claimed authority. At most one of these ever succeeds per position. */
  | "EXIT_CLAIMED"
  /** A reduce-only close was submitted. */
  | "CLOSE_SUBMITTED"
  /** The exchange confirmed the position is flat. */
  | "VERIFIED_FLAT"
  /** A close attempt failed but retries remain. */
  | "CLOSE_ATTEMPT_FAILED"
  /** Closing exhausted its attempts and the position is still open. */
  | "CLOSE_EXHAUSTED"
  /** Local belief and exchange truth diverged. */
  | "DISCREPANCY_FOUND"
  /** Reconciliation adopted exchange truth and the position is live again. */
  | "RECONCILED_OPEN"
  /** Reconciliation found the exchange flat. */
  | "RECONCILED_FLAT"
  /** We lost confidence about what is actually on the exchange. */
  | "CONFIDENCE_LOST";

const TABLE: Readonly<Record<PositionState, Partial<Record<PositionTransition, PositionState>>>> =
  Object.freeze({
    PENDING_ENTRY: {
      ENTRY_CONFIRMED: "OPEN",
      ENTRY_REJECTED: "ENTRY_FAILED",
      // An exit may claim a position whose entry is still in flight: the entry
      // may have filled without us hearing, so the close path must be reachable.
      EXIT_CLAIMED: "EXIT_TRIGGERED",
      DISCREPANCY_FOUND: "RECONCILIATION_REQUIRED",
      CONFIDENCE_LOST: "UNKNOWN",
    },
    OPEN: {
      MONITORING_ATTACHED: "MONITORING",
      EXIT_CLAIMED: "EXIT_TRIGGERED",
      DISCREPANCY_FOUND: "RECONCILIATION_REQUIRED",
      RECONCILED_FLAT: "CLOSED",
      CONFIDENCE_LOST: "UNKNOWN",
    },
    MONITORING: {
      EXIT_CLAIMED: "EXIT_TRIGGERED",
      MONITORING_LOST: "OPEN",
      DISCREPANCY_FOUND: "RECONCILIATION_REQUIRED",
      RECONCILED_FLAT: "CLOSED",
      CONFIDENCE_LOST: "UNKNOWN",
    },
    EXIT_TRIGGERED: {
      CLOSE_SUBMITTED: "CLOSING",
      // A close that fills instantly can be verified before we see the ack.
      VERIFIED_FLAT: "CLOSED",
      CLOSE_EXHAUSTED: "EXIT_FAILED",
      DISCREPANCY_FOUND: "RECONCILIATION_REQUIRED",
      RECONCILED_FLAT: "CLOSED",
      CONFIDENCE_LOST: "UNKNOWN",
    },
    CLOSING: {
      VERIFIED_FLAT: "CLOSED",
      // A partial fill or a rejected attempt stays in CLOSING and retries.
      CLOSE_ATTEMPT_FAILED: "CLOSING",
      CLOSE_SUBMITTED: "CLOSING",
      CLOSE_EXHAUSTED: "EXIT_FAILED",
      DISCREPANCY_FOUND: "RECONCILIATION_REQUIRED",
      RECONCILED_FLAT: "CLOSED",
      CONFIDENCE_LOST: "UNKNOWN",
    },
    EXIT_FAILED: {
      // A failed exit is still an open position. Retrying is always allowed.
      CLOSE_SUBMITTED: "CLOSING",
      VERIFIED_FLAT: "CLOSED",
      RECONCILED_FLAT: "CLOSED",
      DISCREPANCY_FOUND: "RECONCILIATION_REQUIRED",
      CONFIDENCE_LOST: "UNKNOWN",
    },
    RECONCILIATION_REQUIRED: {
      RECONCILED_OPEN: "OPEN",
      RECONCILED_FLAT: "CLOSED",
      EXIT_CLAIMED: "EXIT_TRIGGERED",
      CONFIDENCE_LOST: "UNKNOWN",
    },
    UNKNOWN: {
      RECONCILED_OPEN: "OPEN",
      RECONCILED_FLAT: "CLOSED",
      // Never assume flat: an exit may still be claimed from UNKNOWN.
      EXIT_CLAIMED: "EXIT_TRIGGERED",
      DISCREPANCY_FOUND: "RECONCILIATION_REQUIRED",
    },
    CLOSED: {},
    ENTRY_FAILED: {},
  });

/** The state `transition` leads to from `from`, or `null` when it is not allowed. */
export function nextState(
  from: PositionState,
  transition: PositionTransition,
): PositionState | null {
  return TABLE[from][transition] ?? null;
}

export function canTransition(from: PositionState, transition: PositionTransition): boolean {
  return nextState(from, transition) !== null;
}

/** Every transition legal from `state`. Used by tests and the status view. */
export function allowedTransitions(state: PositionState): readonly PositionTransition[] {
  return Object.keys(TABLE[state]).sort() as PositionTransition[];
}

export class IllegalTransitionError extends Error {
  override readonly name = "IllegalTransitionError";
  constructor(readonly from: PositionState, readonly transition: PositionTransition) {
    super(`illegal position transition: ${from} --${transition}-->`);
  }
}

/** @throws {IllegalTransitionError} when the transition is not in the table. */
export function requireNextState(
  from: PositionState,
  transition: PositionTransition,
): PositionState {
  const next = nextState(from, transition);
  if (next === null) throw new IllegalTransitionError(from, transition);
  return next;
}
