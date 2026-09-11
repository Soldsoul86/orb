/** Signal validation: the untrusted boundary. */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { validateSignal, type SignalValidationContext } from "../src/signal/validate.js";
import { opposite, sideSign, isBuy } from "../src/signal/model.js";

const NOW = 1_700_000_000_000;
const context: SignalValidationContext = { now: NOW, maxAgeMs: 30_000, maxClockSkewMs: 5_000 };

const valid = (overrides: Record<string, unknown> = {}) => ({
  signalId: "sig-0001",
  timestamp: NOW - 1_000,
  symbol: "ETH",
  side: "LONG",
  entry: { kind: "MARKET" },
  sizing: { kind: "BASE_SIZE", size: "1.5" },
  setupId: "breakout-v2",
  ...overrides,
});

function expectRejection(input: unknown, reason: string, note = ""): void {
  const result = validateSignal(input, context);
  assert.equal(result.ok, false, `expected rejection ${reason} ${note}`);
  if (result.ok) return;
  assert.equal(result.reason, reason, `${note}: ${result.detail}`);
}

describe("side helpers", () => {
  test("express the sign convention used by all PnL maths", () => {
    assert.equal(opposite("LONG"), "SHORT");
    assert.equal(opposite("SHORT"), "LONG");
    assert.equal(sideSign("LONG"), 1);
    assert.equal(sideSign("SHORT"), -1);
    assert.equal(isBuy("LONG"), true);
    assert.equal(isBuy("SHORT"), false);
  });
});

describe("a valid signal", () => {
  test("is accepted and normalised", () => {
    const result = validateSignal(valid(), context);
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.signal.signalId, "sig-0001");
    assert.equal(result.signal.symbol, "ETH");
    assert.equal(result.signal.side, "LONG");
    assert.deepEqual(result.signal.entry, { kind: "MARKET" });
    assert.deepEqual(result.signal.sizing, { kind: "BASE_SIZE", size: "1.5" });
    assert.equal(result.signal.setupId, "breakout-v2");
  });

  test("accepts the common side spellings, exactly", () => {
    for (const [input, expected] of [
      ["LONG", "LONG"], ["long", "LONG"], ["BUY", "LONG"], ["buy", "LONG"],
      ["SHORT", "SHORT"], ["short", "SHORT"], ["SELL", "SHORT"], ["sell", "SHORT"],
    ] as const) {
      const result = validateSignal(valid({ side: input }), context);
      assert.ok(result.ok, input);
      if (result.ok) assert.equal(result.signal.side, expected);
    }
  });

  test("rejects a side that merely resembles a valid one", () => {
    for (const side of ["Long", "LONGG", " long", "l", "1", true, null]) {
      expectRejection(valid({ side }), "INVALID_SIDE", String(side));
    }
  });

  test("accepts snake_case field names from a provider", () => {
    const result = validateSignal(
      { signal_id: "sig-2", timestamp: NOW, symbol: "BTC", side: "SHORT",
        sizing: { kind: "BASE_SIZE", size: "0.01" }, setup_id: "mean-reversion" },
      context,
    );
    assert.ok(result.ok);
    if (result.ok) assert.equal(result.signal.setupId, "mean-reversion");
  });

  test("defaults a missing entry intent to MARKET", () => {
    const result = validateSignal(valid({ entry: undefined }), context);
    assert.ok(result.ok);
    if (result.ok) assert.deepEqual(result.signal.entry, { kind: "MARKET" });
  });

  test("accepts a limit entry with a price", () => {
    const result = validateSignal(valid({ entry: { kind: "LIMIT", price: "1999.5" } }), context);
    assert.ok(result.ok);
    if (result.ok) assert.deepEqual(result.signal.entry, { kind: "LIMIT", price: "1999.5" });
  });

  test("accepts notional sizing", () => {
    const result = validateSignal(
      valid({ sizing: { kind: "NOTIONAL_USD", notionalUsd: "500" } }),
      context,
    );
    assert.ok(result.ok);
    if (result.ok) assert.deepEqual(result.signal.sizing, { kind: "NOTIONAL_USD", notionalUsd: "500" });
  });
});

describe("malformed signals", () => {
  test("rejects non-objects", () => {
    for (const input of [null, undefined, 42, "signal", [], true]) {
      expectRejection(input, "MALFORMED_SIGNAL", String(input));
    }
  });

  test("rejects a missing or malformed signal id", () => {
    expectRejection(valid({ signalId: undefined }), "INVALID_SIGNAL_ID");
    expectRejection(valid({ signalId: "" }), "INVALID_SIGNAL_ID");
    expectRejection(valid({ signalId: "a".repeat(129) }), "INVALID_SIGNAL_ID");
    expectRejection(valid({ signalId: "has spaces" }), "INVALID_SIGNAL_ID");
    expectRejection(valid({ signalId: "../../etc/passwd" }), "INVALID_SIGNAL_ID");
    expectRejection(valid({ signalId: 12345 }), "INVALID_SIGNAL_ID");
  });

  test("rejects a missing or malformed symbol", () => {
    expectRejection(valid({ symbol: undefined }), "UNKNOWN_SYMBOL");
    expectRejection(valid({ symbol: "eth" }), "UNKNOWN_SYMBOL", "lowercase");
    expectRejection(valid({ symbol: "ETH;DROP" }), "UNKNOWN_SYMBOL");
    expectRejection(valid({ symbol: "X".repeat(33) }), "UNKNOWN_SYMBOL");
  });

  test("rejects a missing setup id", () => {
    expectRejection(valid({ setupId: undefined }), "MISSING_FIELD");
  });

  test("rejects a missing or non-numeric timestamp", () => {
    expectRejection(valid({ timestamp: undefined }), "MISSING_FIELD");
    expectRejection(valid({ timestamp: "1700000000000" }), "MISSING_FIELD");
    expectRejection(valid({ timestamp: Number.NaN }), "MISSING_FIELD");
  });

  test("rejects invalid sizes", () => {
    expectRejection(valid({ sizing: undefined }), "INVALID_SIZE");
    expectRejection(valid({ sizing: { kind: "BASE_SIZE", size: "0" } }), "INVALID_SIZE", "zero");
    expectRejection(valid({ sizing: { kind: "BASE_SIZE", size: "-1" } }), "INVALID_SIZE", "negative");
    expectRejection(valid({ sizing: { kind: "BASE_SIZE", size: "1e5" } }), "INVALID_SIZE", "exponent");
    expectRejection(valid({ sizing: { kind: "BASE_SIZE", size: "abc" } }), "INVALID_SIZE");
    expectRejection(valid({ sizing: { kind: "BASE_SIZE", size: 1.5 } }), "INVALID_SIZE", "number not string");
    expectRejection(valid({ sizing: { kind: "PERCENT_OF_ACCOUNT", pct: "5" } }), "INVALID_SIZE");
  });

  test("rejects invalid entry prices", () => {
    expectRejection(valid({ entry: { kind: "LIMIT" } }), "INVALID_PRICE");
    expectRejection(valid({ entry: { kind: "LIMIT", price: "0" } }), "INVALID_PRICE");
    expectRejection(valid({ entry: { kind: "LIMIT", price: "-5" } }), "INVALID_PRICE");
    expectRejection(valid({ entry: { kind: "STOP", price: "5" } }), "INVALID_ENTRY_INTENT");
  });

  test("rejects invalid leverage", () => {
    expectRejection(valid({ leverage: 0 }), "INVALID_LEVERAGE");
    expectRejection(valid({ leverage: -3 }), "INVALID_LEVERAGE");
    expectRejection(valid({ leverage: 2.5 }), "INVALID_LEVERAGE");
    expectRejection(valid({ leverage: 10_000 }), "INVALID_LEVERAGE");
    expectRejection(valid({ leverage: "10" }), "INVALID_LEVERAGE");
  });

  test("a rejection carries the signal id whenever the signal was identifiable", () => {
    const result = validateSignal(valid({ side: "sideways" }), context);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.signalId, "sig-0001");
  });
});

describe("freshness", () => {
  test("accepts a signal inside the age window", () => {
    assert.equal(validateSignal(valid({ timestamp: NOW - 29_000 }), context).ok, true);
  });

  test("rejects a stale signal", () => {
    expectRejection(valid({ timestamp: NOW - 31_000 }), "SIGNAL_STALE");
    expectRejection(valid({ timestamp: NOW - 3_600_000 }), "SIGNAL_STALE", "an hour old");
  });

  test("tolerates a provider clock that runs slightly fast", () => {
    assert.equal(validateSignal(valid({ timestamp: NOW + 4_000 }), context).ok, true);
  });

  test("rejects a signal from too far in the future", () => {
    expectRejection(valid({ timestamp: NOW + 6_000 }), "SIGNAL_FROM_FUTURE");
    expectRejection(valid({ timestamp: NOW + 86_400_000 }), "SIGNAL_FROM_FUTURE", "a day ahead");
  });
});

describe("metadata is recorded, never obeyed", () => {
  test("accepts flat scalar metadata", () => {
    const result = validateSignal(
      valid({ strategy: { model: "v3", confidence: 0.82, backtested: true } }),
      context,
    );
    assert.ok(result.ok);
    if (result.ok) {
      assert.deepEqual(result.signal.strategy, { model: "v3", confidence: 0.82, backtested: true });
    }
  });

  test("rejects nested or oversized metadata that could hide instructions", () => {
    expectRejection(valid({ strategy: { nested: { a: 1 } } }), "INVALID_METADATA");
    expectRejection(valid({ strategy: { list: [1, 2, 3] } }), "INVALID_METADATA");
    expectRejection(valid({ strategy: { big: "x".repeat(513) } }), "INVALID_METADATA");
    expectRejection(valid({ strategy: "not an object" }), "INVALID_METADATA");
    expectRejection(
      valid({ strategy: Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`k${i}`, i])) }),
      "INVALID_METADATA",
    );
  });

  test("a provider's stop and target are captured as advisory only", () => {
    const result = validateSignal(valid({ stop: "1950", target: "2100" }), context);
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.signal.advisoryStop, "1950");
    assert.equal(result.signal.advisoryTarget, "2100");
  });

  test("unknown top-level fields are ignored, not rejected and not read", () => {
    const result = validateSignal(
      valid({
        // Nothing a provider invents can reach execution.
        maxLossPct: 0.99,
        hardExitThreshold: 0,
        disableStop: true,
        exit: "HOLD",
        reduceOnly: false,
        someFutureField: "whatever",
      }),
      context,
    );
    assert.ok(result.ok);
    if (!result.ok) return;

    // The produced signal contains only contract fields.
    assert.deepEqual(Object.keys(result.signal).sort(), [
      "entry", "setupId", "side", "signalId", "sizing", "symbol", "timestamp",
    ]);
  });

  test("a provider cannot smuggle a risk override through the signal shape", () => {
    const result = validateSignal(valid({ maxLossFraction: 1, killSwitch: false }), context);
    assert.ok(result.ok);
    if (!result.ok) return;
    const fields = result.signal as unknown as Record<string, unknown>;
    assert.equal(fields["maxLossFraction"], undefined);
    assert.equal(fields["killSwitch"], undefined);
  });
});

describe("determinism", () => {
  test("the same input always yields the same result", () => {
    const input = valid();
    const first = validateSignal(input, context);
    for (let i = 0; i < 50; i++) assert.deepEqual(validateSignal(input, context), first);
  });

  test("validation reads no clock of its own", () => {
    // Only the injected `now` moves the outcome.
    const input = valid({ timestamp: NOW - 20_000 });
    assert.equal(validateSignal(input, context).ok, true);
    assert.equal(validateSignal(input, { ...context, now: NOW + 20_000 }).ok, false);
  });
});
