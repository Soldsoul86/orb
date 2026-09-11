/**
 * The executor's ports.
 *
 * The executor knows nothing about Hyperliquid, HTTP, or where a signal came
 * from. It knows these interfaces. That is what makes the same executor usable
 * by a friend's API today and by Alpha OS tomorrow, and what lets every test
 * drive a complete trade lifecycle without a network.
 *
 * Constitution Art. VI §25: only the Execution Plane acts on reality, and only
 * through permissioned Capabilities. {@link ExchangePort} is that boundary.
 */
import type { Side } from "./signal/model.js";

/** Injected time. The functional core never reads the clock itself. */
export type Clock = () => number;

/** A position exactly as the exchange reports it. This is the truth. */
export interface ExchangePositionView {
  readonly symbol: string;
  readonly side: Side;
  /** Absolute size. A flat position is absent from the account, never size 0. */
  readonly size: string;
  readonly entryPrice: string;
  readonly unrealizedPnl: string;
  readonly marginUsed: string;
  readonly liquidationPrice: string | null;
  readonly leverage: number;
  readonly positionValue: string;
  /**
   * Funding paid (positive) or received (negative) since the position opened.
   *
   * Absent when the port cannot determine it. The exchange settles funding into
   * the account balance rather than into `unrealizedPnl`, so a trade's price PnL
   * and its true economic result diverge by this amount — materially, over a
   * hold measured in hours.
   */
  readonly fundingSinceOpen?: string;
}

/** The account's margin picture, as the exchange reports it. */
export interface AccountStateView {
  readonly accountValue: string;
  readonly totalMarginUsed: string;
  readonly withdrawable: string;
  readonly positions: readonly ExchangePositionView[];
  /** Exchange timestamp of this observation. */
  readonly observedAt: number;
}

export interface AssetInfo {
  readonly symbol: string;
  readonly index: number;
  readonly szDecimals: number;
  readonly maxLeverage: number;
  readonly isDelisted: boolean;
}

export interface PlacedOrder {
  readonly symbol: string;
  readonly side: Side;
  /** `true` when the order may only reduce an existing position. */
  readonly reduceOnly: boolean;
  readonly size: string;
  readonly price: string;
  readonly clientOrderId: `0x${string}` | undefined;
  readonly kind: "market" | "limit" | "stop_market";
  readonly triggerPrice?: string;
}

/** What the exchange said about one submitted order. Never "it worked". */
export type SubmissionOutcome =
  | { readonly kind: "resting"; readonly orderId: number; readonly clientOrderId?: `0x${string}` }
  | {
      readonly kind: "filled";
      readonly orderId: number;
      readonly filledSize: string;
      readonly averagePrice: string;
      readonly clientOrderId?: `0x${string}`;
    }
  | { readonly kind: "waiting"; readonly detail: string }
  | { readonly kind: "rejected"; readonly reason: string };

export interface FillView {
  readonly symbol: string;
  readonly side: Side;
  readonly size: string;
  readonly price: string;
  readonly fee: string;
  readonly closedPnl: string;
  readonly orderId: number;
  readonly clientOrderId?: `0x${string}`;
  readonly at: number;
  readonly isLiquidation: boolean;
  readonly tradeId: number;
}

export interface OpenOrderView {
  readonly symbol: string;
  readonly orderId: number;
  readonly clientOrderId?: `0x${string}`;
  readonly reduceOnly: boolean;
  readonly size: string;
  readonly isTrigger: boolean;
}

/**
 * The capability through which the executor touches the market.
 *
 * Implementations: the live Hyperliquid adapter, a paper adapter that simulates
 * fills, and a dry-run adapter that refuses every write.
 */
export interface ExchangePort {
  /** The account whose positions these operations affect. */
  readonly account: string;
  /** Whether this port can actually move money. Used by the safety interlock. */
  readonly canTrade: boolean;

  assetInfo(symbol: string): AssetInfo | undefined;
  tradableSymbols(): readonly string[];

  /** Authoritative account and position state. */
  accountState(signal?: AbortSignal): Promise<AccountStateView>;
  openOrders(signal?: AbortSignal): Promise<readonly OpenOrderView[]>;
  fillsSince(since: number, signal?: AbortSignal): Promise<readonly FillView[]>;

  /** Places orders. Never retried internally — a duplicate order doubles a position. */
  submit(orders: readonly PlacedOrder[], signal?: AbortSignal): Promise<readonly SubmissionOutcome[]>;
  cancel(orders: readonly { symbol: string; orderId: number }[], signal?: AbortSignal): Promise<void>;
  setLeverage(symbol: string, leverage: number, isCross: boolean, signal?: AbortSignal): Promise<void>;

  /** Latest mark price, for the entry path and as a REST fallback for monitoring. */
  markPrice(symbol: string, signal?: AbortSignal): Promise<string>;
}

/** A mark-price observation, from whichever source saw it. */
export interface MarkPriceTick {
  readonly symbol: string;
  readonly markPrice: string;
  readonly at: number;
  readonly source: "websocket" | "rest";
}

/** Real-time market and account monitoring. */
export interface MarketDataPort {
  /** Begins watching `symbol`. Idempotent. */
  watch(symbol: string): void;
  unwatch(symbol: string): void;
  onMarkPrice(listener: (tick: MarkPriceTick) => void): () => void;
  onFill(listener: (fill: FillView) => void): () => void;
  /** Fires when the feed's trustworthiness changes. Drives the degraded state. */
  onHealth(listener: (healthy: boolean, reason: string) => void): () => void;
  readonly healthy: boolean;
  /** Milliseconds since anything at all arrived. `Infinity` when never. */
  staleness(): number;
  start(): void;
  stop(): void;
}

/** Where the auditable lifecycle goes. Backed by the Event Journal. */
export interface AuditSink {
  /**
   * Records a lifecycle event.
   *
   * Must return promptly and must not throw: it sits near the hard-exit path,
   * where blocking on I/O would cost the exit latency it cannot afford.
   */
  record(event: import("./audit/lifecycle.js").LifecycleEvent): void;
  /** Waits for everything recorded so far to become durable. */
  flush(): Promise<void>;
}
