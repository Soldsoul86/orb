/**
 * Inverting the hard exit threshold into a price.
 *
 * The local sentinel reacts to prices as they arrive. A resting reduce-only
 * stop on the exchange does not need this process to be alive at all — so the
 * two together mean the hard exit does not depend on a single process staying
 * healthy, which is the actual objective.
 *
 * This module answers: *at what mark price does the configured threshold
 * breach?* It is the algebraic inverse of `sentinel.ts`, and the tests assert
 * that the two agree.
 */
import { sideSign, type Side } from "../signal/model.js";
import type { HardExitConfig, LossBasis } from "./config.js";

export interface StopPriceInput {
  readonly side: Side;
  readonly entryPrice: number;
  readonly size: number;
  readonly leverage: number;
  readonly accountValue: number;
  readonly marginUsed: number;
}

/**
 * The adverse price move, in quote units, at which `lossFraction` of `basis`
 * is lost.
 */
function adverseMoveForFraction(
  input: StopPriceInput,
  lossFraction: number,
  basis: LossBasis,
): number {
  const notional = input.entryPrice * input.size;
  switch (basis) {
    case "NOTIONAL":
      // loss = f · entry · size  →  move = f · entry
      return lossFraction * input.entryPrice;
    case "MARGIN": {
      // loss = f · margin, and margin ≈ notional / leverage  →  move = f · entry / leverage
      const margin = input.marginUsed > 0 ? input.marginUsed : notional / Math.max(input.leverage, 1);
      return input.size > 0 ? (lossFraction * margin) / input.size : Number.POSITIVE_INFINITY;
    }
    case "ACCOUNT_EQUITY":
      // loss = f · equity  →  move = f · equity / size
      return input.size > 0
        ? (lossFraction * input.accountValue) / input.size
        : Number.POSITIVE_INFINITY;
  }
}

/**
 * The mark price at which the hard exit threshold is reached.
 *
 * When several rules are configured, the **tightest** stop wins — the price
 * closest to entry — because that is the first threshold that would breach.
 *
 * @returns the trigger price, or `null` when no rule yields a usable price
 *   (for example a zero-size position, or a stop that would land at or below
 *   zero for a long).
 */
export function hardExitTriggerPrice(
  input: StopPriceInput,
  config: HardExitConfig,
): number | null {
  if (!(input.size > 0) || !(input.entryPrice > 0)) return null;

  const moves: number[] = [adverseMoveForFraction(input, config.maxLossFraction, config.basis)];

  if (config.maxLossUsd !== undefined) {
    moves.push(config.maxLossUsd / input.size);
  }

  const tightest = Math.min(...moves.filter((move) => Number.isFinite(move) && move > 0));
  if (!Number.isFinite(tightest)) return null;

  const price = input.entryPrice - sideSign(input.side) * tightest;
  // A long cannot stop at or below zero; a short's stop is always above entry.
  return price > 0 ? price : null;
}

/**
 * The price for the *resting* protective order.
 *
 * Placed slightly further out than the sentinel's own threshold, so in the
 * normal case the local sentinel — which is faster and can see partial fills —
 * acts first, and the exchange-side stop remains a backstop for the case where
 * this process is gone.
 */
export function protectiveStopPrice(
  input: StopPriceInput,
  config: HardExitConfig,
): number | null {
  const slack = 1 + Math.max(config.protectiveStopSlackFraction, 0);
  const widened: HardExitConfig = {
    ...config,
    maxLossFraction: config.maxLossFraction * slack,
    ...(config.maxLossUsd !== undefined ? { maxLossUsd: config.maxLossUsd * slack } : {}),
  };
  return hardExitTriggerPrice(input, widened);
}
