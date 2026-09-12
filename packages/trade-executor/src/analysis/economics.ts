/**
 * Trade economics — the arithmetic that decides whether a setup can pay.
 *
 * This module answers one question: **given what a setup risks, what it aims
 * for, and what the round trip costs, how often must it be right to break even?**
 *
 * It is deliberately separate from the sentinel and from anything that decides
 * a trade. It forecasts nothing and predicts nothing. It is a constraint
 * calculator, and the constraint it describes is the one most short-timeframe
 * strategies die to:
 *
 *   As the stop tightens, cost stops being a rounding error and becomes the
 *   dominant term. The required hit rate rises hyperbolically, not linearly.
 *
 * Everything is a fraction of **notional**, not of margin. That is what makes
 * the central result fall out: leverage cancels. PnL, fees and the stop all
 * scale with notional together, so leverage changes the variance of your
 * equity curve and never the hit rate you need. Leverage cannot rescue a setup
 * whose edge does not clear its costs; it only gets you to the answer sooner.
 */

/** What one round trip costs, as fractions of notional. */
export interface CostModel {
  /** Fee paid entering. Taker if the entry crosses; maker if it rests. */
  readonly entryFeeFraction: number;
  /**
   * Fee paid exiting.
   *
   * A hard exit is always taker: an emergency close that rests in the book is
   * not an emergency close. This term therefore has a floor that no execution
   * tuning can remove.
   */
  readonly exitFeeFraction: number;
  /** Funding per hour, as a fraction of notional. Negative when you receive it. */
  readonly hourlyFundingFraction: number;
  /** How long the setup expects to hold, in hours. */
  readonly expectedHoldHours: number;
  /** Adverse fill quality per side, beyond the quoted price. */
  readonly slippageFraction: number;
}

/** Hyperliquid's base tier. Volume tiers and referral discounts only improve it. */
export const HYPERLIQUID_BASE_FEES = Object.freeze({
  taker: 0.00045,
  maker: 0.00015,
});

/** The three execution styles available to a perp strategy, by total fee cost. */
export const EXECUTION_STYLES = Object.freeze({
  /** Cross on both sides. What an IOC entry plus an IOC hard exit costs. */
  takerTaker: { entry: HYPERLIQUID_BASE_FEES.taker, exit: HYPERLIQUID_BASE_FEES.taker },
  /** Rest the entry, cross the exit. The realistic floor when the exit must be immediate. */
  makerTaker: { entry: HYPERLIQUID_BASE_FEES.maker, exit: HYPERLIQUID_BASE_FEES.taker },
  /** Rest both. Only reachable when no exit is ever urgent — which a hard stop is. */
  makerMaker: { entry: HYPERLIQUID_BASE_FEES.maker, exit: HYPERLIQUID_BASE_FEES.maker },
});

/** What a setup risks and what it aims for, as fractions of notional. */
export interface SetupGeometry {
  /** Adverse move at which the position is closed. */
  readonly stopFraction: number;
  /** Favourable move at which the position is closed. */
  readonly targetFraction: number;
}

/** Total cost of one round trip, as a fraction of notional. */
export function roundTripCost(cost: CostModel): number {
  const fees = cost.entryFeeFraction + cost.exitFeeFraction;
  const slippage = cost.slippageFraction * 2;
  const funding = cost.hourlyFundingFraction * cost.expectedHoldHours;
  return fees + slippage + funding;
}

/** Reward-to-risk, in R multiples. */
export function rewardToRisk(geometry: SetupGeometry): number {
  return geometry.targetFraction / geometry.stopFraction;
}

/**
 * The hit rate at which a setup exactly breaks even.
 *
 *   p (T - c) - (1 - p)(S + c) = 0   ->   p = (S + c) / (S + T)
 *
 * where S is the stop, T the target and c the round-trip cost. Note `c` appears
 * in the numerator but not the denominator: cost does not merely shave the edge,
 * it moves the whole breakeven point.
 *
 * @returns a probability in `(0, 1]`, or `NaN` when the setup cannot break even
 *   at any hit rate — which happens when the target does not cover the cost.
 */
export function breakevenHitRate(geometry: SetupGeometry, cost: CostModel): number {
  const c = roundTripCost(cost);
  const { stopFraction: S, targetFraction: T } = geometry;

  if (!(S > 0) || !(T > 0)) return Number.NaN;
  // A target that does not clear the cost loses on every winner as well as
  // every loser. No hit rate saves it, including 100%.
  if (T <= c) return Number.NaN;

  return (S + c) / (S + T);
}

/**
 * Expected value per trade, as a fraction of notional.
 *
 * Positive is an edge. This is the number that compounds, and the only one
 * that matters over a sample.
 */
export function expectancy(
  geometry: SetupGeometry,
  cost: CostModel,
  hitRate: number,
): number {
  const c = roundTripCost(cost);
  return hitRate * (geometry.targetFraction - c) - (1 - hitRate) * (geometry.stopFraction + c);
}

/** Expectancy in R multiples — expected value per unit risked. */
export function expectancyR(
  geometry: SetupGeometry,
  cost: CostModel,
  hitRate: number,
): number {
  return expectancy(geometry, cost, hitRate) / geometry.stopFraction;
}

/**
 * The tightest stop that can still break even at a given hit rate.
 *
 * Inverting the breakeven identity with `T = k·S`:
 *
 *   S = c / (p(1 + k) - 1)
 *
 * This is the practical form of the constraint. It answers: *given the hit rate
 * I actually believe I have, how close can my stop be before costs eat it?*
 *
 * @returns the minimum viable stop as a fraction of notional, or `Infinity`
 *   when the hit rate cannot support the reward ratio at any stop distance.
 */
export function minimumViableStop(
  hitRate: number,
  rewardRatio: number,
  cost: CostModel,
): number {
  const denominator = hitRate * (1 + rewardRatio) - 1;
  if (!(denominator > 0)) return Number.POSITIVE_INFINITY;
  return roundTripCost(cost) / denominator;
}

/** How a setup stands against its own break-even requirement. */
export interface Verdict {
  readonly roundTripCost: number;
  readonly rewardToRisk: number;
  readonly breakevenHitRate: number;
  /** Hit rate assumed for the assessment. */
  readonly assumedHitRate: number;
  /** How far above break-even the assumption sits. Negative means underwater. */
  readonly edge: number;
  readonly expectancy: number;
  readonly expectancyR: number;
  /**
   * Cost as a share of the amount risked.
   *
   * The single most diagnostic number for a short-timeframe strategy. Above
   * roughly 0.2 the setup is paying the exchange more than it is risking on its
   * own opinion, and execution style matters more than the signal does.
   */
  readonly costToStopRatio: number;
  readonly viable: boolean;
}

export function assess(
  geometry: SetupGeometry,
  cost: CostModel,
  assumedHitRate: number,
): Verdict {
  const c = roundTripCost(cost);
  const breakeven = breakevenHitRate(geometry, cost);
  const ev = expectancy(geometry, cost, assumedHitRate);

  return {
    roundTripCost: c,
    rewardToRisk: rewardToRisk(geometry),
    breakevenHitRate: breakeven,
    assumedHitRate,
    edge: assumedHitRate - breakeven,
    expectancy: ev,
    expectancyR: ev / geometry.stopFraction,
    costToStopRatio: c / geometry.stopFraction,
    viable: Number.isFinite(breakeven) && assumedHitRate > breakeven,
  };
}

/**
 * The number of trades needed before a measured hit rate is distinguishable
 * from break-even.
 *
 * Uses a normal approximation to the binomial. It exists to answer the question
 * that decides whether a backtest or a live sample means anything: *have I seen
 * enough trades to tell an edge from luck?*
 *
 * At small edges the answer is routinely in the thousands, which is why a
 * strategy that looks good over forty trades usually is not.
 *
 * @param confidenceZ 1.96 for 95% (default), 2.58 for 99%.
 */
export function tradesToSignificance(
  breakeven: number,
  observed: number,
  confidenceZ = 1.96,
): number {
  const edge = Math.abs(observed - breakeven);
  if (!(edge > 0)) return Number.POSITIVE_INFINITY;
  const variance = observed * (1 - observed);
  return Math.ceil((confidenceZ ** 2 * variance) / edge ** 2);
}
