/**
 * @orb/trade-executor — signal-agnostic execution with local exit authority.
 *
 * Entry may come from a signal provider. Exit authority belongs to the
 * executor. Nothing a provider sends can request an exit, defer one, or widen a
 * risk threshold; once a position is open the executor never depends on the
 * provider to tell it when to get out.
 *
 * The executor does not know how a signal was generated. Today a friend's API
 * feeds it; later an opportunity layer will. Neither changes anything here.
 */

/* -- Signal contract ------------------------------------------------------ */
export type {
  Side,
  EntryIntent,
  Sizing,
  StrategyMetadata,
  TradeSignal,
} from "./signal/model.js";
export { opposite, sideSign, isBuy } from "./signal/model.js";
export { validateSignal } from "./signal/validate.js";
export type {
  RejectionReason,
  Rejection,
  ValidationResult,
  SignalValidationContext,
} from "./signal/validate.js";

/* -- Risk ----------------------------------------------------------------- */
export {
  DEFAULT_RISK_CONFIG,
  validateRiskConfig,
  RiskConfigError,
} from "./risk/config.js";
export type {
  RiskConfig,
  HardExitConfig,
  EntryLimits,
  ExecutionLimits,
  SafetyConfig,
  SafetyPolicy,
  LossBasis,
} from "./risk/config.js";

export {
  evaluateHardExit,
  measure,
  unrealizedPnl,
  breachesAtPrice,
} from "./risk/sentinel.js";
export type {
  RiskSnapshot,
  RiskAssessment,
  RiskMeasurements,
  HardExitRule,
} from "./risk/sentinel.js";

export { hardExitTriggerPrice, protectiveStopPrice } from "./risk/stop-price.js";
export type { StopPriceInput } from "./risk/stop-price.js";

export { validateEntry, preflightEntry } from "./risk/entry-guards.js";
export type {
  EntryContext,
  PreflightContext,
  EntryDecision,
  AcceptedEntry,
} from "./risk/entry-guards.js";

/* -- Position ------------------------------------------------------------- */
export {
  EXIT_PRIORITY,
  outranks,
  byExitAuthority,
  isLive,
  isTerminal,
  isExiting,
  requiresMonitoring,
} from "./position/model.js";
export type {
  PositionState,
  ExitReason,
  ManagedPosition,
  CloseAttempt,
  ProtectiveOrder,
} from "./position/model.js";

export {
  nextState,
  canTransition,
  allowedTransitions,
  requireNextState,
  IllegalTransitionError,
} from "./position/state-machine.js";
export type { PositionTransition } from "./position/state-machine.js";

export { PositionRegistry, newPosition } from "./position/registry.js";
export type { ExitToken, ClaimOutcome, PositionListener } from "./position/registry.js";

/* -- Execution ------------------------------------------------------------ */
export {
  entryOrder,
  closeOrder,
  protectiveStopOrder,
  remainingSize,
} from "./execution/order-plan.js";
export type { AssetPrecision } from "./execution/order-plan.js";

export { closePosition, totalFilled } from "./execution/closer.js";
export type { CloseOutcome, CloserDependencies } from "./execution/closer.js";

/* -- Reconciliation ------------------------------------------------------- */
export { reconcile, discrepanciesOf } from "./reconcile/reconciler.js";
export type {
  Discrepancy,
  ReconciliationResult,
  ReconcilerDependencies,
} from "./reconcile/reconciler.js";

/* -- Safety --------------------------------------------------------------- */
export { KillSwitch, MemoryKillSwitchStore } from "./kill-switch.js";
export type { KillSwitchRecord, KillSwitchStore } from "./kill-switch.js";

/* -- Audit ---------------------------------------------------------------- */
export { InMemoryAuditSink, LIFECYCLE_SCHEMA } from "./audit/lifecycle.js";
export type { LifecycleEvent, LifecycleStage, RiskMeasurement } from "./audit/lifecycle.js";
export { JournalAuditSink, replayLifecycle } from "./audit/journal-sink.js";
export type { JournalAuditSinkOptions } from "./audit/journal-sink.js";

/* -- Identity ------------------------------------------------------------- */
export {
  entryClientOrderId,
  closeClientOrderId,
  protectiveClientOrderId,
  tradeIdForSignal,
  tradeIdForAdoptedPosition,
} from "./identity.js";
export type { ClientOrderId } from "./identity.js";

/* -- Analysis ------------------------------------------------------------- */
export {
  roundTripCost,
  rewardToRisk,
  breakevenHitRate,
  expectancy,
  expectancyR,
  minimumViableStop,
  assess,
  tradesToSignificance,
  HYPERLIQUID_BASE_FEES,
  EXECUTION_STYLES,
} from "./analysis/economics.js";
export type { CostModel, SetupGeometry, Verdict } from "./analysis/economics.js";

export {
  foldTrades,
  summariseSetup,
  buildSetupLedger,
} from "./analysis/setup-performance.js";
export type {
  TradeRecord,
  SetupPerformance,
  SetupLedger,
} from "./analysis/setup-performance.js";

/* -- Ports ---------------------------------------------------------------- */
export type {
  Clock,
  ExchangePort,
  MarketDataPort,
  AuditSink,
  AccountStateView,
  ExchangePositionView,
  AssetInfo,
  PlacedOrder,
  SubmissionOutcome,
  FillView,
  OpenOrderView,
  MarkPriceTick,
} from "./ports.js";

/* -- The executor --------------------------------------------------------- */
export { TradeExecutor } from "./executor.js";
export type { ExecutorDependencies, ExecutorStatus, SubmitResult } from "./executor.js";
