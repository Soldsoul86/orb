/**
 * Risk configuration.
 *
 * Every threshold in the executor is here, and every one of them is supplied by
 * configuration rather than written into a decision path. Nothing in this file
 * is a default that would be *safe to trade with* — the defaults are
 * conservative starting points, and the runtime host refuses to start against a
 * live account without explicit values.
 */

/**
 * What a loss percentage is measured against.
 *
 * - `MARGIN` — loss as a fraction of the margin committed to this position.
 *   Leverage-aware: at 10× a 1% adverse move is a 10% loss of margin. This is
 *   what most people mean by "max loss per trade", and is the default.
 * - `NOTIONAL` — loss as a fraction of the position's entry notional. This is a
 *   pure price move and ignores leverage.
 * - `ACCOUNT_EQUITY` — loss as a fraction of total account value.
 */
export type LossBasis = "MARGIN" | "NOTIONAL" | "ACCOUNT_EQUITY";

/** The thresholds the hard exit sentinel evaluates. */
export interface HardExitConfig {
  /**
   * The hard loss threshold, as a fraction in `(0, 1]`, measured on {@link basis}.
   * Crossing it closes the position immediately, whatever anything else says.
   */
  readonly maxLossFraction: number;
  readonly basis: LossBasis;
  /** Optional absolute cap, in USD. Whichever rule breaches first wins. */
  readonly maxLossUsd?: number;
  /**
   * Optional guard on proximity to liquidation, as a fraction of mark price.
   * `0.15` exits when the liquidation price is within 15% of the mark.
   */
  readonly minLiquidationDistanceFraction?: number;
  /**
   * Whether to also rest a reduce-only stop order on the exchange.
   *
   * This is the protection that survives this process dying. It is not a
   * replacement for the local sentinel — a resting stop can be cancelled,
   * rejected, or left behind by a position change — but together they mean the
   * hard exit does not depend on one process staying healthy.
   */
  readonly exchangeProtectiveStop: boolean;
  /**
   * How much further out than the sentinel's threshold to place the exchange
   * stop, as a fraction of the threshold. A small gap lets the (faster, more
   * precise) local sentinel act first in the normal case, leaving the resting
   * stop as the backstop.
   */
  readonly protectiveStopSlackFraction: number;
}

/** Limits applied before a position is opened. */
export interface EntryLimits {
  /** Symbols the executor will trade. Empty means "nothing" — fail closed. */
  readonly symbolAllowlist: readonly string[];
  /** Largest notional, in USD, for a single position. */
  readonly maxPositionNotionalUsd: number;
  /** Largest leverage the executor will use, regardless of what a signal asks. */
  readonly maxLeverage: number;
  /** Most positions open at once. */
  readonly maxConcurrentPositions: number;
  /** Smallest notional the exchange will accept, in USD. */
  readonly minNotionalUsd: number;
  /**
   * Fraction of account value that must remain free after opening. Guards
   * against opening a position the account cannot survive.
   */
  readonly minFreeMarginFraction: number;
  /** How old a signal may be, in milliseconds. */
  readonly maxSignalAgeMs: number;
  /** Tolerance for a provider clock that runs fast, in milliseconds. */
  readonly maxClockSkewMs: number;
  /** Largest acceptable slippage from the reference price on entry. */
  readonly maxEntrySlippageFraction: number;
}

/** Timeouts and retry budgets for the order paths. */
export interface ExecutionLimits {
  /** How long an unfilled entry may work before being abandoned. */
  readonly entryTimeoutMs: number;
  /** How long the close path has to reach flat before it is declared failed. */
  readonly exitTimeoutMs: number;
  /** Attempts the close path makes before entering `EXIT_FAILED`. */
  readonly maxCloseAttempts: number;
  /** Delay between close attempts. */
  readonly closeRetryDelayMs: number;
  /**
   * How far through the book a closing order may sweep, as a fraction of mark.
   * A reduce-only IOC needs an aggressive limit to actually cross.
   */
  readonly closeAggressionFraction: number;
  /** How often to reconcile against the exchange. */
  readonly reconciliationIntervalMs: number;
  /** Feed silence beyond this is treated as monitoring lost. */
  readonly feedStalenessLimitMs: number;
}

/** What to do when the kill switch engages, or monitoring cannot be established. */
export type SafetyPolicy =
  /** Close every open position immediately. The fail-safe default. */
  | "CLOSE_ALL"
  /** Keep positions but refuse new entries, and keep alerting. */
  | "HOLD_AND_ALERT";

export interface SafetyConfig {
  readonly killSwitchPolicy: SafetyPolicy;
  /** Applied when a position exists but monitoring cannot be established. */
  readonly degradedPolicy: SafetyPolicy;
}

export interface RiskConfig {
  readonly hardExit: HardExitConfig;
  readonly entry: EntryLimits;
  readonly execution: ExecutionLimits;
  readonly safety: SafetyConfig;
}

/**
 * Conservative starting points.
 *
 * These are not "safe values" — there are none, because risk appetite is the
 * operator's to set. They exist so tests and paper runs have something
 * complete, and so an omitted setting is small rather than unbounded.
 */
export const DEFAULT_RISK_CONFIG: RiskConfig = Object.freeze({
  hardExit: Object.freeze({
    maxLossFraction: 0.1,
    basis: "MARGIN" as LossBasis,
    exchangeProtectiveStop: true,
    protectiveStopSlackFraction: 0.15,
  }),
  entry: Object.freeze({
    symbolAllowlist: Object.freeze([]),
    maxPositionNotionalUsd: 1_000,
    maxLeverage: 3,
    maxConcurrentPositions: 1,
    minNotionalUsd: 10,
    minFreeMarginFraction: 0.2,
    maxSignalAgeMs: 30_000,
    maxClockSkewMs: 5_000,
    maxEntrySlippageFraction: 0.005,
  }),
  execution: Object.freeze({
    entryTimeoutMs: 15_000,
    exitTimeoutMs: 30_000,
    maxCloseAttempts: 5,
    closeRetryDelayMs: 400,
    closeAggressionFraction: 0.02,
    reconciliationIntervalMs: 15_000,
    feedStalenessLimitMs: 30_000,
  }),
  safety: Object.freeze({
    killSwitchPolicy: "CLOSE_ALL" as SafetyPolicy,
    degradedPolicy: "CLOSE_ALL" as SafetyPolicy,
  }),
});

export class RiskConfigError extends Error {
  override readonly name = "RiskConfigError";
  constructor(readonly problems: readonly string[]) {
    super(`invalid risk configuration:\n  - ${problems.join("\n  - ")}`);
  }
}

/**
 * Validates a configuration, refusing anything that would disable a control.
 *
 * A misconfigured threshold is indistinguishable from an absent one at
 * runtime, so this fails loudly at startup instead.
 *
 * @throws {RiskConfigError} listing every problem found, not just the first.
 */
export function validateRiskConfig(config: RiskConfig): RiskConfig {
  const problems: string[] = [];
  const positive = (value: number, name: string) => {
    if (!Number.isFinite(value) || value <= 0) problems.push(`${name} must be > 0, got ${value}`);
  };
  const fraction = (value: number, name: string, { allowZero = false } = {}) => {
    if (!Number.isFinite(value) || value > 1 || (allowZero ? value < 0 : value <= 0)) {
      problems.push(`${name} must be a fraction in ${allowZero ? "[0, 1]" : "(0, 1]"}, got ${value}`);
    }
  };

  fraction(config.hardExit.maxLossFraction, "hardExit.maxLossFraction");
  if (!["MARGIN", "NOTIONAL", "ACCOUNT_EQUITY"].includes(config.hardExit.basis)) {
    problems.push(`hardExit.basis must be MARGIN, NOTIONAL or ACCOUNT_EQUITY`);
  }
  if (config.hardExit.maxLossUsd !== undefined) {
    positive(config.hardExit.maxLossUsd, "hardExit.maxLossUsd");
  }
  if (config.hardExit.minLiquidationDistanceFraction !== undefined) {
    fraction(config.hardExit.minLiquidationDistanceFraction, "hardExit.minLiquidationDistanceFraction");
  }
  fraction(config.hardExit.protectiveStopSlackFraction, "hardExit.protectiveStopSlackFraction", {
    allowZero: true,
  });

  if (config.entry.symbolAllowlist.length === 0) {
    problems.push("entry.symbolAllowlist is empty — the executor would refuse every signal");
  }
  positive(config.entry.maxPositionNotionalUsd, "entry.maxPositionNotionalUsd");
  positive(config.entry.minNotionalUsd, "entry.minNotionalUsd");
  if (config.entry.minNotionalUsd > config.entry.maxPositionNotionalUsd) {
    problems.push("entry.minNotionalUsd exceeds entry.maxPositionNotionalUsd");
  }
  if (!Number.isInteger(config.entry.maxLeverage) || config.entry.maxLeverage < 1) {
    problems.push(`entry.maxLeverage must be an integer >= 1, got ${config.entry.maxLeverage}`);
  }
  if (!Number.isInteger(config.entry.maxConcurrentPositions) || config.entry.maxConcurrentPositions < 1) {
    problems.push("entry.maxConcurrentPositions must be an integer >= 1");
  }
  fraction(config.entry.minFreeMarginFraction, "entry.minFreeMarginFraction", { allowZero: true });
  fraction(config.entry.maxEntrySlippageFraction, "entry.maxEntrySlippageFraction");
  positive(config.entry.maxSignalAgeMs, "entry.maxSignalAgeMs");
  if (config.entry.maxClockSkewMs < 0) problems.push("entry.maxClockSkewMs must be >= 0");

  positive(config.execution.entryTimeoutMs, "execution.entryTimeoutMs");
  positive(config.execution.exitTimeoutMs, "execution.exitTimeoutMs");
  positive(config.execution.reconciliationIntervalMs, "execution.reconciliationIntervalMs");
  positive(config.execution.feedStalenessLimitMs, "execution.feedStalenessLimitMs");
  fraction(config.execution.closeAggressionFraction, "execution.closeAggressionFraction");
  if (!Number.isInteger(config.execution.maxCloseAttempts) || config.execution.maxCloseAttempts < 1) {
    problems.push("execution.maxCloseAttempts must be an integer >= 1");
  }
  if (config.execution.closeRetryDelayMs < 0) problems.push("execution.closeRetryDelayMs must be >= 0");

  if (problems.length > 0) throw new RiskConfigError(problems);
  return config;
}
