/**
 * Entry validation — everything checked before a position is opened.
 *
 * Pure: the caller gathers the context (exchange truth, current positions,
 * executor state) and this decides. Every rejection is a stable code, so a
 * refused signal is countable and auditable rather than a log line.
 *
 * A signal that passes the shape validator has *not* been accepted. It has only
 * been understood.
 */
import { Decimal } from "@orb/hyperliquid";
import type { TradeSignal } from "../signal/model.js";
import type { RejectionReason, Rejection } from "../signal/validate.js";
import type { EntryLimits } from "./config.js";
import type { PositionState } from "../position/model.js";

/** What the guards need to know about the world. Gathered by the caller. */
export interface EntryContext {
  /** Assets the exchange lists, and the metadata that constrains order shapes. */
  readonly asset: { readonly szDecimals: number; readonly maxLeverage: number; readonly isDelisted: boolean } | undefined;
  /** Reference price used to size and to bound slippage. */
  readonly referencePrice: number;
  readonly accountValue: number;
  readonly freeMarginUsd: number;
  /** Positions the executor is currently managing, live or otherwise. */
  readonly openPositions: readonly { readonly symbol: string; readonly side: string; readonly state: PositionState }[];
  /** True when this signal id has already been processed. */
  readonly alreadyProcessed: boolean;
  readonly killSwitchEngaged: boolean;
  readonly degraded: boolean;
  /** Set when entries are suspended for a reason other than the kill switch. */
  readonly entriesSuspended: boolean;
}

/** A signal that passed every guard, with its size resolved. */
export interface AcceptedEntry {
  readonly ok: true;
  readonly signal: TradeSignal;
  /** Resolved absolute size in the base asset, as a decimal string. */
  readonly size: string;
  readonly notionalUsd: number;
  readonly leverage: number;
  readonly referencePrice: number;
  /** The furthest price the entry may fill at before it is abandoned. */
  readonly slippageLimitPrice: number;
}

export type EntryDecision = AcceptedEntry | Rejection;

const deny = (reason: RejectionReason, detail: string, signalId: string): Rejection => ({
  ok: false,
  reason,
  detail,
  signalId,
});

/** Truncates toward zero to `decimals` places, without going through a float. */
function truncate(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return "0";
  const text = value.toFixed(Math.min(Math.max(decimals, 0), 18) + 4);
  const [whole = "0", fraction = ""] = text.split(".");
  if (decimals <= 0) return whole;
  const kept = fraction.slice(0, decimals).replace(/0+$/, "");
  return kept === "" ? whole : `${whole}.${kept}`;
}

/** The context available before any market data has been fetched. */
export type PreflightContext = Pick<
  EntryContext,
  "asset" | "alreadyProcessed" | "killSwitchEngaged" | "degraded" | "entriesSuspended"
>;

/**
 * The guards that need no market data.
 *
 * Run first, and separately, so the executor never spends a network round trip
 * — or leaks a "no price available" error — for a signal it was always going to
 * refuse. A signal naming a symbol the executor does not trade must be rejected
 * as `SYMBOL_NOT_ALLOWED`, not as a pricing failure.
 *
 * @returns a {@link Rejection}, or `null` when these guards pass.
 */
export function preflightEntry(
  signal: TradeSignal,
  limits: EntryLimits,
  context: PreflightContext,
): Rejection | null {
  const id = signal.signalId;

  /* ---- Executor state ------------------------------------------------- */

  if (context.killSwitchEngaged) {
    return deny("KILL_SWITCH_ENGAGED", "the kill switch is engaged; no entries are accepted", id);
  }
  if (context.degraded) {
    return deny("EXECUTOR_DEGRADED", "the executor is in its degraded state; no entries are accepted", id);
  }
  if (context.entriesSuspended) {
    return deny("ENTRY_DISABLED", "entries are suspended", id);
  }

  /* ---- Idempotency ---------------------------------------------------- */

  if (context.alreadyProcessed) {
    return deny("DUPLICATE_SIGNAL", `signal ${id} has already been processed`, id);
  }

  /* ---- Market --------------------------------------------------------- */

  if (!limits.symbolAllowlist.includes(signal.symbol)) {
    return deny("SYMBOL_NOT_ALLOWED", `${signal.symbol} is not in the symbol allowlist`, id);
  }
  if (context.asset === undefined) {
    return deny("UNKNOWN_SYMBOL", `${signal.symbol} is not listed on the exchange`, id);
  }
  if (context.asset.isDelisted) {
    return deny("SYMBOL_DELISTED", `${signal.symbol} is delisted`, id);
  }

  return null;
}

/**
 * Applies every entry guard, in a deliberate order.
 *
 * Executor state comes first: when the kill switch is on, nothing else about
 * the signal matters, and reporting "unknown symbol" for a signal that would
 * have been refused anyway is misleading.
 */
export function validateEntry(
  signal: TradeSignal,
  limits: EntryLimits,
  context: EntryContext,
): EntryDecision {
  const id = signal.signalId;

  const preflight = preflightEntry(signal, limits, context);
  if (preflight !== null) return preflight;

  if (context.asset === undefined) {
    return deny("UNKNOWN_SYMBOL", `${signal.symbol} is not listed on the exchange`, id);
  }
  if (!(context.referencePrice > 0) || !Number.isFinite(context.referencePrice)) {
    return deny("RISK_LIMIT_EXCEEDED", `no usable reference price for ${signal.symbol}`, id);
  }

  /* ---- Conflicting position ------------------------------------------- */

  const existing = context.openPositions.find((position) => position.symbol === signal.symbol);
  if (existing) {
    return deny(
      "CONFLICTING_POSITION",
      `a ${existing.side} position in ${signal.symbol} is already ${existing.state}`,
      id,
    );
  }
  if (context.openPositions.length >= limits.maxConcurrentPositions) {
    return deny(
      "MAX_CONCURRENT_POSITIONS",
      `${context.openPositions.length} positions open, limit is ${limits.maxConcurrentPositions}`,
      id,
    );
  }

  /* ---- Leverage -------------------------------------------------------- */

  const requested = signal.leverage ?? 1;
  const exchangeMax = context.asset.maxLeverage;
  if (requested > limits.maxLeverage) {
    return deny(
      "LEVERAGE_ABOVE_MAX",
      `requested leverage ${requested}x exceeds the configured maximum of ${limits.maxLeverage}x`,
      id,
    );
  }
  if (requested > exchangeMax) {
    return deny(
      "LEVERAGE_ABOVE_MAX",
      `requested leverage ${requested}x exceeds the exchange maximum of ${exchangeMax}x for ${signal.symbol}`,
      id,
    );
  }
  const leverage = requested;

  /* ---- Size ------------------------------------------------------------ */

  const rawSize =
    signal.sizing.kind === "BASE_SIZE"
      ? Number.parseFloat(signal.sizing.size)
      : Number.parseFloat(signal.sizing.notionalUsd) / context.referencePrice;

  if (!Number.isFinite(rawSize) || rawSize <= 0) {
    return deny("INVALID_SIZE", "resolved size is not a positive number", id);
  }

  const size = truncate(rawSize, context.asset.szDecimals);
  const sizeValue = Number.parseFloat(size);
  if (!(sizeValue > 0)) {
    return deny(
      "SIZE_NOT_REPRESENTABLE",
      `size ${rawSize} truncates to zero at ${context.asset.szDecimals} decimals`,
      id,
    );
  }

  const notionalUsd = sizeValue * context.referencePrice;
  if (notionalUsd < limits.minNotionalUsd) {
    return deny(
      "NOTIONAL_BELOW_MINIMUM",
      `notional $${notionalUsd.toFixed(2)} is below the $${limits.minNotionalUsd} minimum`,
      id,
    );
  }
  if (notionalUsd > limits.maxPositionNotionalUsd) {
    return deny(
      "SIZE_ABOVE_MAX",
      `notional $${notionalUsd.toFixed(2)} exceeds the $${limits.maxPositionNotionalUsd} maximum`,
      id,
    );
  }

  /* ---- Margin ---------------------------------------------------------- */

  const requiredMargin = notionalUsd / leverage;
  if (requiredMargin > context.freeMarginUsd) {
    return deny(
      "INSUFFICIENT_MARGIN",
      `needs $${requiredMargin.toFixed(2)} margin, $${context.freeMarginUsd.toFixed(2)} available`,
      id,
    );
  }
  const remainingFraction =
    context.accountValue > 0 ? (context.freeMarginUsd - requiredMargin) / context.accountValue : 0;
  if (remainingFraction < limits.minFreeMarginFraction) {
    return deny(
      "INSUFFICIENT_MARGIN",
      `would leave ${(remainingFraction * 100).toFixed(1)}% free margin, below the ` +
        `${(limits.minFreeMarginFraction * 100).toFixed(1)}% floor`,
      id,
    );
  }

  /* ---- Entry price and slippage ---------------------------------------- */

  // Computed exactly: `price * (1 + f)` in binary floating point turns a clean
  // 2010 into 2009.9999999999998, which then truncates to a worse limit than
  // the operator configured.
  const direction = signal.side === "LONG" ? 1 : -1;
  const slippageLimitPrice = Decimal.parse(
    (
      Decimal.parse(context.referencePrice).toNumber() *
      (1 + direction * limits.maxEntrySlippageFraction)
    ).toPrecision(12),
  ).toNumber();

  if (signal.entry.kind === "LIMIT") {
    const limitPrice = Number.parseFloat(signal.entry.price);
    // A limit worse than our slippage bound would fill at a price we have
    // already decided is unacceptable.
    const tooFar =
      signal.side === "LONG" ? limitPrice > slippageLimitPrice : limitPrice < slippageLimitPrice;
    if (tooFar) {
      return deny(
        "RISK_LIMIT_EXCEEDED",
        `limit price ${limitPrice} is beyond the ${(limits.maxEntrySlippageFraction * 100).toFixed(2)}% slippage bound`,
        id,
      );
    }
  }

  return {
    ok: true,
    signal,
    size,
    notionalUsd,
    leverage,
    referencePrice: context.referencePrice,
    slippageLimitPrice,
  };
}
