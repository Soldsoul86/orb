/**
 * Trade economics and per-setup measurement.
 *
 * The claims this module makes about short-timeframe viability are strong, so
 * they are pinned rather than asserted in prose.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  roundTripCost,
  breakevenHitRate,
  expectancy,
  expectancyR,
  minimumViableStop,
  assess,
  tradesToSignificance,
  rewardToRisk,
  EXECUTION_STYLES,
  HYPERLIQUID_BASE_FEES,
  type CostModel,
} from "../src/analysis/economics.js";
import {
  foldTrades,
  buildSetupLedger,
  summariseSetup,
} from "../src/analysis/setup-performance.js";
import type { LifecycleEvent } from "../src/audit/lifecycle.js";

/** Taker both sides, no funding, no slippage: the executor's current default. */
const takerTaker: CostModel = {
  entryFeeFraction: EXECUTION_STYLES.takerTaker.entry,
  exitFeeFraction: EXECUTION_STYLES.takerTaker.exit,
  hourlyFundingFraction: 0,
  expectedHoldHours: 0,
  slippageFraction: 0,
};

const makerTaker: CostModel = {
  ...takerTaker,
  entryFeeFraction: EXECUTION_STYLES.makerTaker.entry,
  exitFeeFraction: EXECUTION_STYLES.makerTaker.exit,
};

const near = (actual: number, expected: number, tolerance = 1e-9, note = "") =>
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `${note} expected ${expected}, got ${actual}`,
  );

describe("round-trip cost", () => {
  test("sums fees, both sides of slippage, and funding over the hold", () => {
    near(roundTripCost(takerTaker), 0.0009, 1e-12, "taker/taker fees");
    near(roundTripCost(makerTaker), 0.0006, 1e-12, "maker entry, taker exit");

    const withEverything: CostModel = {
      ...takerTaker,
      slippageFraction: 0.0001,
      hourlyFundingFraction: 0.0001,
      expectedHoldHours: 4,
    };
    // 0.0009 fees + 0.0002 slippage + 0.0004 funding
    near(roundTripCost(withEverything), 0.0015, 1e-12);
  });

  test("funding can be received, not only paid", () => {
    const paid: CostModel = { ...takerTaker, hourlyFundingFraction: -0.0001, expectedHoldHours: 4 };
    near(roundTripCost(paid), 0.0009 - 0.0004, 1e-12);
  });
});

describe("break-even hit rate", () => {
  test("a costless coin flip at 1:1 breaks even at exactly 50%", () => {
    const free: CostModel = { ...takerTaker, entryFeeFraction: 0, exitFeeFraction: 0 };
    near(breakevenHitRate({ stopFraction: 0.01, targetFraction: 0.01 }, free), 0.5);
  });

  test("cost moves the break-even point, it does not merely shave the edge", () => {
    // S = T = 1%, c = 0.09%  ->  (0.01 + 0.0009) / 0.02 = 54.5%
    near(breakevenHitRate({ stopFraction: 0.01, targetFraction: 0.01 }, takerTaker), 0.545, 1e-9);
  });

  test("tightening the stop raises the required hit rate hyperbolically", () => {
    const required = [0.02, 0.01, 0.005, 0.003, 0.002, 0.001].map((stopFraction) =>
      breakevenHitRate({ stopFraction, targetFraction: stopFraction }, takerTaker),
    );

    // Monotonically harder as the stop tightens.
    for (let i = 1; i < required.length; i++) {
      assert.ok(required[i]! > required[i - 1]!, `${required[i]} should exceed ${required[i - 1]}`);
    }

    // The headline numbers, at 1:1 reward-to-risk with taker fees both sides.
    near(required[0]!, 0.5225, 1e-9, "2.0% stop");
    near(required[1]!, 0.545, 1e-9, "1.0% stop");
    near(required[2]!, 0.59, 1e-9, "0.5% stop");
    near(required[4]!, 0.725, 1e-9, "0.2% stop");
    near(required[5]!, 0.95, 1e-9, "0.1% stop");
  });

  test("a target that does not clear the cost cannot break even at any hit rate", () => {
    // Aiming for 0.05% while the round trip costs 0.09%: every winner loses.
    const doomed = breakevenHitRate({ stopFraction: 0.01, targetFraction: 0.0005 }, takerTaker);
    assert.ok(Number.isNaN(doomed), "must be NaN, not a hit rate above 1");

    // Even a perfect record loses money.
    assert.ok(expectancy({ stopFraction: 0.01, targetFraction: 0.0005 }, takerTaker, 1.0) < 0);
  });

  test("a better reward ratio lowers the required hit rate", () => {
    const oneToOne = breakevenHitRate({ stopFraction: 0.005, targetFraction: 0.005 }, takerTaker);
    const twoToOne = breakevenHitRate({ stopFraction: 0.005, targetFraction: 0.010 }, takerTaker);
    const threeToOne = breakevenHitRate({ stopFraction: 0.005, targetFraction: 0.015 }, takerTaker);
    assert.ok(twoToOne < oneToOne && threeToOne < twoToOne);
    near(twoToOne, 0.0059 / 0.015, 1e-9);
  });

  test("execution style is worth more than signal quality at a tight stop", () => {
    const geometry = { stopFraction: 0.002, targetFraction: 0.002 };
    const asTaker = breakevenHitRate(geometry, takerTaker);
    const asMaker = breakevenHitRate(geometry, makerTaker);

    near(asTaker, 0.725, 1e-9);
    near(asMaker, 0.65, 1e-9);
    // Resting the entry is worth 7.5 points of hit rate at a 0.2% stop — more
    // than most signal research ever delivers.
    assert.ok(asTaker - asMaker > 0.07);
  });

  test("refuses a nonsensical geometry rather than returning a number", () => {
    assert.ok(Number.isNaN(breakevenHitRate({ stopFraction: 0, targetFraction: 0.01 }, takerTaker)));
    assert.ok(Number.isNaN(breakevenHitRate({ stopFraction: -0.01, targetFraction: 0.01 }, takerTaker)));
  });
});

describe("leverage does not change the required hit rate", () => {
  test("break-even is identical at every leverage, because everything scales together", () => {
    // The geometry is expressed as a fraction of notional. Leverage multiplies
    // notional, and therefore multiplies PnL and fees by exactly the same
    // factor. It changes the variance of the equity curve, never the edge.
    const geometry = { stopFraction: 0.01, targetFraction: 0.02 };
    const breakeven = breakevenHitRate(geometry, takerTaker);

    for (const leverage of [1, 2, 5, 10, 20, 50]) {
      const notional = 1_000 * leverage;
      const grossWin = geometry.targetFraction * notional;
      const grossLoss = geometry.stopFraction * notional;
      const cost = roundTripCost(takerTaker) * notional;

      // At the break-even hit rate the expected account change is zero,
      // whatever the leverage.
      const ev = breakeven * (grossWin - cost) - (1 - breakeven) * (grossLoss + cost);
      near(ev, 0, 1e-9, `leverage ${leverage}`);
    }
  });
});

describe("expectancy", () => {
  test("is zero exactly at break-even and positive above it", () => {
    const geometry = { stopFraction: 0.01, targetFraction: 0.01 };
    const breakeven = breakevenHitRate(geometry, takerTaker);

    near(expectancy(geometry, takerTaker, breakeven), 0, 1e-12);
    assert.ok(expectancy(geometry, takerTaker, breakeven + 0.05) > 0);
    assert.ok(expectancy(geometry, takerTaker, breakeven - 0.05) < 0);
  });

  test("expressed in R, a 60% hit rate at 1:1 with taker fees is a thin edge", () => {
    const r = expectancyR({ stopFraction: 0.01, targetFraction: 0.01 }, takerTaker, 0.6);
    // 0.6(0.01-0.0009) - 0.4(0.01+0.0009) = 0.00110  ->  0.11R
    near(r, 0.11, 1e-9);
  });

  test("the same hit rate is worthless once the stop is tight enough", () => {
    // 60% at a 0.1% stop, taker both sides, is decisively negative.
    const r = expectancyR({ stopFraction: 0.001, targetFraction: 0.001 }, takerTaker, 0.6);
    assert.ok(r < 0, `expected a loss, got ${r}R`);
  });
});

describe("minimum viable stop", () => {
  test("inverts the break-even identity consistently", () => {
    for (const hitRate of [0.55, 0.6, 0.7]) {
      for (const ratio of [1, 1.5, 2]) {
        const stop = minimumViableStop(hitRate, ratio, takerTaker);
        const recovered = breakevenHitRate(
          { stopFraction: stop, targetFraction: stop * ratio },
          takerTaker,
        );
        near(recovered, hitRate, 1e-9, `p=${hitRate} k=${ratio}`);
      }
    }
  });

  test("a hit rate that cannot support the reward ratio has no viable stop", () => {
    // At 1:1 you need better than 50% before any stop distance works.
    assert.equal(minimumViableStop(0.5, 1, takerTaker), Number.POSITIVE_INFINITY);
    assert.equal(minimumViableStop(0.4, 1, takerTaker), Number.POSITIVE_INFINITY);
  });

  test("a strong hit rate still cannot rescue an arbitrarily tight stop", () => {
    // Even at 70% and 1:1, taker fees set a floor of 0.225% on the stop.
    near(minimumViableStop(0.7, 1, takerTaker), 0.0009 / 0.4, 1e-12);
    assert.ok(minimumViableStop(0.7, 1, takerTaker) > 0.002);
  });
});

describe("assessment", () => {
  test("reports cost as a share of what is risked", () => {
    const tight = assess({ stopFraction: 0.002, targetFraction: 0.002 }, takerTaker, 0.6);
    const wide = assess({ stopFraction: 0.02, targetFraction: 0.02 }, takerTaker, 0.6);

    near(tight.costToStopRatio, 0.45, 1e-9);
    near(wide.costToStopRatio, 0.045, 1e-9);
    assert.equal(tight.viable, false, "0.45 of the risk goes to the exchange");
    assert.equal(wide.viable, true);
  });

  test("a viable setup reports positive edge and expectancy", () => {
    const verdict = assess({ stopFraction: 0.01, targetFraction: 0.02 }, takerTaker, 0.45);
    assert.equal(verdict.viable, true);
    assert.ok(verdict.edge > 0);
    assert.ok(verdict.expectancy > 0);
    near(verdict.rewardToRisk, 2);
  });
});

describe("statistical significance", () => {
  test("a small edge needs a large sample", () => {
    // 55% observed against a 54.5% break-even: a 0.5-point edge.
    const needed = tradesToSignificance(0.545, 0.55);
    assert.ok(needed > 30_000, `a half-point edge needs a huge sample, got ${needed}`);
  });

  test("a large edge is provable quickly", () => {
    assert.ok(tradesToSignificance(0.5, 0.8) < 50);
  });

  test("no edge at all can never be proven", () => {
    assert.equal(tradesToSignificance(0.545, 0.545), Number.POSITIVE_INFINITY);
  });

  test("a flattering short sample proves nothing", () => {
    // 7 wins from 10 trades against a 54.5% break-even looks great.
    const needed = tradesToSignificance(0.545, 0.7);
    assert.ok(needed > 10, `10 trades is not enough; ${needed} would be`);
  });
});

describe("reward-to-risk", () => {
  test("is the ratio of target to stop", () => {
    near(rewardToRisk({ stopFraction: 0.01, targetFraction: 0.03 }), 3);
  });
});

describe("exchange fee reference", () => {
  test("matches Hyperliquid's base tier", () => {
    assert.equal(HYPERLIQUID_BASE_FEES.taker, 0.00045);
    assert.equal(HYPERLIQUID_BASE_FEES.maker, 0.00015);
    // The hard exit is always taker, so maker/maker is not reachable for a
    // strategy with a hard stop.
    assert.equal(EXECUTION_STYLES.makerTaker.exit, HYPERLIQUID_BASE_FEES.taker);
  });
});

/* ================================================================== *
 * Per-setup measurement
 * ================================================================== */

let clock = 1_700_000_000_000;

/** Builds the lifecycle events one completed trade produces. */
function tradeEvents(options: {
  tradeId: string;
  setupId: string;
  entryPrice: number;
  size: number;
  grossPnl: number;
  fees: number;
  funding?: number;
  holdMs?: number;
  exitReason?: string;
}): LifecycleEvent[] {
  const openedAt = (clock += 1_000);
  const closedAt = openedAt + (options.holdMs ?? 60_000);
  return [
    {
      stage: "SIGNAL_VALIDATED", at: openedAt, tradeId: options.tradeId,
      signalId: `sig-${options.tradeId}`, symbol: "ETH", side: "LONG",
      detail: { setupId: options.setupId },
    },
    {
      stage: "POSITION_OPEN", at: openedAt, tradeId: options.tradeId,
      symbol: "ETH", side: "LONG",
      size: String(options.size), price: String(options.entryPrice),
    },
    {
      stage: "TRADE_CLOSED", at: closedAt, tradeId: options.tradeId,
      symbol: "ETH", side: "LONG",
      exitReason: (options.exitReason ?? "HARD_RISK_EXIT") as NonNullable<LifecycleEvent["exitReason"]>,
      realizedPnl: String(options.grossPnl),
      fees: String(options.fees),
      funding: String(options.funding ?? 0),
    },
  ];
}

describe("folding trades from the journal", () => {
  test("joins the entry facts to the settled economics", () => {
    const events = tradeEvents({
      tradeId: "t1", setupId: "momentum-5m", entryPrice: 2000, size: 1,
      grossPnl: 20, fees: 1.8, funding: 0.2,
    });

    const [trade] = foldTrades(events);
    assert.ok(trade);
    assert.equal(trade.setupId, "momentum-5m");
    assert.equal(trade.notional, 2000);
    assert.equal(trade.grossPnl, 20);
    near(trade.netPnl, 18, 1e-9, "gross minus fees minus funding");
    near(trade.netFraction, 18 / 2000, 1e-12);
  });

  test("an unfinished trade is absent — this measures what closed", () => {
    const events = tradeEvents({
      tradeId: "t1", setupId: "s", entryPrice: 2000, size: 1, grossPnl: 5, fees: 1,
    }).slice(0, 2);
    assert.deepEqual([...foldTrades(events)], []);
  });

  test("a close with no recorded open cannot be attributed", () => {
    // An adopted position: real, but its entry economics are not ours to know.
    const orphan: LifecycleEvent[] = [
      { stage: "TRADE_CLOSED", at: clock, tradeId: "adopted", symbol: "ETH",
        exitReason: "HARD_RISK_EXIT", realizedPnl: "-10", fees: "1" },
    ];
    assert.deepEqual([...foldTrades(orphan)], []);
  });

  test("a trade with no setupId is bucketed, not dropped", () => {
    const events = tradeEvents({
      tradeId: "t1", setupId: "", entryPrice: 2000, size: 1, grossPnl: 5, fees: 1,
    });
    events[0] = { ...events[0]!, detail: {} };
    const [trade] = foldTrades(events);
    assert.equal(trade?.setupId, "(unattributed)");
  });
});

describe("per-setup performance", () => {
  test("separates a winning setup from a losing one inside a flat account", () => {
    // Blended, these two net to roughly nothing. Apart, one is clearly bleeding.
    const events = [
      ...Array.from({ length: 6 }, (_, i) =>
        tradeEvents({ tradeId: `w${i}`, setupId: "momentum-15m",
          entryPrice: 2000, size: 1, grossPnl: 12, fees: 1.8 })).flat(),
      ...Array.from({ length: 4 }, (_, i) =>
        tradeEvents({ tradeId: `l${i}`, setupId: "momentum-15m",
          entryPrice: 2000, size: 1, grossPnl: -10, fees: 1.8 })).flat(),

      ...Array.from({ length: 5 }, (_, i) =>
        tradeEvents({ tradeId: `s${i}`, setupId: "scalp-30s",
          entryPrice: 2000, size: 1, grossPnl: 2, fees: 1.8 })).flat(),
      ...Array.from({ length: 5 }, (_, i) =>
        tradeEvents({ tradeId: `f${i}`, setupId: "scalp-30s",
          entryPrice: 2000, size: 1, grossPnl: -2, fees: 1.8 })).flat(),
    ];

    const ledger = buildSetupLedger(events, takerTaker);
    assert.equal(ledger.bySetup.length, 2);

    // Worst first: the actionable end of the list.
    const [worst, best] = ledger.bySetup;
    assert.equal(worst?.setupId, "scalp-30s");
    assert.equal(best?.setupId, "momentum-15m");

    // The scalp is a pure fee transfer: symmetric gross moves, zero gross edge,
    // and a perfectly respectable-looking 50% hit rate — yet it hands the
    // exchange the entire round-trip cost of ten trades. A hit rate in
    // isolation says nothing at all.
    near(worst!.grossPnl, 0, 1e-9);
    near(worst!.netPnl, -18, 1e-9);
    near(worst!.hitRate, 0.5, 1e-9);
    assert.ok(worst!.expectancyPerTrade < 0, "50% wins, still negative expectancy");

    assert.ok(best!.netPnl > 0);
    near(best!.hitRate, 0.6);
  });

  test("reports how much of the gross profit the exchange took", () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      tradeEvents({ tradeId: `t${i}`, setupId: "thin-edge",
        entryPrice: 2000, size: 1, grossPnl: 2, fees: 1.8 })).flat();

    const [setup] = buildSetupLedger(events, takerTaker).bySetup;
    near(setup!.grossPnl, 20, 1e-9);
    near(setup!.fees, 18, 1e-9);
    // 90% of everything the setup found went to the exchange.
    near(setup!.costShareOfGross!, 0.9, 1e-9);
  });

  test("computes break-even from realised geometry, not an assumed one", () => {
    const events = [
      ...Array.from({ length: 5 }, (_, i) =>
        tradeEvents({ tradeId: `w${i}`, setupId: "s",
          entryPrice: 2000, size: 1, grossPnl: 20, fees: 1.8 })).flat(),
      ...Array.from({ length: 5 }, (_, i) =>
        tradeEvents({ tradeId: `l${i}`, setupId: "s",
          entryPrice: 2000, size: 1, grossPnl: -20, fees: 1.8 })).flat(),
    ];

    const [setup] = buildSetupLedger(events, takerTaker).bySetup;
    assert.ok(setup?.breakeven !== null && setup?.breakeven !== undefined);
    // Wins net 18.2, losses net 21.8: a realised reward ratio below 1, so
    // break-even sits above 50% and a 50% hit rate is not enough.
    assert.ok(setup!.realisedRewardToRisk! < 1);
    assert.ok(setup!.breakeven! > 0.5);
    assert.ok(setup!.edge! < 0, "a 50% hit rate loses here");
  });

  test("flags a flattering sample as not yet significant", () => {
    const events = [
      ...Array.from({ length: 3 }, (_, i) =>
        tradeEvents({ tradeId: `w${i}`, setupId: "lucky",
          entryPrice: 2000, size: 1, grossPnl: 20, fees: 1.8 })).flat(),
      tradeEvents({ tradeId: "l0", setupId: "lucky",
        entryPrice: 2000, size: 1, grossPnl: -20, fees: 1.8 }),
    ].flat();

    const [setup] = buildSetupLedger(events, takerTaker).bySetup;
    assert.equal(setup!.trades, 4);
    assert.equal(setup!.significant, false, "4 trades proves nothing");
    assert.ok((setup!.tradesForSignificance ?? 0) > 4);
  });

  test("records why each trade ended", () => {
    const events = [
      tradeEvents({ tradeId: "a", setupId: "s", entryPrice: 2000, size: 1,
        grossPnl: -20, fees: 1.8, exitReason: "HARD_RISK_EXIT" }),
      tradeEvents({ tradeId: "b", setupId: "s", entryPrice: 2000, size: 1,
        grossPnl: -20, fees: 1.8, exitReason: "HARD_RISK_EXIT" }),
      tradeEvents({ tradeId: "c", setupId: "s", entryPrice: 2000, size: 1,
        grossPnl: 30, fees: 1.8, exitReason: "MANUAL_EXIT" }),
    ].flat();

    const [setup] = buildSetupLedger(events, takerTaker).bySetup;
    assert.equal(setup!.exitReasons["HARD_RISK_EXIT"], 2);
    assert.equal(setup!.exitReasons["MANUAL_EXIT"], 1);
  });

  test("totals reconcile with the sum of the trades", () => {
    const events = Array.from({ length: 7 }, (_, i) =>
      tradeEvents({ tradeId: `t${i}`, setupId: i % 2 === 0 ? "a" : "b",
        entryPrice: 2000, size: 1, grossPnl: i - 3, fees: 1.8, funding: 0.1 })).flat();

    const ledger = buildSetupLedger(events, takerTaker);
    const summed = ledger.bySetup.reduce((a, s) => a + s.netPnl, 0);
    near(ledger.totals.netPnl, summed, 1e-9);
    assert.equal(ledger.totals.trades, 7);
  });

  test("an empty journal produces an empty ledger, not an error", () => {
    const ledger = buildSetupLedger([], takerTaker);
    assert.deepEqual([...ledger.bySetup], []);
    assert.equal(ledger.totals.trades, 0);
  });

  test("summarising with no cost model still reports the realised result", () => {
    const events = tradeEvents({ tradeId: "t", setupId: "s",
      entryPrice: 2000, size: 1, grossPnl: 10, fees: 1.8 });
    const setup = summariseSetup("s", foldTrades(events));
    near(setup.netPnl, 8.2, 1e-9);
    assert.equal(setup.breakeven, null, "no cost model means no break-even claim");
  });
});
