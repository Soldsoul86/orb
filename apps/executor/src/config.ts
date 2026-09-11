/**
 * Configuration and the production safety interlock.
 *
 * Everything the executor can be told is read here, once, from the environment,
 * and validated before anything starts. Nothing else in the repository reads
 * `process.env` — the linter enforces that.
 *
 * ## The interlock
 *
 * The single most dangerous failure in this system is running live against
 * mainnet when you meant to be testing. So reaching mainnet requires **three
 * independent affirmative settings**, each of which must be wrong on purpose:
 *
 *   ORB_HL_ENV=mainnet
 *   ORB_HL_MODE=live
 *   ORB_HL_CONFIRM_MAINNET=I-UNDERSTAND-THIS-TRADES-REAL-FUNDS
 *
 * Absent any one of them the process refuses to start rather than quietly
 * downgrading. A test configuration cannot reach production by omission, and
 * dry-run and paper modes are structurally incapable of it: their exchange
 * ports have no signing key at all.
 */
import { readFileSync } from "node:fs";

/** How the executor is allowed to act on the market. */
export type ExecutionMode =
  /** Validate and log; every write is refused at the port. */
  | "dry_run"
  /** Simulate fills locally against real prices. No order ever leaves. */
  | "paper"
  /** Real orders against the configured network. */
  | "live";

export type Network = "testnet" | "mainnet";

export interface ExecutorConfig {
  readonly mode: ExecutionMode;
  readonly network: Network;

  readonly wallet: {
    /** Present only in `live` mode. Never logged, never serialised. */
    readonly privateKey?: string;
    /** Trade on behalf of a vault or sub-account rather than the signer. */
    readonly vaultAddress?: `0x${string}`;
    /** Read-only account to watch in dry-run/paper without a key. */
    readonly watchAddress?: `0x${string}`;
  };

  readonly api: {
    readonly host: string;
    readonly port: number;
    /** Shared secret for HMAC request signing. At least 32 bytes of entropy. */
    readonly signalSecret: string;
    /** Separate secret for operator endpoints. Never equal to the signal secret. */
    readonly operatorSecret: string;
    readonly maxSkewMs: number;
    readonly rateLimitPerMinute: number;
    readonly maxBodyBytes: number;
  };

  readonly risk: {
    readonly maxLossFraction: number;
    readonly lossBasis: "MARGIN" | "NOTIONAL" | "ACCOUNT_EQUITY";
    readonly maxLossUsd?: number;
    readonly minLiquidationDistanceFraction?: number;
    readonly exchangeProtectiveStop: boolean;
    readonly protectiveStopSlackFraction: number;

    readonly symbolAllowlist: readonly string[];
    readonly maxPositionNotionalUsd: number;
    readonly maxLeverage: number;
    readonly maxConcurrentPositions: number;
    readonly minNotionalUsd: number;
    readonly minFreeMarginFraction: number;
    readonly maxSignalAgeMs: number;
    readonly maxClockSkewMs: number;
    readonly maxEntrySlippageFraction: number;

    readonly entryTimeoutMs: number;
    readonly exitTimeoutMs: number;
    readonly maxCloseAttempts: number;
    readonly closeRetryDelayMs: number;
    readonly closeAggressionFraction: number;
    readonly reconciliationIntervalMs: number;
    readonly feedStalenessLimitMs: number;

    readonly killSwitchPolicy: "CLOSE_ALL" | "HOLD_AND_ALERT";
    readonly degradedPolicy: "CLOSE_ALL" | "HOLD_AND_ALERT";
  };

  readonly storage: {
    /** Directory holding the journal lanes and the kill-switch state. */
    readonly dataDir: string;
    readonly lane: string;
    readonly device: string;
  };
}

export class ConfigError extends Error {
  override readonly name = "ConfigError";
  constructor(readonly problems: readonly string[]) {
    super(`invalid executor configuration:\n  - ${problems.join("\n  - ")}`);
  }
}

/** The environment, as a plain map. Injected so this stays testable. */
export type Environment = Readonly<Record<string, string | undefined>>;

const MAINNET_CONFIRMATION = "I-UNDERSTAND-THIS-TRADES-REAL-FUNDS";

/**
 * Reads a secret.
 *
 * `NAME_FILE` is preferred over `NAME`: a file path keeps the secret out of the
 * process environment, where it would be visible to anything that can read
 * `/proc` or a container inspection.
 */
function readSecret(env: Environment, name: string, problems: string[]): string | undefined {
  const path = env[`${name}_FILE`];
  if (path !== undefined && path !== "") {
    try {
      const value = readFileSync(path, "utf8").trim();
      if (value === "") problems.push(`${name}_FILE points at an empty file`);
      return value === "" ? undefined : value;
    } catch (error) {
      problems.push(`${name}_FILE could not be read: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }
  const value = env[name];
  return value === undefined || value === "" ? undefined : value;
}

function number(
  env: Environment,
  name: string,
  fallback: number,
  problems: string[],
  { integer = false } = {},
): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || (integer && !Number.isInteger(value))) {
    problems.push(`${name} must be ${integer ? "an integer" : "a number"}, got ${JSON.stringify(raw)}`);
    return fallback;
  }
  return value;
}

function optionalNumber(env: Environment, name: string, problems: string[]): number | undefined {
  const raw = env[name];
  if (raw === undefined || raw === "") return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    problems.push(`${name} must be a number, got ${JSON.stringify(raw)}`);
    return undefined;
  }
  return value;
}

function boolean(env: Environment, name: string, fallback: boolean): boolean {
  const raw = env[name]?.toLowerCase();
  if (raw === undefined || raw === "") return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function oneOf<T extends string>(
  env: Environment,
  name: string,
  allowed: readonly T[],
  fallback: T,
  problems: string[],
): T {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  if (!(allowed as readonly string[]).includes(raw)) {
    problems.push(`${name} must be one of ${allowed.join(", ")}, got ${JSON.stringify(raw)}`);
    return fallback;
  }
  return raw as T;
}

/**
 * Builds a validated configuration, or throws listing every problem.
 *
 * @throws {ConfigError} when anything is missing, malformed, or when the
 *   mainnet interlock is not fully satisfied.
 */
export function loadConfig(env: Environment): ExecutorConfig {
  const problems: string[] = [];

  const mode = oneOf(env, "ORB_HL_MODE", ["dry_run", "paper", "live"] as const, "dry_run", problems);
  const network = oneOf(env, "ORB_HL_ENV", ["testnet", "mainnet"] as const, "testnet", problems);

  /* ---- The interlock ------------------------------------------------- */

  if (network === "mainnet") {
    if (env["ORB_HL_CONFIRM_MAINNET"] !== MAINNET_CONFIRMATION) {
      problems.push(
        `ORB_HL_ENV=mainnet requires ORB_HL_CONFIRM_MAINNET=${MAINNET_CONFIRMATION}. ` +
          `Refusing to start: this configuration would trade real funds.`,
      );
    }
    if (mode !== "live") {
      problems.push(
        `ORB_HL_ENV=mainnet is only valid with ORB_HL_MODE=live. ` +
          `A ${mode} configuration must not point at mainnet.`,
      );
    }
  }

  /* ---- Wallet --------------------------------------------------------- */

  const privateKey = readSecret(env, "ORB_HL_PRIVATE_KEY", problems);
  if (mode === "live") {
    if (privateKey === undefined) {
      problems.push("ORB_HL_MODE=live requires ORB_HL_PRIVATE_KEY or ORB_HL_PRIVATE_KEY_FILE");
    } else if (!/^(0x)?[0-9a-fA-F]{64}$/.test(privateKey)) {
      problems.push("ORB_HL_PRIVATE_KEY must be 32 hex bytes");
    }
  }

  const watchAddress = env["ORB_HL_WATCH_ADDRESS"];
  if (watchAddress !== undefined && watchAddress !== "" && !/^0x[0-9a-fA-F]{40}$/.test(watchAddress)) {
    problems.push("ORB_HL_WATCH_ADDRESS must be a 20-byte hex address");
  }
  if (mode !== "live" && privateKey === undefined && (watchAddress === undefined || watchAddress === "")) {
    problems.push(`ORB_HL_MODE=${mode} requires ORB_HL_WATCH_ADDRESS to know which account to observe`);
  }

  const vaultAddress = env["ORB_HL_VAULT_ADDRESS"];
  if (vaultAddress !== undefined && vaultAddress !== "" && !/^0x[0-9a-fA-F]{40}$/.test(vaultAddress)) {
    problems.push("ORB_HL_VAULT_ADDRESS must be a 20-byte hex address");
  }

  /* ---- API secrets ---------------------------------------------------- */

  const signalSecret = readSecret(env, "ORB_HL_SIGNAL_SECRET", problems);
  const operatorSecret = readSecret(env, "ORB_HL_OPERATOR_SECRET", problems);

  if (signalSecret === undefined) {
    problems.push("ORB_HL_SIGNAL_SECRET or ORB_HL_SIGNAL_SECRET_FILE is required");
  } else if (signalSecret.length < 32) {
    problems.push("ORB_HL_SIGNAL_SECRET must be at least 32 characters");
  }
  if (operatorSecret === undefined) {
    problems.push("ORB_HL_OPERATOR_SECRET or ORB_HL_OPERATOR_SECRET_FILE is required");
  } else if (operatorSecret.length < 32) {
    problems.push("ORB_HL_OPERATOR_SECRET must be at least 32 characters");
  }
  if (signalSecret !== undefined && signalSecret === operatorSecret) {
    // Otherwise a compromised signal provider could engage or release the kill
    // switch, which is precisely the authority they must not have.
    problems.push("ORB_HL_OPERATOR_SECRET must differ from ORB_HL_SIGNAL_SECRET");
  }

  /* ---- Risk ----------------------------------------------------------- */

  const allowlistRaw = env["ORB_HL_SYMBOL_ALLOWLIST"] ?? "";
  const symbolAllowlist = allowlistRaw
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => symbol !== "");
  if (symbolAllowlist.length === 0) {
    problems.push("ORB_HL_SYMBOL_ALLOWLIST is required — the executor trades nothing by default");
  }

  const maxLossFraction = number(env, "ORB_HL_MAX_LOSS_FRACTION", Number.NaN, problems);
  if (!Number.isFinite(maxLossFraction)) {
    problems.push("ORB_HL_MAX_LOSS_FRACTION is required — there is no safe default hard exit threshold");
  }

  const maxLossUsd = optionalNumber(env, "ORB_HL_MAX_LOSS_USD", problems);
  const minLiquidationDistanceFraction = optionalNumber(
    env,
    "ORB_HL_MIN_LIQUIDATION_DISTANCE_FRACTION",
    problems,
  );

  const config: ExecutorConfig = {
    mode,
    network,
    wallet: {
      ...(privateKey !== undefined ? { privateKey } : {}),
      ...(vaultAddress !== undefined && vaultAddress !== ""
        ? { vaultAddress: vaultAddress as `0x${string}` }
        : {}),
      ...(watchAddress !== undefined && watchAddress !== ""
        ? { watchAddress: watchAddress as `0x${string}` }
        : {}),
    },
    api: {
      host: env["ORB_HL_API_HOST"] ?? "127.0.0.1",
      port: number(env, "ORB_HL_API_PORT", 8787, problems, { integer: true }),
      signalSecret: signalSecret ?? "",
      operatorSecret: operatorSecret ?? "",
      maxSkewMs: number(env, "ORB_HL_API_MAX_SKEW_MS", 30_000, problems),
      rateLimitPerMinute: number(env, "ORB_HL_API_RATE_LIMIT_PER_MINUTE", 120, problems, {
        integer: true,
      }),
      maxBodyBytes: number(env, "ORB_HL_API_MAX_BODY_BYTES", 16_384, problems, { integer: true }),
    },
    risk: {
      maxLossFraction,
      lossBasis: oneOf(
        env,
        "ORB_HL_LOSS_BASIS",
        ["MARGIN", "NOTIONAL", "ACCOUNT_EQUITY"] as const,
        "MARGIN",
        problems,
      ),
      ...(maxLossUsd !== undefined ? { maxLossUsd } : {}),
      ...(minLiquidationDistanceFraction !== undefined ? { minLiquidationDistanceFraction } : {}),
      exchangeProtectiveStop: boolean(env, "ORB_HL_EXCHANGE_PROTECTIVE_STOP", true),
      protectiveStopSlackFraction: number(env, "ORB_HL_PROTECTIVE_STOP_SLACK", 0.15, problems),

      symbolAllowlist,
      maxPositionNotionalUsd: number(env, "ORB_HL_MAX_POSITION_NOTIONAL_USD", 1_000, problems),
      maxLeverage: number(env, "ORB_HL_MAX_LEVERAGE", 3, problems, { integer: true }),
      maxConcurrentPositions: number(env, "ORB_HL_MAX_CONCURRENT_POSITIONS", 1, problems, {
        integer: true,
      }),
      minNotionalUsd: number(env, "ORB_HL_MIN_NOTIONAL_USD", 10, problems),
      minFreeMarginFraction: number(env, "ORB_HL_MIN_FREE_MARGIN_FRACTION", 0.2, problems),
      maxSignalAgeMs: number(env, "ORB_HL_MAX_SIGNAL_AGE_MS", 30_000, problems),
      maxClockSkewMs: number(env, "ORB_HL_MAX_CLOCK_SKEW_MS", 5_000, problems),
      maxEntrySlippageFraction: number(env, "ORB_HL_MAX_ENTRY_SLIPPAGE", 0.005, problems),

      entryTimeoutMs: number(env, "ORB_HL_ENTRY_TIMEOUT_MS", 15_000, problems),
      exitTimeoutMs: number(env, "ORB_HL_EXIT_TIMEOUT_MS", 30_000, problems),
      maxCloseAttempts: number(env, "ORB_HL_MAX_CLOSE_ATTEMPTS", 5, problems, { integer: true }),
      closeRetryDelayMs: number(env, "ORB_HL_CLOSE_RETRY_DELAY_MS", 400, problems),
      closeAggressionFraction: number(env, "ORB_HL_CLOSE_AGGRESSION", 0.02, problems),
      reconciliationIntervalMs: number(env, "ORB_HL_RECONCILIATION_INTERVAL_MS", 15_000, problems),
      feedStalenessLimitMs: number(env, "ORB_HL_FEED_STALENESS_LIMIT_MS", 30_000, problems),

      killSwitchPolicy: oneOf(
        env,
        "ORB_HL_KILL_SWITCH_POLICY",
        ["CLOSE_ALL", "HOLD_AND_ALERT"] as const,
        "CLOSE_ALL",
        problems,
      ),
      degradedPolicy: oneOf(
        env,
        "ORB_HL_DEGRADED_POLICY",
        ["CLOSE_ALL", "HOLD_AND_ALERT"] as const,
        "CLOSE_ALL",
        problems,
      ),
    },
    storage: {
      dataDir: env["ORB_HL_DATA_DIR"] ?? ".orb-local/hyperliquid-executor",
      lane: env["ORB_HL_LANE"] ?? "executor",
      device: env["ORB_HL_DEVICE"] ?? "hyperliquid-executor",
    },
  };

  if (problems.length > 0) throw new ConfigError(problems);
  return config;
}

/**
 * A redacted view, safe to log or expose on the health endpoint.
 *
 * Constructed by naming the fields to include rather than by removing secrets,
 * so a future field cannot leak by being forgotten.
 */
export function describeConfig(config: ExecutorConfig): Record<string, unknown> {
  return {
    mode: config.mode,
    network: config.network,
    tradingAccount: config.wallet.vaultAddress ?? config.wallet.watchAddress ?? "(derived from key)",
    api: {
      host: config.api.host,
      port: config.api.port,
      maxSkewMs: config.api.maxSkewMs,
      rateLimitPerMinute: config.api.rateLimitPerMinute,
    },
    risk: {
      maxLossFraction: config.risk.maxLossFraction,
      lossBasis: config.risk.lossBasis,
      maxLossUsd: config.risk.maxLossUsd ?? null,
      exchangeProtectiveStop: config.risk.exchangeProtectiveStop,
      symbolAllowlist: config.risk.symbolAllowlist,
      maxPositionNotionalUsd: config.risk.maxPositionNotionalUsd,
      maxLeverage: config.risk.maxLeverage,
      maxConcurrentPositions: config.risk.maxConcurrentPositions,
      killSwitchPolicy: config.risk.killSwitchPolicy,
      degradedPolicy: config.risk.degradedPolicy,
    },
    storage: config.storage,
  };
}

/** Maps the flat environment shape onto the executor's `RiskConfig`. */
export function toRiskConfig(config: ExecutorConfig): import("@orb/trade-executor").RiskConfig {
  return {
    hardExit: {
      maxLossFraction: config.risk.maxLossFraction,
      basis: config.risk.lossBasis,
      ...(config.risk.maxLossUsd !== undefined ? { maxLossUsd: config.risk.maxLossUsd } : {}),
      ...(config.risk.minLiquidationDistanceFraction !== undefined
        ? { minLiquidationDistanceFraction: config.risk.minLiquidationDistanceFraction }
        : {}),
      exchangeProtectiveStop: config.risk.exchangeProtectiveStop,
      protectiveStopSlackFraction: config.risk.protectiveStopSlackFraction,
    },
    entry: {
      symbolAllowlist: config.risk.symbolAllowlist,
      maxPositionNotionalUsd: config.risk.maxPositionNotionalUsd,
      maxLeverage: config.risk.maxLeverage,
      maxConcurrentPositions: config.risk.maxConcurrentPositions,
      minNotionalUsd: config.risk.minNotionalUsd,
      minFreeMarginFraction: config.risk.minFreeMarginFraction,
      maxSignalAgeMs: config.risk.maxSignalAgeMs,
      maxClockSkewMs: config.risk.maxClockSkewMs,
      maxEntrySlippageFraction: config.risk.maxEntrySlippageFraction,
    },
    execution: {
      entryTimeoutMs: config.risk.entryTimeoutMs,
      exitTimeoutMs: config.risk.exitTimeoutMs,
      maxCloseAttempts: config.risk.maxCloseAttempts,
      closeRetryDelayMs: config.risk.closeRetryDelayMs,
      closeAggressionFraction: config.risk.closeAggressionFraction,
      reconciliationIntervalMs: config.risk.reconciliationIntervalMs,
      feedStalenessLimitMs: config.risk.feedStalenessLimitMs,
    },
    safety: {
      killSwitchPolicy: config.risk.killSwitchPolicy,
      degradedPolicy: config.risk.degradedPolicy,
    },
  };
}
