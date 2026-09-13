/**
 * The Hyperliquid `/info` endpoint — read-only exchange truth.
 *
 * Everything the executor believes about a position ultimately comes from here
 * or from the WebSocket feed. Constitution Art. XI §42: reality is updated only
 * through observation, so these reads are the only thing that may confirm an
 * action took effect.
 */
import type { HttpTransport } from "./transport.js";
import { TransportError } from "./transport.js";
import type { Address } from "./keys.js";
import type {
  ClearinghouseState,
  MetaResponse,
  OpenOrder,
  OrderStatusResponse,
  PerpAssetCtx,
  UserFill,
  AssetMeta,
  Candle,
  CandleInterval,
} from "./types.js";
import { MAINNET_API, TESTNET_API } from "./types.js";
import type { HyperliquidNetwork } from "./signing.js";

export interface InfoClientOptions {
  readonly network: HyperliquidNetwork;
  readonly transport: HttpTransport;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
}

/**
 * Resolves a symbol to the asset index the wire uses, and caches the metadata
 * that price and size formatting depend on.
 */
export class AssetDirectory {
  readonly #byName = new Map<string, { index: number; meta: AssetMeta }>();

  constructor(universe: readonly AssetMeta[]) {
    for (const [index, meta] of universe.entries()) this.#byName.set(meta.name, { index, meta });
  }

  has(symbol: string): boolean {
    return this.#byName.has(symbol);
  }

  /** @throws {RangeError} when the symbol is not listed — never guesses an index. */
  resolve(symbol: string): { readonly index: number; readonly meta: AssetMeta } {
    const entry = this.#byName.get(symbol);
    if (!entry) throw new RangeError(`unknown Hyperliquid asset: ${symbol}`);
    return entry;
  }

  get symbols(): readonly string[] {
    return [...this.#byName.keys()].sort();
  }

  /** Symbols that are listed and not delisted — the only ones safe to trade. */
  get tradableSymbols(): readonly string[] {
    return [...this.#byName.entries()]
      .filter(([, entry]) => entry.meta.isDelisted !== true)
      .map(([name]) => name)
      .sort();
  }
}

export class InfoClient {
  readonly #transport: HttpTransport;
  readonly #url: string;
  readonly #timeoutMs: number;

  constructor(options: InfoClientOptions) {
    this.#transport = options.transport;
    const base = options.baseUrl ?? (options.network === "testnet" ? TESTNET_API : MAINNET_API);
    this.#url = `${base.replace(/\/$/, "")}/info`;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
  }

  async #post<T>(body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const result = await this.#transport({
      url: this.#url,
      body,
      timeoutMs: this.#timeoutMs,
      ...(signal ? { signal } : {}),
    });
    if (result === null || typeof result !== "object") {
      throw new TransportError(`unexpected /info response for ${String(body["type"])}`, "malformed");
    }
    return result as T;
  }

  async meta(signal?: AbortSignal): Promise<MetaResponse> {
    return this.#post<MetaResponse>({ type: "meta" }, signal);
  }

  async assetDirectory(signal?: AbortSignal): Promise<AssetDirectory> {
    const meta = await this.meta(signal);
    if (!Array.isArray(meta.universe)) {
      throw new TransportError("meta response has no universe", "malformed");
    }
    return new AssetDirectory(meta.universe);
  }

  /** The authoritative account and position state. */
  async clearinghouseState(user: Address, signal?: AbortSignal): Promise<ClearinghouseState> {
    return this.#post<ClearinghouseState>({ type: "clearinghouseState", user }, signal);
  }

  async openOrders(user: Address, signal?: AbortSignal): Promise<readonly OpenOrder[]> {
    const result = await this.#post<readonly OpenOrder[] | Record<string, never>>(
      { type: "frontendOpenOrders", user },
      signal,
    );
    return Array.isArray(result) ? result : [];
  }

  async userFills(user: Address, signal?: AbortSignal): Promise<readonly UserFill[]> {
    const result = await this.#post<readonly UserFill[]>({ type: "userFills", user }, signal);
    return Array.isArray(result) ? result : [];
  }

  async userFillsByTime(
    user: Address,
    startTime: number,
    signal?: AbortSignal,
  ): Promise<readonly UserFill[]> {
    const result = await this.#post<readonly UserFill[]>(
      { type: "userFillsByTime", user, startTime },
      signal,
    );
    return Array.isArray(result) ? result : [];
  }

  /** Looks up one order by exchange id or client order id. */
  async orderStatus(
    user: Address,
    oid: number | `0x${string}`,
    signal?: AbortSignal,
  ): Promise<OrderStatusResponse> {
    return this.#post<OrderStatusResponse>({ type: "orderStatus", user, oid }, signal);
  }

  /** Mark/oracle/mid prices for every perp, aligned with `meta().universe`. */
  async metaAndAssetCtxs(
    signal?: AbortSignal,
  ): Promise<{ meta: MetaResponse; contexts: readonly PerpAssetCtx[] }> {
    const result = await this.#post<[MetaResponse, readonly PerpAssetCtx[]]>(
      { type: "metaAndAssetCtxs" },
      signal,
    );
    if (!Array.isArray(result) || result.length < 2) {
      throw new TransportError("malformed metaAndAssetCtxs response", "malformed");
    }
    return { meta: result[0], contexts: result[1] };
  }

  /**
   * Historical candles.
   *
   * The exchange caps how many it returns per call, so a long range must be
   * walked in windows — see `scripts/collect-candles.mjs`, which does exactly
   * that and is the intended way to assemble a dataset.
   *
   * This is the one read that is genuinely historical. Everything else on this
   * client describes the present.
   */
  async candleSnapshot(
    coin: string,
    interval: CandleInterval,
    startTime: number,
    endTime?: number,
    signal?: AbortSignal,
  ): Promise<readonly Candle[]> {
    const result = await this.#post<readonly Candle[]>(
      {
        type: "candleSnapshot",
        req: { coin, interval, startTime, ...(endTime !== undefined ? { endTime } : {}) },
      },
      signal,
    );
    return Array.isArray(result) ? result : [];
  }

  /** Mid prices by symbol. A cheap liveness probe as well as a price source. */
  async allMids(signal?: AbortSignal): Promise<Readonly<Record<string, string>>> {
    return this.#post<Record<string, string>>({ type: "allMids" }, signal);
  }
}
