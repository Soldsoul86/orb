/**
 * Reconciliation.
 *
 * The exchange is the source of truth for what positions exist. Local state is
 * a belief, and beliefs drift: a fill we never heard about, a close that landed
 * after we gave up on it, a position opened by hand in the web UI, a process
 * that died between submitting an order and recording it.
 *
 * Two rules govern everything here:
 *
 * 1. **Never silently overwrite a discrepancy.** Every divergence is recorded
 *    on the position and emitted as an audit event before local state is
 *    brought into line. A reconciliation that leaves no trace is
 *    indistinguishable from a bug.
 * 2. **Never assume flat.** A position we cannot account for is adopted and
 *    monitored, not discarded. An unmonitored position is the failure mode this
 *    entire executor exists to prevent.
 */
import type { AuditSink, Clock, ExchangePort, ExchangePositionView } from "../ports.js";
import type { ManagedPosition } from "../position/model.js";
import { isTerminal } from "../position/model.js";
import { PositionRegistry, newPosition } from "../position/registry.js";
import { tradeIdForAdoptedPosition } from "../identity.js";

/** A single divergence between local belief and exchange truth. */
export interface Discrepancy {
  readonly kind:
    /** The exchange holds a position the executor was not managing. */
    | "UNTRACKED_POSITION"
    /** Local state says open; the exchange says flat. */
    | "PHANTOM_POSITION"
    /** Both agree a position exists, but not on its size. */
    | "SIZE_MISMATCH"
    /** Both agree a position exists, but not on its direction. */
    | "SIDE_MISMATCH"
    /** A reduce-only order is resting that no managed position accounts for. */
    | "ORPHANED_ORDER";
  readonly symbol: string;
  readonly detail: string;
  readonly localValue?: string;
  readonly exchangeValue?: string;
}

export interface ReconciliationResult {
  readonly at: number;
  readonly discrepancies: readonly Discrepancy[];
  /** Positions adopted from the exchange that the executor was not tracking. */
  readonly adopted: readonly string[];
  /** Positions marked closed because the exchange reports them flat. */
  readonly closed: readonly string[];
  /** Positions whose local size was corrected to the exchange's. */
  readonly corrected: readonly string[];
  readonly exchangeReachable: boolean;
  readonly error?: string;
}

export interface ReconcilerDependencies {
  readonly exchange: ExchangePort;
  readonly registry: PositionRegistry;
  readonly audit: AuditSink;
  readonly now: Clock;
  /** Default leverage recorded for an adopted position with no history. */
  readonly defaultLeverage: number;
}

/** Sizes agree when they differ by less than one lot of the asset. */
function sizesAgree(a: string, b: string, szDecimals: number): boolean {
  const tolerance = Math.pow(10, -szDecimals) / 2;
  return Math.abs(Math.abs(Number.parseFloat(a)) - Math.abs(Number.parseFloat(b))) <= tolerance;
}

/**
 * Compares local belief against exchange truth and brings the two into line.
 *
 * Runs on startup, on reconnect, after a WebSocket failure, after a failed
 * close, and on a timer. It is safe to run at any time and is idempotent.
 */
export async function reconcile(
  deps: ReconcilerDependencies,
  signal?: AbortSignal,
): Promise<ReconciliationResult> {
  const { exchange, registry, audit, now } = deps;
  const at = now();

  audit.record({ stage: "RECONCILIATION_STARTED", at, tradeId: "executor" });

  let exchangeState;
  try {
    exchangeState = await exchange.accountState(signal);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // We could not see reality. Every live position is now of unknown state —
    // and unknown is emphatically not flat.
    for (const position of registry.live()) {
      if (position.state !== "UNKNOWN") {
        registry.transition(position.symbol, "CONFIDENCE_LOST", { lastObservedAt: at });
        registry.recordDiscrepancy(position.symbol, `exchange unreachable during reconciliation: ${message}`);
      }
    }
    audit.record({
      stage: "RECONCILIATION_COMPLETE",
      at: now(),
      tradeId: "executor",
      error: message,
      detail: { exchangeReachable: false },
    });
    return {
      at,
      discrepancies: [],
      adopted: [],
      closed: [],
      corrected: [],
      exchangeReachable: false,
      error: message,
    };
  }

  const discrepancies: Discrepancy[] = [];
  const adopted: string[] = [];
  const closed: string[] = [];
  const corrected: string[] = [];

  const onExchange = new Map<string, ExchangePositionView>();
  for (const position of exchangeState.positions) {
    if (Math.abs(Number.parseFloat(position.size)) > 0) onExchange.set(position.symbol, position);
  }

  /* ---- Positions the exchange holds --------------------------------- */

  for (const [symbol, actual] of onExchange) {
    const local = registry.get(symbol);

    if (!local || isTerminal(local.state)) {
      // Adopted: opened by hand, left behind by a crash, or a close we believed
      // had succeeded. Either way it is real and must be monitored.
      const tradeId = tradeIdForAdoptedPosition(symbol, exchangeState.observedAt);
      const discrepancy: Discrepancy = {
        kind: "UNTRACKED_POSITION",
        symbol,
        detail: local
          ? `local state is ${local.state} but the exchange holds ${actual.size}`
          : `the exchange holds ${actual.size} with no local record`,
        ...(local ? { localValue: local.state } : {}),
        exchangeValue: actual.size,
      };
      discrepancies.push(discrepancy);

      registry.open(
        newPosition({
          tradeId,
          symbol,
          side: actual.side,
          state: "OPEN",
          openedAt: exchangeState.observedAt,
          leverage: actual.leverage > 0 ? actual.leverage : deps.defaultLeverage,
          size: actual.size,
          entryPrice: actual.entryPrice,
        }),
      );
      registry.recordDiscrepancy(symbol, discrepancy.detail);
      adopted.push(symbol);
      record(deps, discrepancy, tradeId);
      continue;
    }

    // Tracked and present. Check the facts agree.
    const asset = exchange.assetInfo(symbol);
    const szDecimals = asset?.szDecimals ?? 8;

    if (local.side !== actual.side) {
      const discrepancy: Discrepancy = {
        kind: "SIDE_MISMATCH",
        symbol,
        detail: `local believes ${local.side}, the exchange holds ${actual.side}`,
        localValue: local.side,
        exchangeValue: actual.side,
      };
      discrepancies.push(discrepancy);
      registry.recordDiscrepancy(symbol, discrepancy.detail);
      record(deps, discrepancy, local.tradeId);
      // The exchange is authoritative about direction, and a stale side would
      // make the sentinel compute PnL with the wrong sign.
      registry.observe(symbol, {
        side: actual.side,
        size: actual.size,
        entryPrice: actual.entryPrice,
        lastObservedAt: exchangeState.observedAt,
      });
      corrected.push(symbol);
      continue;
    }

    if (!sizesAgree(local.size, actual.size, szDecimals)) {
      const discrepancy: Discrepancy = {
        kind: "SIZE_MISMATCH",
        symbol,
        detail: `local believes ${local.size}, the exchange holds ${actual.size}`,
        localValue: local.size,
        exchangeValue: actual.size,
      };
      discrepancies.push(discrepancy);
      registry.recordDiscrepancy(symbol, discrepancy.detail);
      record(deps, discrepancy, local.tradeId);
      corrected.push(symbol);
    }

    // Adopt the exchange's facts either way: even when sizes agree, entry price
    // and margin move as funding accrues.
    registry.observe(symbol, {
      size: actual.size,
      entryPrice: actual.entryPrice,
      lastObservedAt: exchangeState.observedAt,
    });

    // A position whose entry was still in flight is now confirmed.
    if (local.state === "PENDING_ENTRY") {
      registry.transition(symbol, "ENTRY_CONFIRMED", {
        size: actual.size,
        entryPrice: actual.entryPrice,
        lastObservedAt: exchangeState.observedAt,
      });
    } else if (local.state === "RECONCILIATION_REQUIRED" || local.state === "UNKNOWN") {
      registry.transition(symbol, "RECONCILED_OPEN", { lastObservedAt: exchangeState.observedAt });
    }
  }

  /* ---- Positions we believe in that the exchange does not ------------ */

  for (const local of registry.live()) {
    if (onExchange.has(local.symbol)) continue;

    // An entry still in flight is not yet a phantom: the order may simply not
    // have filled. It is resolved by the entry timeout, not here.
    if (local.state === "PENDING_ENTRY") continue;

    const discrepancy: Discrepancy = {
      kind: "PHANTOM_POSITION",
      symbol: local.symbol,
      detail: `local state is ${local.state} with size ${local.size}, but the exchange is flat`,
      localValue: local.size,
      exchangeValue: "0",
    };

    // A close we already commanded reaching flat is the expected ending, not a
    // discrepancy — but a position going flat on its own certainly is.
    const expected = local.state === "EXIT_TRIGGERED" || local.state === "CLOSING";
    if (!expected) {
      discrepancies.push(discrepancy);
      registry.recordDiscrepancy(local.symbol, discrepancy.detail);
      record(deps, discrepancy, local.tradeId);
    }

    registry.transition(local.symbol, "RECONCILED_FLAT", {
      lastObservedAt: exchangeState.observedAt,
      closedAt: exchangeState.observedAt,
    });
    closed.push(local.symbol);

    audit.record({
      stage: "TRADE_CLOSED",
      at: now(),
      tradeId: local.tradeId,
      symbol: local.symbol,
      side: local.side,
      ...(local.exitReason ? { exitReason: local.exitReason } : { exitReason: "UNKNOWN" as const }),
      detail: { viaReconciliation: true, expected },
    });
  }

  /* ---- Resting orders with nothing behind them ------------------------ */

  try {
    const openOrders = await exchange.openOrders(signal);
    for (const order of openOrders) {
      if (!order.reduceOnly) continue;
      const local = registry.get(order.symbol);
      if (local && !isTerminal(local.state)) continue;

      const discrepancy: Discrepancy = {
        kind: "ORPHANED_ORDER",
        symbol: order.symbol,
        detail: `reduce-only order ${order.orderId} rests on ${order.symbol} with no managed position`,
        exchangeValue: String(order.orderId),
      };
      discrepancies.push(discrepancy);
      record(deps, discrepancy, "executor");
    }
  } catch {
    // Order listing is diagnostic, not load-bearing: a failure here must not
    // discard the position reconciliation we already completed.
  }

  audit.record({
    stage: "RECONCILIATION_COMPLETE",
    at: now(),
    tradeId: "executor",
    detail: {
      discrepancies: discrepancies.length,
      adopted: adopted.length,
      closed: closed.length,
      corrected: corrected.length,
      exchangeReachable: true,
    },
  });

  return { at, discrepancies, adopted, closed, corrected, exchangeReachable: true };
}

function record(deps: ReconcilerDependencies, discrepancy: Discrepancy, tradeId: string): void {
  deps.audit.record({
    stage: "RECONCILIATION_DISCREPANCY",
    at: deps.now(),
    tradeId,
    symbol: discrepancy.symbol,
    detail: {
      kind: discrepancy.kind,
      detail: discrepancy.detail,
      local: discrepancy.localValue ?? null,
      exchange: discrepancy.exchangeValue ?? null,
    },
  });
}

/** Every discrepancy recorded against a position, for the audit view. */
export function discrepanciesOf(position: ManagedPosition): readonly string[] {
  return position.discrepancies;
}
