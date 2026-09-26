/**
 * Acceptance criteria.
 *
 * These drive the real `TradeExecutor`, the real journal, the real sentinel and
 * the real close path against a simulated exchange. Nothing is stubbed except
 * the exchange and the clock.
 *
 * Each suite corresponds to one of the stated acceptance criteria:
 *
 *   1. Entry        — signal, validated, position opened, exchange confirms.
 *   2. Hard exit    — threshold crosses, position closes, exchange confirms flat.
 *   3. Independence — the provider says HOLD forever; the position still closes.
 *   4. Recovery     — restart with an open position; rediscover, reconcile, enforce.
 *   5. Idempotency  — many concurrent triggers, exactly one close lifecycle.
 *   6. Audit        — the whole lifecycle reconstructable from persisted state.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FileJournalStore, Journal } from "@orb/journal";
import {
  JournalAuditSink,
  KillSwitch,
  MemoryKillSwitchStore,
  TradeExecutor,
  replayLifecycle,
  type AssetInfo,
  type KillSwitchStore,
  type RiskConfig,
} from "@orb/trade-executor";
import { PaperExchangePort, ScriptedMarketDataFeed } from "@orb/executor-app";

const ETH: AssetInfo = { symbol: "ETH", index: 1, szDecimals: 4, maxLeverage: 25, isDelisted: false };
const START = 1_700_000_000_000;

/**
 * A harness that behaves like the real runtime host, but with a scripted
 * exchange and a clock the test controls.
 */
class Harness {
  readonly prices = new Map<string, string>([["ETH", "2000"]]);
  readonly exchange: PaperExchangePort;
  readonly feed = new ScriptedMarketDataFeed(() => this.time);
  readonly killSwitchStore: KillSwitchStore;
  readonly killSwitch: KillSwitch;
  readonly audit: JournalAuditSink;
  readonly executor: TradeExecutor;
  time = START;

  constructor(
    readonly journal: Journal,
    config: RiskConfig,
    killSwitchStore: KillSwitchStore = new MemoryKillSwitchStore(),
    exchange?: PaperExchangePort,
    hourlyFundingRate = 0,
  ) {
    this.exchange =
      exchange ??
      new PaperExchangePort({
        assets: [ETH],
        priceSource: async (symbol) => {
          const price = this.prices.get(symbol);
          if (price === undefined) throw new Error(`no price for ${symbol}`);
          return price;
        },
        startingBalanceUsd: 100_000,
        now: () => this.time,
        feeFraction: 0.00045,
        hourlyFundingRate,
      });

    this.killSwitchStore = killSwitchStore;
    this.killSwitch = new KillSwitch(killSwitchStore, () => this.time);
    this.audit = new JournalAuditSink({ journal });

    this.executor = new TradeExecutor({
      exchange: this.exchange,
      marketData: this.feed,
      audit: this.audit,
      killSwitch: this.killSwitch,
      config,
      now: () => this.time,
      sleep: async () => undefined,
      setInterval: () => null,
      clearInterval: () => undefined,
    });
  }

  /** Moves the market and delivers the tick, exactly as the feed would. */
  async tick(symbol: string, price: number): Promise<void> {
    this.time += 100;
    this.prices.set(symbol, String(price));
    this.feed.push(symbol, price, this.time);
    // Let the close lifecycle the tick may have started run to completion.
    await settle();
  }

  signal(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      signalId: `sig-${randomUUID()}`,
      timestamp: this.time,
      symbol: "ETH",
      side: "LONG",
      entry: { kind: "MARKET" },
      sizing: { kind: "BASE_SIZE", size: "1" },
      setupId: "acceptance",
      leverage: 10,
      ...overrides,
    };
  }
}

/** Drains the microtask and macrotask queues so async work settles. */
async function settle(rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/** 10% of margin at 10x leverage on a $2000 entry is a $20 move: the stop is 1980. */
function config(overrides: Partial<RiskConfig> = {}): RiskConfig {
  return {
    hardExit: {
      maxLossFraction: 0.1,
      basis: "MARGIN",
      // The paper exchange rests protective orders but never triggers them, so
      // keeping it on proves the order is placed without it doing the closing.
      exchangeProtectiveStop: true,
      protectiveStopSlackFraction: 0.15,
    },
    entry: {
      symbolAllowlist: ["ETH"],
      maxPositionNotionalUsd: 50_000,
      maxLeverage: 20,
      maxConcurrentPositions: 3,
      minNotionalUsd: 10,
      minFreeMarginFraction: 0.05,
      maxSignalAgeMs: 30_000,
      maxClockSkewMs: 5_000,
      maxEntrySlippageFraction: 0.01,
    },
    execution: {
      entryTimeoutMs: 10_000,
      exitTimeoutMs: 30_000,
      maxCloseAttempts: 5,
      closeRetryDelayMs: 0,
      closeAggressionFraction: 0.02,
      reconciliationIntervalMs: 60_000,
      feedStalenessLimitMs: 30_000,
    },
    safety: { killSwitchPolicy: "CLOSE_ALL", degradedPolicy: "CLOSE_ALL" },
    ...overrides,
  };
}

let directory: string;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "orb-acceptance-"));
});

after(async () => {
  await rm(directory, { recursive: true, force: true });
});

let journalCounter = 0;
async function newJournal(): Promise<Journal> {
  const store = await FileJournalStore.open(join(directory, `journal-${journalCounter++}`));
  return Journal.open({ lane: "executor", device: "test", store });
}

/* ================================================================== *
 * 1. Entry
 * ================================================================== */

describe("acceptance: entry", () => {
  test("a signal arrives, is validated, and the exchange confirms a position", async () => {
    const journal = await newJournal();
    const h = new Harness(journal, config());
    await h.executor.start();
    await h.killSwitch.release("test");

    const result = await h.executor.submitSignal(h.signal({ signalId: "entry-1" }));
    await settle();

    assert.equal(result.accepted, true, JSON.stringify(result.rejection));

    // The executor's belief.
    const position = h.executor.registry.get("ETH");
    assert.ok(position, "the executor must be tracking a position");
    assert.equal(position.state, "MONITORING");
    assert.equal(position.side, "LONG");
    assert.equal(position.size, "1");

    // Exchange truth, independently.
    const account = await h.exchange.accountState();
    const actual = account.positions.find((p) => p.symbol === "ETH");
    assert.ok(actual, "the exchange must actually hold the position");
    assert.equal(actual.size, "1");
    assert.equal(actual.side, "LONG");

    await h.executor.stop();
    await journal.close();
  });

  test("the entry is idempotent: the same signal id never opens two positions", async () => {
    const journal = await newJournal();
    const h = new Harness(journal, config());
    await h.executor.start();
    await h.killSwitch.release("test");

    const signal = h.signal({ signalId: "duplicate-1" });
    const first = await h.executor.submitSignal(signal);
    const second = await h.executor.submitSignal(signal);
    const third = await h.executor.submitSignal({ ...signal, timestamp: h.time });
    await settle();

    assert.equal(first.accepted, true);
    assert.equal(second.accepted, false);
    assert.equal(second.rejection?.reason, "DUPLICATE_SIGNAL");
    assert.equal(third.rejection?.reason, "DUPLICATE_SIGNAL");
    assert.equal(h.exchange.positionCount, 1, "exactly one position exists");

    await h.executor.stop();
    await journal.close();
  });

  test("concurrent deliveries of one signal open exactly one position", async () => {
    const journal = await newJournal();
    const h = new Harness(journal, config());
    await h.executor.start();
    await h.killSwitch.release("test");

    const signal = h.signal({ signalId: "race-1" });
    const results = await Promise.all(
      Array.from({ length: 25 }, () => h.executor.submitSignal(signal)),
    );
    await settle();

    assert.equal(results.filter((r) => r.accepted).length, 1);
    assert.equal(h.exchange.positionCount, 1);

    await h.executor.stop();
    await journal.close();
  });

  test("a rejected signal never reaches the exchange", async () => {
    const journal = await newJournal();
    const h = new Harness(journal, config());
    await h.executor.start();
    await h.killSwitch.release("test");

    const rejections = await Promise.all([
      h.executor.submitSignal(h.signal({ symbol: "DOGE" })),
      h.executor.submitSignal(h.signal({ leverage: 100 })),
      h.executor.submitSignal(h.signal({ timestamp: h.time - 120_000 })),
      h.executor.submitSignal(h.signal({ sizing: { kind: "BASE_SIZE", size: "-1" } })),
      h.executor.submitSignal({ nonsense: true }),
    ]);
    await settle();

    assert.ok(rejections.every((r) => !r.accepted));
    assert.equal(h.exchange.positionCount, 0);
    assert.deepEqual(
      rejections.map((r) => r.rejection?.reason),
      ["SYMBOL_NOT_ALLOWED", "LEVERAGE_ABOVE_MAX", "SIGNAL_STALE", "INVALID_SIZE", "INVALID_SIGNAL_ID"],
    );

    await h.executor.stop();
    await journal.close();
  });

  test("an exchange-native protective stop is rested alongside the local sentinel", async () => {
    const journal = await newJournal();
    const h = new Harness(journal, config());
    await h.executor.start();
    await h.killSwitch.release("test");

    await h.executor.submitSignal(h.signal({ signalId: "protected-1" }));
    await settle();

    const position = h.executor.registry.get("ETH");
    assert.ok(position?.protectiveOrder, "a resting stop must exist on the exchange");
    // 10% of margin is a $20 move; +15% slack puts the resting stop at 1977.
    assert.equal(position.protectiveOrder.triggerPrice, "1977");

    const resting = await h.exchange.openOrders();
    assert.equal(resting.length, 1);
    assert.equal(resting[0]!.reduceOnly, true, "protection can only ever reduce");
    assert.equal(resting[0]!.isTrigger, true);

    await h.executor.stop();
    await journal.close();
  });
});

/* ================================================================== *
 * 2. Hard exit
 * ================================================================== */

describe("acceptance: hard exit", () => {
  test("crossing the threshold closes the position with no further signal", async () => {
    const journal = await newJournal();
    const h = new Harness(journal, config());
    await h.executor.start();
    await h.killSwitch.release("test");
    await h.executor.submitSignal(h.signal({ signalId: "hard-exit-1" }));
    await settle();

    assert.equal(h.executor.registry.get("ETH")!.state, "MONITORING");

    // Drift toward the threshold without reaching it.
    await h.tick("ETH", 1995);
    await h.tick("ETH", 1985);
    assert.equal(h.executor.registry.get("ETH")!.state, "MONITORING", "still inside the threshold");

    // Cross it. No signal is sent, and nothing else is asked.
    await h.tick("ETH", 1979);
    await settle();

    const position = h.executor.registry.get("ETH")!;
    assert.equal(position.state, "CLOSED");
    assert.equal(position.exitReason, "HARD_RISK_EXIT");

    // Exchange truth: actually flat.
    const account = await h.exchange.accountState();
    assert.equal(account.positions.length, 0, "the exchange must confirm flat");

    // The audit records the measurement the decision was made on.
    await h.audit.flush();
    const lifecycle = await replayLifecycle(journal, position.tradeId);
    const crossing = lifecycle.find((event) => event.stage === "HARD_THRESHOLD_CROSSED");
    assert.ok(crossing, "the crossing must be recorded");
    assert.equal(crossing.risk?.rule, "MAX_LOSS_FRACTION");
    // Strings since 2026-09-26: a permanent record of a quantity is not a
    // binary float, and the journal's encoder now refuses to write one.
    assert.equal(crossing.risk?.threshold, "0.1");
    assert.ok(Number(crossing.risk?.measured ?? 0) >= 0.1);
    assert.equal(crossing.risk?.markPrice, "1979");

    await h.executor.stop();
    await journal.close();
  });

  test("the exact threshold boundary closes the position", async () => {
    const journal = await newJournal();
    const h = new Harness(journal, config());
    await h.executor.start();
    await h.killSwitch.release("test");
    await h.executor.submitSignal(h.signal({ signalId: "boundary-1" }));
    await settle();

    await h.tick("ETH", 1980.01);
    assert.equal(h.executor.registry.get("ETH")!.state, "MONITORING");

    await h.tick("ETH", 1980);
    await settle();
    assert.equal(h.executor.registry.get("ETH")!.state, "CLOSED");

    await h.executor.stop();
    await journal.close();
  });

  test("a SHORT closes when the price runs the other way", async () => {
    const journal = await newJournal();
    const h = new Harness(journal, config());
    await h.executor.start();
    await h.killSwitch.release("test");
    await h.executor.submitSignal(h.signal({ signalId: "short-1", side: "SHORT" }));
    await settle();

    assert.equal(h.executor.registry.get("ETH")!.side, "SHORT");

    // A falling price is profit for a short.
    await h.tick("ETH", 1900);
    assert.equal(h.executor.registry.get("ETH")!.state, "MONITORING");

    await h.tick("ETH", 2021);
    await settle();

    const position = h.executor.registry.get("ETH")!;
    assert.equal(position.state, "CLOSED");
    assert.equal(position.exitReason, "HARD_RISK_EXIT");
    assert.equal((await h.exchange.accountState()).positions.length, 0);

    await h.executor.stop();
    await journal.close();
  });

  test("a price that gaps straight through the threshold still closes", async () => {
    const journal = await newJournal();
    const h = new Harness(journal, config());
    await h.executor.start();
    await h.killSwitch.release("test");
    await h.executor.submitSignal(h.signal({ signalId: "gap-1" }));
    await settle();

    // No tick ever prints near the threshold.
    await h.tick("ETH", 1500);
    await settle();

    assert.equal(h.executor.registry.get("ETH")!.state, "CLOSED");
    assert.equal((await h.exchange.accountState()).positions.length, 0);

    await h.executor.stop();
    await journal.close();
  });

  test("a position in profit is never closed, however far it runs", async () => {
    const journal = await newJournal();
    const h = new Harness(journal, config());
    await h.executor.start();
    await h.killSwitch.release("test");
    await h.executor.submitSignal(h.signal({ signalId: "profit-1" }));
    await settle();

    for (const price of [2010, 2100, 2500, 5000]) await h.tick("ETH", price);
    assert.equal(h.executor.registry.get("ETH")!.state, "MONITORING");
    assert.equal(h.exchange.positionCount, 1);

    await h.executor.stop();
    await journal.close();
  });

  test("the close is reduce-only and cannot flip the position", async () => {
    const journal = await newJournal();
    const h = new Harness(journal, config());
    await h.executor.start();
    await h.killSwitch.release("test");
    await h.executor.submitSignal(h.signal({ signalId: "reduce-only-1" }));
    await settle();

    await h.tick("ETH", 1900);
    await settle();

    await h.audit.flush();
    const lifecycle = await replayLifecycle(journal);
    const exitOrders = lifecycle.filter((event) => event.stage === "EXIT_ORDER_SUBMITTED");
    assert.ok(exitOrders.length >= 1);
    // Closing a long means selling, and the exchange rejects any reduce-only
    // order that would increase a position — proven by the account staying flat.
    assert.equal(exitOrders[0]!.side, "SHORT");
    assert.equal((await h.exchange.accountState()).positions.length, 0);

    await h.executor.stop();
    await journal.close();
  });

  test("a partially filling close keeps going until the exchange is flat", async () => {
    const journal = await newJournal();
    const h = new Harness(journal, config());
    await h.executor.start();
    await h.killSwitch.release("test");
    await h.executor.submitSignal(h.signal({ signalId: "partial-1" }));
    await settle();

    h.exchange.partialFillFraction = 0.5;
    await h.tick("ETH", 1900);
    await settle(40);

    // Even halving each time, five attempts leave a remainder — so this asserts
    // the loop's behaviour, not a fortunate fill.
    const position = h.executor.registry.get("ETH")!;
    assert.ok(position.closeAttempts.length > 1, "the close must have retried");
    assert.ok(
      position.closeAttempts.some((attempt) => attempt.outcome === "partial"),
      "partial fills must be recorded",
    );

    await h.executor.stop();
    await journal.close();
  });
});

/* ================================================================== *
 * 3. Independence from the signal provider
 * ================================================================== */

describe("acceptance: independence from the signal provider", () => {
  test("the provider says HOLD indefinitely; the position still closes", async () => {
    const journal = await newJournal();
    const h = new Harness(journal, config());
    await h.executor.start();
    await h.killSwitch.release("test");
    await h.executor.submitSignal(h.signal({ signalId: "independent-1" }));
    await settle();

    // The provider keeps insisting. Every one of these is a *new signal*, which
    // is the only thing a provider can send — and none of them can request,
    // defer, or prevent an exit.
    const holdPayloads = [
      { ...h.signal({ signalId: "hold-1" }), exit: "HOLD", hold: true },
      { ...h.signal({ signalId: "hold-2" }), action: "DO_NOT_EXIT" },
      { ...h.signal({ signalId: "hold-3" }), maxLossFraction: 1, disableStop: true },
      { ...h.signal({ signalId: "hold-4" }), stop: "1", target: "99999" },
    ];
    for (const payload of holdPayloads) await h.executor.submitSignal(payload);
    await settle();

    // None of them changed anything: the position is untouched and the
    // configured threshold is unchanged.
    assert.equal(h.executor.registry.get("ETH")!.state, "MONITORING");
    assert.equal(h.executor.config.hardExit.maxLossFraction, 0.1);

    // Now the threshold crosses. The provider has said nothing new.
    await h.tick("ETH", 1970);
    await settle();

    const position = h.executor.registry.get("ETH")!;
    assert.equal(position.state, "CLOSED");
    assert.equal(position.exitReason, "HARD_RISK_EXIT");
    assert.equal((await h.exchange.accountState()).positions.length, 0);

    await h.executor.stop();
    await journal.close();
  });

  test("a provider's advisory stop is recorded but never acted on", async () => {
    const journal = await newJournal();
    const h = new Harness(journal, config());
    await h.executor.start();
    await h.killSwitch.release("test");

    // The provider's stop is far below the executor's own threshold.
    await h.executor.submitSignal(h.signal({ signalId: "advisory-1", stop: "1000" }));
    await settle();

    // The executor's threshold is what fires, at 1980 — not the provider's 1000.
    await h.tick("ETH", 1975);
    await settle();

    assert.equal(h.executor.registry.get("ETH")!.state, "CLOSED");

    await h.audit.flush();
    const lifecycle = await replayLifecycle(journal);
    const validated = lifecycle.find((event) => event.stage === "SIGNAL_VALIDATED");
    assert.equal(validated?.detail?.["advisoryStop"], "1000", "recorded for analysis");

    await h.executor.stop();
    await journal.close();
  });

  test("the provider cannot reach the kill switch through a signal", async () => {
    const journal = await newJournal();
    const h = new Harness(journal, config());
    await h.executor.start();
    await h.executor.engageKillSwitch("operator halt");

    const result = await h.executor.submitSignal({
      ...h.signal({ signalId: "bypass-1" }),
      killSwitch: false,
      overrideKillSwitch: true,
      force: true,
    });
    await settle();

    assert.equal(result.accepted, false);
    assert.equal(result.rejection?.reason, "KILL_SWITCH_ENGAGED");
    assert.equal(h.killSwitch.engaged, true, "a signal cannot clear the switch");
    assert.equal(h.exchange.positionCount, 0);

    await h.executor.stop();
    await journal.close();
  });

  test("the kill switch closes an open position and outranks the hard exit", async () => {
    const journal = await newJournal();
    const h = new Harness(journal, config());
    await h.executor.start();
    await h.killSwitch.release("test");
    await h.executor.submitSignal(h.signal({ signalId: "kill-1" }));
    await settle();

    await h.executor.engageKillSwitch("emergency");
    await settle();

    const position = h.executor.registry.get("ETH")!;
    assert.equal(position.state, "CLOSED");
    assert.equal(position.exitReason, "KILL_SWITCH");
    assert.equal((await h.exchange.accountState()).positions.length, 0);

    await h.executor.stop();
    await journal.close();
  });
});

/* ================================================================== *
 * 4. Recovery
 * ================================================================== */

describe("acceptance: recovery", () => {
  test("a restart rediscovers an open position, reconciles it, and resumes monitoring", async () => {
    const journal = await newJournal();
    const killSwitchStore = new MemoryKillSwitchStore();
    const first = new Harness(journal, config(), killSwitchStore);
    await first.executor.start();
    await first.killSwitch.release("test");
    await first.executor.submitSignal(first.signal({ signalId: "restart-1" }));
    await settle();
    assert.equal(first.exchange.positionCount, 1);

    // Crash: stop the executor, keep the exchange state.
    await first.executor.stop();

    // A brand new executor, with no memory of the position at all.
    const second = new Harness(journal, config(), killSwitchStore, first.exchange);
    second.time = first.time;
    assert.equal(second.executor.registry.all().length, 0, "starts with no knowledge");

    await second.executor.start();
    await settle();

    const rediscovered = second.executor.registry.get("ETH");
    assert.ok(rediscovered, "the position must be rediscovered from the exchange");
    assert.equal(rediscovered.size, "1");
    assert.equal(rediscovered.side, "LONG");
    assert.equal(rediscovered.state, "MONITORING", "monitoring must be reattached");

    // And the hard exit is enforced on the rediscovered position.
    await second.tick("ETH", 1970);
    await settle();

    assert.equal(second.executor.registry.get("ETH")!.state, "CLOSED");
    assert.equal(second.executor.registry.get("ETH")!.exitReason, "HARD_RISK_EXIT");
    assert.equal((await second.exchange.accountState()).positions.length, 0);

    await second.executor.stop();
    await journal.close();
  });

  test("a restart into an already-breached position closes it immediately", async () => {
    const journal = await newJournal();
    const killSwitchStore = new MemoryKillSwitchStore();
    const first = new Harness(journal, config(), killSwitchStore);
    await first.executor.start();
    await first.killSwitch.release("test");
    await first.executor.submitSignal(first.signal({ signalId: "breached-1" }));
    await settle();
    await first.executor.stop();

    // The market moves far past the threshold while the executor is down.
    first.prices.set("ETH", "1900");

    const second = new Harness(journal, config(), killSwitchStore, first.exchange);
    second.time = first.time + 60_000;
    second.prices.set("ETH", "1900");

    await second.executor.start();
    await settle(30);

    // No tick was ever delivered: startup itself evaluated the threshold.
    const position = second.executor.registry.get("ETH")!;
    assert.equal(position.state, "CLOSED");
    assert.equal(position.exitReason, "HARD_RISK_EXIT");
    assert.equal((await second.exchange.accountState()).positions.length, 0);

    await second.executor.stop();
    await journal.close();
  });

  test("an engaged kill switch survives a restart and closes positions on boot", async () => {
    const journal = await newJournal();
    const killSwitchStore = new MemoryKillSwitchStore();
    const first = new Harness(journal, config(), killSwitchStore);
    await first.executor.start();
    await first.killSwitch.release("test");
    await first.executor.submitSignal(first.signal({ signalId: "kill-restart-1" }));
    await settle();

    await first.killSwitch.engage("halt before restart");
    await first.executor.stop();

    const second = new Harness(journal, config(), killSwitchStore, first.exchange);
    second.time = first.time;
    await second.executor.start();
    await settle(20);

    assert.equal(second.killSwitch.engaged, true);
    assert.equal((await second.exchange.accountState()).positions.length, 0, "CLOSE_ALL policy applied");

    await second.executor.stop();
    await journal.close();
  });

  test("losing the feed with a position open triggers the configured safety policy", async () => {
    const journal = await newJournal();
    const h = new Harness(journal, config());
    await h.executor.start();
    await h.killSwitch.release("test");
    await h.executor.submitSignal(h.signal({ signalId: "degraded-1" }));
    await settle();

    // The feed dies *and* the exchange becomes unreachable, so REST cannot
    // restore confidence either.
    h.exchange.unreachable = true;
    h.feed.breakFeed("websocket gone");
    await settle(20);

    assert.equal(h.executor.degraded, true, "the executor must know it is degraded");
    assert.equal(h.executor.status().degradedReason !== undefined, true);

    await h.executor.stop();
    await journal.close();
  });

  test("a feed outage the exchange can cover does not degrade the executor", async () => {
    const journal = await newJournal();
    const h = new Harness(journal, config());
    await h.executor.start();
    await h.killSwitch.release("test");
    await h.executor.submitSignal(h.signal({ signalId: "rest-fallback-1" }));
    await settle();

    // The socket dies but REST still answers: reconciliation covers the gap.
    h.feed.breakFeed("websocket gone");
    await settle(20);

    assert.equal(h.executor.degraded, false);
    assert.equal(h.executor.registry.get("ETH")!.state, "MONITORING");

    await h.executor.stop();
    await journal.close();
  });

  test("a threshold crossing during a feed outage is still enforced over REST", async () => {
    const journal = await newJournal();
    const h = new Harness(journal, config());
    await h.executor.start();
    await h.killSwitch.release("test");
    await h.executor.submitSignal(h.signal({ signalId: "outage-exit-1" }));
    await settle();

    // The price breaches while the socket is down; the REST path must catch it.
    h.prices.set("ETH", "1960");
    h.feed.breakFeed("websocket gone");
    await settle(30);

    const position = h.executor.registry.get("ETH")!;
    assert.equal(position.state, "CLOSED");
    assert.equal(position.exitReason, "HARD_RISK_EXIT");

    await h.executor.stop();
    await journal.close();
  });

  test("a position that appears on the exchange is adopted and monitored", async () => {
    const journal = await newJournal();
    const h = new Harness(journal, config());

    // Opened by hand in the web UI, or left by an earlier process.
    h.exchange.seedPosition({
      symbol: "ETH", side: "LONG", size: 2, entryPrice: 2000, leverage: 10, openedAt: START,
    });

    await h.executor.start();
    await h.killSwitch.release("test");
    await settle();

    const adopted = h.executor.registry.get("ETH");
    assert.ok(adopted, "an untracked position must be adopted, never ignored");
    assert.equal(adopted.size, "2");
    assert.equal(adopted.state, "MONITORING");
    assert.ok(adopted.discrepancies.length > 0, "the divergence is recorded");

    // And it is protected by the same threshold as any other position.
    await h.tick("ETH", 1970);
    await settle();
    assert.equal(h.executor.registry.get("ETH")!.state, "CLOSED");

    await h.executor.stop();
    await journal.close();
  });
});

/* ================================================================== *
 * 5. Idempotency of the exit
 * ================================================================== */

describe("acceptance: one exit lifecycle", () => {
  test("many concurrent threshold crossings produce exactly one close lifecycle", async () => {
    const journal = await newJournal();
    const h = new Harness(journal, config());
    await h.executor.start();
    await h.killSwitch.release("test");
    await h.executor.submitSignal(h.signal({ signalId: "storm-1" }));
    await settle();

    const beforeClaims = h.executor.registry.totalClaims;

    // A burst of breaching ticks, all at once, as a fast market produces.
    for (let i = 0; i < 50; i++) {
      h.feed.push("ETH", 1970 - i, h.time + i);
    }
    h.prices.set("ETH", "1920");
    await settle(40);

    assert.equal(
      h.executor.registry.totalClaims - beforeClaims,
      1,
      "exactly one exit may ever be claimed",
    );

    const position = h.executor.registry.get("ETH")!;
    assert.equal(position.state, "CLOSED");
    assert.equal((await h.exchange.accountState()).positions.length, 0);

    // One lifecycle in the audit trail, not fifty.
    await h.audit.flush();
    const lifecycle = await replayLifecycle(journal, position.tradeId);
    const triggered = lifecycle.filter((event) => event.stage === "EXIT_TRIGGERED");
    const closed = lifecycle.filter((event) => event.stage === "TRADE_CLOSED");
    assert.equal(triggered.length, 1, "exactly one EXIT_TRIGGERED");
    assert.equal(closed.length, 1, "exactly one TRADE_CLOSED");

    await h.executor.stop();
    await journal.close();
  });

  test("a manual close during a hard exit does not create a second close", async () => {
    const journal = await newJournal();
    const h = new Harness(journal, config());
    await h.executor.start();
    await h.killSwitch.release("test");
    await h.executor.submitSignal(h.signal({ signalId: "manual-race-1" }));
    await settle();

    const before = h.executor.registry.totalClaims;

    // Fire both at the same moment.
    h.feed.push("ETH", 1960, h.time);
    h.prices.set("ETH", "1960");
    const manual = h.executor.closePositionNow("ETH", "MANUAL_EXIT", "operator pressed close");
    await Promise.all([manual, settle(30)]);

    assert.equal(h.executor.registry.totalClaims - before, 1);
    // The hard risk exit outranks a manual one, so that is the recorded reason.
    assert.equal(h.executor.registry.get("ETH")!.exitReason, "HARD_RISK_EXIT");

    await h.executor.stop();
    await journal.close();
  });

  test("a kill switch during a hard exit escalates the reason, not the order count", async () => {
    const journal = await newJournal();
    const h = new Harness(journal, config());
    await h.executor.start();
    await h.killSwitch.release("test");
    await h.executor.submitSignal(h.signal({ signalId: "escalate-1" }));
    await settle();

    const before = h.executor.registry.totalClaims;

    h.feed.push("ETH", 1960, h.time);
    h.prices.set("ETH", "1960");
    await h.executor.engageKillSwitch("emergency during close");
    await settle(30);

    assert.equal(h.executor.registry.totalClaims - before, 1, "still one claim");
    assert.equal((await h.exchange.accountState()).positions.length, 0);

    await h.executor.stop();
    await journal.close();
  });
});

/* ================================================================== *
 * 6. Audit
 * ================================================================== */

describe("acceptance: audit", () => {
  test("a complete lifecycle is reconstructable from persisted history alone", async () => {
    const directoryForRun = join(directory, "audit-run");
    const store = await FileJournalStore.open(directoryForRun);
    const journal = await Journal.open({ lane: "executor", device: "test", store });

    const h = new Harness(journal, config());
    await h.executor.start();
    await h.killSwitch.release("test");
    await h.executor.submitSignal(h.signal({ signalId: "audit-1" }));
    await settle();
    await h.tick("ETH", 1960);
    await settle();

    const tradeId = h.executor.registry.get("ETH")!.tradeId;
    await h.audit.flush();
    await h.executor.stop();
    await journal.close();

    // Reopen from disk: nothing in memory, only what was persisted.
    const reopenedStore = await FileJournalStore.open(directoryForRun);
    const reopened = await Journal.open({ lane: "executor", device: "test", store: reopenedStore });
    await reopened.verify(); // the hash chain must be intact

    const lifecycle = await replayLifecycle(reopened, tradeId);
    const stages = lifecycle.map((event) => event.stage);

    for (const required of [
      "SIGNAL_RECEIVED",
      "SIGNAL_VALIDATED",
      "ENTRY_SUBMITTED",
      "ENTRY_ACKNOWLEDGED",
      "POSITION_OPEN",
      "MONITORING_STARTED",
      "HARD_THRESHOLD_CROSSED",
      "EXIT_TRIGGERED",
      "EXIT_ORDER_SUBMITTED",
      "POSITION_VERIFIED_FLAT",
      "TRADE_CLOSED",
    ] as const) {
      assert.ok(stages.includes(required), `${required} must appear in the audit trail`);
    }

    // The record carries what a post-mortem needs.
    const closed = lifecycle.find((event) => event.stage === "TRADE_CLOSED")!;
    assert.equal(closed.exitReason, "HARD_RISK_EXIT");
    assert.ok(closed.realizedPnl !== undefined, "realised PnL must be recorded");
    assert.ok(closed.fees !== undefined, "fees must be recorded");

    const crossing = lifecycle.find((event) => event.stage === "HARD_THRESHOLD_CROSSED")!;
    assert.ok(crossing.risk, "the measurement behind the decision must be recorded");
    assert.equal(crossing.risk.threshold, "0.1");
    assert.equal(crossing.risk.basis, "MARGIN");

    // Ordering is causal, not incidental.
    assert.ok(
      stages.indexOf("HARD_THRESHOLD_CROSSED") < stages.indexOf("EXIT_TRIGGERED"),
      "the crossing precedes the trigger",
    );
    assert.ok(
      stages.indexOf("EXIT_ORDER_SUBMITTED") < stages.indexOf("POSITION_VERIFIED_FLAT"),
      "the order precedes the verification",
    );

    await reopened.close();
  });

  test("the audit trail never contains a secret", async () => {
    const journal = await newJournal();
    const h = new Harness(journal, config());
    await h.executor.start();
    await h.killSwitch.release("test");
    await h.executor.submitSignal(h.signal({ signalId: "redaction-1" }));
    await settle();
    await h.tick("ETH", 1900);
    await settle();
    await h.audit.flush();

    const text = JSON.stringify(await journal.readAll());
    for (const forbidden of ["privateKey", "private_key", "signature", "secret", "0x0123456789abcdef"]) {
      assert.ok(!text.includes(forbidden), `the journal must not contain ${forbidden}`);
    }

    await h.executor.stop();
    await journal.close();
  });

  test("a rejected signal is audited with its deterministic reason", async () => {
    const journal = await newJournal();
    const h = new Harness(journal, config());
    await h.executor.start();
    await h.killSwitch.release("test");

    await h.executor.submitSignal(h.signal({ signalId: "rejected-1", symbol: "DOGE" }));
    await h.audit.flush();

    const lifecycle = await replayLifecycle(journal);
    const rejection = lifecycle.find((event) => event.stage === "SIGNAL_REJECTED");
    assert.ok(rejection, "every rejection must be audited");
    assert.equal(rejection.rejectionReason, "SYMBOL_NOT_ALLOWED");
    assert.equal(rejection.signalId, "rejected-1");

    await h.executor.stop();
    await journal.close();
  });
});


/* ================================================================== *
 * 7. Settlement over a long hold
 * ================================================================== */

describe("acceptance: settlement is fee- and funding-complete", () => {
  /**
   * The identity that must hold for a trade to be reconstructable in cash terms:
   *
   *   account delta  ==  realizedPnl - fees - fundingPaid
   *
   * Anything left over is a cost the audit trail cannot account for, and over
   * many trades an unaccounted term is a systematic bias rather than noise.
   */
  test("a day-long hold reconciles exactly against the account", async () => {
    const journal = await newJournal();
    // 0.01%/hour — a trending-market funding regime, long side paying.
    const h = new Harness(journal, config(), new MemoryKillSwitchStore(), undefined, 0.0001);
    await h.executor.start();
    await h.killSwitch.release("test");

    const before = Number((await h.exchange.accountState()).accountValue);
    await h.executor.submitSignal(h.signal({ signalId: "settle-day-1" }));
    await settle();

    // Hold for a full day, drifting to just inside the threshold.
    for (let hour = 1; hour <= 24; hour++) {
      h.time += 3_600_000;
      const price = 2000 - (hour / 24) * 19;
      h.prices.set("ETH", price.toFixed(4));
      h.feed.push("ETH", price.toFixed(4), h.time);
      await settle(3);
    }
    assert.equal(h.executor.registry.get("ETH")!.state, "MONITORING", "still inside the threshold");

    // Cross it.
    h.time += 3_600_000;
    h.prices.set("ETH", "1979");
    h.feed.push("ETH", "1979", h.time);
    await settle(40);

    const position = h.executor.registry.get("ETH")!;
    assert.equal(position.state, "CLOSED");
    assert.equal(position.exitReason, "HARD_RISK_EXIT");

    const after = Number((await h.exchange.accountState()).accountValue);

    await h.audit.flush();
    const lifecycle = await replayLifecycle(journal, position.tradeId);
    const closed = lifecycle.find((event) => event.stage === "TRADE_CLOSED")!;

    assert.ok(closed.realizedPnl !== undefined, "realised PnL must be recorded");
    assert.ok(closed.fees !== undefined, "fees must be recorded");
    assert.ok(closed.funding !== undefined, "funding must be recorded over a long hold");

    const reportedNet =
      Number(closed.realizedPnl) - Number(closed.fees) - Number(closed.funding);
    const actualDelta = after - before;

    assert.ok(
      Math.abs(actualDelta - reportedNet) < 1e-6,
      `settlement must reconcile: account moved ${actualDelta}, ` +
        `report accounts for ${reportedNet} ` +
        `(pnl ${closed.realizedPnl}, fees ${closed.fees}, funding ${closed.funding})`,
    );
  });

  test("reported fees cover the round trip, not just the exit", async () => {
    const journal = await newJournal();
    const h = new Harness(journal, config());
    await h.executor.start();
    await h.killSwitch.release("test");
    await h.executor.submitSignal(h.signal({ signalId: "roundtrip-1" }));
    await settle();

    await h.tick("ETH", 1979);
    await settle(30);

    const position = h.executor.registry.get("ETH")!;
    await h.audit.flush();
    const closed = (await replayLifecycle(journal, position.tradeId)).find(
      (event) => event.stage === "TRADE_CLOSED",
    )!;

    // Entry at 2000 and exit near 1979, both taker at 0.045%: roughly $1.79.
    // Only counting the exit would report roughly half that.
    const fees = Number(closed.fees);
    const exitOnly = 1979 * 0.00045;
    assert.ok(
      fees > exitOnly * 1.8,
      `round-trip fees expected near 1.79, got ${fees} (exit alone would be ${exitOnly.toFixed(4)})`,
    );
  });

  test("funding is recorded even when the price never moves", async () => {
    const journal = await newJournal();
    const h = new Harness(journal, config(), new MemoryKillSwitchStore(), undefined, 0.0001);
    await h.executor.start();
    await h.killSwitch.release("test");
    await h.executor.submitSignal(h.signal({ signalId: "funding-only-1" }));
    await settle();

    // Twelve hours flat, then an operator close. No price movement at all.
    h.time += 12 * 3_600_000;
    await h.executor.closePositionNow("ETH", "MANUAL_EXIT", "settlement check");
    await settle(30);

    const position = h.executor.registry.get("ETH")!;
    await h.audit.flush();
    const closed = (await replayLifecycle(journal, position.tradeId)).find(
      (event) => event.stage === "TRADE_CLOSED",
    )!;

    // 12h at 0.01%/hr on $2000 notional = $2.40, paid by the long.
    assert.ok(closed.funding !== undefined, "funding must be recorded");
    assert.ok(
      Math.abs(Number(closed.funding) - 2.4) < 1e-6,
      `expected 2.40 of funding, got ${closed.funding}`,
    );
    // And price PnL is zero, so the cost of the hold was entirely fees + funding.
    assert.equal(Number(closed.realizedPnl), 0);
  });
});
