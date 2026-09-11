/**
 * Position state, exit reasons, and exit priority.
 *
 * The state machine is explicit because every implicit state transition in a
 * trading system eventually becomes a position nobody is watching.
 */
import type { Side, TradeSignal } from "../signal/model.js";

/**
 * The lifecycle of a managed position.
 *
 * - `PENDING_ENTRY` — an entry order is in flight. The exchange has not
 *   confirmed a position, and we must not assume one exists.
 * - `OPEN` — the exchange confirms a position. Monitoring is not yet attached.
 * - `MONITORING` — the hard exit sentinel is live on this position.
 * - `EXIT_TRIGGERED` — exactly one exit has claimed authority. Reserved
 *   synchronously so no second exit can start.
 * - `CLOSING` — a reduce-only close is working, possibly across several attempts.
 * - `CLOSED` — the exchange confirms flat. The only terminal success.
 * - `ENTRY_FAILED` — entry did not result in a position.
 * - `EXIT_FAILED` — closing exhausted its attempts and the position is still open.
 * - `RECONCILIATION_REQUIRED` — local belief and exchange truth disagree.
 * - `UNKNOWN` — we lost confidence about reality. Never treated as flat.
 */
export type PositionState =
  | "PENDING_ENTRY"
  | "OPEN"
  | "MONITORING"
  | "EXIT_TRIGGERED"
  | "CLOSING"
  | "CLOSED"
  | "ENTRY_FAILED"
  | "EXIT_FAILED"
  | "RECONCILIATION_REQUIRED"
  | "UNKNOWN";

/** Why a position was closed. Recorded on every completed trade. */
export type ExitReason =
  | "HARD_RISK_EXIT"
  | "KILL_SWITCH"
  | "STRATEGY_EXIT"
  | "SIGNAL_EXIT"
  | "MANUAL_EXIT"
  | "LIQUIDATION"
  | "UNKNOWN";

/**
 * Exit authority, lowest number wins.
 *
 * A lower-priority rule must never override a higher-priority one. In practice
 * that means: once an exit has claimed the position at priority *p*, a trigger
 * at priority > *p* is ignored, and a trigger at priority < *p* escalates the
 * recorded reason without starting a second closing lifecycle.
 *
 *   1. Emergency / kill switch (and liquidation, which has already happened)
 *   2. Hard risk exit
 *   3. Other mandatory risk controls, including an operator's manual close
 *   4. Normal strategy exit
 *   5. Signal-provider exit
 */
export const EXIT_PRIORITY: Readonly<Record<ExitReason, number>> = Object.freeze({
  KILL_SWITCH: 1,
  LIQUIDATION: 1,
  HARD_RISK_EXIT: 2,
  MANUAL_EXIT: 3,
  STRATEGY_EXIT: 4,
  SIGNAL_EXIT: 5,
  UNKNOWN: 9,
});

/** True when `candidate` outranks `current` and may escalate it. */
export function outranks(candidate: ExitReason, current: ExitReason): boolean {
  return EXIT_PRIORITY[candidate] < EXIT_PRIORITY[current];
}

/** Orders reasons by authority, most authoritative first. */
export function byExitAuthority(a: ExitReason, b: ExitReason): number {
  return EXIT_PRIORITY[a] - EXIT_PRIORITY[b];
}

/** One attempt at closing a position. A close may need several. */
export interface CloseAttempt {
  readonly attempt: number;
  readonly at: number;
  readonly requestedSize: string;
  readonly orderId?: number;
  readonly clientOrderId?: `0x${string}`;
  readonly outcome: "submitted" | "filled" | "partial" | "rejected" | "error";
  readonly filledSize?: string;
  readonly averagePrice?: string;
  readonly error?: string;
}

/** A protective order resting on the exchange, independent of this process. */
export interface ProtectiveOrder {
  readonly orderId: number;
  readonly triggerPrice: string;
  readonly size: string;
  readonly placedAt: number;
}

/** What the executor believes about one position, derived from the journal. */
export interface ManagedPosition {
  /** Stable id for the whole trade lifecycle, from signal to close. */
  readonly tradeId: string;
  readonly symbol: string;
  readonly side: Side;
  readonly state: PositionState;

  /** The signal that opened it. Absent for a position discovered on the exchange. */
  readonly signal?: TradeSignal;
  /** Deterministic client order id for the entry, derived from the signal id. */
  readonly entryClientOrderId?: `0x${string}`;

  /** Exchange-confirmed size. `"0"` until the exchange confirms a position. */
  readonly size: string;
  readonly entryPrice: string;
  readonly leverage: number;

  readonly openedAt: number;
  readonly lastObservedAt: number;
  readonly closedAt?: number;

  /** Set exactly once, when an exit claims authority. */
  readonly exitReason?: ExitReason;
  readonly exitTriggeredAt?: number;
  readonly closeAttempts: readonly CloseAttempt[];
  readonly protectiveOrder?: ProtectiveOrder;

  readonly realizedPnl?: string;
  readonly fees?: string;
  /** Funding paid (+) or received (-) over the hold. Absent when unknown. */
  readonly fundingPaid?: string;
  readonly exitPrice?: string;

  /** Recorded when local belief and exchange truth diverged. Never overwritten silently. */
  readonly discrepancies: readonly string[];
}

/** States in which a position exists on the exchange and must be watched. */
export function isLive(state: PositionState): boolean {
  return (
    state === "PENDING_ENTRY" ||
    state === "OPEN" ||
    state === "MONITORING" ||
    state === "EXIT_TRIGGERED" ||
    state === "CLOSING" ||
    state === "EXIT_FAILED" ||
    state === "RECONCILIATION_REQUIRED" ||
    state === "UNKNOWN"
  );
}

/** States from which no further action is taken. */
export function isTerminal(state: PositionState): boolean {
  return state === "CLOSED" || state === "ENTRY_FAILED";
}

/** States in which an exit has already claimed the position. */
export function isExiting(state: PositionState): boolean {
  return state === "EXIT_TRIGGERED" || state === "CLOSING";
}

/**
 * States where the executor should still be watching the risk threshold.
 *
 * Note `EXIT_FAILED` and `RECONCILIATION_REQUIRED` are included: a failed exit
 * is still an open position, and abandoning it is the worst possible response.
 */
export function requiresMonitoring(state: PositionState): boolean {
  return isLive(state);
}
