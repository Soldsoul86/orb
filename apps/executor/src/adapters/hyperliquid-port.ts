/**
 * The live Hyperliquid exchange port.
 *
 * Binds the executor's abstract {@link ExchangePort} to the real adapter. It
 * translates shapes and nothing else — every decision was already made by the
 * time a call reaches here.
 */
import {
  AssetDirectory,
  ExchangeClient,
  InfoClient,
  formatPrice,
  formatSize,
  type Address,
  type OrderWire,
  type OrderGrouping,
} from "@orb/hyperliquid";
import type {
  AccountStateView,
  AssetInfo,
  ExchangePort,
  ExchangePositionView,
  FillView,
  OpenOrderView,
  PlacedOrder,
  SubmissionOutcome,
} from "@orb/trade-executor";

export interface HyperliquidPortOptions {
  readonly info: InfoClient;
  /** Absent in read-only modes: without it the port cannot trade at all. */
  readonly exchange?: ExchangeClient;
  readonly directory: AssetDirectory;
  /** The account to observe. For a vault, the vault's address. */
  readonly account: Address;
}

export class HyperliquidExchangePort implements ExchangePort {
  readonly #info: InfoClient;
  readonly #exchange: ExchangeClient | undefined;
  readonly #directory: AssetDirectory;
  readonly account: string;

  /** Mark prices, refreshed by the feed and used as a REST fallback. */
  readonly #marks = new Map<string, string>();

  constructor(options: HyperliquidPortOptions) {
    this.#info = options.info;
    this.#exchange = options.exchange;
    this.#directory = options.directory;
    this.account = options.account;
  }

  get canTrade(): boolean {
    return this.#exchange !== undefined;
  }

  assetInfo(symbol: string): AssetInfo | undefined {
    if (!this.#directory.has(symbol)) return undefined;
    const { index, meta } = this.#directory.resolve(symbol);
    return {
      symbol,
      index,
      szDecimals: meta.szDecimals,
      maxLeverage: meta.maxLeverage,
      isDelisted: meta.isDelisted === true,
    };
  }

  tradableSymbols(): readonly string[] {
    return this.#directory.tradableSymbols;
  }

  /** Lets the WebSocket feed keep the REST fallback warm. */
  noteMarkPrice(symbol: string, markPrice: string): void {
    this.#marks.set(symbol, markPrice);
  }

  async accountState(signal?: AbortSignal): Promise<AccountStateView> {
    const state = await this.#info.clearinghouseState(this.account as Address, signal);

    const positions: ExchangePositionView[] = [];
    for (const entry of state.assetPositions) {
      const size = Number.parseFloat(entry.position.szi);
      // The exchange reports a flat position by omitting it; a zero here would
      // be a shape we do not expect, and must not be read as a live position.
      if (!Number.isFinite(size) || size === 0) continue;
      positions.push({
        symbol: entry.position.coin,
        side: size > 0 ? "LONG" : "SHORT",
        size: Math.abs(size).toString(),
        entryPrice: entry.position.entryPx,
        unrealizedPnl: entry.position.unrealizedPnl,
        marginUsed: entry.position.marginUsed,
        liquidationPrice: entry.position.liquidationPx,
        leverage: entry.position.leverage.value,
        positionValue: entry.position.positionValue,
        ...(entry.position.cumFunding
          ? { fundingSinceOpen: entry.position.cumFunding.sinceOpen }
          : {}),
      });
    }

    return {
      accountValue: state.marginSummary.accountValue,
      totalMarginUsed: state.marginSummary.totalMarginUsed,
      withdrawable: state.withdrawable,
      positions,
      observedAt: state.time,
    };
  }

  async openOrders(signal?: AbortSignal): Promise<readonly OpenOrderView[]> {
    const orders = await this.#info.openOrders(this.account as Address, signal);
    return orders.map((order) => ({
      symbol: order.coin,
      orderId: order.oid,
      ...(order.cloid ? { clientOrderId: order.cloid } : {}),
      reduceOnly: order.reduceOnly === true,
      size: order.sz,
      isTrigger: order.isTrigger === true,
    }));
  }

  async fillsSince(since: number, signal?: AbortSignal): Promise<readonly FillView[]> {
    const fills = await this.#info.userFillsByTime(this.account as Address, since, signal);
    return fills.map((fill) => ({
      symbol: fill.coin,
      // `side` on a fill is the order's direction, not the position's.
      side: fill.side === "B" ? ("LONG" as const) : ("SHORT" as const),
      size: fill.sz,
      price: fill.px,
      fee: fill.fee,
      closedPnl: fill.closedPnl,
      orderId: fill.oid,
      ...(fill.cloid ? { clientOrderId: fill.cloid } : {}),
      at: fill.time,
      isLiquidation: fill.liquidation !== undefined,
      tradeId: fill.tid,
    }));
  }

  async submit(
    orders: readonly PlacedOrder[],
    signal?: AbortSignal,
  ): Promise<readonly SubmissionOutcome[]> {
    if (this.#exchange === undefined) {
      return orders.map(() => ({
        kind: "rejected" as const,
        reason: "this port has no signing key and cannot place orders",
      }));
    }
    if (orders.length === 0) return [];

    const wire: OrderWire[] = orders.map((order) => this.#toWire(order));
    // A trigger order that should resize with the position uses positionTpsl;
    // anything else is a standalone order.
    const grouping: OrderGrouping = orders.every((order) => order.kind === "stop_market")
      ? "positionTpsl"
      : "na";

    const outcomes = await this.#exchange.placeOrders(wire, grouping, signal);
    return outcomes.map((outcome) => {
      switch (outcome.kind) {
        case "resting":
          return {
            kind: "resting" as const,
            orderId: outcome.oid,
            ...(outcome.cloid ? { clientOrderId: outcome.cloid } : {}),
          };
        case "filled":
          return {
            kind: "filled" as const,
            orderId: outcome.oid,
            filledSize: outcome.totalSz,
            averagePrice: outcome.avgPx,
            ...(outcome.cloid ? { clientOrderId: outcome.cloid } : {}),
          };
        case "waiting":
          return { kind: "waiting" as const, detail: outcome.detail };
        case "rejected":
          return { kind: "rejected" as const, reason: outcome.reason };
      }
    });
  }

  #toWire(order: PlacedOrder): OrderWire {
    const { index, meta } = this.#directory.resolve(order.symbol);
    const price = formatPrice(order.price, meta.szDecimals);
    const size = formatSize(order.size, meta.szDecimals);

    if (order.kind === "stop_market") {
      return {
        a: index,
        b: order.side === "LONG",
        p: price,
        s: size,
        r: order.reduceOnly,
        t: {
          trigger: {
            isMarket: true,
            triggerPx: formatPrice(order.triggerPrice ?? order.price, meta.szDecimals),
            // Closing a long at a worse price is a stop loss, and the same for
            // a short: this order only ever exists as protection.
            tpsl: "sl",
          },
        },
        ...(order.clientOrderId ? { c: order.clientOrderId } : {}),
      };
    }

    return {
      a: index,
      b: order.side === "LONG",
      p: price,
      s: size,
      r: order.reduceOnly,
      // "market" here means an aggressive IOC that crosses the book; "limit"
      // means post-only, which is the only way a resting entry makes sense.
      t: { limit: { tif: order.kind === "market" ? "Ioc" : "Alo" } },
      ...(order.clientOrderId ? { c: order.clientOrderId } : {}),
    };
  }

  async cancel(
    orders: readonly { symbol: string; orderId: number }[],
    signal?: AbortSignal,
  ): Promise<void> {
    if (this.#exchange === undefined || orders.length === 0) return;
    await this.#exchange.cancelOrders(
      orders.map((order) => ({ asset: this.#directory.resolve(order.symbol).index, oid: order.orderId })),
      signal,
    );
  }

  async setLeverage(
    symbol: string,
    leverage: number,
    isCross: boolean,
    signal?: AbortSignal,
  ): Promise<void> {
    if (this.#exchange === undefined) return;
    await this.#exchange.updateLeverage(
      this.#directory.resolve(symbol).index,
      leverage,
      isCross,
      signal,
    );
  }

  async markPrice(symbol: string, signal?: AbortSignal): Promise<string> {
    try {
      const { contexts, meta } = await this.#info.metaAndAssetCtxs(signal);
      const index = meta.universe.findIndex((asset) => asset.name === symbol);
      const context = index >= 0 ? contexts[index] : undefined;
      if (context?.markPx !== undefined) {
        this.#marks.set(symbol, context.markPx);
        return context.markPx;
      }
    } catch (error) {
      const cached = this.#marks.get(symbol);
      if (cached !== undefined) return cached;
      throw error;
    }

    const cached = this.#marks.get(symbol);
    if (cached !== undefined) return cached;
    throw new Error(`no mark price available for ${symbol}`);
  }
}
