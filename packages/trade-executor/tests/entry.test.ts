/** Entry guards, kill switch, order construction and risk configuration. */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { validateEntry, type EntryContext } from "../src/risk/entry-guards.js";
import {
  DEFAULT_RISK_CONFIG,
  validateRiskConfig,
  RiskConfigError,
  type EntryLimits,
  type RiskConfig,
} from "../src/risk/config.js";
import { KillSwitch, MemoryKillSwitchStore } from "../src/kill-switch.js";
import { entryOrder, closeOrder, protectiveStopOrder, remainingSize } from "../src/execution/order-plan.js";
import {
  entryClientOrderId,
  closeClientOrderId,
  protectiveClientOrderId,
  tradeIdForSignal,
} from "../src/identity.js";
import type { TradeSignal } from "../src/signal/model.js";

const NOW = 1_700_000_000_000;

const limits: EntryLimits = {
  symbolAllowlist: ["ETH", "BTC"],
  maxPositionNotionalUsd: 10_000,
  maxLeverage: 10,
  maxConcurrentPositions: 2,
  minNotionalUsd: 10,
  minFreeMarginFraction: 0.2,
  maxSignalAgeMs: 30_000,
  maxClockSkewMs: 5_000,
  maxEntrySlippageFraction: 0.005,
};

const signal = (overrides: Partial<Record<keyof TradeSignal, unknown>> = {}): TradeSignal => ({
  signalId: "sig-1",
  timestamp: NOW,
  symbol: "ETH",
  side: "LONG",
  entry: { kind: "MARKET" },
  sizing: { kind: "BASE_SIZE", size: "1" },
  setupId: "setup-1",
  leverage: 5,
  ...overrides,
}) as TradeSignal;

const context = (overrides: Partial<EntryContext> = {}): EntryContext => ({
  asset: { szDecimals: 4, maxLeverage: 25, isDelisted: false },
  referencePrice: 2000,
  accountValue: 10_000,
  freeMarginUsd: 8_000,
  openPositions: [],
  alreadyProcessed: false,
  killSwitchEngaged: false,
  degraded: false,
  entriesSuspended: false,
  ...overrides,
});

function expectDeny(ctx: Partial<EntryContext>, reason: string, sig = signal()): void {
  const decision = validateEntry(sig, limits, context(ctx));
  assert.equal(decision.ok, false, `expected ${reason}`);
  if (!decision.ok) assert.equal(decision.reason, reason, decision.detail);
}

describe("accepted entries", () => {
  test("a well-formed signal within limits is accepted and sized", () => {
    const decision = validateEntry(signal(), limits, context());
    assert.ok(decision.ok);
    if (!decision.ok) return;
    assert.equal(decision.size, "1");
    assert.equal(decision.notionalUsd, 2000);
    assert.equal(decision.leverage, 5);
    assert.equal(decision.referencePrice, 2000);
    // A long's worst acceptable fill is above the reference price.
    assert.equal(decision.slippageLimitPrice, 2010);
  });

  test("notional sizing is converted at the reference price and truncated to lot size", () => {
    const decision = validateEntry(
      signal({ sizing: { kind: "NOTIONAL_USD", notionalUsd: "1000" } }),
      limits,
      context(),
    );
    assert.ok(decision.ok);
    if (decision.ok) assert.equal(decision.size, "0.5");
  });

  test("a short's slippage bound sits below the reference price", () => {
    const decision = validateEntry(signal({ side: "SHORT" }), limits, context());
    assert.ok(decision.ok);
    if (decision.ok) assert.equal(decision.slippageLimitPrice, 1990);
  });

  test("an absent leverage defaults to 1", () => {
    const decision = validateEntry(signal({ leverage: undefined }), limits, context());
    assert.ok(decision.ok);
    if (decision.ok) assert.equal(decision.leverage, 1);
  });
});

describe("executor state is checked before anything else", () => {
  test("the kill switch refuses every entry", () => {
    expectDeny({ killSwitchEngaged: true }, "KILL_SWITCH_ENGAGED");
  });

  test("a kill switch outranks even an otherwise invalid signal", () => {
    // Reporting "unknown symbol" for a signal that would have been refused
    // anyway would be misleading about why nothing happened.
    const decision = validateEntry(
      signal({ symbol: "DOGE" }),
      limits,
      context({ killSwitchEngaged: true, asset: undefined }),
    );
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.reason, "KILL_SWITCH_ENGAGED");
  });

  test("a degraded executor refuses entries", () => {
    expectDeny({ degraded: true }, "EXECUTOR_DEGRADED");
  });

  test("suspended entries are refused", () => {
    expectDeny({ entriesSuspended: true }, "ENTRY_DISABLED");
  });

  test("an already-processed signal is a duplicate", () => {
    expectDeny({ alreadyProcessed: true }, "DUPLICATE_SIGNAL");
  });
});

describe("market guards", () => {
  test("a symbol outside the allowlist is refused even if the exchange lists it", () => {
    expectDeny({}, "SYMBOL_NOT_ALLOWED", signal({ symbol: "SOL" }));
  });

  test("a symbol the exchange does not list is refused", () => {
    const withSol: EntryLimits = { ...limits, symbolAllowlist: ["ETH", "SOL"] };
    const decision = validateEntry(signal({ symbol: "SOL" }), withSol, context({ asset: undefined }));
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.reason, "UNKNOWN_SYMBOL");
  });

  test("a delisted symbol is refused", () => {
    expectDeny({ asset: { szDecimals: 4, maxLeverage: 25, isDelisted: true } }, "SYMBOL_DELISTED");
  });

  test("an unusable reference price is refused rather than guessed", () => {
    expectDeny({ referencePrice: 0 }, "RISK_LIMIT_EXCEEDED");
    expectDeny({ referencePrice: Number.NaN }, "RISK_LIMIT_EXCEEDED");
  });
});

describe("position guards", () => {
  test("an existing position in the same symbol conflicts", () => {
    expectDeny(
      { openPositions: [{ symbol: "ETH", side: "LONG", state: "MONITORING" }] },
      "CONFLICTING_POSITION",
    );
  });

  test("an opposing position in the same symbol also conflicts", () => {
    // The exchange nets to one position per asset, so this is not a hedge.
    expectDeny(
      { openPositions: [{ symbol: "ETH", side: "SHORT", state: "MONITORING" }] },
      "CONFLICTING_POSITION",
    );
  });

  test("a position still closing conflicts", () => {
    expectDeny(
      { openPositions: [{ symbol: "ETH", side: "LONG", state: "CLOSING" }] },
      "CONFLICTING_POSITION",
    );
  });

  test("the concurrent position limit is enforced", () => {
    expectDeny(
      {
        openPositions: [
          { symbol: "BTC", side: "LONG", state: "MONITORING" },
          { symbol: "SOL", side: "LONG", state: "MONITORING" },
        ],
      },
      "MAX_CONCURRENT_POSITIONS",
    );
  });
});

describe("leverage guards", () => {
  test("the executor's own maximum binds, whatever the signal asks", () => {
    expectDeny({}, "LEVERAGE_ABOVE_MAX", signal({ leverage: 20 }));
  });

  test("the exchange's maximum binds too", () => {
    expectDeny(
      { asset: { szDecimals: 4, maxLeverage: 3, isDelisted: false } },
      "LEVERAGE_ABOVE_MAX",
      signal({ leverage: 5 }),
    );
  });

  test("leverage exactly at the limit is allowed", () => {
    assert.equal(validateEntry(signal({ leverage: 10 }), limits, context()).ok, true);
  });
});

describe("size and margin guards", () => {
  test("a notional above the maximum is refused", () => {
    expectDeny({}, "SIZE_ABOVE_MAX", signal({ sizing: { kind: "BASE_SIZE", size: "6" } }));
  });

  test("a notional below the exchange minimum is refused", () => {
    expectDeny({}, "NOTIONAL_BELOW_MINIMUM", signal({ sizing: { kind: "BASE_SIZE", size: "0.001" } }));
  });

  test("a size that truncates to zero at the asset's lot size is refused", () => {
    expectDeny(
      { asset: { szDecimals: 0, maxLeverage: 25, isDelisted: false } },
      "SIZE_NOT_REPRESENTABLE",
      signal({ sizing: { kind: "BASE_SIZE", size: "0.5" } }),
    );
  });

  test("insufficient free margin is refused", () => {
    expectDeny({ freeMarginUsd: 100 }, "INSUFFICIENT_MARGIN");
  });

  test("an entry that would breach the free-margin floor is refused", () => {
    // $2000 notional at 5x needs $400 margin. With $2400 free of $10,000 equity
    // that leaves 20% — exactly the floor, so anything less must fail.
    assert.equal(validateEntry(signal(), limits, context({ freeMarginUsd: 2_400 })).ok, true);
    expectDeny({ freeMarginUsd: 2_399 }, "INSUFFICIENT_MARGIN");
  });
});

describe("slippage guard", () => {
  test("a limit price inside the slippage bound is accepted", () => {
    const decision = validateEntry(
      signal({ entry: { kind: "LIMIT", price: "2005" } }),
      limits,
      context(),
    );
    assert.equal(decision.ok, true);
  });

  test("a long's limit above the bound is refused", () => {
    expectDeny({}, "RISK_LIMIT_EXCEEDED", signal({ entry: { kind: "LIMIT", price: "2050" } }));
  });

  test("a short's limit below the bound is refused", () => {
    expectDeny(
      {},
      "RISK_LIMIT_EXCEEDED",
      signal({ side: "SHORT", entry: { kind: "LIMIT", price: "1950" } }),
    );
  });
});

describe("risk configuration validation", () => {
  const base: RiskConfig = {
    ...DEFAULT_RISK_CONFIG,
    entry: { ...DEFAULT_RISK_CONFIG.entry, symbolAllowlist: ["ETH"] },
  };

  test("a complete configuration validates", () => {
    assert.doesNotThrow(() => validateRiskConfig(base));
  });

  test("an empty allowlist is refused — it would silently refuse every signal", () => {
    assert.throws(
      () => validateRiskConfig({ ...base, entry: { ...base.entry, symbolAllowlist: [] } }),
      RiskConfigError,
    );
  });

  test("a threshold outside (0, 1] is refused", () => {
    for (const maxLossFraction of [0, -0.1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(
        () => validateRiskConfig({ ...base, hardExit: { ...base.hardExit, maxLossFraction } }),
        RiskConfigError,
        String(maxLossFraction),
      );
    }
  });

  test("a threshold of exactly 1 is allowed — losing all the margin is a real choice", () => {
    assert.doesNotThrow(() =>
      validateRiskConfig({ ...base, hardExit: { ...base.hardExit, maxLossFraction: 1 } }),
    );
  });

  test("reports every problem at once, not just the first", () => {
    try {
      validateRiskConfig({
        ...base,
        hardExit: { ...base.hardExit, maxLossFraction: 0 },
        entry: { ...base.entry, symbolAllowlist: [], maxLeverage: 0 },
      });
      assert.fail("should have thrown");
    } catch (error) {
      assert.ok(error instanceof RiskConfigError);
      assert.ok(error.problems.length >= 3, `only found: ${error.problems.join(", ")}`);
    }
  });

  test("nonsensical execution limits are refused", () => {
    assert.throws(
      () => validateRiskConfig({ ...base, execution: { ...base.execution, maxCloseAttempts: 0 } }),
      RiskConfigError,
    );
    assert.throws(
      () => validateRiskConfig({ ...base, execution: { ...base.execution, exitTimeoutMs: -1 } }),
      RiskConfigError,
    );
  });
});

describe("kill switch", () => {
  test("starts engaged until its stored state has actually been read", () => {
    const killSwitch = new KillSwitch(new MemoryKillSwitchStore(), () => NOW);
    assert.equal(killSwitch.engaged, true, "unknown is not the same as clear");
  });

  test("loading no stored record clears it", async () => {
    const killSwitch = new KillSwitch(new MemoryKillSwitchStore(), () => NOW);
    await killSwitch.load();
    assert.equal(killSwitch.engaged, false);
  });

  test("fails closed when its state cannot be read", async () => {
    const store = new MemoryKillSwitchStore();
    store.failOnLoad = true;
    const killSwitch = new KillSwitch(store, () => NOW);

    await killSwitch.load();
    assert.equal(killSwitch.engaged, true);
    assert.match(killSwitch.state.reason, /unreadable/);
  });

  test("survives a restart while engaged", async () => {
    const store = new MemoryKillSwitchStore();
    const first = new KillSwitch(store, () => NOW);
    await first.load();
    await first.engage("manual halt");

    const second = new KillSwitch(store, () => NOW);
    await second.load();
    assert.equal(second.engaged, true);
    assert.equal(second.state.reason, "manual halt");
  });

  test("stays engaged when persisting the engagement fails", async () => {
    const store = new MemoryKillSwitchStore();
    store.save = async () => {
      throw new Error("disk full");
    };
    const killSwitch = new KillSwitch(store, () => NOW);
    await killSwitch.load();

    await killSwitch.engage("halt");
    assert.equal(killSwitch.engaged, true, "a failed write must not leave it clear");
  });

  test("refuses to release when the release cannot be persisted", async () => {
    const store = new MemoryKillSwitchStore();
    const killSwitch = new KillSwitch(store, () => NOW);
    await killSwitch.load();
    await killSwitch.engage("halt");

    store.save = async () => {
      throw new Error("disk full");
    };
    await assert.rejects(() => killSwitch.release("resume"));
    assert.equal(killSwitch.engaged, true, "a restart must not come back up trading");
  });

  test("notifies subscribers and survives a throwing one", async () => {
    const killSwitch = new KillSwitch(new MemoryKillSwitchStore(), () => NOW);
    const seen: boolean[] = [];
    killSwitch.subscribe(() => {
      throw new Error("listener blew up");
    });
    killSwitch.subscribe((record) => seen.push(record.engaged));

    await killSwitch.load();
    await killSwitch.engage("halt");
    await killSwitch.release("resume");
    assert.deepEqual(seen, [false, true, false]);
  });
});

describe("order construction", () => {
  const precision = { szDecimals: 4 };

  test("an entry crosses the book with an IOC limit at the slippage bound", () => {
    const order = entryOrder({
      symbol: "ETH", side: "LONG", size: "1.23456789", limitPrice: 2010.123456,
      clientOrderId: "0x01", precision,
    });
    assert.equal(order.reduceOnly, false);
    assert.equal(order.kind, "market");
    assert.equal(order.size, "1.2345", "truncated to lot size");
    assert.equal(order.price, "2010.1", "5 significant figures, 2 decimal places");
  });

  test("a limit entry is post-only, so it cannot cross unexpectedly", () => {
    const order = entryOrder({
      symbol: "ETH", side: "LONG", size: "1", limitPrice: 1999,
      clientOrderId: "0x01", precision, postOnly: true,
    });
    assert.equal(order.kind, "limit");
  });

  test("a close is reduce-only and priced through the mark to actually cross", () => {
    const long = closeOrder({
      symbol: "ETH", side: "LONG", size: "1", markPrice: 2000,
      aggressionFraction: 0.02, precision,
    });
    assert.equal(long.reduceOnly, true);
    assert.equal(long.side, "SHORT", "closing a long means selling");
    assert.equal(long.price, "1960", "bid below the mark to guarantee a cross");

    const short = closeOrder({
      symbol: "ETH", side: "SHORT", size: "1", markPrice: 2000,
      aggressionFraction: 0.02, precision,
    });
    assert.equal(short.side, "LONG", "closing a short means buying");
    assert.equal(short.price, "2040", "offer above the mark");
  });

  test("a close is always reduce-only, so it can never flip the position", () => {
    for (const side of ["LONG", "SHORT"] as const) {
      const order = closeOrder({
        symbol: "ETH", side, size: "1", markPrice: 2000, aggressionFraction: 0.02, precision,
      });
      assert.equal(order.reduceOnly, true, side);
    }
  });

  test("a protective stop is a reduce-only stop-market at the trigger price", () => {
    const order = protectiveStopOrder({
      symbol: "ETH", side: "LONG", size: "1", triggerPrice: 1977, precision,
    });
    assert.equal(order.kind, "stop_market");
    assert.equal(order.reduceOnly, true);
    assert.equal(order.side, "SHORT");
    assert.equal(order.triggerPrice, "1977");
  });

  test("an unrepresentable size is refused rather than silently rounded to zero", () => {
    assert.throws(() =>
      closeOrder({
        symbol: "ETH", side: "LONG", size: "0.00001", markPrice: 2000,
        aggressionFraction: 0.02, precision: { szDecimals: 2 },
      }),
    );
  });

  test("remaining size reports what is left, and null when nothing is", () => {
    assert.equal(remainingSize("1", "0.4", 4), "0.6");
    assert.equal(remainingSize("1", "1", 4), null);
    assert.equal(remainingSize("1", "1.5", 4), null, "over-filled is still done");
    assert.equal(remainingSize("1", "0.99999", 2), null, "dust below one lot");
  });
});

describe("deterministic identifiers", () => {
  test("a signal always maps to the same entry order id and trade id", () => {
    assert.equal(entryClientOrderId("sig-1"), entryClientOrderId("sig-1"));
    assert.equal(tradeIdForSignal("sig-1"), tradeIdForSignal("sig-1"));
  });

  test("different signals map to different ids", () => {
    assert.notEqual(entryClientOrderId("sig-1"), entryClientOrderId("sig-2"));
    assert.notEqual(tradeIdForSignal("sig-1"), tradeIdForSignal("sig-2"));
  });

  test("client order ids are exactly 16 bytes of hex, as the wire requires", () => {
    for (const id of [
      entryClientOrderId("sig-1"),
      closeClientOrderId("trade_1", 1),
      protectiveClientOrderId("trade_1"),
    ]) {
      assert.match(id, /^0x[0-9a-f]{32}$/);
    }
  });

  test("each close attempt gets its own id, so a retry is not a duplicate", () => {
    const ids = [1, 2, 3, 4, 5].map((attempt) => closeClientOrderId("trade_1", attempt));
    assert.equal(new Set(ids).size, 5);
  });

  test("the namespaces do not collide", () => {
    assert.notEqual(entryClientOrderId("x"), protectiveClientOrderId("x"));
    assert.notEqual(entryClientOrderId("x"), closeClientOrderId("x", 1));
  });
});
