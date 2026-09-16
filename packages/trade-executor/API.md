# API — `@orb/trade-executor`

## Signal contract

```ts
interface TradeSignal {
  readonly signalId: string;        // 1-128 chars of [A-Za-z0-9._:-]
  readonly timestamp: number;       // ms since epoch; checked for freshness
  readonly symbol: string;
  readonly side: "LONG" | "SHORT";
  readonly entry: { kind: "MARKET" } | { kind: "LIMIT"; price: string };
  readonly sizing:
    | { kind: "BASE_SIZE"; size: string }
    | { kind: "NOTIONAL_USD"; notionalUsd: string };
  readonly leverage?: number;
  readonly setupId: string;
  readonly strategy?: StrategyMetadata;   // recorded, never read
  readonly advisoryStop?: string;         // advisory only — never decides an exit
  readonly advisoryTarget?: string;       // advisory only
}

validateSignal(input: unknown, context: SignalValidationContext): ValidationResult
```

Pure. Unknown top-level fields are ignored rather than rejected — a provider
adding a field must not break execution — but they are also never read, so they
can never influence it.

Rejection reasons are stable codes and form part of the API contract:
`MALFORMED_SIGNAL`, `INVALID_SIGNAL_ID`, `INVALID_SIDE`, `INVALID_ENTRY_INTENT`,
`INVALID_SIZE`, `INVALID_PRICE`, `INVALID_LEVERAGE`, `INVALID_METADATA`,
`MISSING_FIELD`, `SIGNAL_STALE`, `SIGNAL_FROM_FUTURE`, `DUPLICATE_SIGNAL`,
`UNKNOWN_SYMBOL`, `SYMBOL_NOT_ALLOWED`, `SYMBOL_DELISTED`,
`SIZE_NOT_REPRESENTABLE`, `LEVERAGE_ABOVE_MAX`, `SIZE_ABOVE_MAX`,
`NOTIONAL_BELOW_MINIMUM`, `INSUFFICIENT_MARGIN`, `CONFLICTING_POSITION`,
`MAX_CONCURRENT_POSITIONS`, `RISK_LIMIT_EXCEEDED`, `KILL_SWITCH_ENGAGED`,
`EXECUTOR_DEGRADED`, `ENTRY_DISABLED`.

## The hard exit sentinel

```ts
interface RiskSnapshot {
  readonly symbol: string;
  readonly side: Side;
  readonly size: number;            // absolute
  readonly entryPrice: number;
  readonly markPrice: number;
  readonly marginUsed: number;
  readonly accountValue: number;
  readonly liquidationPrice: number | null;
  readonly leverage: number;
  readonly observedAt: number;
}

evaluateHardExit(snapshot: RiskSnapshot, config: HardExitConfig): RiskAssessment
breachesAtPrice(base, markPrice, observedAt, config): RiskAssessment   // fast path
measure(snapshot, basis): RiskMeasurements
unrealizedPnl(snapshot): number
```

`RiskSnapshot` has exactly these fields. It carries no signal, setup, target or
strategy — deliberately, and a test asserts it.

```ts
type RiskAssessment =
  | { breached: false; measurements: RiskMeasurements }
  | { breached: true; rule: HardExitRule; measured: number; threshold: number;
      measurements: RiskMeasurements };

type HardExitRule = "MAX_LOSS_FRACTION" | "MAX_LOSS_USD" | "LIQUIDATION_PROXIMITY";
```

Breach is `>=`. The exact boundary exits.

## Stop price inversion

```ts
hardExitTriggerPrice(input: StopPriceInput, config: HardExitConfig): number | null
protectiveStopPrice(input: StopPriceInput, config: HardExitConfig): number | null
```

The algebraic inverse of the sentinel: the mark price at which the threshold
breaches. `protectiveStopPrice` widens it by `protectiveStopSlackFraction` for
the resting exchange-side order. Returns `null` when no usable price exists.

## Entry guards

```ts
preflightEntry(signal, limits, context: PreflightContext): Rejection | null
validateEntry(signal, limits, context: EntryContext): EntryDecision
```

`preflightEntry` runs the guards that need no market data (executor state,
idempotency, allowlist, listing, delisting) so a signal we were never going to
accept costs no network round trip. `validateEntry` runs it first, then the
price-dependent guards, and resolves the size.

## Position and state machine

```ts
type PositionState =
  | "PENDING_ENTRY" | "OPEN" | "MONITORING" | "EXIT_TRIGGERED" | "CLOSING"
  | "CLOSED" | "ENTRY_FAILED" | "EXIT_FAILED" | "RECONCILIATION_REQUIRED" | "UNKNOWN";

type ExitReason =
  | "HARD_RISK_EXIT" | "KILL_SWITCH" | "STRATEGY_EXIT" | "SIGNAL_EXIT"
  | "MANUAL_EXIT" | "LIQUIDATION" | "UNKNOWN";

EXIT_PRIORITY: Record<ExitReason, number>   // lower wins
outranks(candidate, current): boolean

nextState(from, transition): PositionState | null
requireNextState(from, transition): PositionState   // throws IllegalTransitionError
allowedTransitions(state): readonly PositionTransition[]

isLive(state) · isTerminal(state) · isExiting(state) · requiresMonitoring(state)
```

## Registry — the single exit transition

```ts
class PositionRegistry {
  claimExit(symbol: string, reason: ExitReason, at: number): ClaimOutcome
  reserveSignal(signalId: string): boolean
  releaseSignal(signalId: string): void
  open(position: ManagedPosition): ManagedPosition
  transition(symbol, transition, patch?): ManagedPosition
  observe(symbol, patch): ManagedPosition | undefined
  recordCloseAttempt(symbol, attempt): void
  recordDiscrepancy(symbol, description): void
  get(symbol) · byTradeId(id) · all() · live()
  get totalClaims(): number
  subscribe(listener: PositionListener): () => void
}

type ClaimOutcome =
  | { kind: "claimed"; token: ExitToken }          // exactly one caller ever sees this
  | { kind: "escalated"; from: ExitReason; to: ExitReason }
  | { kind: "already_exiting"; reason: ExitReason }
  | { kind: "not_exitable"; state: PositionState | "absent" };
```

**`claimExit` and `reserveSignal` are synchronous and must stay that way.** Their
atomicity is the whole concurrency guarantee.

## Closing

```ts
closePosition(deps: CloserDependencies, token: ExitToken): Promise<CloseOutcome>
```

Loops until the **exchange** reports flat. Every order is reduce-only. Re-reads
the remaining size from the exchange on each attempt rather than trusting local
state. Returns `{ flat, attempts, closedSize, averagePrice?, realizedPnl?, fees?, error? }`.

## Reconciliation

```ts
reconcile(deps: ReconcilerDependencies, signal?): Promise<ReconciliationResult>
```

Discrepancy kinds: `UNTRACKED_POSITION`, `PHANTOM_POSITION`, `SIZE_MISMATCH`,
`SIDE_MISMATCH`, `ORPHANED_ORDER`. Idempotent and safe to run at any time.

## Kill switch

```ts
class KillSwitch {
  constructor(store: KillSwitchStore, now: Clock)
  get engaged(): boolean          // true until load() has actually read state
  load(): Promise<KillSwitchRecord>
  engage(reason: string, source?): Promise<KillSwitchRecord>
  release(reason: string, source?): Promise<KillSwitchRecord>   // rejects if the write fails
}
```

## The executor

```ts
class TradeExecutor {
  constructor(deps: ExecutorDependencies)
  start(): Promise<void>       // kill switch → reconcile → monitor → evaluate → schedule
  stop(): Promise<void>        // waits for in-flight closes
  submitSignal(payload: unknown): Promise<SubmitResult>
  closePositionNow(symbol, reason, detail): Promise<boolean>
  closeAll(reason, detail): Promise<void>
  engageKillSwitch(reason, source?): Promise<void>
  releaseKillSwitch(reason, source?): Promise<void>
  reconcileNow(): Promise<ReconciliationResult>
  evaluateNow(symbol: string): Promise<void>
  status(): ExecutorStatus
  readonly registry: PositionRegistry
}
```

## Spend authority

```ts
const NOTIONAL_ASSET = "usd:notional";   // exposure opened, never cash
const NOTIONAL_DECIMALS = 6;             // matches USDC
const NOTIONAL_UNIT: AssetUnit;

interface SpendAuthorityConfig {
  account: string;            // the scope a budget is written against
  requester?: Requester;      // default DELEGATE:signal-provider
}
interface SpendAuthority extends SpendAuthorityConfig { guard: SpendGuard }

function usdToBaseUnits(usd: number): bigint;   // rounds UP, toward the limit
function baseUnitsToUsd(amount: bigint): string;
function entryDraft(signal, decision, config): SpendDraft;
function confirmedNotional(size: string, entryPrice: string): bigint;
```

Passed as `ExecutorDependencies.spendAuthority`. Omitted, the executor is
unchanged.

`usdToBaseUnits` rounds **up** because the figure is compared against a
ceiling; rounding a spend down is how a budget is exceeded a rounding error at
a time. The conversion runs through a fixed-precision string, not a
multiplication, because `1234.56 * 1e6` is not `1234560000` in binary floating
point.

`requestId` is `entry:<signalId>`, so a signal redelivered after a crash asks
the same question and gets the same answer instead of reserving twice — the
same reason the client order id is derived from the signal id.

New `RejectionReason` members:

| Reason | Means |
| --- | --- |
| `SPEND_NOT_AUTHORIZED` | The policy said no — over budget, or needs approvals |
| `SPEND_AUTHORITY_UNAVAILABLE` | The gate could not be consulted. Never resolved in favour of trading |

## Ports

`ExchangePort`, `MarketDataPort`, `AuditSink`, `Clock`. Implemented by the
runtime host for Hyperliquid, paper and dry-run.

## Audit

```ts
class JournalAuditSink implements AuditSink {
  record(event: LifecycleEvent): void   // synchronous, O(1), never throws
  flush(): Promise<void>
  get pending(): number
  get dropped(): number
}

replayLifecycle(journal: Journal, tradeId?: string): Promise<readonly LifecycleEvent[]>
```

Stages: `SIGNAL_RECEIVED`, `SIGNAL_VALIDATED`, `SIGNAL_REJECTED`,
`ENTRY_SUBMITTED`, `ENTRY_ACKNOWLEDGED`, `ENTRY_FAILED`, `POSITION_OPEN`,
`MONITORING_STARTED`, `MONITORING_LOST`, `PROTECTIVE_ORDER_PLACED`,
`PROTECTIVE_ORDER_FAILED`, `HARD_THRESHOLD_CROSSED`, `EXIT_TRIGGERED`,
`EXIT_SUPERSEDED`, `EXIT_ORDER_SUBMITTED`, `PARTIAL_FILL`, `FULL_FILL`,
`EXIT_ATTEMPT_FAILED`, `POSITION_VERIFIED_FLAT`, `TRADE_CLOSED`,
`RECONCILIATION_*`, `KILL_SWITCH_*`, `DEGRADED_*`, `EXECUTOR_*`.
