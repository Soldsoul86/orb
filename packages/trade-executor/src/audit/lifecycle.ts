/**
 * The auditable trade lifecycle.
 *
 * Every trade must be reconstructable from these records alone: what arrived,
 * what was decided, what was sent, what the exchange confirmed, and why the
 * position was closed. They are appended to the Event Journal, which is
 * append-only and hash-chained, so the audit trail is tamper-evident
 * (Constitution Art. I).
 *
 * Nothing here ever carries a private key, a signature, or an API secret.
 */
import type { Side } from "../signal/model.js";
import type { ExitReason } from "../position/model.js";
import type { RejectionReason } from "../signal/validate.js";

export const LIFECYCLE_SCHEMA = { id: "orb.trade.lifecycle", version: 1 } as const;

/** The stages a trade passes through, in the order they normally occur. */
export type LifecycleStage =
  | "SIGNAL_RECEIVED"
  | "SIGNAL_VALIDATED"
  | "SIGNAL_REJECTED"
  | "ENTRY_SUBMITTED"
  | "ENTRY_ACKNOWLEDGED"
  | "ENTRY_FAILED"
  | "POSITION_OPEN"
  | "MONITORING_STARTED"
  | "MONITORING_LOST"
  | "PROTECTIVE_ORDER_PLACED"
  | "PROTECTIVE_ORDER_FAILED"
  | "HARD_THRESHOLD_CROSSED"
  | "EXIT_TRIGGERED"
  | "EXIT_SUPERSEDED"
  | "EXIT_ORDER_SUBMITTED"
  | "PARTIAL_FILL"
  | "FULL_FILL"
  | "EXIT_ATTEMPT_FAILED"
  | "POSITION_VERIFIED_FLAT"
  | "TRADE_CLOSED"
  | "RECONCILIATION_STARTED"
  | "RECONCILIATION_DISCREPANCY"
  | "RECONCILIATION_COMPLETE"
  | "KILL_SWITCH_ENGAGED"
  | "KILL_SWITCH_RELEASED"
  | "DEGRADED_ENTERED"
  | "DEGRADED_RESOLVED"
  | "EXECUTOR_STARTED"
  | "EXECUTOR_STOPPED";

/** What the sentinel measured when it made a decision. Kept for post-mortems. */
export interface RiskMeasurement {
  readonly rule: string;
  readonly measured: number;
  readonly threshold: number;
  readonly basis: string;
  readonly markPrice: string;
  readonly entryPrice: string;
  readonly unrealizedPnl: string;
}

/** One immutable record in a trade's lifecycle. */
export interface LifecycleEvent {
  readonly stage: LifecycleStage;
  readonly at: number;
  /** Correlates every record of one trade, from signal to close. */
  readonly tradeId: string;
  readonly signalId?: string;
  readonly symbol?: string;
  readonly side?: Side;
  readonly size?: string;
  readonly price?: string;
  readonly orderId?: number;
  readonly clientOrderId?: string;
  readonly exitReason?: ExitReason;
  readonly rejectionReason?: RejectionReason;
  readonly risk?: RiskMeasurement;
  readonly realizedPnl?: string;
  readonly fees?: string;
  /** Funding paid (+) or received (-) over the hold. Not a fee, not price PnL. */
  readonly funding?: string;
  readonly error?: string;
  /** Free-form, audit-only. Never read by any decision path. */
  readonly detail?: Readonly<Record<string, string | number | boolean | null>>;
}

/** Collects lifecycle events in memory. Used by tests and by the health view. */
export class InMemoryAuditSink {
  readonly events: LifecycleEvent[] = [];

  record(event: LifecycleEvent): void {
    this.events.push(event);
  }

  async flush(): Promise<void> {
    // Nothing to make durable.
  }

  /** Every event for one trade, in the order it was recorded. */
  forTrade(tradeId: string): readonly LifecycleEvent[] {
    return this.events.filter((event) => event.tradeId === tradeId);
  }

  stages(tradeId?: string): readonly LifecycleStage[] {
    const events = tradeId === undefined ? this.events : this.forTrade(tradeId);
    return events.map((event) => event.stage);
  }
}
