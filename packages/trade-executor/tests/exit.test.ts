/**
 * The close path and reconciliation.
 *
 * Both are driven against a scripted exchange, so every awkward case a real
 * exchange produces — a partial fill, a rejection, a position that will not go
 * flat, a position that appears from nowhere — is reproducible exactly.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { closePosition } from "../src/execution/closer.js";
import { reconcile } from "../src/reconcile/reconciler.js";
import { PositionRegistry, newPosition } from "../src/position/registry.js";
import { InMemoryAuditSink } from "../src/audit/lifecycle.js";
import { DEFAULT_RISK_CONFIG } from "../src/risk/config.js";
import type {
  AccountStateView,
  AssetInfo,
  ExchangePort,
  ExchangePositionView,
  FillView,
  OpenOrderView,
  PlacedOrder,
  SubmissionOutcome,
} from "../src/ports.js";
import type { Side } from "../src/signal/model.js";

const AT = 1_700_000_000_000;
const limits = { ...DEFAULT_RISK_CONFIG.execution, closeRetryDelayMs: 0, maxCloseAttempts: 5 };

/**
 * A scripted exchange.
 *
 * Behaves like a netted perp account: one position per symbol, reduce-only
 * orders that shrink it, and a configurable set of failures.
 */
class FakeExchange implements ExchangePort {
  readonly account = "0xfake";
  readonly canTrade = true;

  readonly positions = new Map<string, { side: Side; size: number; entryPrice: number; leverage: number }>();
  readonly submitted: PlacedOrder[] = [];
  readonly restingOrders: OpenOrderView[] = [];
  fills: FillView[] = [];

  /** Fraction of each reduce-only request that actually fills. */
  fillFraction = 1;
  /** Number of leading attempts that fill only partially; the rest fill fully. */
  partialAttempts = Number.POSITIVE_INFINITY;
  #closeAttempts = 0;
  /** Queue of scripted failures, one per `submit`. */
  submitFailures: (string | null)[] = [];
  /** When set, reduce-only orders are rejected with this reason. */
  rejectCloses: string | null = null;
  /** When true, reading account state throws. */
  unreachable = false;
  /** When true, a close fills but the position never actually shrinks. */
  closesDoNothing = false;
  accountStateCalls = 0;
  mark = 2000;

  assetInfo(symbol: string): AssetInfo | undefined {
    return { symbol, index: 0, szDecimals: 4, maxLeverage: 25, isDelisted: false };
  }
  tradableSymbols(): readonly string[] {
    return [...this.positions.keys()];
  }

  async accountState(): Promise<AccountStateView> {
    this.accountStateCalls += 1;
    if (this.unreachable) throw new Error("exchange unreachable");

    const positions: ExchangePositionView[] = [...this.positions.entries()].map(([symbol, p]) => ({
      symbol,
      side: p.side,
      size: String(p.size),
      entryPrice: String(p.entryPrice),
      unrealizedPnl: String((p.side === "LONG" ? 1 : -1) * (this.mark - p.entryPrice) * p.size),
      marginUsed: String((p.entryPrice * p.size) / p.leverage),
      liquidationPrice: null,
      leverage: p.leverage,
      positionValue: String(this.mark * p.size),
    }));

    return {
      accountValue: "10000",
      totalMarginUsed: "200",
      withdrawable: "9800",
      positions,
      observedAt: AT,
    };
  }

  async openOrders(): Promise<readonly OpenOrderView[]> {
    return this.restingOrders;
  }

  async fillsSince(since: number): Promise<readonly FillView[]> {
    return this.fills.filter((fill) => fill.at >= since);
  }

  async submit(orders: readonly PlacedOrder[]): Promise<readonly SubmissionOutcome[]> {
    const failure = this.submitFailures.shift();
    if (failure) throw new Error(failure);

    return orders.map((order) => {
      this.submitted.push(order);
      if (order.reduceOnly && this.rejectCloses !== null) {
        return { kind: "rejected", reason: this.rejectCloses };
      }

      const position = this.positions.get(order.symbol);
      if (!order.reduceOnly || !position) {
        return { kind: "rejected", reason: "no position to reduce" };
      }

      this.#closeAttempts += 1;
      const fraction = this.#closeAttempts <= this.partialAttempts ? this.fillFraction : 1;
      const requested = Number.parseFloat(order.size);
      const filled = round(Math.min(requested, position.size) * fraction, 4);
      if (!(filled > 0)) return { kind: "rejected", reason: "nothing to fill" };

      if (!this.closesDoNothing) {
        position.size = round(position.size - filled, 4);
        if (position.size <= 0) this.positions.delete(order.symbol);
      }

      this.fills.push({
        symbol: order.symbol,
        side: order.side,
        size: String(filled),
        price: String(this.mark),
        fee: String(this.mark * filled * 0.00045),
        closedPnl: String(-10 * filled),
        orderId: 100 + this.submitted.length,
        at: AT + this.submitted.length,
        isLiquidation: false,
        tradeId: this.submitted.length,
      });

      return {
        kind: "filled",
        orderId: 100 + this.submitted.length,
        filledSize: String(filled),
        averagePrice: String(this.mark),
      };
    });
  }

  async cancel(): Promise<void> {}
  async setLeverage(): Promise<void> {}
  async markPrice(): Promise<string> {
    return String(this.mark);
  }
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function setup(size = 1) {
  const exchange = new FakeExchange();
  exchange.positions.set("ETH", { side: "LONG", size, entryPrice: 2000, leverage: 10 });

  const registry = new PositionRegistry();
  registry.open(
    newPosition({
      tradeId: "trade_1",
      symbol: "ETH",
      side: "LONG",
      state: "MONITORING",
      openedAt: AT,
      leverage: 10,
      size: String(size),
      entryPrice: "2000",
    }),
  );

  const audit = new InMemoryAuditSink();
  const deps = { exchange, registry, audit, now: () => AT, limits, sleep: async () => {} };
  return { exchange, registry, audit, deps };
}

function claim(registry: PositionRegistry) {
  const outcome = registry.claimExit("ETH", "HARD_RISK_EXIT", AT);
  assert.ok(outcome.kind === "claimed");
  if (outcome.kind !== "claimed") throw new Error("unreachable");
  return outcome.token;
}

describe("closing a position", () => {
  test("submits a reduce-only order and verifies the exchange is flat", async () => {
    const { exchange, registry, audit, deps } = setup();
    const outcome = await closePosition(deps, claim(registry));

    assert.equal(outcome.flat, true);
    assert.equal(exchange.positions.has("ETH"), false);
    assert.equal(exchange.submitted.length, 1);
    assert.equal(exchange.submitted[0]!.reduceOnly, true, "the close must be reduce-only");
    assert.equal(exchange.submitted[0]!.side, "SHORT", "closing a long means selling");
    assert.ok(audit.stages().includes("POSITION_VERIFIED_FLAT"));
  });

  test("only the exchange saying flat ends the close, not a filled acknowledgement", async () => {
    const { exchange, registry, deps } = setup();
    // Orders report filled, but the position never shrinks.
    exchange.closesDoNothing = true;

    const outcome = await closePosition(deps, claim(registry));
    assert.equal(outcome.flat, false, "an acknowledged fill is not a closed position");
    assert.equal(exchange.submitted.length, limits.maxCloseAttempts);
  });

  test("keeps closing the remainder across partial fills", async () => {
    const { exchange, registry, audit, deps } = setup(1);
    // Two attempts hit thin liquidity and fill half; the third clears the rest.
    exchange.fillFraction = 0.5;
    exchange.partialAttempts = 2;

    const outcome = await closePosition(deps, claim(registry));

    assert.equal(outcome.flat, true);
    assert.ok(exchange.submitted.length > 1, "one order was never going to be enough");
    assert.ok(audit.stages().includes("PARTIAL_FILL"));
    // Each attempt closes what is actually left, not the original size.
    const sizes = exchange.submitted.map((order) => Number.parseFloat(order.size));
    for (let i = 1; i < sizes.length; i++) {
      assert.ok(sizes[i]! < sizes[i - 1]!, "each attempt should be smaller");
    }
  });

  test("retries after a rejected close", async () => {
    const { exchange, registry, audit, deps } = setup();
    exchange.rejectCloses = "Order has invalid price.";
    // Let the third attempt succeed.
    let attempts = 0;
    const originalSubmit = exchange.submit.bind(exchange);
    exchange.submit = async (orders) => {
      attempts += 1;
      if (attempts >= 3) exchange.rejectCloses = null;
      return originalSubmit(orders);
    };

    const outcome = await closePosition(deps, claim(registry));
    assert.equal(outcome.flat, true);
    assert.ok(attempts >= 3);
    assert.ok(audit.stages().includes("EXIT_ATTEMPT_FAILED"));
  });

  test("retries after a transport failure, without assuming the order landed", async () => {
    const { exchange, registry, deps } = setup();
    exchange.submitFailures = ["network timeout", "network timeout"];

    const outcome = await closePosition(deps, claim(registry));
    assert.equal(outcome.flat, true);
    // It re-read the position before each attempt rather than trusting memory.
    assert.ok(exchange.accountStateCalls >= 3);
  });

  test("gives up after the configured attempts and reports why", async () => {
    const { exchange, registry, deps } = setup();
    exchange.rejectCloses = "reduce-only order would not reduce position";

    const outcome = await closePosition(deps, claim(registry));
    assert.equal(outcome.flat, false);
    assert.equal(outcome.attempts, limits.maxCloseAttempts);
    assert.match(outcome.error ?? "", /reduce-only/);
  });

  test("a position already flat closes immediately with no orders at all", async () => {
    const { exchange, registry, audit, deps } = setup();
    exchange.positions.delete("ETH");

    const outcome = await closePosition(deps, claim(registry));
    assert.equal(outcome.flat, true);
    assert.equal(exchange.submitted.length, 0);
    assert.ok(audit.stages().includes("POSITION_VERIFIED_FLAT"));
  });

  test("records realised PnL and fees from the exchange's own fills", async () => {
    const { registry, deps } = setup();
    const outcome = await closePosition(deps, claim(registry));

    assert.equal(outcome.flat, true);
    assert.ok(outcome.realizedPnl !== undefined, "realised PnL must be recorded");
    assert.ok(outcome.fees !== undefined, "fees must be recorded");
    assert.equal(Number.parseFloat(outcome.realizedPnl!), -10);
    assert.ok(Number.parseFloat(outcome.fees!) > 0);
  });

  test("settlement covers the whole trade, including the entry fee", async () => {
    // Regression: windowing fills from the exit claim reported only the exit
    // fee, understating every trade's cost by exactly the entry fee.
    const { exchange, registry, deps } = setup();

    // The position was opened a day before the exit was claimed.
    const openedADayEarlier = AT - 86_400_000;
    registry.observe("ETH", { openedAt: openedADayEarlier });
    exchange.fills.push({
      symbol: "ETH", side: "LONG", size: "1", price: "2000",
      fee: "0.9", closedPnl: "0", orderId: 1, at: openedADayEarlier,
      isLiquidation: false, tradeId: 1,
    });

    const outcome = await closePosition(deps, claim(registry));

    assert.equal(outcome.flat, true);
    const fees = Number.parseFloat(outcome.fees!);
    assert.ok(fees > 0.9, `round-trip fees must include the 0.9 entry fee, got ${fees}`);
  });

  test("an adopted position settles only over what we actually saw", async () => {
    // Its entry predates adoption, so the entry fee is not ours to know. The
    // window must not reach back past the position's own start and sweep in
    // fills from a previous trade in the same symbol.
    const { exchange, registry, deps } = setup();

    exchange.fills.push({
      symbol: "ETH", side: "LONG", size: "5", price: "1800",
      fee: "99", closedPnl: "-500", orderId: 1, at: AT - 86_400_000,
      isLiquidation: false, tradeId: 1,
    });

    const outcome = await closePosition(deps, claim(registry));
    assert.equal(outcome.flat, true);
    assert.ok(
      Number.parseFloat(outcome.fees!) < 99,
      "a previous trade's fees must not be attributed to this one",
    );
  });

  test("records every attempt on the position for audit", async () => {
    const { exchange, registry, deps } = setup();
    exchange.fillFraction = 0.5;
    exchange.partialAttempts = 1;
    await closePosition(deps, claim(registry));

    const attempts = registry.get("ETH")!.closeAttempts;
    assert.ok(attempts.length >= 2);
    assert.ok(attempts.every((attempt) => attempt.attempt > 0));
    assert.ok(attempts.some((attempt) => attempt.outcome === "partial" || attempt.outcome === "filled"));
  });

  test("stops when the remainder is dust that no order can express", async () => {
    const { exchange, registry, deps } = setup();
    // A remainder below one lot at 4 decimals.
    exchange.positions.set("ETH", { side: "LONG", size: 0.00001, entryPrice: 2000, leverage: 10 });

    const outcome = await closePosition(deps, claim(registry));
    assert.equal(outcome.flat, false);
    assert.match(outcome.error ?? "", /unclosable remainder/);
  });

  test("closing a short buys, not sells", async () => {
    const { exchange, registry, deps } = setup();
    exchange.positions.set("ETH", { side: "SHORT", size: 1, entryPrice: 2000, leverage: 10 });
    registry.observe("ETH", { side: "SHORT" });

    await closePosition(deps, claim(registry));
    assert.equal(exchange.submitted[0]!.side, "LONG");
    assert.equal(exchange.submitted[0]!.reduceOnly, true);
  });
});

describe("reconciliation", () => {
  const reconcilerDeps = (exchange: ExchangePort, registry: PositionRegistry, audit: InMemoryAuditSink) => ({
    exchange,
    registry,
    audit,
    now: () => AT,
    defaultLeverage: 1,
  });

  test("agreement produces no discrepancies", async () => {
    const { exchange, registry, audit } = setup();
    const result = await reconcile(reconcilerDeps(exchange, registry, audit));

    assert.equal(result.exchangeReachable, true);
    assert.deepEqual([...result.discrepancies], []);
    assert.ok(audit.stages().includes("RECONCILIATION_COMPLETE"));
  });

  test("adopts a position the executor was not tracking", async () => {
    const exchange = new FakeExchange();
    exchange.positions.set("BTC", { side: "SHORT", size: 0.5, entryPrice: 60_000, leverage: 5 });
    const registry = new PositionRegistry();
    const audit = new InMemoryAuditSink();

    const result = await reconcile(reconcilerDeps(exchange, registry, audit));

    assert.deepEqual([...result.adopted], ["BTC"]);
    assert.equal(result.discrepancies[0]?.kind, "UNTRACKED_POSITION");
    const adopted = registry.get("BTC");
    assert.equal(adopted?.side, "SHORT");
    assert.equal(adopted?.size, "0.5");
    assert.equal(adopted?.state, "OPEN", "an adopted position must be monitored, not ignored");
    assert.ok(audit.stages().includes("RECONCILIATION_DISCREPANCY"));
  });

  test("closes a position the exchange says is flat, and records that it diverged", async () => {
    const { exchange, registry, audit } = setup();
    exchange.positions.delete("ETH");

    const result = await reconcile(reconcilerDeps(exchange, registry, audit));

    assert.deepEqual([...result.closed], ["ETH"]);
    assert.equal(result.discrepancies[0]?.kind, "PHANTOM_POSITION");
    assert.equal(registry.get("ETH")?.state, "CLOSED");
    assert.ok(registry.get("ETH")!.discrepancies.length > 0, "the divergence is recorded, not hidden");
  });

  test("a position going flat during a commanded close is expected, not a discrepancy", async () => {
    const { exchange, registry, audit } = setup();
    registry.claimExit("ETH", "HARD_RISK_EXIT", AT);
    exchange.positions.delete("ETH");

    const result = await reconcile(reconcilerDeps(exchange, registry, audit));
    assert.deepEqual([...result.discrepancies], []);
    assert.equal(registry.get("ETH")?.state, "CLOSED");
  });

  test("corrects a size mismatch and records it", async () => {
    const { exchange, registry, audit } = setup();
    exchange.positions.set("ETH", { side: "LONG", size: 0.6, entryPrice: 2000, leverage: 10 });

    const result = await reconcile(reconcilerDeps(exchange, registry, audit));

    assert.equal(result.discrepancies[0]?.kind, "SIZE_MISMATCH");
    assert.equal(registry.get("ETH")!.size, "0.6", "the exchange is authoritative");
    assert.deepEqual([...result.corrected], ["ETH"]);
    assert.ok(registry.get("ETH")!.discrepancies.some((d) => d.includes("0.6")));
  });

  test("a size difference below one lot is not a mismatch", async () => {
    const { exchange, registry, audit } = setup();
    // 4 decimals of precision: a half-lot difference is noise, not divergence.
    exchange.positions.set("ETH", { side: "LONG", size: 1.00001, entryPrice: 2000, leverage: 10 });

    const result = await reconcile(reconcilerDeps(exchange, registry, audit));
    assert.deepEqual([...result.discrepancies], []);
  });

  test("corrects a side mismatch, because a wrong sign inverts every PnL", async () => {
    const { exchange, registry, audit } = setup();
    exchange.positions.set("ETH", { side: "SHORT", size: 1, entryPrice: 2000, leverage: 10 });

    const result = await reconcile(reconcilerDeps(exchange, registry, audit));

    assert.equal(result.discrepancies[0]?.kind, "SIDE_MISMATCH");
    assert.equal(registry.get("ETH")!.side, "SHORT");
  });

  test("an unreachable exchange makes every position UNKNOWN, never flat", async () => {
    const { exchange, registry, audit } = setup();
    exchange.unreachable = true;

    const result = await reconcile(reconcilerDeps(exchange, registry, audit));

    assert.equal(result.exchangeReachable, false);
    assert.equal(registry.get("ETH")!.state, "UNKNOWN");
    assert.notEqual(registry.get("ETH")!.state, "CLOSED");
    assert.ok(registry.get("ETH")!.discrepancies.some((d) => d.includes("unreachable")));
  });

  test("a pending entry is not a phantom — the order may simply not have filled", async () => {
    const exchange = new FakeExchange();
    const registry = new PositionRegistry();
    registry.open(
      newPosition({
        tradeId: "trade_1", symbol: "ETH", side: "LONG",
        state: "PENDING_ENTRY", openedAt: AT, leverage: 10,
      }),
    );

    const result = await reconcile(reconcilerDeps(exchange, registry, new InMemoryAuditSink()));
    assert.deepEqual([...result.discrepancies], []);
    assert.equal(registry.get("ETH")!.state, "PENDING_ENTRY");
  });

  test("confirms a pending entry the exchange has actually filled", async () => {
    const exchange = new FakeExchange();
    exchange.positions.set("ETH", { side: "LONG", size: 1, entryPrice: 2000, leverage: 10 });
    const registry = new PositionRegistry();
    registry.open(
      newPosition({
        tradeId: "trade_1", symbol: "ETH", side: "LONG",
        state: "PENDING_ENTRY", openedAt: AT, leverage: 10,
      }),
    );

    await reconcile(reconcilerDeps(exchange, registry, new InMemoryAuditSink()));
    assert.equal(registry.get("ETH")!.state, "OPEN");
    assert.equal(registry.get("ETH")!.size, "1");
  });

  test("recovers an UNKNOWN position back to OPEN", async () => {
    const { exchange, registry, audit } = setup();
    registry.transition("ETH", "CONFIDENCE_LOST");
    assert.equal(registry.get("ETH")!.state, "UNKNOWN");

    await reconcile(reconcilerDeps(exchange, registry, audit));
    assert.equal(registry.get("ETH")!.state, "OPEN");
  });

  test("flags a reduce-only order with no position behind it", async () => {
    const exchange = new FakeExchange();
    exchange.restingOrders.push({
      symbol: "SOL", orderId: 7, reduceOnly: true, size: "10", isTrigger: true,
    });

    const result = await reconcile(
      reconcilerDeps(exchange, new PositionRegistry(), new InMemoryAuditSink()),
    );
    assert.ok(result.discrepancies.some((d) => d.kind === "ORPHANED_ORDER"));
  });

  test("is idempotent — running twice changes nothing the second time", async () => {
    const exchange = new FakeExchange();
    exchange.positions.set("BTC", { side: "LONG", size: 1, entryPrice: 60_000, leverage: 2 });
    const registry = new PositionRegistry();
    const audit = new InMemoryAuditSink();

    const first = await reconcile(reconcilerDeps(exchange, registry, audit));
    const second = await reconcile(reconcilerDeps(exchange, registry, audit));

    assert.equal(first.adopted.length, 1);
    assert.equal(second.adopted.length, 0);
    assert.equal(second.discrepancies.length, 0);
  });
});
