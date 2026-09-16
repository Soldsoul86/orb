/**
 * The executor asking permission before it commits exposure.
 *
 * `CAPABILITY_MODEL.md` §5 puts financial actions in the irreversible tier and
 * requires *explicit, per-scope authorization* for them. Until now the
 * executor satisfied that with configuration — a notional cap, a symbol
 * allowlist, a leverage ceiling — which `ARCHITECTURAL_DEBT.md` recorded as
 * "not a per-action authorization gate". This is the gate.
 *
 * The test that carries this file is the third one. Every entry in it is
 * individually inside every `RiskConfig` limit, and together they are not
 * allowed. No per-trade limit can express that, because the question is about
 * a day rather than a trade.
 *
 * Nothing is stubbed but the exchange and the clock. The guard is the real
 * one, over a real `JournalLedgerStore`, over the same journal the executor
 * audits to.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { Journal, MemoryJournalStore } from "@orb/journal";
import {
  ANY_REQUESTER,
  JournalLedgerStore,
  SpendGuard,
  singlePolicy,
  type SpendPolicy,
} from "@orb/payment-policy";
import {
  DEFAULT_RISK_CONFIG,
  JournalAuditSink,
  KillSwitch,
  MemoryKillSwitchStore,
  NOTIONAL_ASSET,
  NOTIONAL_UNIT,
  TradeExecutor,
  usdToBaseUnits,
  type AssetInfo,
  type RiskConfig,
} from "@orb/trade-executor";
import { PaperExchangePort, ScriptedMarketDataFeed } from "@orb/executor-app";

const START = 1_700_000_000_000;
const ACCOUNT = "acct:desk";

const asset = (symbol: string, index: number): AssetInfo => ({
  symbol,
  index,
  szDecimals: 4,
  maxLeverage: 25,
  isDelisted: false,
});
const ASSETS = [asset("ETH", 1), asset("BTC", 2), asset("SOL", 3)];

/**
 * Deliberately generous, so nothing here is ever refused by risk.
 *
 * Every entry below is $2,000 against a $10,000 per-position ceiling and three
 * permitted concurrent positions. If a trade is stopped in this file, spend
 * authority stopped it.
 */
const config: RiskConfig = {
  ...DEFAULT_RISK_CONFIG,
  entry: {
    ...DEFAULT_RISK_CONFIG.entry,
    symbolAllowlist: ["ETH", "BTC", "SOL"],
    maxPositionNotionalUsd: 10_000,
    maxConcurrentPositions: 3,
    maxLeverage: 10,
  },
};

/** A daily ceiling on exposure opened, which `RiskConfig` cannot express. */
const dailyBudget = (maxUsd: number): SpendPolicy => ({
  account: ACCOUNT,
  version: 1,
  units: [NOTIONAL_UNIT],
  rules: [
    {
      id: "daily-exposure",
      kind: "WINDOW_BUDGET",
      scope: ANY_REQUESTER,
      asset: NOTIONAL_ASSET,
      windowMs: 86_400_000,
      maxTotal: usdToBaseUnits(maxUsd),
    },
  ],
});

class Harness {
  readonly prices = new Map([
    ["ETH", "2000"],
    ["BTC", "2000"],
    ["SOL", "2000"],
  ]);
  readonly exchange: PaperExchangePort;
  readonly feed = new ScriptedMarketDataFeed(() => this.time);
  readonly audit: JournalAuditSink;
  readonly executor: TradeExecutor;
  time = START;

  private constructor(
    readonly journal: Journal,
    readonly guard: SpendGuard,
    readonly store: JournalLedgerStore,
    budgetUsd: number | null,
  ) {
    this.exchange = new PaperExchangePort({
      assets: ASSETS,
      priceSource: async (symbol) => {
        const price = this.prices.get(symbol);
        if (price === undefined) throw new Error(`no price for ${symbol}`);
        return price;
      },
      startingBalanceUsd: 1_000_000,
      now: () => this.time,
      feeFraction: 0.00045,
      hourlyFundingRate: 0,
    });
    this.audit = new JournalAuditSink({ journal });
    this.executor = new TradeExecutor({
      exchange: this.exchange,
      marketData: this.feed,
      audit: this.audit,
      killSwitch: new KillSwitch(new MemoryKillSwitchStore(), () => this.time),
      config,
      ...(budgetUsd === null
        ? {}
        : { spendAuthority: { guard: this.guard, account: ACCOUNT } }),
      now: () => this.time,
      sleep: async () => undefined,
      setInterval: () => null,
      clearInterval: () => undefined,
    });
  }

  static async open(budgetUsd: number | null): Promise<Harness> {
    const journal = await Journal.open({
      store: new MemoryJournalStore(),
      device: "spend-test",
      lane: "test",
    });
    const store = await JournalLedgerStore.open({ journal });
    const guard = new SpendGuard({
      store,
      policyFor: singlePolicy(dailyBudget(budgetUsd ?? 0)),
      clock: { now: () => START },
    });
    const harness = new Harness(journal, guard, store, budgetUsd);
    // Entries are suspended until the executor is running.
    await harness.executor.start();
    return harness;
  }

  signal(symbol: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      signalId: `sig-${randomUUID()}`,
      timestamp: this.time,
      symbol,
      side: "LONG",
      entry: { kind: "MARKET" },
      sizing: { kind: "BASE_SIZE", size: "1" }, // $2,000 at the fixed price
      setupId: "spend-acceptance",
      leverage: 1,
      ...overrides,
    };
  }

  async spent(): Promise<bigint> {
    const entries = await this.store.entries(ACCOUNT);
    return entries
      .filter((e) => e.state !== "REVERSED")
      .reduce((total, e) => total + e.amount, 0n);
  }
}

async function settle(rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i++) await new Promise((resolve) => setImmediate(resolve));
}

describe("acceptance: spend authority over entry exposure", () => {
  test("an entry inside the budget opens normally", async () => {
    const h = await Harness.open(10_000);
    const result = await h.executor.submitSignal(h.signal("ETH"));
    await settle();

    assert.equal(result.accepted, true, "a $2,000 entry under a $10,000 budget must open");
    assert.equal(await h.spent(), usdToBaseUnits(2_000));
  });

  test("the executor is unchanged when no spend authority is configured", async () => {
    // Art. X §37 — the kernel evolves through addition. Adding this control to
    // the codebase must not change an existing deployment's behaviour.
    const h = await Harness.open(null);
    for (const symbol of ["ETH", "BTC", "SOL"]) {
      const result = await h.executor.submitSignal(h.signal(symbol));
      await settle();
      assert.equal(result.accepted, true, `${symbol} must open with no guard configured`);
    }
  });

  test("a budget stops what no per-trade limit can", async () => {
    // Three $2,000 entries against a $5,000 day. Each one is inside every
    // RiskConfig limit — $10,000 per position, three concurrent, 10x leverage.
    // Only their sum is too much, and a per-trade cap cannot see a sum.
    const h = await Harness.open(5_000);

    const first = await h.executor.submitSignal(h.signal("ETH"));
    await settle();
    const second = await h.executor.submitSignal(h.signal("BTC"));
    await settle();
    const third = await h.executor.submitSignal(h.signal("SOL"));
    await settle();

    assert.equal(first.accepted, true);
    assert.equal(second.accepted, true);
    assert.equal(third.accepted, false, "$6,000 of exposure against a $5,000 day must be refused");
    assert.equal(third.rejection?.reason, "SPEND_NOT_AUTHORIZED");

    // And it is refused as a spend, not as a risk breach. The two answer
    // different questions and a reader must be able to tell which stopped it.
    assert.notEqual(third.rejection?.reason, "RISK_LIMIT_EXCEEDED");
    assert.equal(await h.spent(), usdToBaseUnits(4_000), "the refused entry consumed nothing");
  });

  test("the refused entry never reaches the exchange", async () => {
    // A gate that refuses after the order is placed is not a gate.
    const h = await Harness.open(3_000);
    await h.executor.submitSignal(h.signal("ETH"));
    await settle();
    const before = (await h.exchange.fillsSince(0)).length;

    const refused = await h.executor.submitSignal(h.signal("BTC"));
    await settle();

    assert.equal(refused.accepted, false);
    assert.equal(
      (await h.exchange.fillsSince(0)).length,
      before,
      "no order may reach the venue for a refused spend",
    );
  });

  test("the ledger records what the exchange filled, not what was asked for", async () => {
    // Art. XI §42: the loop closes on a Sensor's confirmation. The settled
    // figure comes from the position the exchange reports.
    const h = await Harness.open(10_000);
    await h.executor.submitSignal(h.signal("ETH"));
    await settle();

    const entries = await h.store.entries(ACCOUNT);
    const entry = entries[0];
    assert.ok(entry !== undefined);
    assert.equal(entry.state, "SETTLED", "a confirmed position must settle its reservation");
  });

  test("budget freed by a rejected entry is available again", async () => {
    const h = await Harness.open(5_000);
    h.exchange.rejectNextOrder = "simulated venue rejection";

    const rejected = await h.executor.submitSignal(h.signal("ETH"));
    await settle();

    assert.equal(rejected.accepted, false);
    assert.equal(await h.spent(), 0n, "a rejected order must not hold budget");

    // The budget it briefly held is usable by the next entry.
    const next = await h.executor.submitSignal(h.signal("BTC"));
    await settle();
    assert.equal(next.accepted, true);
  });
});

/**
 * The two "we do not know" paths.
 *
 * Art. XI §42 forbids assuming an Action changed reality. Its mirror binds
 * just as hard: we may not assume it did not. Between those, an unresolved
 * reservation stays exactly where it is — settling it records exposure that
 * may not exist, reversing it frees budget that may be committed.
 */
describe("acceptance: spend authority under uncertainty", () => {
  test("an unreachable exchange leaves the reservation standing", async () => {
    const h = await Harness.open(10_000);

    // The executor reads the account twice: once to size the entry, once to
    // confirm it. Only the second read fails here, so the order really does
    // go out and the executor genuinely cannot tell whether it opened.
    // Failing both would reject the signal before authorization and prove
    // nothing about the reservation.
    let reads = 0;
    const realAccountState = h.exchange.accountState.bind(h.exchange);
    h.exchange.accountState = async () => {
      if (++reads > 1) throw new Error("exchange unreachable");
      return realAccountState();
    };

    await h.executor.submitSignal(h.signal("ETH"));
    await settle();
    assert.ok(reads > 1, "the confirming read must have been attempted");

    const entries = await h.store.entries(ACCOUNT);
    assert.equal(entries.length, 1);
    assert.equal(
      entries[0]?.state,
      "PENDING",
      "an unconfirmed entry must be neither settled nor reversed",
    );
    // Still held against the budget, because it may well have happened.
    assert.equal(await h.spent(), usdToBaseUnits(2_000));
  });

  test("an unreachable guard refuses the trade rather than assuming it is fine", async () => {
    const h = await Harness.open(10_000);
    // A gate that cannot be consulted is not a gate that said yes.
    const broken = {
      authorize: async () => {
        throw new Error("ledger unavailable");
      },
    };
    const executor = new TradeExecutor({
      exchange: h.exchange,
      marketData: h.feed,
      audit: h.audit,
      killSwitch: new KillSwitch(new MemoryKillSwitchStore(), () => h.time),
      config,
      spendAuthority: { guard: broken as unknown as SpendGuard, account: ACCOUNT },
      now: () => h.time,
      sleep: async () => undefined,
      setInterval: () => null,
      clearInterval: () => undefined,
    });
    await executor.start();

    const before = (await h.exchange.fillsSince(0)).length;
    const result = await executor.submitSignal(h.signal("ETH"));
    await settle();

    assert.equal(result.accepted, false);
    assert.equal(result.rejection?.reason, "SPEND_AUTHORITY_UNAVAILABLE");
    assert.notEqual(
      result.rejection?.reason,
      "SPEND_NOT_AUTHORIZED",
      "could not ask is not the same as was told no",
    );
    assert.equal((await h.exchange.fillsSince(0)).length, before, "nothing may be traded");
  });
});
