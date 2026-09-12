/**
 * Per-setup performance, reconstructed from the journal.
 *
 * The executor is deliberately signal-agnostic: it has no opinion about whether
 * a setup is good. This is how you find out — not by believing a backtest, but
 * by folding the actual recorded history of what each `setupId` did, net of
 * everything it cost.
 *
 * It is a projection in the kernel's sense (Constitution Art. IX §33): it holds
 * no truth of its own, it is rebuilt by replay, and it can be discarded at any
 * time. Every number it reports is traceable to immutable events.
 *
 * The point of measuring per setup rather than per account is that a blended
 * equity curve hides everything. Two setups, one with an edge and one bleeding,
 * net out to "roughly flat" — and the only way to act on that is to see them
 * apart.
 */
import type { LifecycleEvent } from "../audit/lifecycle.js";
import type { Side } from "../signal/model.js";
import type { CostModel } from "./economics.js";
import { breakevenHitRate, tradesToSignificance } from "./economics.js";

/** One completed trade, reduced to the terms that decide whether it paid. */
export interface TradeRecord {
  readonly tradeId: string;
  readonly setupId: string;
  readonly symbol: string;
  readonly side: Side;
  readonly signalId?: string;
  readonly openedAt: number;
  readonly closedAt: number;
  readonly holdMs: number;
  readonly entryPrice: number;
  readonly exitPrice?: number;
  readonly notional: number;
  /** Price PnL before costs. */
  readonly grossPnl: number;
  readonly fees: number;
  readonly funding: number;
  /** What actually landed in the account: `grossPnl - fees - funding`. */
  readonly netPnl: number;
  /** Net result as a fraction of notional — comparable across sizes. */
  readonly netFraction: number;
  readonly exitReason: string;
}

/** What a setup actually did, over the trades in the journal. */
export interface SetupPerformance {
  readonly setupId: string;
  readonly trades: number;
  readonly wins: number;
  readonly losses: number;
  readonly scratches: number;
  readonly hitRate: number;

  readonly grossPnl: number;
  readonly fees: number;
  readonly funding: number;
  readonly netPnl: number;

  /**
   * Costs as a share of gross profit, when gross was positive.
   *
   * Above 1 the setup found an edge and handed all of it to the exchange.
   */
  readonly costShareOfGross: number | null;

  readonly averageWin: number;
  readonly averageLoss: number;
  /** Realised reward-to-risk, from what actually happened, not what was planned. */
  readonly realisedRewardToRisk: number | null;
  /** Expected net result per trade, as a fraction of notional. */
  readonly expectancyPerTrade: number;

  readonly medianHoldMs: number;
  readonly exitReasons: Readonly<Record<string, number>>;

  /**
   * Hit rate this setup needed, given its own realised geometry and costs.
   * `null` when there were too few trades of either kind to infer geometry.
   */
  readonly breakeven: number | null;
  /** Observed hit rate minus break-even. Negative means it is losing money. */
  readonly edge: number | null;
  /**
   * Trades needed before this edge is distinguishable from luck at 95%.
   *
   * Compare against `trades`. A setup with a 4-trade sample and a flattering
   * hit rate has told you nothing.
   */
  readonly tradesForSignificance: number | null;
  /** Whether the sample is large enough for `edge` to mean anything. */
  readonly significant: boolean;
}

/** Everything the projection holds. Rebuildable, never authoritative. */
export interface SetupLedger {
  readonly trades: readonly TradeRecord[];
  readonly bySetup: readonly SetupPerformance[];
  readonly totals: {
    readonly trades: number;
    readonly grossPnl: number;
    readonly fees: number;
    readonly funding: number;
    readonly netPnl: number;
  };
}

/** Trades smaller than this fraction of notional are neither wins nor losses. */
const SCRATCH_THRESHOLD = 1e-9;

/**
 * Folds lifecycle events into completed trades.
 *
 * Joins `SIGNAL_VALIDATED` (which carries the `setupId` and the entry facts) to
 * `TRADE_CLOSED` (which carries the settled economics) on `tradeId`. A trade
 * still open, or one whose close was never recorded, is simply absent — this
 * measures what finished, not what was hoped for.
 */
export function foldTrades(events: readonly LifecycleEvent[]): readonly TradeRecord[] {
  interface Partial {
    setupId?: string;
    signalId?: string;
    symbol?: string;
    side?: Side;
    openedAt?: number;
    entryPrice?: number;
    size?: number;
  }

  const opening = new Map<string, Partial>();
  const out: TradeRecord[] = [];

  for (const event of events) {
    const partial = opening.get(event.tradeId) ?? {};

    switch (event.stage) {
      case "SIGNAL_VALIDATED": {
        const setupId = event.detail?.["setupId"];
        opening.set(event.tradeId, {
          ...partial,
          ...(typeof setupId === "string" ? { setupId } : {}),
          ...(event.signalId !== undefined ? { signalId: event.signalId } : {}),
          ...(event.symbol !== undefined ? { symbol: event.symbol } : {}),
          ...(event.side !== undefined ? { side: event.side } : {}),
        });
        break;
      }

      case "POSITION_OPEN": {
        opening.set(event.tradeId, {
          ...partial,
          openedAt: event.at,
          ...(event.price !== undefined ? { entryPrice: Number.parseFloat(event.price) } : {}),
          ...(event.size !== undefined ? { size: Number.parseFloat(event.size) } : {}),
          ...(event.symbol !== undefined ? { symbol: event.symbol } : {}),
          ...(event.side !== undefined ? { side: event.side } : {}),
        });
        break;
      }

      case "TRADE_CLOSED": {
        // A close with no recorded open is an adopted position: real, but its
        // entry economics are not ours to know, so it cannot be attributed.
        if (partial.openedAt === undefined || partial.entryPrice === undefined) break;

        const grossPnl = Number.parseFloat(event.realizedPnl ?? "0");
        const fees = Number.parseFloat(event.fees ?? "0");
        const funding = Number.parseFloat(event.funding ?? "0");
        const size = partial.size ?? 0;
        const notional = partial.entryPrice * size;
        const netPnl = grossPnl - fees - funding;

        out.push({
          tradeId: event.tradeId,
          setupId: partial.setupId ?? "(unattributed)",
          symbol: partial.symbol ?? event.symbol ?? "(unknown)",
          side: partial.side ?? event.side ?? "LONG",
          ...(partial.signalId !== undefined ? { signalId: partial.signalId } : {}),
          openedAt: partial.openedAt,
          closedAt: event.at,
          holdMs: event.at - partial.openedAt,
          entryPrice: partial.entryPrice,
          ...(event.price !== undefined ? { exitPrice: Number.parseFloat(event.price) } : {}),
          notional,
          grossPnl,
          fees,
          funding,
          netPnl,
          netFraction: notional > 0 ? netPnl / notional : 0,
          exitReason: event.exitReason ?? "UNKNOWN",
        });
        opening.delete(event.tradeId);
        break;
      }

      default:
        break;
    }
  }

  return out;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

/** Aggregates completed trades into per-setup performance. */
export function summariseSetup(
  setupId: string,
  trades: readonly TradeRecord[],
  cost?: CostModel,
): SetupPerformance {
  const wins = trades.filter((t) => t.netFraction > SCRATCH_THRESHOLD);
  const losses = trades.filter((t) => t.netFraction < -SCRATCH_THRESHOLD);
  const scratches = trades.length - wins.length - losses.length;

  const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
  const grossPnl = sum(trades.map((t) => t.grossPnl));
  const fees = sum(trades.map((t) => t.fees));
  const funding = sum(trades.map((t) => t.funding));
  const netPnl = grossPnl - fees - funding;

  // Averages in fractional terms, so trades of different sizes are comparable.
  const averageWin = wins.length > 0 ? sum(wins.map((t) => t.netFraction)) / wins.length : 0;
  const averageLoss =
    losses.length > 0 ? Math.abs(sum(losses.map((t) => t.netFraction)) / losses.length) : 0;

  const hitRate = trades.length > 0 ? wins.length / trades.length : 0;
  const realisedRewardToRisk = averageLoss > 0 ? averageWin / averageLoss : null;

  // Break-even is computed from what this setup actually did, so it reflects
  // real slippage and real holding costs rather than an assumed geometry.
  let breakeven: number | null = null;
  if (cost !== undefined && averageWin > 0 && averageLoss > 0) {
    breakeven = breakevenHitRate(
      { stopFraction: averageLoss, targetFraction: averageWin },
      cost,
    );
    if (!Number.isFinite(breakeven)) breakeven = null;
  }

  const edge = breakeven === null ? null : hitRate - breakeven;
  const tradesForSignificance =
    breakeven === null ? null : tradesToSignificance(breakeven, hitRate);

  return {
    setupId,
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    scratches,
    hitRate,
    grossPnl,
    fees,
    funding,
    netPnl,
    costShareOfGross: grossPnl > 0 ? (fees + funding) / grossPnl : null,
    averageWin,
    averageLoss,
    realisedRewardToRisk,
    expectancyPerTrade:
      trades.length > 0 ? sum(trades.map((t) => t.netFraction)) / trades.length : 0,
    medianHoldMs: median(trades.map((t) => t.holdMs)),
    exitReasons: trades.reduce<Record<string, number>>((acc, t) => {
      acc[t.exitReason] = (acc[t.exitReason] ?? 0) + 1;
      return acc;
    }, {}),
    breakeven,
    edge,
    tradesForSignificance,
    significant:
      tradesForSignificance !== null &&
      Number.isFinite(tradesForSignificance) &&
      trades.length >= tradesForSignificance,
  };
}

/**
 * Builds the full ledger from lifecycle events.
 *
 * Setups are ordered by net result, worst first — because the actionable end of
 * this list is the losing end.
 */
export function buildSetupLedger(
  events: readonly LifecycleEvent[],
  cost?: CostModel,
): SetupLedger {
  const trades = foldTrades(events);

  const grouped = new Map<string, TradeRecord[]>();
  for (const trade of trades) {
    const bucket = grouped.get(trade.setupId);
    if (bucket) bucket.push(trade);
    else grouped.set(trade.setupId, [trade]);
  }

  const bySetup = [...grouped.entries()]
    .map(([setupId, group]) => summariseSetup(setupId, group, cost))
    .sort((a, b) => a.netPnl - b.netPnl);

  const sum = (pick: (t: TradeRecord) => number) => trades.reduce((a, t) => a + pick(t), 0);

  return {
    trades,
    bySetup,
    totals: {
      trades: trades.length,
      grossPnl: sum((t) => t.grossPnl),
      fees: sum((t) => t.fees),
      funding: sum((t) => t.funding),
      netPnl: sum((t) => t.netPnl),
    },
  };
}
