/**
 * The trade executor.
 *
 * The imperative shell around a functional core. It owns three authorities that
 * the signal provider does not have and can never acquire:
 *
 *   **Risk authority**  — whether a position may be opened at all.
 *   **Position authority** — what the executor believes is open, reconciled
 *                          continuously against the exchange.
 *   **Exit authority**  — when a position closes. A signal cannot request an
 *                          exit, cannot defer one, and cannot raise a threshold.
 *
 * A signal is an entry intent. That is the whole of its power.
 *
 * ## The hard exit critical path
 *
 * On a mark-price tick the path from observation to order is deliberately
 * short, and deliberately free of anything that can block:
 *
 *   tick -> sentinel.evaluate (pure)   -> registry.claimExit (synchronous CAS)
 *        -> submit reduce-only close
 *
 * The audit record is *enqueued* synchronously — an array push, O(1), no I/O —
 * and becomes durable asynchronously. Nothing waits on a disk write, a network
 * round trip, or a projection rebuild before the order goes out. That ordering
 * is safe because durability of the intent is not what protects us: the
 * exchange is, and a restart reconciles against it.
 */
import type {
  AccountStateView,
  AuditSink,
  Clock,
  ExchangePort,
  FillView,
  MarketDataPort,
  MarkPriceTick,
} from "./ports.js";
import type { RiskConfig } from "./risk/config.js";
import { validateRiskConfig } from "./risk/config.js";
import type { TradeSignal } from "./signal/model.js";
import { validateSignal, type Rejection, type ValidationResult } from "./signal/validate.js";
import { preflightEntry, validateEntry, type EntryContext } from "./risk/entry-guards.js";
import { evaluateHardExit, type RiskSnapshot } from "./risk/sentinel.js";
import { protectiveStopPrice } from "./risk/stop-price.js";
import type { ExitReason, ManagedPosition } from "./position/model.js";
import { isTerminal, requiresMonitoring } from "./position/model.js";
import { PositionRegistry, newPosition, type ClaimOutcome } from "./position/registry.js";
import { entryOrder, protectiveStopOrder } from "./execution/order-plan.js";
import { closePosition } from "./execution/closer.js";
import { reconcile, type ReconciliationResult } from "./reconcile/reconciler.js";
import { KillSwitch } from "./kill-switch.js";
import {
  entryClientOrderId,
  protectiveClientOrderId,
  tradeIdForSignal,
} from "./identity.js";

export interface ExecutorDependencies {
  readonly exchange: ExchangePort;
  readonly marketData: MarketDataPort;
  readonly audit: AuditSink;
  readonly killSwitch: KillSwitch;
  readonly config: RiskConfig;
  readonly now?: Clock;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly setInterval?: (fn: () => void, ms: number) => unknown;
  readonly clearInterval?: (handle: unknown) => void;
}

export interface SubmitResult {
  readonly accepted: boolean;
  readonly tradeId?: string;
  readonly signalId?: string;
  readonly rejection?: Rejection;
}

/** What the health endpoint reports. Never contains a secret. */
export interface ExecutorStatus {
  readonly running: boolean;
  readonly degraded: boolean;
  readonly degradedReason?: string;
  readonly killSwitch: { readonly engaged: boolean; readonly reason: string };
  readonly feedHealthy: boolean;
  readonly feedStalenessMs: number;
  readonly account: string;
  readonly canTrade: boolean;
  readonly positions: readonly {
    readonly tradeId: string;
    readonly symbol: string;
    readonly side: string;
    readonly state: string;
    readonly size: string;
    readonly entryPrice: string;
    readonly exitReason?: ExitReason;
    readonly discrepancies: number;
    readonly protectedOnExchange: boolean;
  }[];
  readonly lastReconciliation?: {
    readonly at: number;
    readonly reachable: boolean;
    readonly discrepancies: number;
  };
  readonly hardExit: {
    readonly maxLossFraction: number;
    readonly basis: string;
    readonly maxLossUsd?: number;
    readonly exchangeProtectiveStop: boolean;
  };
}

export class TradeExecutor {
  readonly #exchange: ExchangePort;
  readonly #marketData: MarketDataPort;
  readonly #audit: AuditSink;
  readonly #killSwitch: KillSwitch;
  readonly #config: RiskConfig;
  readonly #now: Clock;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #setInterval: (fn: () => void, ms: number) => unknown;
  readonly #clearInterval: (handle: unknown) => void;

  readonly registry = new PositionRegistry();

  #running = false;
  #degraded = false;
  #degradedReason: string | undefined;
  #reconcileTimer: unknown = null;
  #unsubscribe: (() => void)[] = [];
  #lastReconciliation: ReconciliationResult | undefined;

  /** Account facts the sentinel needs but a price tick does not carry. */
  #accountValue = 0;
  #freeMargin = 0;
  /** In-flight close lifecycles, so shutdown can wait for them. */
  readonly #closing = new Map<string, Promise<void>>();

  constructor(deps: ExecutorDependencies) {
    this.#exchange = deps.exchange;
    this.#marketData = deps.marketData;
    this.#audit = deps.audit;
    this.#killSwitch = deps.killSwitch;
    this.#config = validateRiskConfig(deps.config);
    this.#now = deps.now ?? (() => Date.now());
    this.#sleep = deps.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    this.#setInterval = deps.setInterval ?? ((fn, ms) => setInterval(fn, ms));
    this.#clearInterval = deps.clearInterval ?? ((handle) => clearInterval(handle as never));
  }

  get config(): RiskConfig {
    return this.#config;
  }

  get degraded(): boolean {
    return this.#degraded;
  }

  /* ================================================================== *
   * Lifecycle
   * ================================================================== */

  /**
   * Starts the executor.
   *
   * Order matters and is not negotiable: load the kill switch, reconcile
   * against the exchange, resume monitoring on whatever is actually open, and
   * only then evaluate risk on every rediscovered position — before accepting a
   * single new signal. A restart must never leave a position unmonitored, and
   * must never wait for the next tick to notice a threshold that is already
   * breached.
   */
  async start(): Promise<void> {
    if (this.#running) return;
    this.#running = true;

    this.#audit.record({ stage: "EXECUTOR_STARTED", at: this.#now(), tradeId: "executor" });

    // 1. Kill switch first: it may forbid everything that follows.
    await this.#killSwitch.load();

    // 2. Discover what is actually open.
    const result = await this.#reconcileNow();

    // 3. Attach monitoring before anything else can happen.
    this.#marketData.start();
    this.#unsubscribe.push(
      this.#marketData.onMarkPrice((tick) => this.#onMarkPrice(tick)),
      this.#marketData.onFill((fill) => this.#onFill(fill)),
      this.#marketData.onHealth((healthy, reason) => void this.#onFeedHealth(healthy, reason)),
    );
    for (const position of this.registry.live()) {
      this.#attachMonitoring(position);
    }

    // 4. Evaluate the hard threshold on every rediscovered position immediately.
    //    A position that breached while we were down must close now, not on the
    //    next tick that happens to arrive.
    await this.#evaluateAllNow();

    // 5. Only now is it safe to run on a schedule.
    this.#reconcileTimer = this.#setInterval(() => {
      void this.#reconcileNow().then(() => this.#evaluateAllNow());
    }, this.#config.execution.reconciliationIntervalMs);

    if (!result.exchangeReachable) {
      await this.#enterDegraded("could not reach the exchange at startup");
    }

    // 6. A kill switch that was engaged when we went down still applies.
    if (this.#killSwitch.engaged && this.#config.safety.killSwitchPolicy === "CLOSE_ALL") {
      await this.closeAll("KILL_SWITCH", "kill switch was engaged at startup");
    }
  }

  async stop(): Promise<void> {
    if (!this.#running) return;
    this.#running = false;

    if (this.#reconcileTimer !== null) this.#clearInterval(this.#reconcileTimer);
    this.#reconcileTimer = null;
    for (const unsubscribe of this.#unsubscribe) unsubscribe();
    this.#unsubscribe = [];
    this.#marketData.stop();

    // Never abandon a close that is already working.
    await Promise.allSettled([...this.#closing.values()]);

    this.#audit.record({ stage: "EXECUTOR_STOPPED", at: this.#now(), tradeId: "executor" });
    await this.#audit.flush();
  }

  /* ================================================================== *
   * Entry — the only thing a signal can ask for
   * ================================================================== */

  /**
   * Handles an untrusted signal payload end to end.
   *
   * Validation, risk, sizing and submission. A signal that fails any guard is
   * recorded with a deterministic reason and never reaches the exchange.
   */
  async submitSignal(payload: unknown): Promise<SubmitResult> {
    const at = this.#now();

    const parsed: ValidationResult = validateSignal(payload, {
      now: at,
      maxAgeMs: this.#config.entry.maxSignalAgeMs,
      maxClockSkewMs: this.#config.entry.maxClockSkewMs,
    });

    this.#audit.record({
      stage: "SIGNAL_RECEIVED",
      at,
      tradeId: parsed.ok ? tradeIdForSignal(parsed.signal.signalId) : "unidentified",
      ...(parsed.ok
        ? { signalId: parsed.signal.signalId, symbol: parsed.signal.symbol, side: parsed.signal.side }
        : parsed.signalId !== undefined
          ? { signalId: parsed.signalId }
          : {}),
    });

    if (!parsed.ok) return this.#rejectSignal(parsed);
    return this.#openPosition(parsed.signal);
  }

  #rejectSignal(rejection: Rejection): SubmitResult {
    this.#audit.record({
      stage: "SIGNAL_REJECTED",
      at: this.#now(),
      tradeId: rejection.signalId ? tradeIdForSignal(rejection.signalId) : "unidentified",
      ...(rejection.signalId !== undefined ? { signalId: rejection.signalId } : {}),
      rejectionReason: rejection.reason,
      error: rejection.detail,
    });
    return {
      accepted: false,
      rejection,
      ...(rejection.signalId !== undefined ? { signalId: rejection.signalId } : {}),
    };
  }

  async #openPosition(signal: TradeSignal): Promise<SubmitResult> {
    const tradeId = tradeIdForSignal(signal.signalId);

    /* -- Reserve the signal id before anything else. --------------------
     * Synchronous, so two concurrent deliveries of the same signal cannot
     * both proceed. Released again only if the entry never happens. */
    if (!this.registry.reserveSignal(signal.signalId)) {
      return this.#rejectSignal({
        ok: false,
        reason: "DUPLICATE_SIGNAL",
        detail: `signal ${signal.signalId} has already been processed`,
        signalId: signal.signalId,
      });
    }

    /* -- Guards that need no market data run before any network call. ----
     * A signal for a symbol we do not trade must be refused as such, not as a
     * pricing failure, and must not cost a round trip to the exchange. */
    const preflight = preflightEntry(signal, this.#config.entry, {
      asset: this.#exchange.assetInfo(signal.symbol),
      alreadyProcessed: false, // reserved above
      killSwitchEngaged: this.#killSwitch.engaged,
      degraded: this.#degraded,
      entriesSuspended: !this.#running,
    });
    if (preflight !== null) {
      this.registry.releaseSignal(signal.signalId);
      return this.#rejectSignal(preflight);
    }

    let account: AccountStateView;
    let referencePrice: number;
    try {
      [account, referencePrice] = await Promise.all([
        this.#exchange.accountState(),
        this.#exchange.markPrice(signal.symbol).then(Number.parseFloat),
      ]);
      this.#accountValue = Number.parseFloat(account.accountValue);
      this.#freeMargin = Number.parseFloat(account.withdrawable);
    } catch (error) {
      this.registry.releaseSignal(signal.signalId);
      return this.#rejectSignal({
        ok: false,
        reason: "RISK_LIMIT_EXCEEDED",
        detail: `cannot read exchange state: ${describe(error)}`,
        signalId: signal.signalId,
      });
    }

    const context: EntryContext = {
      asset: this.#exchange.assetInfo(signal.symbol),
      referencePrice,
      accountValue: this.#accountValue,
      freeMarginUsd: this.#freeMargin,
      openPositions: this.registry
        .live()
        .map((p) => ({ symbol: p.symbol, side: p.side, state: p.state })),
      alreadyProcessed: false, // already reserved above
      killSwitchEngaged: this.#killSwitch.engaged,
      degraded: this.#degraded,
      entriesSuspended: !this.#running,
    };

    const decision = validateEntry(signal, this.#config.entry, context);
    if (!decision.ok) {
      this.registry.releaseSignal(signal.signalId);
      return this.#rejectSignal(decision);
    }

    this.#audit.record({
      stage: "SIGNAL_VALIDATED",
      at: this.#now(),
      tradeId,
      signalId: signal.signalId,
      symbol: signal.symbol,
      side: signal.side,
      size: decision.size,
      price: String(referencePrice),
      detail: {
        notionalUsd: decision.notionalUsd,
        leverage: decision.leverage,
        setupId: signal.setupId,
        // Recorded so the trade can be analysed against the provider's intent.
        // Never read by any decision path.
        advisoryStop: signal.advisoryStop ?? null,
        advisoryTarget: signal.advisoryTarget ?? null,
      },
    });

    /* -- Place the entry ------------------------------------------------- */

    const clientOrderId = entryClientOrderId(signal.signalId);
    const asset = context.asset!;

    this.registry.open(
      newPosition({
        tradeId,
        symbol: signal.symbol,
        side: signal.side,
        state: "PENDING_ENTRY",
        openedAt: this.#now(),
        leverage: decision.leverage,
        signal,
        entryClientOrderId: clientOrderId,
      }),
    );

    try {
      if (decision.leverage > 1) {
        await this.#exchange.setLeverage(signal.symbol, decision.leverage, true);
      }
    } catch (error) {
      // Leverage is a precondition, not the trade. Failing to set it means we
      // would open at the wrong size-to-margin ratio, so refuse.
      this.registry.transition(signal.symbol, "ENTRY_REJECTED", { closedAt: this.#now() });
      this.#audit.record({
        stage: "ENTRY_FAILED",
        at: this.#now(),
        tradeId,
        signalId: signal.signalId,
        symbol: signal.symbol,
        error: `could not set leverage: ${describe(error)}`,
      });
      return { accepted: false, tradeId, signalId: signal.signalId };
    }

    const limitPrice =
      decision.signal.entry.kind === "LIMIT"
        ? Number.parseFloat(decision.signal.entry.price)
        : decision.slippageLimitPrice;

    const order = entryOrder({
      symbol: signal.symbol,
      side: signal.side,
      size: decision.size,
      limitPrice,
      clientOrderId,
      precision: { szDecimals: asset.szDecimals },
      postOnly: decision.signal.entry.kind === "LIMIT",
    });

    this.#audit.record({
      stage: "ENTRY_SUBMITTED",
      at: this.#now(),
      tradeId,
      signalId: signal.signalId,
      symbol: signal.symbol,
      side: signal.side,
      size: order.size,
      price: order.price,
      clientOrderId,
    });

    let outcome;
    try {
      [outcome] = await this.#exchange.submit([order]);
    } catch (error) {
      // We do not know whether this landed. Reconcile rather than guess; the
      // deterministic cloid means a retry cannot double the position.
      this.#audit.record({
        stage: "ENTRY_FAILED",
        at: this.#now(),
        tradeId,
        signalId: signal.signalId,
        symbol: signal.symbol,
        error: `entry submission failed: ${describe(error)}`,
      });
      await this.#reconcileNow();
      const after = this.registry.get(signal.symbol);
      if (after && !isTerminal(after.state)) {
        this.#attachMonitoring(after);
        return { accepted: true, tradeId, signalId: signal.signalId };
      }
      return { accepted: false, tradeId, signalId: signal.signalId };
    }

    if (!outcome || outcome.kind === "rejected") {
      const reason = outcome?.kind === "rejected" ? outcome.reason : "no outcome returned";
      this.registry.transition(signal.symbol, "ENTRY_REJECTED", { closedAt: this.#now() });
      this.#audit.record({
        stage: "ENTRY_FAILED",
        at: this.#now(),
        tradeId,
        signalId: signal.signalId,
        symbol: signal.symbol,
        error: reason,
      });
      return { accepted: false, tradeId, signalId: signal.signalId };
    }

    this.#audit.record({
      stage: "ENTRY_ACKNOWLEDGED",
      at: this.#now(),
      tradeId,
      signalId: signal.signalId,
      symbol: signal.symbol,
      ...(outcome.kind === "filled"
        ? { size: outcome.filledSize, price: outcome.averagePrice, orderId: outcome.orderId }
        : outcome.kind === "resting"
          ? { orderId: outcome.orderId }
          : {}),
      detail: { outcome: outcome.kind },
    });

    // An acknowledgement is not a position. Ask the exchange.
    await this.#confirmEntry(signal.symbol, tradeId);
    return { accepted: true, tradeId, signalId: signal.signalId };
  }

  /** Confirms the entry against exchange truth and begins monitoring. */
  async #confirmEntry(symbol: string, tradeId: string): Promise<void> {
    let account: AccountStateView;
    try {
      account = await this.#exchange.accountState();
    } catch {
      // Unknown, not failed. Reconciliation resolves it; meanwhile the position
      // stays PENDING_ENTRY and is still watched.
      return;
    }

    const actual = account.positions.find((position) => position.symbol === symbol);
    const local = this.registry.get(symbol);
    if (!local) return;

    if (!actual || !(Math.abs(Number.parseFloat(actual.size)) > 0)) {
      // Nothing opened. An IOC that did not cross is a normal, harmless outcome.
      if (local.state === "PENDING_ENTRY") {
        this.registry.transition(symbol, "ENTRY_REJECTED", { closedAt: this.#now() });
        this.#audit.record({
          stage: "ENTRY_FAILED",
          at: this.#now(),
          tradeId,
          symbol,
          error: "the exchange reports no position after entry",
        });
      }
      return;
    }

    this.#accountValue = Number.parseFloat(account.accountValue);
    this.#freeMargin = Number.parseFloat(account.withdrawable);

    const opened = this.registry.transition(symbol, "ENTRY_CONFIRMED", {
      size: actual.size,
      entryPrice: actual.entryPrice,
      leverage: actual.leverage > 0 ? actual.leverage : local.leverage,
      lastObservedAt: account.observedAt,
    });

    this.#audit.record({
      stage: "POSITION_OPEN",
      at: this.#now(),
      tradeId,
      symbol,
      side: opened.side,
      size: actual.size,
      price: actual.entryPrice,
    });

    this.#attachMonitoring(opened);
    await this.#placeProtectiveStop(opened, actual.marginUsed);

    // Evaluate immediately: a position can already be beyond its threshold by
    // the time it is confirmed, if entry slipped.
    await this.#evaluatePosition(symbol, Number.parseFloat(await this.#markOr(symbol, actual.entryPrice)));
  }

  async #markOr(symbol: string, fallback: string): Promise<string> {
    try {
      return await this.#exchange.markPrice(symbol);
    } catch {
      return fallback;
    }
  }

  /* ================================================================== *
   * Exchange-native protection
   * ================================================================== */

  /**
   * Rests a reduce-only stop-market order on the exchange.
   *
   * This is the layer that survives this process dying. It is placed slightly
   * wider than the local sentinel's threshold so the sentinel normally acts
   * first; the resting order is the backstop, not the primary control.
   *
   * Failing to place it is not fatal — the local sentinel still holds — but it
   * is recorded, because it means the protection is now single-layered.
   */
  async #placeProtectiveStop(position: ManagedPosition, marginUsed: string): Promise<void> {
    if (!this.#config.hardExit.exchangeProtectiveStop) return;

    const asset = this.#exchange.assetInfo(position.symbol);
    if (!asset) return;

    const trigger = protectiveStopPrice(
      {
        side: position.side,
        entryPrice: Number.parseFloat(position.entryPrice),
        size: Number.parseFloat(position.size),
        leverage: position.leverage,
        accountValue: this.#accountValue,
        marginUsed: Number.parseFloat(marginUsed),
      },
      this.#config.hardExit,
    );

    if (trigger === null) {
      this.#audit.record({
        stage: "PROTECTIVE_ORDER_FAILED",
        at: this.#now(),
        tradeId: position.tradeId,
        symbol: position.symbol,
        error: "no usable protective stop price for this position",
      });
      return;
    }

    try {
      const order = protectiveStopOrder({
        symbol: position.symbol,
        side: position.side,
        size: position.size,
        triggerPrice: trigger,
        precision: { szDecimals: asset.szDecimals },
        clientOrderId: protectiveClientOrderId(position.tradeId),
      });
      const [outcome] = await this.#exchange.submit([order]);

      if (outcome && (outcome.kind === "resting" || outcome.kind === "waiting")) {
        const orderId = outcome.kind === "resting" ? outcome.orderId : 0;
        this.registry.recordProtectiveOrder(position.symbol, {
          orderId,
          triggerPrice: order.triggerPrice ?? order.price,
          size: order.size,
          placedAt: this.#now(),
        });
        this.#audit.record({
          stage: "PROTECTIVE_ORDER_PLACED",
          at: this.#now(),
          tradeId: position.tradeId,
          symbol: position.symbol,
          size: order.size,
          price: order.triggerPrice ?? order.price,
          orderId,
        });
        return;
      }

      this.#audit.record({
        stage: "PROTECTIVE_ORDER_FAILED",
        at: this.#now(),
        tradeId: position.tradeId,
        symbol: position.symbol,
        error: outcome?.kind === "rejected" ? outcome.reason : "unexpected outcome",
      });
    } catch (error) {
      this.#audit.record({
        stage: "PROTECTIVE_ORDER_FAILED",
        at: this.#now(),
        tradeId: position.tradeId,
        symbol: position.symbol,
        error: describe(error),
      });
    }
  }

  /* ================================================================== *
   * Monitoring and the hard exit critical path
   * ================================================================== */

  #attachMonitoring(position: ManagedPosition): void {
    this.#marketData.watch(position.symbol);
    if (position.state === "OPEN") {
      this.registry.transition(position.symbol, "MONITORING_ATTACHED");
      this.#audit.record({
        stage: "MONITORING_STARTED",
        at: this.#now(),
        tradeId: position.tradeId,
        symbol: position.symbol,
      });
    }
  }

  /**
   * The critical path.
   *
   * Synchronous up to and including the exit claim. Only the order submission
   * is asynchronous, and nothing else is allowed in front of it.
   */
  #onMarkPrice(tick: MarkPriceTick): void {
    const position = this.registry.get(tick.symbol);
    if (!position || !requiresMonitoring(position.state)) return;

    const markPrice = Number.parseFloat(tick.markPrice);
    if (!(markPrice > 0)) return;

    const size = Number.parseFloat(position.size);
    const entryPrice = Number.parseFloat(position.entryPrice);
    if (!(size > 0) || !(entryPrice > 0)) return;

    const snapshot: RiskSnapshot = {
      symbol: position.symbol,
      side: position.side,
      size,
      entryPrice,
      markPrice,
      // marginUsed is derived rather than awaited: fetching it here would put a
      // network round trip on the critical path.
      marginUsed: (entryPrice * size) / Math.max(position.leverage, 1),
      accountValue: this.#accountValue,
      liquidationPrice: null,
      leverage: position.leverage,
      observedAt: tick.at,
    };

    const assessment = evaluateHardExit(snapshot, this.#config.hardExit);
    this.registry.observe(tick.symbol, { lastObservedAt: tick.at });
    if (!assessment.breached) return;

    // Threshold crossed. Claim, record, fire — in that order, and nothing else.
    const claim = this.registry.claimExit(tick.symbol, "HARD_RISK_EXIT", tick.at);

    this.#audit.record({
      stage: "HARD_THRESHOLD_CROSSED",
      at: tick.at,
      tradeId: position.tradeId,
      symbol: position.symbol,
      side: position.side,
      size: position.size,
      price: tick.markPrice,
      exitReason: "HARD_RISK_EXIT",
      risk: {
        rule: assessment.rule,
        measured: assessment.measured,
        threshold: assessment.threshold,
        basis: assessment.measurements.basis,
        markPrice: tick.markPrice,
        entryPrice: position.entryPrice,
        unrealizedPnl: String(assessment.measurements.unrealizedPnl),
      },
    });

    this.#beginExit(claim, position.symbol, "HARD_RISK_EXIT");
  }

  /**
   * Starts at most one closing lifecycle for a claim.
   *
   * Anything other than a fresh claim is recorded and dropped: an escalation
   * updates the reason on the existing lifecycle, and a duplicate trigger does
   * nothing at all.
   */
  #beginExit(claim: ClaimOutcome, symbol: string, reason: ExitReason): void {
    if (claim.kind === "escalated") {
      this.#audit.record({
        stage: "EXIT_SUPERSEDED",
        at: this.#now(),
        tradeId: this.registry.get(symbol)?.tradeId ?? "unknown",
        symbol,
        exitReason: claim.to,
        detail: { supersededReason: claim.from },
      });
      return;
    }
    if (claim.kind !== "claimed") return;

    const token = claim.token;
    this.#audit.record({
      stage: "EXIT_TRIGGERED",
      at: token.claimedAt,
      tradeId: token.tradeId,
      symbol,
      exitReason: reason,
    });

    if (this.#closing.has(symbol)) return;

    const work = (async () => {
      try {
        const outcome = await closePosition(
          {
            exchange: this.#exchange,
            registry: this.registry,
            audit: this.#audit,
            now: this.#now,
            limits: this.#config.execution,
            sleep: this.#sleep,
          },
          token,
        );

        const finalReason = this.registry.get(symbol)?.exitReason ?? reason;

        if (outcome.flat) {
          this.registry.transition(symbol, "VERIFIED_FLAT", {
            closedAt: this.#now(),
            ...(outcome.averagePrice !== undefined ? { exitPrice: outcome.averagePrice } : {}),
            ...(outcome.realizedPnl !== undefined ? { realizedPnl: outcome.realizedPnl } : {}),
            ...(outcome.fees !== undefined ? { fees: outcome.fees } : {}),
          });
          this.#audit.record({
            stage: "TRADE_CLOSED",
            at: this.#now(),
            tradeId: token.tradeId,
            symbol,
            exitReason: finalReason,
            ...(outcome.averagePrice !== undefined ? { price: outcome.averagePrice } : {}),
            ...(outcome.realizedPnl !== undefined ? { realizedPnl: outcome.realizedPnl } : {}),
            ...(outcome.fees !== undefined ? { fees: outcome.fees } : {}),
            size: outcome.closedSize,
            detail: { attempts: outcome.attempts },
          });
          this.#marketData.unwatch(symbol);
        } else {
          this.registry.transition(symbol, "CLOSE_EXHAUSTED", { lastObservedAt: this.#now() });
          this.#audit.record({
            stage: "EXIT_ATTEMPT_FAILED",
            at: this.#now(),
            tradeId: token.tradeId,
            symbol,
            exitReason: finalReason,
            error: outcome.error ?? "the position is still open",
            detail: { attempts: outcome.attempts, terminal: true },
          });
          // A failed exit is still an open position. Keep watching it and
          // reconcile, rather than treating it as finished.
          await this.#reconcileNow();
        }
      } catch (error) {
        this.#audit.record({
          stage: "EXIT_ATTEMPT_FAILED",
          at: this.#now(),
          tradeId: token.tradeId,
          symbol,
          error: describe(error),
        });
      } finally {
        this.#closing.delete(symbol);
      }
    })();

    this.#closing.set(symbol, work);
  }

  #onFill(fill: FillView): void {
    const position = this.registry.get(fill.symbol);
    if (!position) return;

    if (fill.isLiquidation) {
      // The exchange has already closed us. Record the reason honestly.
      const claim = this.registry.claimExit(fill.symbol, "LIQUIDATION", fill.at);
      this.#audit.record({
        stage: "EXIT_TRIGGERED",
        at: fill.at,
        tradeId: position.tradeId,
        symbol: fill.symbol,
        exitReason: "LIQUIDATION",
        size: fill.size,
        price: fill.price,
      });
      this.#beginExit(claim, fill.symbol, "LIQUIDATION");
      return;
    }

    this.#audit.record({
      stage: "PARTIAL_FILL",
      at: fill.at,
      tradeId: position.tradeId,
      symbol: fill.symbol,
      size: fill.size,
      price: fill.price,
      orderId: fill.orderId,
      realizedPnl: fill.closedPnl,
      fees: fill.fee,
      detail: { source: "feed" },
    });
  }

  async #onFeedHealth(healthy: boolean, reason: string): Promise<void> {
    if (healthy) {
      if (this.#degraded) await this.#resolveDegraded("the feed recovered");
      return;
    }

    this.#audit.record({
      stage: "MONITORING_LOST",
      at: this.#now(),
      tradeId: "executor",
      error: reason,
    });

    // Losing the feed with nothing open is an inconvenience. Losing it with a
    // position open is the scenario the failure policy exists for.
    if (this.registry.live().length === 0) return;

    // Try REST first: reconciliation may restore enough confidence to continue.
    const result = await this.#reconcileNow();
    if (result.exchangeReachable) {
      await this.#evaluateAllNow();
      return;
    }
    await this.#enterDegraded(`monitoring lost and the exchange is unreachable: ${reason}`);
  }

  /* ================================================================== *
   * Degraded state and the failure policy
   * ================================================================== */

  async #enterDegraded(reason: string): Promise<void> {
    if (this.#degraded) return;
    this.#degraded = true;
    this.#degradedReason = reason;

    this.#audit.record({
      stage: "DEGRADED_ENTERED",
      at: this.#now(),
      tradeId: "executor",
      error: reason,
      detail: { policy: this.#config.safety.degradedPolicy },
    });

    if (this.#config.safety.degradedPolicy === "CLOSE_ALL") {
      await this.closeAll("HARD_RISK_EXIT", `degraded: ${reason}`);
    }
  }

  async #resolveDegraded(reason: string): Promise<void> {
    if (!this.#degraded) return;
    this.#degraded = false;
    this.#degradedReason = undefined;
    this.#audit.record({
      stage: "DEGRADED_RESOLVED",
      at: this.#now(),
      tradeId: "executor",
      detail: { reason },
    });
  }

  /* ================================================================== *
   * Operator controls
   * ================================================================== */

  /**
   * Engages the kill switch.
   *
   * Entries stop immediately. Whether open positions are closed is the
   * configured policy, not a caller's choice — and the signal API has no route
   * to this method at all.
   */
  async engageKillSwitch(reason: string, source = "operator"): Promise<void> {
    const record = await this.#killSwitch.engage(reason, source);
    this.#audit.record({
      stage: "KILL_SWITCH_ENGAGED",
      at: record.at,
      tradeId: "executor",
      error: reason,
      detail: { source, policy: this.#config.safety.killSwitchPolicy },
    });
    if (this.#config.safety.killSwitchPolicy === "CLOSE_ALL") {
      await this.closeAll("KILL_SWITCH", reason);
    }
  }

  async releaseKillSwitch(reason: string, source = "operator"): Promise<void> {
    const record = await this.#killSwitch.release(reason, source);
    this.#audit.record({
      stage: "KILL_SWITCH_RELEASED",
      at: record.at,
      tradeId: "executor",
      detail: { source, reason },
    });
  }

  /** Closes one position under an explicit reason. Used by the operator API. */
  async closePositionNow(symbol: string, reason: ExitReason, detail: string): Promise<boolean> {
    const position = this.registry.get(symbol);
    if (!position || isTerminal(position.state)) return false;

    const claim = this.registry.claimExit(symbol, reason, this.#now());
    this.#audit.record({
      stage: "EXIT_TRIGGERED",
      at: this.#now(),
      tradeId: position.tradeId,
      symbol,
      exitReason: reason,
      detail: { requested: detail },
    });
    this.#beginExit(claim, symbol, reason);
    await this.#closing.get(symbol);
    return this.registry.get(symbol)?.state === "CLOSED";
  }

  /** Closes every open position, and waits for all of them. */
  async closeAll(reason: ExitReason, detail: string): Promise<void> {
    const symbols = this.registry.live().map((position) => position.symbol);
    for (const symbol of symbols) {
      const position = this.registry.get(symbol);
      if (!position || isTerminal(position.state)) continue;
      const claim = this.registry.claimExit(symbol, reason, this.#now());
      this.#audit.record({
        stage: "EXIT_TRIGGERED",
        at: this.#now(),
        tradeId: position.tradeId,
        symbol,
        exitReason: reason,
        detail: { requested: detail },
      });
      this.#beginExit(claim, symbol, reason);
    }
    await Promise.allSettled([...this.#closing.values()]);
  }

  /* ================================================================== *
   * Reconciliation
   * ================================================================== */

  async #reconcileNow(): Promise<ReconciliationResult> {
    const result = await reconcile({
      exchange: this.#exchange,
      registry: this.registry,
      audit: this.#audit,
      now: this.#now,
      defaultLeverage: 1,
    });
    this.#lastReconciliation = result;

    if (result.exchangeReachable) {
      try {
        const account = await this.#exchange.accountState();
        this.#accountValue = Number.parseFloat(account.accountValue);
        this.#freeMargin = Number.parseFloat(account.withdrawable);
      } catch {
        // Already reflected by the reconciliation result.
      }
      // An adopted position must be watched from the moment it is discovered.
      for (const symbol of result.adopted) {
        const position = this.registry.get(symbol);
        if (position) this.#attachMonitoring(position);
      }
    }
    return result;
  }

  /** Forces a reconciliation now. Exposed for the operator API and tests. */
  async reconcileNow(): Promise<ReconciliationResult> {
    return this.#reconcileNow();
  }

  /**
   * Evaluates the hard threshold against fresh prices for every live position.
   *
   * Used at startup and whenever monitoring may have missed ticks. This is what
   * makes a restart safe: a position that breached while the process was down
   * closes immediately rather than waiting for the next tick.
   */
  async #evaluateAllNow(): Promise<void> {
    for (const position of this.registry.live()) {
      if (!requiresMonitoring(position.state)) continue;
      try {
        const mark = Number.parseFloat(await this.#exchange.markPrice(position.symbol));
        await this.#evaluatePosition(position.symbol, mark);
      } catch {
        // Cannot price it. Reconciliation and the degraded policy handle it.
      }
    }
    await Promise.allSettled([...this.#closing.values()]);
  }

  /**
   * Runs the sentinel against one position at a known price, and waits for any
   * close it starts.
   *
   * Callers that want the fire-and-forget tick path use {@link #onMarkPrice}
   * directly; this is for the paths that must not return until the exit has
   * actually been driven — startup, shutdown, and the operator API.
   */
  async #evaluatePosition(symbol: string, markPrice: number): Promise<void> {
    if (!(markPrice > 0)) return;
    this.#onMarkPrice({ symbol, markPrice: String(markPrice), at: this.#now(), source: "rest" });
    await this.#closing.get(symbol);
  }

  /** Exposed for the operator API and tests: evaluate one position now. */
  async evaluateNow(symbol: string): Promise<void> {
    const mark = await this.#exchange.markPrice(symbol);
    await this.#evaluatePosition(symbol, Number.parseFloat(mark));
  }

  /* ================================================================== *
   * Status
   * ================================================================== */

  status(): ExecutorStatus {
    return {
      running: this.#running,
      degraded: this.#degraded,
      ...(this.#degradedReason !== undefined ? { degradedReason: this.#degradedReason } : {}),
      killSwitch: {
        engaged: this.#killSwitch.engaged,
        reason: this.#killSwitch.state.reason,
      },
      feedHealthy: this.#marketData.healthy,
      feedStalenessMs: this.#marketData.staleness(),
      account: this.#exchange.account,
      canTrade: this.#exchange.canTrade,
      positions: this.registry.all().map((position) => ({
        tradeId: position.tradeId,
        symbol: position.symbol,
        side: position.side,
        state: position.state,
        size: position.size,
        entryPrice: position.entryPrice,
        ...(position.exitReason !== undefined ? { exitReason: position.exitReason } : {}),
        discrepancies: position.discrepancies.length,
        protectedOnExchange: position.protectiveOrder !== undefined,
      })),
      ...(this.#lastReconciliation
        ? {
            lastReconciliation: {
              at: this.#lastReconciliation.at,
              reachable: this.#lastReconciliation.exchangeReachable,
              discrepancies: this.#lastReconciliation.discrepancies.length,
            },
          }
        : {}),
      hardExit: {
        maxLossFraction: this.#config.hardExit.maxLossFraction,
        basis: this.#config.hardExit.basis,
        ...(this.#config.hardExit.maxLossUsd !== undefined
          ? { maxLossUsd: this.#config.hardExit.maxLossUsd }
          : {}),
        exchangeProtectiveStop: this.#config.hardExit.exchangeProtectiveStop,
      },
    };
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
