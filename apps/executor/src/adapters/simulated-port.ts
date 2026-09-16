/**
 * Paper and dry-run exchange ports.
 *
 * Both exist so a complete trade lifecycle — entry, threshold crossing, exit,
 * verification, reconciliation — can be exercised without risking money, and
 * both are structurally incapable of reaching the exchange: neither holds a
 * signing key, and neither has a network path to `/exchange`.
 *
 * - **Dry run** refuses every write and reports exactly what it would have
 *   sent. Positions never open, so nothing ever needs closing.
 * - **Paper** maintains a simulated position book against real (or scripted)
 *   prices, filling marketable orders immediately. It is the mode that can
 *   demonstrate the hard exit end to end.
 */
import type {
  AccountStateView,
  AssetInfo,
  ExchangePort,
  ExchangePositionView,
  FillView,
  OpenOrderView,
  PlacedOrder,
  Side,
  SubmissionOutcome,
} from "@orb/trade-executor";

/** Where a simulated port gets its prices. */
export type PriceSource = (symbol: string) => Promise<string>;

export interface SimulatedPortOptions {
  readonly assets: readonly AssetInfo[];
  readonly priceSource: PriceSource;
  readonly startingBalanceUsd: number;
  readonly account?: string;
  readonly now?: () => number;
  /** Fraction of notional charged per fill, matching a taker fee. */
  readonly feeFraction?: number;
  /**
   * Hourly funding rate as a fraction of notional, charged to longs when
   * positive. Hyperliquid settles funding hourly into the account balance, so
   * modelling it is the only way to validate a hold measured in hours.
   */
  readonly hourlyFundingRate?: number;
}

interface SimPosition {
  symbol: string;
  side: Side;
  size: number;
  entryPrice: number;
  leverage: number;
  openedAt: number;
  /** Funding paid (positive) or received (negative) since the position opened. */
  fundingPaid?: number;
  /** When funding was last accrued, so accrual is not double counted. */
  fundingAccruedAt?: number;
}

/**
 * A paper exchange.
 *
 * Fills are immediate and at the reference price: this simulates *position
 * management*, not microstructure. Slippage and queue position are not
 * modelled, and a paper result should never be read as an execution estimate.
 */
export class PaperExchangePort implements ExchangePort {
  readonly #assets = new Map<string, AssetInfo>();
  readonly #priceSource: PriceSource;
  readonly #now: () => number;
  readonly #feeFraction: number;
  readonly #hourlyFundingRate: number;

  readonly #positions = new Map<string, SimPosition>();
  readonly #restingOrders = new Map<number, PlacedOrder & { orderId: number }>();
  readonly #fills: FillView[] = [];

  #balance: number;
  #nextOrderId = 1_000;
  readonly account: string;
  readonly canTrade = true;

  /** Set to make the next `submit` fail, to exercise the failure paths. */
  failNextSubmit: string | null = null;
  /** Set to make `accountState` throw, to exercise "exchange unreachable". */
  unreachable = false;
  /** Fills only this fraction of each close, to exercise partial fills. */
  partialFillFraction = 1;

  constructor(options: SimulatedPortOptions) {
    for (const asset of options.assets) this.#assets.set(asset.symbol, asset);
    this.#priceSource = options.priceSource;
    this.#now = options.now ?? (() => Date.now());
    this.#feeFraction = options.feeFraction ?? 0.00045;
    this.#hourlyFundingRate = options.hourlyFundingRate ?? 0;
    this.#balance = options.startingBalanceUsd;
    this.account = options.account ?? "0xpaper000000000000000000000000000000000000";
  }

  assetInfo(symbol: string): AssetInfo | undefined {
    return this.#assets.get(symbol);
  }

  tradableSymbols(): readonly string[] {
    return [...this.#assets.values()].filter((a) => !a.isDelisted).map((a) => a.symbol).sort();
  }

  /** Opens a position directly. Used to set up a restart or reconciliation test. */
  seedPosition(position: SimPosition): void {
    this.#positions.set(position.symbol, { ...position });
  }

  /**
   * Accrues funding up to now, in whole hours.
   *
   * Charged against the balance, not against unrealized PnL — which is what the
   * real exchange does, and the reason a position's price PnL and its true
   * economic result diverge over a long hold.
   */
  #accrueFunding(position: SimPosition): void {
    if (this.#hourlyFundingRate === 0) return;
    const now = this.#now();
    const since = position.fundingAccruedAt ?? position.openedAt;
    const hours = Math.floor((now - since) / 3_600_000);
    if (hours < 1) return;

    const sign = position.side === "LONG" ? 1 : -1;
    const charge = sign * hours * this.#hourlyFundingRate * position.entryPrice * position.size;
    position.fundingPaid = (position.fundingPaid ?? 0) + charge;
    position.fundingAccruedAt = since + hours * 3_600_000;
    this.#balance -= charge;
  }

  async accountState(): Promise<AccountStateView> {
    if (this.unreachable) throw new Error("paper exchange is unreachable");

    const positions: ExchangePositionView[] = [];
    let marginUsed = 0;
    let unrealized = 0;

    for (const position of this.#positions.values()) {
      this.#accrueFunding(position);
      const mark = Number.parseFloat(await this.#priceSource(position.symbol));
      const sign = position.side === "LONG" ? 1 : -1;
      const pnl = sign * (mark - position.entryPrice) * position.size;
      const notional = position.entryPrice * position.size;
      const margin = notional / Math.max(position.leverage, 1);
      marginUsed += margin;
      unrealized += pnl;

      positions.push({
        symbol: position.symbol,
        side: position.side,
        size: String(position.size),
        entryPrice: String(position.entryPrice),
        unrealizedPnl: String(pnl),
        marginUsed: String(margin),
        liquidationPrice: null,
        leverage: position.leverage,
        positionValue: String(mark * position.size),
        ...(this.#hourlyFundingRate !== 0
          ? { fundingSinceOpen: String(position.fundingPaid ?? 0) }
          : {}),
      });
    }

    const accountValue = this.#balance + unrealized;
    return {
      accountValue: String(accountValue),
      totalMarginUsed: String(marginUsed),
      withdrawable: String(Math.max(accountValue - marginUsed, 0)),
      positions,
      observedAt: this.#now(),
    };
  }

  async openOrders(): Promise<readonly OpenOrderView[]> {
    return [...this.#restingOrders.values()].map((order) => ({
      symbol: order.symbol,
      orderId: order.orderId,
      ...(order.clientOrderId ? { clientOrderId: order.clientOrderId } : {}),
      reduceOnly: order.reduceOnly,
      size: order.size,
      isTrigger: order.kind === "stop_market",
    }));
  }

  async fillsSince(since: number): Promise<readonly FillView[]> {
    return this.#fills.filter((fill) => fill.at >= since);
  }

  async submit(orders: readonly PlacedOrder[]): Promise<readonly SubmissionOutcome[]> {
    if (this.failNextSubmit !== null) {
      const reason = this.failNextSubmit;
      this.failNextSubmit = null;
      throw new Error(reason);
    }

    const outcomes: SubmissionOutcome[] = [];
    for (const order of orders) outcomes.push(await this.#fill(order));
    return outcomes;
  }

  async #fill(order: PlacedOrder): Promise<SubmissionOutcome> {
    const asset = this.#assets.get(order.symbol);
    if (!asset) return { kind: "rejected", reason: `unknown asset ${order.symbol}` };

    // A stop order rests until triggered; it does not fill now.
    if (order.kind === "stop_market") {
      const orderId = this.#nextOrderId++;
      this.#restingOrders.set(orderId, { ...order, orderId });
      return { kind: "resting", orderId };
    }

    const existing = this.#positions.get(order.symbol);

    if (order.reduceOnly) {
      // Reduce-only with nothing to reduce is rejected, exactly as the exchange
      // would — this is the guarantee that a close can never open a position.
      if (!existing) return { kind: "rejected", reason: "reduce-only order with no position" };
      if (existing.side === order.side) {
        return { kind: "rejected", reason: "reduce-only order would increase the position" };
      }
    }

    const price = Number.parseFloat(await this.#priceSource(order.symbol));
    const requested = Number.parseFloat(order.size);
    const orderId = this.#nextOrderId++;

    if (order.reduceOnly && existing) {
      this.#accrueFunding(existing);
      const fillable = Math.min(requested, existing.size) * this.partialFillFraction;
      const size = roundDown(fillable, asset.szDecimals);
      if (!(size > 0)) return { kind: "rejected", reason: "reduce-only fill rounds to zero" };

      const sign = existing.side === "LONG" ? 1 : -1;
      const pnl = sign * (price - existing.entryPrice) * size;
      const fee = price * size * this.#feeFraction;
      this.#balance += pnl - fee;

      existing.size = roundDown(existing.size - size, asset.szDecimals);
      if (existing.size <= 0) this.#positions.delete(order.symbol);

      this.#record(order, size, price, fee, pnl, orderId);
      return {
        kind: "filled",
        orderId,
        filledSize: String(size),
        averagePrice: String(price),
        ...(order.clientOrderId ? { clientOrderId: order.clientOrderId } : {}),
      };
    }

    const size = roundDown(requested, asset.szDecimals);
    if (!(size > 0)) return { kind: "rejected", reason: "order size rounds to zero" };

    const fee = price * size * this.#feeFraction;
    this.#balance -= fee;

    if (existing && existing.side === order.side) {
      const totalSize = existing.size + size;
      existing.entryPrice = (existing.entryPrice * existing.size + price * size) / totalSize;
      existing.size = totalSize;
    } else {
      this.#positions.set(order.symbol, {
        symbol: order.symbol,
        side: order.side,
        size,
        entryPrice: price,
        // Leverage is set before the position exists, so it is held aside and
        // applied here — otherwise every position would open at 1x.
        leverage: this.#pendingLeverage.get(order.symbol) ?? existing?.leverage ?? 1,
        openedAt: this.#now(),
      });
    }

    this.#record(order, size, price, fee, 0, orderId);
    return {
      kind: "filled",
      orderId,
      filledSize: String(size),
      averagePrice: String(price),
      ...(order.clientOrderId ? { clientOrderId: order.clientOrderId } : {}),
    };
  }

  #record(
    order: PlacedOrder,
    size: number,
    price: number,
    fee: number,
    closedPnl: number,
    orderId: number,
  ): void {
    this.#fills.push({
      symbol: order.symbol,
      side: order.side,
      size: String(size),
      price: String(price),
      fee: String(fee),
      closedPnl: String(closedPnl),
      orderId,
      ...(order.clientOrderId ? { clientOrderId: order.clientOrderId } : {}),
      at: this.#now(),
      isLiquidation: false,
      tradeId: orderId,
    });
  }

  async cancel(orders: readonly { symbol: string; orderId: number }[]): Promise<void> {
    for (const order of orders) this.#restingOrders.delete(order.orderId);
  }

  readonly #pendingLeverage = new Map<string, number>();

  async setLeverage(symbol: string, leverage: number): Promise<void> {
    const position = this.#positions.get(symbol);
    if (position) position.leverage = leverage;
    this.#pendingLeverage.set(symbol, leverage);
  }

  async markPrice(symbol: string): Promise<string> {
    return this.#priceSource(symbol);
  }

  /** Test and diagnostic view of the simulated book. */
  get balance(): number {
    return this.#balance;
  }

  get positionCount(): number {
    return this.#positions.size;
  }
}

/**
 * A dry-run port.
 *
 * Reads are real; every write is refused and reported. Nothing can open, so
 * nothing can need closing — which makes this the safe default mode.
 */
export class DryRunExchangePort implements ExchangePort {
  readonly #inner: ExchangePort;
  readonly #onWouldSubmit: (orders: readonly PlacedOrder[]) => void;
  readonly canTrade = false;

  constructor(inner: ExchangePort, onWouldSubmit: (orders: readonly PlacedOrder[]) => void) {
    this.#inner = inner;
    this.#onWouldSubmit = onWouldSubmit;
  }

  get account(): string {
    return this.#inner.account;
  }

  assetInfo(symbol: string): AssetInfo | undefined {
    return this.#inner.assetInfo(symbol);
  }
  tradableSymbols(): readonly string[] {
    return this.#inner.tradableSymbols();
  }
  accountState(signal?: AbortSignal): Promise<AccountStateView> {
    return this.#inner.accountState(signal);
  }
  openOrders(signal?: AbortSignal): Promise<readonly OpenOrderView[]> {
    return this.#inner.openOrders(signal);
  }
  fillsSince(since: number, signal?: AbortSignal): Promise<readonly FillView[]> {
    return this.#inner.fillsSince(since, signal);
  }
  markPrice(symbol: string, signal?: AbortSignal): Promise<string> {
    return this.#inner.markPrice(symbol, signal);
  }

  async submit(orders: readonly PlacedOrder[]): Promise<readonly SubmissionOutcome[]> {
    this.#onWouldSubmit(orders);
    return orders.map(() => ({
      kind: "rejected" as const,
      reason: "dry run: no order was sent to the exchange",
    }));
  }

  async cancel(): Promise<void> {
    // Nothing was ever placed.
  }

  async setLeverage(): Promise<void> {
    // A dry run never changes account settings either.
  }
}

function roundDown(value: number, decimals: number): number {
  const factor = 10 ** Math.min(Math.max(decimals, 0), 12);
  return Math.floor(value * factor + 1e-9) / factor;
}
