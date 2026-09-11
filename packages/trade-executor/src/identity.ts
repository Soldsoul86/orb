/**
 * Deterministic identifiers.
 *
 * A signal id is turned into a client order id by hashing, which makes entry
 * idempotent *at the exchange*, not merely in our own memory: resubmitting the
 * same signal produces the same `cloid`, and the exchange refuses a duplicate.
 * That is the difference between "we think we already did this" and "the
 * exchange will not let us do it twice" — and it is what survives a crash
 * between submitting an order and recording that we did.
 */
import { createHash } from "node:crypto";

/** A Hyperliquid client order id: exactly 16 bytes, hex encoded. */
export type ClientOrderId = `0x${string}`;

function digest(namespace: string, value: string): string {
  return createHash("sha256").update(`${namespace} ${value}`, "utf8").digest("hex");
}

/**
 * The client order id for a signal's entry order.
 *
 * Stable for the lifetime of the signal id: the same signal always maps to the
 * same order id, on any device, after any restart.
 */
export function entryClientOrderId(signalId: string): ClientOrderId {
  return `0x${digest("orb.entry.v1", signalId).slice(0, 32)}`;
}

/**
 * The client order id for one close attempt.
 *
 * The attempt number is part of the input because a retry is a genuinely new
 * order — reusing the id would have the exchange reject the retry as a
 * duplicate, which is the opposite of what a retry needs.
 */
export function closeClientOrderId(tradeId: string, attempt: number): ClientOrderId {
  return `0x${digest("orb.close.v1", `${tradeId}:${attempt}`).slice(0, 32)}`;
}

/** The client order id for a position's resting protective stop. */
export function protectiveClientOrderId(tradeId: string): ClientOrderId {
  return `0x${digest("orb.protect.v1", tradeId).slice(0, 32)}`;
}

/**
 * The trade id for a signal.
 *
 * Derived rather than random so that a restart mid-entry rediscovers the same
 * trade rather than creating a second record of it.
 */
export function tradeIdForSignal(signalId: string): string {
  return `trade_${digest("orb.trade.v1", signalId).slice(0, 24)}`;
}

/** The trade id for a position found on the exchange with no signal behind it. */
export function tradeIdForAdoptedPosition(symbol: string, openedAt: number): string {
  return `trade_adopted_${digest("orb.adopted.v1", `${symbol}:${openedAt}`).slice(0, 20)}`;
}
