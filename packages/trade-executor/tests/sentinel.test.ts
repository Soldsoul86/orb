/**
 * The hard exit sentinel.
 *
 * These are the tests that matter most in the repository. If the sentinel is
 * wrong, everything else is decoration.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateHardExit,
  measure,
  unrealizedPnl,
  breachesAtPrice,
  type RiskSnapshot,
} from "../src/risk/sentinel.js";
import { hardExitTriggerPrice, protectiveStopPrice } from "../src/risk/stop-price.js";
import type { HardExitConfig } from "../src/risk/config.js";

const AT = 1_700_000_000_000;

/** A 1 ETH position at 2000, 10x, so margin is $200 and notional is $2000. */
function position(overrides: Partial<RiskSnapshot> = {}): RiskSnapshot {
  return {
    symbol: "ETH",
    side: "LONG",
    size: 1,
    entryPrice: 2000,
    markPrice: 2000,
    marginUsed: 200,
    accountValue: 10_000,
    liquidationPrice: null,
    leverage: 10,
    observedAt: AT,
    ...overrides,
  };
}

const config = (overrides: Partial<HardExitConfig> = {}): HardExitConfig => ({
  maxLossFraction: 0.1,
  basis: "MARGIN",
  exchangeProtectiveStop: true,
  protectiveStopSlackFraction: 0.15,
  ...overrides,
});

describe("unrealized PnL", () => {
  test("a long profits as the price rises and loses as it falls", () => {
    assert.equal(unrealizedPnl(position({ markPrice: 2100 })), 100);
    assert.equal(unrealizedPnl(position({ markPrice: 1900 })), -100);
    assert.equal(unrealizedPnl(position({ markPrice: 2000 })), 0);
  });

  test("a short profits as the price falls — the sign is inverted, not the maths", () => {
    const short = { side: "SHORT" as const };
    assert.equal(unrealizedPnl(position({ ...short, markPrice: 1900 })), 100);
    assert.equal(unrealizedPnl(position({ ...short, markPrice: 2100 })), -100);
  });

  test("scales with position size", () => {
    assert.equal(unrealizedPnl(position({ size: 5, markPrice: 1990 })), -50);
  });
});

describe("loss basis", () => {
  // $20 loss on a 1 ETH position: 1% of notional, 10% of margin, 0.2% of equity.
  const losing = position({ markPrice: 1980 });

  test("MARGIN measures loss against the margin committed", () => {
    assert.equal(measure(losing, "MARGIN").lossFraction, 0.1);
  });

  test("NOTIONAL measures loss as a pure price move, ignoring leverage", () => {
    assert.equal(measure(losing, "NOTIONAL").lossFraction, 0.01);
  });

  test("ACCOUNT_EQUITY measures loss against total account value", () => {
    assert.equal(measure(losing, "ACCOUNT_EQUITY").lossFraction, 0.002);
  });

  test("a position in profit has zero loss on every basis", () => {
    const winning = position({ markPrice: 2100 });
    for (const basis of ["MARGIN", "NOTIONAL", "ACCOUNT_EQUITY"] as const) {
      const measured = measure(winning, basis);
      assert.equal(measured.loss, 0, basis);
      assert.equal(measured.lossFraction, 0, basis);
    }
  });

  test("MARGIN falls back to notional/leverage when the exchange reports no margin", () => {
    // marginUsed is 0 (an unconfirmed position, or a feed gap). 2000/10 = 200.
    const noMargin = position({ markPrice: 1980, marginUsed: 0 });
    assert.equal(measure(noMargin, "MARGIN").lossFraction, 0.1);
  });

  test("a zero denominator with a real loss reads as infinite, never as no risk", () => {
    const broken = position({ markPrice: 1980, marginUsed: 0, leverage: 0, entryPrice: 2000, size: 0 });
    const measured = measure({ ...broken, size: 0 }, "MARGIN");
    // Size 0 means no loss at all, so the fraction is 0 — not a false alarm.
    assert.equal(measured.lossFraction, 0);

    const zeroEquity = position({ markPrice: 1980, accountValue: 0 });
    assert.equal(measure(zeroEquity, "ACCOUNT_EQUITY").lossFraction, Number.POSITIVE_INFINITY);
  });
});

describe("threshold crossing", () => {
  test("LONG: crossing the threshold breaches", () => {
    // 10% of $200 margin is $20, which is a $20 adverse move on 1 ETH.
    const before = evaluateHardExit(position({ markPrice: 1981 }), config());
    const after = evaluateHardExit(position({ markPrice: 1979 }), config());

    assert.equal(before.breached, false);
    assert.equal(after.breached, true);
    assert.equal(after.breached && after.rule, "MAX_LOSS_FRACTION");
  });

  test("SHORT: crossing the threshold breaches, in the other direction", () => {
    const short = { side: "SHORT" as const };
    const before = evaluateHardExit(position({ ...short, markPrice: 2019 }), config());
    const after = evaluateHardExit(position({ ...short, markPrice: 2021 }), config());

    assert.equal(before.breached, false);
    assert.equal(after.breached, true);
    assert.equal(after.breached && after.rule, "MAX_LOSS_FRACTION");
  });

  test("the exact boundary breaches — a threshold you can sit on is not a threshold", () => {
    const exact = evaluateHardExit(position({ markPrice: 1980 }), config());
    assert.equal(exact.breached, true);
    assert.equal(exact.breached && exact.measured, 0.1);
    assert.equal(exact.breached && exact.threshold, 0.1);
  });

  test("one tick inside the boundary does not breach", () => {
    const inside = evaluateHardExit(position({ markPrice: 1980.01 }), config());
    assert.equal(inside.breached, false);
    assert.ok(inside.measurements.lossFraction < 0.1);
  });

  test("a profitable position never breaches, however far it runs", () => {
    for (const markPrice of [2001, 2500, 20_000]) {
      assert.equal(evaluateHardExit(position({ markPrice }), config()).breached, false);
    }
  });

  test("the breach reports what was measured, for the audit record", () => {
    const assessment = evaluateHardExit(position({ markPrice: 1960 }), config());
    assert.ok(assessment.breached);
    if (!assessment.breached) return;
    assert.equal(assessment.measured, 0.2);
    assert.equal(assessment.threshold, 0.1);
    assert.equal(assessment.measurements.unrealizedPnl, -40);
    assert.equal(assessment.measurements.loss, 40);
    assert.equal(assessment.measurements.basis, "MARGIN");
  });

  test("the threshold is configuration, not code", () => {
    const price = position({ markPrice: 1990 }); // 5% of margin
    assert.equal(evaluateHardExit(price, config({ maxLossFraction: 0.1 })).breached, false);
    assert.equal(evaluateHardExit(price, config({ maxLossFraction: 0.05 })).breached, true);
    assert.equal(evaluateHardExit(price, config({ maxLossFraction: 0.01 })).breached, true);
  });

  test("basis changes which prices breach, at the same threshold", () => {
    const price = position({ markPrice: 1980 });
    assert.equal(evaluateHardExit(price, config({ basis: "MARGIN" })).breached, true);
    assert.equal(evaluateHardExit(price, config({ basis: "NOTIONAL" })).breached, false);
  });
});

describe("additional hard exit rules", () => {
  test("an absolute USD cap fires independently of the fraction", () => {
    // $15 loss: only 7.5% of margin, under the 10% fraction, but over a $10 cap.
    const snapshot = position({ markPrice: 1985 });
    const withCap = config({ maxLossUsd: 10 });

    assert.equal(evaluateHardExit(snapshot, config()).breached, false);
    const breach = evaluateHardExit(snapshot, withCap);
    assert.equal(breach.breached, true);
    assert.equal(breach.breached && breach.rule, "MAX_LOSS_USD");
    assert.equal(breach.breached && breach.measured, 15);
  });

  test("liquidation proximity fires even while the loss is small", () => {
    const snapshot = position({ markPrice: 1995, liquidationPrice: 1900 });
    // Liquidation is ~4.8% away, inside a 10% buffer.
    const breach = evaluateHardExit(
      snapshot,
      config({ minLiquidationDistanceFraction: 0.1 }),
    );
    assert.equal(breach.breached, true);
    assert.equal(breach.breached && breach.rule, "LIQUIDATION_PROXIMITY");
  });

  test("liquidation proximity is skipped when the exchange reports no price", () => {
    const snapshot = position({ markPrice: 1995, liquidationPrice: null });
    assert.equal(
      evaluateHardExit(snapshot, config({ minLiquidationDistanceFraction: 0.9 })).breached,
      false,
    );
  });

  test("the most serious applicable rule is the one reported", () => {
    // Both the fraction and the USD cap breach; the fraction is checked first.
    const breach = evaluateHardExit(position({ markPrice: 1900 }), config({ maxLossUsd: 10 }));
    assert.equal(breach.breached && breach.rule, "MAX_LOSS_FRACTION");
  });
});

describe("independence from everything except price and position", () => {
  test("the sentinel's inputs contain no signal, setup, target or strategy", () => {
    // A structural assertion: RiskSnapshot has exactly these keys. If a future
    // change adds a signal or a setup here, this test fails and should.
    const keys = Object.keys(position()).sort();
    assert.deepEqual(keys, [
      "accountValue",
      "entryPrice",
      "leverage",
      "liquidationPrice",
      "marginUsed",
      "markPrice",
      "observedAt",
      "side",
      "size",
      "symbol",
    ]);
  });

  test("evaluation is pure: the same inputs always give the same answer", () => {
    const snapshot = position({ markPrice: 1975 });
    const first = evaluateHardExit(snapshot, config());
    for (let i = 0; i < 100; i++) {
      assert.deepEqual(evaluateHardExit(snapshot, config()), first);
    }
  });

  test("the fast path agrees with a full evaluation", () => {
    const { markPrice: _ignored, observedAt: _also, ...base } = position();
    for (const price of [2100, 2000, 1990, 1980, 1979, 1500]) {
      assert.deepEqual(
        breachesAtPrice(base, price, AT, config()),
        evaluateHardExit(position({ markPrice: price }), config()),
      );
    }
  });
});

describe("rapid crossing", () => {
  test("a gap straight through the threshold still breaches", () => {
    // The price never prints at the threshold: it jumps from safe to far past.
    const before = evaluateHardExit(position({ markPrice: 2000 }), config());
    const after = evaluateHardExit(position({ markPrice: 1500 }), config());
    assert.equal(before.breached, false);
    assert.equal(after.breached, true);
    assert.equal(after.breached && after.measured, 2.5);
  });

  test("every tick in a fast sequence is evaluated independently", () => {
    const prices = [2000, 1998, 1995, 1990, 1985, 1980, 1975, 1970];
    const breaches = prices.map((markPrice) =>
      evaluateHardExit(position({ markPrice }), config()).breached,
    );
    assert.deepEqual(breaches, [false, false, false, false, false, true, true, true]);
  });
});

describe("stop price inversion", () => {
  test("the trigger price is exactly where the sentinel would fire", () => {
    const input = {
      side: "LONG" as const,
      entryPrice: 2000,
      size: 1,
      leverage: 10,
      accountValue: 10_000,
      marginUsed: 200,
    };
    const trigger = hardExitTriggerPrice(input, config());
    assert.equal(trigger, 1980);

    // The inversion and the sentinel must agree, or the resting stop protects a
    // different threshold than the local one.
    assert.equal(evaluateHardExit(position({ markPrice: trigger! }), config()).breached, true);
    assert.equal(
      evaluateHardExit(position({ markPrice: trigger! + 0.01 }), config()).breached,
      false,
    );
  });

  test("a short's stop sits above entry", () => {
    const trigger = hardExitTriggerPrice(
      { side: "SHORT", entryPrice: 2000, size: 1, leverage: 10, accountValue: 10_000, marginUsed: 200 },
      config(),
    );
    assert.equal(trigger, 2020);
    assert.equal(
      evaluateHardExit(position({ side: "SHORT", markPrice: trigger! }), config()).breached,
      true,
    );
  });

  test("agrees with the sentinel across every basis", () => {
    for (const basis of ["MARGIN", "NOTIONAL", "ACCOUNT_EQUITY"] as const) {
      const settings = config({ basis });
      const trigger = hardExitTriggerPrice(
        { side: "LONG", entryPrice: 2000, size: 1, leverage: 10, accountValue: 10_000, marginUsed: 200 },
        settings,
      );
      assert.ok(trigger !== null, basis);
      assert.equal(
        evaluateHardExit(position({ markPrice: trigger }), settings).breached,
        true,
        `${basis} at the trigger price`,
      );
      assert.equal(
        evaluateHardExit(position({ markPrice: trigger + 0.01 }), settings).breached,
        false,
        `${basis} just inside the trigger price`,
      );
    }
  });

  test("the tightest configured rule wins", () => {
    const input = {
      side: "LONG" as const,
      entryPrice: 2000,
      size: 1,
      leverage: 10,
      accountValue: 10_000,
      marginUsed: 200,
    };
    // The fraction implies a $20 move; a $5 cap is tighter and must win.
    assert.equal(hardExitTriggerPrice(input, config({ maxLossUsd: 5 })), 1995);
    // A $500 cap is looser, so the fraction still decides.
    assert.equal(hardExitTriggerPrice(input, config({ maxLossUsd: 500 })), 1980);
  });

  test("refuses a stop that would land at or below zero", () => {
    const input = {
      side: "LONG" as const,
      entryPrice: 100,
      size: 1,
      leverage: 1,
      accountValue: 10_000,
      marginUsed: 100,
    };
    // A 200% loss threshold would imply a negative price.
    assert.equal(hardExitTriggerPrice(input, config({ maxLossFraction: 2, basis: "NOTIONAL" })), null);
  });

  test("refuses a stop for a position with no size", () => {
    assert.equal(
      hardExitTriggerPrice(
        { side: "LONG", entryPrice: 2000, size: 0, leverage: 10, accountValue: 1, marginUsed: 0 },
        config(),
      ),
      null,
    );
  });

  test("the resting protective stop sits further out than the local sentinel", () => {
    const input = {
      side: "LONG" as const,
      entryPrice: 2000,
      size: 1,
      leverage: 10,
      accountValue: 10_000,
      marginUsed: 200,
    };
    const local = hardExitTriggerPrice(input, config())!;
    const resting = protectiveStopPrice(input, config())!;

    // For a long, "further out" means lower.
    assert.ok(resting < local, `${resting} should be below ${local}`);
    // 15% slack on a $20 move is $23.
    assert.equal(resting, 1977);
  });

  test("a short's resting stop sits above its local threshold", () => {
    const input = {
      side: "SHORT" as const,
      entryPrice: 2000,
      size: 1,
      leverage: 10,
      accountValue: 10_000,
      marginUsed: 200,
    };
    assert.ok(protectiveStopPrice(input, config())! > hardExitTriggerPrice(input, config())!);
  });

  test("zero slack places the resting stop exactly on the local threshold", () => {
    const input = {
      side: "LONG" as const,
      entryPrice: 2000,
      size: 1,
      leverage: 10,
      accountValue: 10_000,
      marginUsed: 200,
    };
    const settings = config({ protectiveStopSlackFraction: 0 });
    assert.equal(protectiveStopPrice(input, settings), hardExitTriggerPrice(input, settings));
  });
});
