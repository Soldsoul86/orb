/**
 * The hard exit sentinel.
 *
 * This is the component the whole executor exists to protect. Its rules:
 *
 * - It is **pure**. No I/O, no clock, no allocation beyond the result. It is
 *   called on every mark-price tick, and it sits directly on the critical path
 *   between a price moving and a close order being sent.
 * - It is **configuration-driven**. No threshold is written into a decision.
 * - It is **independent**. It reads a position and a price. It cannot see the
 *   setup, the signal, the provider's opinion, an indicator, a target price, or
 *   whether the strategy thinks the trade will recover. None of those are in
 *   scope here, and that is deliberate: they are exactly the inputs that talk
 *   people out of stops.
 *
 * Breach is evaluated with `>=`, so a measurement landing exactly on the
 * threshold exits. A threshold you can sit precisely on without acting is not
 * a threshold.
 */
import { sideSign, type Side } from "../signal/model.js";
import type { HardExitConfig, LossBasis } from "./config.js";

/** Everything the sentinel is allowed to know about a position. */
export interface RiskSnapshot {
  readonly symbol: string;
  readonly side: Side;
  /** Absolute position size, in the base asset. */
  readonly size: number;
  readonly entryPrice: number;
  readonly markPrice: number;
  /** Margin committed to this position, in USD. */
  readonly marginUsed: number;
  /** Total account value, in USD. */
  readonly accountValue: number;
  /** Exchange liquidation price, when the exchange reports one. */
  readonly liquidationPrice: number | null;
  readonly leverage: number;
  readonly observedAt: number;
}

/** Which rule fired. */
export type HardExitRule = "MAX_LOSS_FRACTION" | "MAX_LOSS_USD" | "LIQUIDATION_PROXIMITY";

export interface RiskMeasurements {
  /** Unrealized PnL in USD. Negative is a loss. */
  readonly unrealizedPnl: number;
  /** Loss in USD; `0` when the position is in profit. */
  readonly loss: number;
  /** Loss as a fraction of {@link RiskSnapshot} on the configured basis. */
  readonly lossFraction: number;
  readonly basis: LossBasis;
  /** Distance from mark to liquidation, as a fraction of mark. `null` if unknown. */
  readonly liquidationDistanceFraction: number | null;
}

export type RiskAssessment =
  | { readonly breached: false; readonly measurements: RiskMeasurements }
  | {
      readonly breached: true;
      readonly rule: HardExitRule;
      readonly measured: number;
      readonly threshold: number;
      readonly measurements: RiskMeasurements;
    };

/**
 * Unrealized PnL, computed locally rather than taken from the feed.
 *
 * A mark-price tick carries a price, not a PnL, so the sentinel must be able to
 * derive one. Computing it the same way everywhere also means the number in the
 * audit record is the number the decision was made on.
 */
export function unrealizedPnl(snapshot: RiskSnapshot): number {
  return sideSign(snapshot.side) * (snapshot.markPrice - snapshot.entryPrice) * snapshot.size;
}

/** The denominator for the configured basis. */
function lossDenominator(snapshot: RiskSnapshot, basis: LossBasis): number {
  switch (basis) {
    case "NOTIONAL":
      return snapshot.entryPrice * snapshot.size;
    case "ACCOUNT_EQUITY":
      return snapshot.accountValue;
    case "MARGIN":
      // Prefer the exchange's own margin figure. When it is missing or zero
      // (an unconfirmed position, or a feed gap) fall back to the notional
      // implied by leverage rather than dividing by zero and reporting no risk.
      if (snapshot.marginUsed > 0) return snapshot.marginUsed;
      return (snapshot.entryPrice * snapshot.size) / Math.max(snapshot.leverage, 1);
  }
}

export function measure(snapshot: RiskSnapshot, basis: LossBasis): RiskMeasurements {
  const pnl = unrealizedPnl(snapshot);
  const loss = pnl < 0 ? -pnl : 0;
  const denominator = lossDenominator(snapshot, basis);

  // A zero or nonsensical denominator must not read as "no risk". Reporting an
  // infinite loss fraction makes the sentinel fire, which is the safe direction.
  const lossFraction =
    denominator > 0 ? loss / denominator : loss > 0 ? Number.POSITIVE_INFINITY : 0;

  const liquidationDistanceFraction =
    snapshot.liquidationPrice !== null && snapshot.liquidationPrice > 0 && snapshot.markPrice > 0
      ? Math.abs(snapshot.markPrice - snapshot.liquidationPrice) / snapshot.markPrice
      : null;

  return { unrealizedPnl: pnl, loss, lossFraction, basis, liquidationDistanceFraction };
}

/**
 * Evaluates every hard exit rule against a snapshot.
 *
 * Rules are checked in authority order, and the first breach wins, so the
 * recorded reason is the most serious one that applies.
 */
export function evaluateHardExit(
  snapshot: RiskSnapshot,
  config: HardExitConfig,
): RiskAssessment {
  const measurements = measure(snapshot, config.basis);

  if (measurements.lossFraction >= config.maxLossFraction) {
    return {
      breached: true,
      rule: "MAX_LOSS_FRACTION",
      measured: measurements.lossFraction,
      threshold: config.maxLossFraction,
      measurements,
    };
  }

  if (config.maxLossUsd !== undefined && measurements.loss >= config.maxLossUsd) {
    return {
      breached: true,
      rule: "MAX_LOSS_USD",
      measured: measurements.loss,
      threshold: config.maxLossUsd,
      measurements,
    };
  }

  const liquidationLimit = config.minLiquidationDistanceFraction;
  if (
    liquidationLimit !== undefined &&
    measurements.liquidationDistanceFraction !== null &&
    measurements.liquidationDistanceFraction <= liquidationLimit
  ) {
    return {
      breached: true,
      rule: "LIQUIDATION_PROXIMITY",
      measured: measurements.liquidationDistanceFraction,
      threshold: liquidationLimit,
      measurements,
    };
  }

  return { breached: false, measurements };
}

/**
 * Fast path: does this mark price breach the threshold?
 *
 * Used on every tick. Builds the snapshot from the last known position facts
 * and the new price, so a tick costs one multiply and one compare rather than
 * a round trip to the exchange.
 */
export function breachesAtPrice(
  base: Omit<RiskSnapshot, "markPrice" | "observedAt">,
  markPrice: number,
  observedAt: number,
  config: HardExitConfig,
): RiskAssessment {
  return evaluateHardExit({ ...base, markPrice, observedAt }, config);
}
