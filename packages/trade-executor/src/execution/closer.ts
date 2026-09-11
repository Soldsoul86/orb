/**
 * The close path.
 *
 * Once an exit has claimed a position, this drives it to flat. Its contract:
 *
 * - Every closing order is **reduce-only**, so it can only ever shrink the
 *   position, never flip it.
 * - A submitted order is not a closed position. The loop continues until the
 *   **exchange** reports the position flat (Constitution Art. XI, law 42).
 * - Partial fills are expected, not exceptional: each pass re-reads the
 *   remaining size from the exchange and closes what is actually still there.
 * - It gives up only after the configured attempts or timeout, and giving up
 *   means `EXIT_FAILED` — a state that keeps being monitored and retried, never
 *   a position quietly abandoned.
 *
 * It never decides *whether* to exit. That has already been decided.
 */
import type { AuditSink, Clock, ExchangePort, PlacedOrder } from "../ports.js";
import type { ExecutionLimits } from "../risk/config.js";
import type { ExitToken, PositionRegistry } from "../position/registry.js";
import type { ManagedPosition } from "../position/model.js";
import { closeOrder } from "./order-plan.js";
import { closeClientOrderId } from "../identity.js";

export interface CloseOutcome {
  readonly flat: boolean;
  readonly attempts: number;
  /** Total size confirmed closed across all attempts. */
  readonly closedSize: string;
  /** Size-weighted average fill price, when anything filled. */
  readonly averagePrice?: string;
  readonly realizedPnl?: string;
  readonly fees?: string;
  readonly error?: string;
}

export interface CloserDependencies {
  readonly exchange: ExchangePort;
  readonly registry: PositionRegistry;
  readonly audit: AuditSink;
  readonly now: Clock;
  readonly limits: ExecutionLimits;
  readonly sleep: (ms: number) => Promise<void>;
}

/**
 * Closes a position and verifies it is actually flat.
 *
 * @param token proof that the caller owns the single exit lifecycle.
 */
export async function closePosition(
  deps: CloserDependencies,
  token: ExitToken,
): Promise<CloseOutcome> {
  const { exchange, registry, audit, now, limits, sleep } = deps;
  const deadline = now() + limits.exitTimeoutMs;

  let attempt = 0;
  let closedSize = 0;
  let notional = 0;
  let lastError: string | undefined;

  const position = registry.get(token.symbol);
  if (!position) {
    return { flat: false, attempts: 0, closedSize: "0", error: "position vanished from the registry" };
  }

  const fillsFrom = token.claimedAt - 1_000;

  const flatResult = async (attempts: number): Promise<CloseOutcome> => {
    audit.record({
      stage: "POSITION_VERIFIED_FLAT",
      at: now(),
      tradeId: token.tradeId,
      symbol: token.symbol,
      exitReason: registry.get(token.symbol)?.exitReason ?? token.reason,
    });
    const settled = await settlement(exchange, token.symbol, fillsFrom).catch(() => null);
    return {
      flat: true,
      attempts,
      closedSize: trim(closedSize),
      ...(closedSize > 0 ? { averagePrice: trim(notional / closedSize) } : {}),
      ...(settled ? { realizedPnl: trim(settled.realizedPnl), fees: trim(settled.fees) } : {}),
    };
  };

  while (attempt < limits.maxCloseAttempts) {
    if (now() > deadline) {
      lastError = `exit timeout of ${limits.exitTimeoutMs}ms exceeded`;
      break;
    }
    attempt += 1;

    /* -- What is actually still open? The exchange decides, not our memory. -- */

    let remaining: { size: number; entryPrice: number } | null;
    try {
      remaining = await readOpenSize(exchange, token.symbol);
    } catch (error) {
      lastError = describe(error);
      recordAttempt(deps, token, attempt, "0", { outcome: "error", error: lastError });
      await sleep(limits.closeRetryDelayMs);
      continue;
    }

    // The exchange says flat. This is the only way out that counts.
    if (remaining === null) return flatResult(attempt - 1);

    /* -- Submit a reduce-only close for exactly what remains. -- */

    const asset = exchange.assetInfo(token.symbol);
    if (!asset) {
      lastError = `asset metadata for ${token.symbol} is unavailable`;
      break;
    }

    let markPrice: number;
    try {
      markPrice = Number.parseFloat(await exchange.markPrice(token.symbol));
    } catch {
      // Without a fresh mark, price the close off the entry rather than
      // abandoning the attempt: an unpriceable close is worse than a wide one.
      markPrice = remaining.entryPrice;
    }
    if (!(markPrice > 0)) markPrice = remaining.entryPrice;

    let order: PlacedOrder;
    try {
      order = closeOrder({
        symbol: token.symbol,
        side: position.side,
        size: trim(remaining.size),
        markPrice,
        aggressionFraction: limits.closeAggressionFraction,
        precision: { szDecimals: asset.szDecimals },
        clientOrderId: closeClientOrderId(token.tradeId, attempt),
      });
    } catch (error) {
      // A size that cannot be represented on the wire is dust: the remainder is
      // below one lot and no order can close it.
      lastError = `unclosable remainder: ${describe(error)}`;
      recordAttempt(deps, token, attempt, trim(remaining.size), { outcome: "error", error: lastError });
      break;
    }

    audit.record({
      stage: "EXIT_ORDER_SUBMITTED",
      at: now(),
      tradeId: token.tradeId,
      symbol: token.symbol,
      side: order.side,
      size: order.size,
      price: order.price,
      exitReason: token.reason,
      ...(order.clientOrderId ? { clientOrderId: order.clientOrderId } : {}),
    });

    let outcome;
    try {
      [outcome] = await exchange.submit([order]);
    } catch (error) {
      lastError = describe(error);
      recordAttempt(deps, token, attempt, order.size, { outcome: "error", error: lastError });
      await sleep(limits.closeRetryDelayMs);
      continue;
    }

    if (!outcome) {
      lastError = "exchange returned no outcome for the close order";
      recordAttempt(deps, token, attempt, order.size, { outcome: "error", error: lastError });
      await sleep(limits.closeRetryDelayMs);
      continue;
    }

    switch (outcome.kind) {
      case "filled": {
        const size = Number.parseFloat(outcome.filledSize);
        const price = Number.parseFloat(outcome.averagePrice);
        closedSize += size;
        notional += size * price;

        const partial = size + 1e-12 < remaining.size;
        audit.record({
          stage: partial ? "PARTIAL_FILL" : "FULL_FILL",
          at: now(),
          tradeId: token.tradeId,
          symbol: token.symbol,
          size: outcome.filledSize,
          price: outcome.averagePrice,
          orderId: outcome.orderId,
          exitReason: token.reason,
        });
        recordAttempt(deps, token, attempt, order.size, {
          outcome: partial ? "partial" : "filled",
          filledSize: outcome.filledSize,
          averagePrice: outcome.averagePrice,
          orderId: outcome.orderId,
        });
        // Loop regardless: only the exchange saying flat ends this.
        break;
      }
      case "resting":
      case "waiting": {
        recordAttempt(deps, token, attempt, order.size, {
          outcome: "submitted",
          ...(outcome.kind === "resting" ? { orderId: outcome.orderId } : {}),
        });
        await sleep(limits.closeRetryDelayMs);
        break;
      }
      case "rejected": {
        lastError = outcome.reason;
        recordAttempt(deps, token, attempt, order.size, { outcome: "rejected", error: outcome.reason });
        audit.record({
          stage: "EXIT_ATTEMPT_FAILED",
          at: now(),
          tradeId: token.tradeId,
          symbol: token.symbol,
          exitReason: token.reason,
          error: outcome.reason,
        });
        await sleep(limits.closeRetryDelayMs);
        break;
      }
    }
  }

  /* -- One last check: an attempt may have succeeded as the budget ran out. -- */

  try {
    if ((await readOpenSize(exchange, token.symbol)) === null) return flatResult(attempt);
  } catch (error) {
    lastError ??= describe(error);
  }

  return {
    flat: false,
    attempts: attempt,
    closedSize: trim(closedSize),
    ...(closedSize > 0 ? { averagePrice: trim(notional / closedSize) } : {}),
    error: lastError ?? "the exchange still reports an open position",
  };
}

/** The exchange's current open size for `symbol`, or `null` when flat. */
async function readOpenSize(
  exchange: ExchangePort,
  symbol: string,
): Promise<{ size: number; entryPrice: number } | null> {
  const state = await exchange.accountState();
  const position = state.positions.find((candidate) => candidate.symbol === symbol);
  if (!position) return null;
  const size = Math.abs(Number.parseFloat(position.size));
  if (!(size > 0)) return null;
  return { size, entryPrice: Number.parseFloat(position.entryPrice) };
}

/** Realized PnL and fees, read from the exchange's own fills. */
async function settlement(
  exchange: ExchangePort,
  symbol: string,
  since: number,
): Promise<{ realizedPnl: number; fees: number }> {
  const fills = await exchange.fillsSince(since);
  let realizedPnl = 0;
  let fees = 0;
  for (const fill of fills) {
    if (fill.symbol !== symbol) continue;
    realizedPnl += Number.parseFloat(fill.closedPnl);
    fees += Number.parseFloat(fill.fee);
  }
  return { realizedPnl, fees };
}

function recordAttempt(
  deps: CloserDependencies,
  token: ExitToken,
  attempt: number,
  requestedSize: string,
  result: {
    outcome: "submitted" | "filled" | "partial" | "rejected" | "error";
    filledSize?: string;
    averagePrice?: string;
    orderId?: number;
    error?: string;
  },
): void {
  deps.registry.recordCloseAttempt(token.symbol, {
    attempt,
    at: deps.now(),
    requestedSize,
    outcome: result.outcome,
    ...(result.filledSize !== undefined ? { filledSize: result.filledSize } : {}),
    ...(result.averagePrice !== undefined ? { averagePrice: result.averagePrice } : {}),
    ...(result.orderId !== undefined ? { orderId: result.orderId } : {}),
    ...(result.error !== undefined ? { error: result.error } : {}),
  });
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function trim(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(10).replace(/0+$/, "").replace(/\.$/, "") || "0";
}

/** Total size filled across every close attempt. For tests and the status view. */
export function totalFilled(position: ManagedPosition): string {
  const total = position.closeAttempts.reduce(
    (sum, attempt) => sum + Number.parseFloat(attempt.filledSize ?? "0"),
    0,
  );
  return trim(total);
}
