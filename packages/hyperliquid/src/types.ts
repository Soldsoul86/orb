/**
 * Hyperliquid wire types.
 *
 * These mirror the exchange's JSON exactly, including its abbreviated field
 * names (`a` asset, `b` isBuy, `p` price, `s` size, `r` reduceOnly, `t` type,
 * `c` client order id). They are deliberately *not* prettified: this is the
 * boundary, and a rename here would hide a wire change behind a local name.
 *
 * Everything numeric that represents money arrives as a decimal *string*.
 */
import type { Address } from "./keys.js";

export const MAINNET_API = "https://api.hyperliquid.xyz";
export const TESTNET_API = "https://api.hyperliquid-testnet.xyz";
export const MAINNET_WS = "wss://api.hyperliquid.xyz/ws";
export const TESTNET_WS = "wss://api.hyperliquid-testnet.xyz/ws";

/** Time in force. `Ioc` is what a reduce-only emergency close uses. */
export type Tif = "Gtc" | "Ioc" | "Alo" | "FrontendMarket";

export type OrderType =
  | { readonly limit: { readonly tif: Tif } }
  | {
      readonly trigger: {
        readonly isMarket: boolean;
        readonly triggerPx: string;
        readonly tpsl: "tp" | "sl";
      };
    };

/** A single order on the wire. Field order matters: it is hashed as-is. */
export interface OrderWire {
  readonly a: number;
  readonly b: boolean;
  readonly p: string;
  readonly s: string;
  readonly r: boolean;
  readonly t: OrderType;
  readonly c?: `0x${string}`;
}

export type OrderGrouping = "na" | "normalTpsl" | "positionTpsl";

export type OrderStatusEntry =
  | { readonly resting: { readonly oid: number; readonly cloid?: `0x${string}` } }
  | {
      readonly filled: {
        readonly totalSz: string;
        readonly avgPx: string;
        readonly oid: number;
        readonly cloid?: `0x${string}`;
      };
    }
  | { readonly error: string }
  | "waitingForFill"
  | "waitingForTrigger";

export interface OrderResponse {
  readonly status: "ok" | "err";
  readonly response:
    | { readonly type: "order"; readonly data: { readonly statuses: readonly OrderStatusEntry[] } }
    | { readonly type: string; readonly data?: unknown };
}

/** Perpetual asset metadata. `szDecimals` drives every price and size we send. */
export interface AssetMeta {
  readonly name: string;
  readonly szDecimals: number;
  readonly maxLeverage: number;
  readonly isDelisted?: true;
  readonly onlyIsolated?: true;
}

export interface MetaResponse {
  readonly universe: readonly AssetMeta[];
}

export interface PerpAssetCtx {
  readonly markPx: string;
  readonly midPx: string | null;
  readonly oraclePx: string;
  readonly funding: string;
  readonly openInterest: string;
  readonly prevDayPx: string;
}

export interface LeverageInfo {
  readonly type: "cross" | "isolated";
  readonly value: number;
  readonly rawUsd?: string;
}

/** A position exactly as the exchange reports it. This is the truth. */
export interface ExchangePosition {
  readonly coin: string;
  /** Signed size: positive is long, negative is short, absent means flat. */
  readonly szi: string;
  readonly entryPx: string;
  readonly positionValue: string;
  readonly unrealizedPnl: string;
  readonly returnOnEquity: string;
  readonly liquidationPx: string | null;
  readonly marginUsed: string;
  readonly maxLeverage: number;
  readonly leverage: LeverageInfo;
  /**
   * Funding paid (positive) or received (negative) on this position.
   *
   * Hyperliquid settles funding into the account balance, not into
   * `unrealizedPnl` — so a position's price PnL and its true economic result
   * diverge by exactly this, and the divergence grows with holding time.
   */
  readonly cumFunding?: {
    readonly allTime: string;
    readonly sinceOpen: string;
    readonly sinceChange: string;
  };
}

export interface AssetPosition {
  readonly type: "oneWay";
  readonly position: ExchangePosition;
}

export interface MarginSummary {
  readonly accountValue: string;
  readonly totalNtlPos: string;
  readonly totalRawUsd: string;
  readonly totalMarginUsed: string;
}

export interface ClearinghouseState {
  readonly marginSummary: MarginSummary;
  readonly crossMarginSummary: MarginSummary;
  readonly crossMaintenanceMarginUsed: string;
  readonly withdrawable: string;
  readonly assetPositions: readonly AssetPosition[];
  readonly time: number;
}

export interface UserFill {
  readonly coin: string;
  readonly px: string;
  readonly sz: string;
  readonly side: "B" | "A";
  readonly time: number;
  readonly startPosition: string;
  readonly dir: string;
  readonly closedPnl: string;
  readonly hash: `0x${string}`;
  readonly oid: number;
  readonly crossed: boolean;
  readonly fee: string;
  readonly tid: number;
  readonly feeToken: string;
  readonly cloid?: `0x${string}`;
  readonly liquidation?: {
    readonly liquidatedUser?: Address;
    readonly markPx: string;
    readonly method: "market" | "backstop";
  };
}

export interface OpenOrder {
  readonly coin: string;
  readonly side: "B" | "A";
  readonly limitPx: string;
  readonly sz: string;
  readonly oid: number;
  readonly timestamp: number;
  readonly origSz: string;
  readonly cloid?: `0x${string}`;
  readonly reduceOnly?: boolean;
  readonly isPositionTpsl?: boolean;
  readonly triggerPx?: string;
  readonly isTrigger?: boolean;
  readonly orderType?: string;
}

/** Lifecycle status of an order, as reported by `orderStatus` and `orderUpdates`. */
export type OrderProcessingStatus =
  | "open"
  | "filled"
  | "canceled"
  | "triggered"
  | "rejected"
  | "marginCanceled"
  | "reduceOnlyCanceled"
  | "reduceOnlyRejected"
  | "liquidatedCanceled"
  | "scheduledCancel"
  | "internalCancel"
  | (string & {});

export interface OrderStatusResponse {
  readonly status: "order" | "unknownOid";
  readonly order?: {
    readonly order: OpenOrder;
    readonly status: OrderProcessingStatus;
    readonly statusTimestamp: number;
  };
}

/** Candle intervals the exchange supports. */
export type CandleInterval =
  | "1m" | "3m" | "5m" | "15m" | "30m"
  | "1h" | "2h" | "4h" | "8h" | "12h"
  | "1d" | "3d" | "1w" | "1M";

/**
 * One candle, in the exchange's abbreviated wire form.
 *
 * Kept verbatim rather than prettified, for the same reason as the order
 * fields: a rename here would hide a wire change behind a local name.
 */
export interface Candle {
  /** Opening timestamp, ms since epoch. */
  readonly t: number;
  /** Closing timestamp, ms since epoch. */
  readonly T: number;
  /** Asset symbol. */
  readonly s: string;
  readonly i: CandleInterval;
  readonly o: string;
  readonly c: string;
  readonly h: string;
  readonly l: string;
  /** Volume in the base asset. */
  readonly v: string;
  /** Number of trades in the interval. */
  readonly n: number;
}

/** True when the exchange considers an order finished — no more fills will come. */
export function isTerminalOrderStatus(status: OrderProcessingStatus): boolean {
  return status !== "open" && status !== "triggered";
}
