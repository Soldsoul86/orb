/**
 * Market data feeds.
 *
 * Real-time monitoring is what makes the local hard exit sentinel viable, and
 * polling alone is far too slow to respect a stop. But a socket is exactly the
 * thing that dies quietly, so every feed here reports its own health, and
 * polling exists underneath as a safety net rather than as the primary path.
 */
import { HyperliquidSocket, type Address } from "@orb/hyperliquid";
import type { FillView, MarketDataPort, MarkPriceTick } from "@orb/trade-executor";
import type { HyperliquidExchangePort } from "./hyperliquid-port.js";

type MarkListener = (tick: MarkPriceTick) => void;
type FillListener = (fill: FillView) => void;
type HealthListener = (healthy: boolean, reason: string) => void;

/** Shared listener plumbing, so each feed only implements its own source. */
abstract class BaseFeed implements MarketDataPort {
  protected readonly markListeners = new Set<MarkListener>();
  protected readonly fillListeners = new Set<FillListener>();
  protected readonly healthListeners = new Set<HealthListener>();
  protected readonly watched = new Set<string>();
  protected lastMessageAt = 0;
  protected isHealthy = false;

  protected readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  abstract start(): void;
  abstract stop(): void;
  protected abstract onWatch(symbol: string): void;
  protected abstract onUnwatch(symbol: string): void;

  watch(symbol: string): void {
    if (this.watched.has(symbol)) return;
    this.watched.add(symbol);
    this.onWatch(symbol);
  }

  unwatch(symbol: string): void {
    if (!this.watched.delete(symbol)) return;
    this.onUnwatch(symbol);
  }

  onMarkPrice(listener: MarkListener): () => void {
    this.markListeners.add(listener);
    return () => void this.markListeners.delete(listener);
  }

  onFill(listener: FillListener): () => void {
    this.fillListeners.add(listener);
    return () => void this.fillListeners.delete(listener);
  }

  onHealth(listener: HealthListener): () => void {
    this.healthListeners.add(listener);
    return () => void this.healthListeners.delete(listener);
  }

  get healthy(): boolean {
    return this.isHealthy;
  }

  staleness(): number {
    return this.lastMessageAt === 0 ? Number.POSITIVE_INFINITY : this.now() - this.lastMessageAt;
  }

  protected emitMark(tick: MarkPriceTick): void {
    this.lastMessageAt = tick.at;
    for (const listener of this.markListeners) {
      try {
        listener(tick);
      } catch {
        // A listener must never be able to stop the feed — and this listener is
        // the hard exit path, whose own errors are handled inside it.
      }
    }
  }

  protected emitFill(fill: FillView): void {
    this.lastMessageAt = this.now();
    for (const listener of this.fillListeners) {
      try {
        listener(fill);
      } catch {
        // As above.
      }
    }
  }

  protected setHealth(healthy: boolean, reason: string): void {
    if (this.isHealthy === healthy) return;
    this.isHealthy = healthy;
    for (const listener of this.healthListeners) {
      try {
        listener(healthy, reason);
      } catch {
        // As above.
      }
    }
  }
}

export interface HyperliquidFeedOptions {
  readonly socket: HyperliquidSocket;
  readonly account: Address;
  readonly port: HyperliquidExchangePort;
  /** REST poll interval, as the safety net under the socket. */
  readonly pollIntervalMs?: number;
  /** Silence beyond this marks the feed unhealthy. */
  readonly stalenessLimitMs?: number;
  readonly now?: () => number;
  readonly setTimer?: (fn: () => void, ms: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
}

/**
 * The live feed: WebSocket first, REST polling underneath.
 *
 * Both paths emit the same tick, so the sentinel cannot tell them apart — which
 * is the point. Losing the socket degrades latency, not correctness, and the
 * health signal tells the executor that its reaction time is now seconds rather
 * than milliseconds.
 */
export class HyperliquidMarketDataFeed extends BaseFeed {
  readonly #socket: HyperliquidSocket;
  readonly #account: Address;
  readonly #port: HyperliquidExchangePort;
  readonly #pollIntervalMs: number;
  readonly #stalenessLimitMs: number;
  readonly #setTimer: (fn: () => void, ms: number) => unknown;
  readonly #clearTimer: (handle: unknown) => void;

  #pollTimer: unknown = null;
  #unsubscribe: (() => void)[] = [];
  #running = false;

  constructor(options: HyperliquidFeedOptions) {
    super(options.now);
    this.#socket = options.socket;
    this.#account = options.account;
    this.#port = options.port;
    this.#pollIntervalMs = options.pollIntervalMs ?? 5_000;
    this.#stalenessLimitMs = options.stalenessLimitMs ?? 30_000;
    this.#setTimer = options.setTimer ?? ((fn, ms) => setInterval(fn, ms));
    this.#clearTimer = options.clearTimer ?? ((handle) => clearInterval(handle as never));
  }

  override start(): void {
    if (this.#running) return;
    this.#running = true;

    this.#unsubscribe.push(
      this.#socket.on("activeAssetCtx", (event) => {
        this.#port.noteMarkPrice(event.coin, event.ctx.markPx);
        this.emitMark({
          symbol: event.coin,
          markPrice: event.ctx.markPx,
          at: this.now(),
          source: "websocket",
        });
      }),
      this.#socket.on("userFills", (event) => {
        for (const fill of event.fills) {
          this.emitFill({
            symbol: fill.coin,
            side: fill.side === "B" ? "LONG" : "SHORT",
            size: fill.sz,
            price: fill.px,
            fee: fill.fee,
            closedPnl: fill.closedPnl,
            orderId: fill.oid,
            ...(fill.cloid ? { clientOrderId: fill.cloid } : {}),
            at: fill.time,
            isLiquidation: fill.liquidation !== undefined,
            tradeId: fill.tid,
          });
        }
      }),
      this.#socket.on("health", (health) => {
        this.setHealth(health.state === "connected", `websocket ${health.state}`);
      }),
    );

    this.#socket.subscribeUserFills(this.#account);
    this.#socket.subscribeOrderUpdates(this.#account);
    for (const symbol of this.watched) this.#socket.subscribeAssetContext(symbol);
    this.#socket.start();

    // The REST net runs unconditionally, not only when the socket is down: a
    // socket that is "connected" but silent is the failure this catches.
    this.#pollTimer = this.#setTimer(() => void this.#poll(), this.#pollIntervalMs);
  }

  override stop(): void {
    this.#running = false;
    if (this.#pollTimer !== null) this.#clearTimer(this.#pollTimer);
    this.#pollTimer = null;
    for (const unsubscribe of this.#unsubscribe) unsubscribe();
    this.#unsubscribe = [];
    this.#socket.stop();
    this.setHealth(false, "feed stopped");
  }

  protected override onWatch(symbol: string): void {
    if (this.#running) this.#socket.subscribeAssetContext(symbol);
  }

  protected override onUnwatch(): void {
    // Leaving a subscription in place is harmless and avoids a resubscribe if
    // the same symbol is traded again shortly.
  }

  async #poll(): Promise<void> {
    for (const symbol of this.watched) {
      try {
        const markPrice = await this.#port.markPrice(symbol);
        this.emitMark({ symbol, markPrice, at: this.now(), source: "rest" });
      } catch {
        // Individual failures are expected; staleness below is what matters.
      }
    }

    // Health is a judgement about *data*, not about socket state: a connected
    // socket delivering nothing is unhealthy.
    if (this.staleness() > this.#stalenessLimitMs) {
      this.setHealth(false, `no market data for ${Math.round(this.staleness())}ms`);
    } else if (this.watched.size > 0) {
      this.setHealth(true, "market data flowing");
    }
  }
}

/**
 * A feed driven entirely by the caller.
 *
 * Used by paper mode and by every test that needs to move a price to an exact
 * value and assert what the executor did about it.
 */
export class ScriptedMarketDataFeed extends BaseFeed {
  #running = false;

  override start(): void {
    this.#running = true;
    this.setHealth(true, "scripted feed started");
  }

  override stop(): void {
    this.#running = false;
    this.setHealth(false, "scripted feed stopped");
  }

  protected override onWatch(): void {
    // Nothing to subscribe to.
  }

  protected override onUnwatch(): void {
    // Nothing to unsubscribe from.
  }

  get running(): boolean {
    return this.#running;
  }

  /** Pushes a mark price, as the WebSocket would. */
  push(symbol: string, markPrice: number | string, at = this.now()): void {
    this.emitMark({ symbol, markPrice: String(markPrice), at, source: "websocket" });
  }

  pushFill(fill: FillView): void {
    this.emitFill(fill);
  }

  /** Simulates the feed dying, which is what triggers the degraded policy. */
  breakFeed(reason = "simulated disconnect"): void {
    this.setHealth(false, reason);
  }

  restoreFeed(reason = "simulated reconnect"): void {
    this.setHealth(true, reason);
  }
}
