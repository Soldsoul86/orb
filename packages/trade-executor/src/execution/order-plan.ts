/**
 * Order construction.
 *
 * Pure functions from a decision to the orders that express it. Separating this
 * from submission means the exact order the executor would send is assertable
 * in a test without any exchange at all.
 */
import { formatPrice, formatSize } from "@orb/hyperliquid";
import { opposite, type Side } from "../signal/model.js";
import type { PlacedOrder } from "../ports.js";

export interface AssetPrecision {
  readonly szDecimals: number;
}

/**
 * An aggressive marketable limit order for entry.
 *
 * Hyperliquid has no unconditional market order for this path; an IOC limit
 * priced through the book is the equivalent, and unlike a true market order it
 * carries an explicit worst price — which is precisely the slippage bound the
 * risk layer already computed.
 */
export function entryOrder(input: {
  readonly symbol: string;
  readonly side: Side;
  readonly size: string;
  readonly limitPrice: number;
  readonly clientOrderId: `0x${string}`;
  readonly precision: AssetPrecision;
  readonly postOnly?: boolean;
}): PlacedOrder {
  return {
    symbol: input.symbol,
    side: input.side,
    reduceOnly: false,
    size: formatSize(input.size, input.precision.szDecimals),
    price: formatPrice(input.limitPrice, input.precision.szDecimals),
    clientOrderId: input.clientOrderId,
    kind: input.postOnly === true ? "limit" : "market",
  };
}

/**
 * A reduce-only closing order.
 *
 * `reduceOnly` is not a convenience: it is the guarantee that a close can never
 * accidentally open a position in the opposite direction — which is exactly
 * what a stale size would otherwise do during a partial fill.
 *
 * The limit is priced `aggressionFraction` *through* the mark in the direction
 * that crosses, so an IOC actually fills rather than resting.
 */
export function closeOrder(input: {
  readonly symbol: string;
  readonly side: Side;
  readonly size: string;
  readonly markPrice: number;
  readonly aggressionFraction: number;
  readonly precision: AssetPrecision;
  readonly clientOrderId?: `0x${string}`;
}): PlacedOrder {
  const closingSide = opposite(input.side);
  // Closing a long means selling: bid below the mark. Closing a short means
  // buying: offer above it.
  const direction = closingSide === "LONG" ? 1 : -1;
  const limit = input.markPrice * (1 + direction * Math.abs(input.aggressionFraction));

  return {
    symbol: input.symbol,
    side: closingSide,
    reduceOnly: true,
    size: formatSize(input.size, input.precision.szDecimals),
    price: formatPrice(limit, input.precision.szDecimals),
    clientOrderId: input.clientOrderId,
    kind: "market",
  };
}

/**
 * A resting reduce-only stop-market order, as exchange-native protection.
 *
 * This is what keeps the hard exit alive when this process is not.
 */
export function protectiveStopOrder(input: {
  readonly symbol: string;
  readonly side: Side;
  readonly size: string;
  readonly triggerPrice: number;
  readonly precision: AssetPrecision;
  readonly clientOrderId?: `0x${string}`;
}): PlacedOrder {
  const closingSide = opposite(input.side);
  const trigger = formatPrice(input.triggerPrice, input.precision.szDecimals);

  return {
    symbol: input.symbol,
    side: closingSide,
    reduceOnly: true,
    size: formatSize(input.size, input.precision.szDecimals),
    // For a stop-market the limit price is not the execution price; the trigger
    // is. It is set equal to the trigger so the wire object is well-formed.
    price: trigger,
    clientOrderId: input.clientOrderId,
    kind: "stop_market",
    triggerPrice: trigger,
  };
}

/**
 * The remaining size to close, given what has already filled.
 *
 * Returns `null` when nothing is left — which is how a partial-fill loop knows
 * it is done without asking the exchange twice.
 */
export function remainingSize(
  target: string,
  filled: string,
  szDecimals: number,
): string | null {
  const remaining = Number.parseFloat(target) - Number.parseFloat(filled);
  if (!(remaining > 0)) return null;
  const truncated = remaining.toFixed(Math.min(Math.max(szDecimals, 0), 12));
  return Number.parseFloat(truncated) > 0 ? truncated.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") : null;
}
