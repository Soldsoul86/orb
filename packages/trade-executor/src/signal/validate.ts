/**
 * Signal validation — the untrusted boundary.
 *
 * A signal from outside is data, never instruction. This module is a pure
 * function from an unknown value to either a {@link TradeSignal} or a
 * deterministic rejection. It does no I/O, reads no clock, and reaches no
 * exchange: the caller supplies the time and the context.
 *
 * Every rejection carries a stable machine-readable reason, so rejections can
 * be counted, alerted on, and audited rather than lost in a log line.
 */
import type {
  EntryIntent,
  Side,
  Sizing,
  StrategyMetadata,
  TradeSignal,
} from "./model.js";

/** Stable rejection codes. These are part of the signal API's contract. */
export type RejectionReason =
  // Shape
  | "MALFORMED_SIGNAL"
  | "MISSING_FIELD"
  | "INVALID_SIGNAL_ID"
  | "INVALID_SIDE"
  | "INVALID_ENTRY_INTENT"
  | "INVALID_SIZE"
  | "INVALID_PRICE"
  | "INVALID_LEVERAGE"
  | "INVALID_METADATA"
  // Time
  | "SIGNAL_STALE"
  | "SIGNAL_FROM_FUTURE"
  // Identity
  | "DUPLICATE_SIGNAL"
  // Market
  | "UNKNOWN_SYMBOL"
  | "SYMBOL_NOT_ALLOWED"
  | "SYMBOL_DELISTED"
  | "SIZE_NOT_REPRESENTABLE"
  // Risk (see `risk/entry-guards.ts`)
  | "LEVERAGE_ABOVE_MAX"
  | "SIZE_ABOVE_MAX"
  | "NOTIONAL_BELOW_MINIMUM"
  | "INSUFFICIENT_MARGIN"
  | "CONFLICTING_POSITION"
  | "MAX_CONCURRENT_POSITIONS"
  | "RISK_LIMIT_EXCEEDED"
  // Spend authority (see `risk/spend-authority.ts`). Distinct from
  // RISK_LIMIT_EXCEEDED because they answer different questions: a risk limit
  // says this trade is too big, spend authority says this requester has had
  // enough. Collapsing them would hide which control stopped the trade.
  | "SPEND_NOT_AUTHORIZED"
  | "SPEND_AUTHORITY_UNAVAILABLE"
  // Executor state
  | "KILL_SWITCH_ENGAGED"
  | "EXECUTOR_DEGRADED"
  | "ENTRY_DISABLED";

export interface Rejection {
  readonly ok: false;
  readonly reason: RejectionReason;
  /** Human-readable detail. Safe to return to the caller; never leaks secrets. */
  readonly detail: string;
  /** Present whenever the signal was well-formed enough to identify. */
  readonly signalId?: string;
}

export type ValidationResult =
  | { readonly ok: true; readonly signal: TradeSignal }
  | Rejection;

export interface SignalValidationContext {
  /** Current time, injected. */
  readonly now: number;
  /** How old a signal may be before it is refused. */
  readonly maxAgeMs: number;
  /** Tolerance for a provider whose clock runs fast. */
  readonly maxClockSkewMs: number;
}

const reject = (reason: RejectionReason, detail: string, signalId?: string): Rejection =>
  signalId === undefined ? { ok: false, reason, detail } : { ok: false, reason, detail, signalId };

const DECIMAL = /^\d+(\.\d+)?$/;
const SIGNAL_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const SYMBOL = /^[A-Z0-9@/_-]{1,32}$/;
const SETUP_ID = /^[A-Za-z0-9._:-]{1,128}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A positive decimal string. Rejects `0`, negatives, exponents and `NaN`. */
function isPositiveDecimal(value: unknown): value is string {
  return typeof value === "string" && DECIMAL.test(value) && Number.parseFloat(value) > 0;
}

function parseSide(value: unknown): Side | null {
  if (value === "LONG" || value === "SHORT") return value;
  // Accept the common wire spellings, but only exactly — never a fuzzy match.
  if (value === "BUY" || value === "buy" || value === "long") return "LONG";
  if (value === "SELL" || value === "sell" || value === "short") return "SHORT";
  return null;
}

function parseEntry(value: unknown): EntryIntent | Rejection {
  if (value === undefined || value === "MARKET" || value === "market") return { kind: "MARKET" };
  if (!isRecord(value)) return reject("INVALID_ENTRY_INTENT", "entry must be an object or \"MARKET\"");

  const kind = String(value["kind"] ?? "").toUpperCase();
  if (kind === "MARKET") return { kind: "MARKET" };
  if (kind === "LIMIT") {
    if (!isPositiveDecimal(value["price"])) {
      return reject("INVALID_PRICE", "entry.price must be a positive decimal string");
    }
    return { kind: "LIMIT", price: value["price"] };
  }
  return reject("INVALID_ENTRY_INTENT", `unsupported entry kind: ${kind || "(none)"}`);
}

function parseSizing(value: unknown): Sizing | Rejection {
  if (!isRecord(value)) return reject("INVALID_SIZE", "sizing must be an object");

  const kind = String(value["kind"] ?? "").toUpperCase();
  if (kind === "BASE_SIZE") {
    if (!isPositiveDecimal(value["size"])) {
      return reject("INVALID_SIZE", "sizing.size must be a positive decimal string");
    }
    return { kind: "BASE_SIZE", size: value["size"] };
  }
  if (kind === "NOTIONAL_USD") {
    if (!isPositiveDecimal(value["notionalUsd"])) {
      return reject("INVALID_SIZE", "sizing.notionalUsd must be a positive decimal string");
    }
    return { kind: "NOTIONAL_USD", notionalUsd: value["notionalUsd"] };
  }
  return reject("INVALID_SIZE", `unsupported sizing kind: ${kind || "(none)"}`);
}

function parseMetadata(value: unknown): StrategyMetadata | Rejection {
  if (!isRecord(value)) return reject("INVALID_METADATA", "strategy must be an object");

  const out: Record<string, string | number | boolean> = {};
  const entries = Object.entries(value);
  if (entries.length > 32) return reject("INVALID_METADATA", "strategy has too many fields");

  for (const [key, item] of entries) {
    if (key.length > 64) return reject("INVALID_METADATA", `metadata key too long: ${key.slice(0, 32)}`);
    if (typeof item === "string") {
      if (item.length > 512) return reject("INVALID_METADATA", `metadata value too long: ${key}`);
      out[key] = item;
    } else if (typeof item === "boolean") {
      out[key] = item;
    } else if (typeof item === "number" && Number.isFinite(item)) {
      out[key] = item;
    } else {
      return reject("INVALID_METADATA", `metadata value must be a scalar: ${key}`);
    }
  }
  return out;
}

const isRejection = (value: unknown): value is Rejection =>
  isRecord(value) && value["ok"] === false;

/**
 * Parses and validates an untrusted signal payload.
 *
 * Unknown top-level fields are ignored rather than rejected — a provider adding
 * a field must not break execution — but they are also never read, so they can
 * never influence it either.
 */
export function validateSignal(
  input: unknown,
  context: SignalValidationContext,
): ValidationResult {
  if (!isRecord(input)) return reject("MALFORMED_SIGNAL", "signal must be a JSON object");

  const signalId = input["signalId"] ?? input["signal_id"];
  if (typeof signalId !== "string" || !SIGNAL_ID.test(signalId)) {
    return reject("INVALID_SIGNAL_ID", "signalId must be 1-128 chars of [A-Za-z0-9._:-]");
  }

  const symbol = input["symbol"];
  if (typeof symbol !== "string" || !SYMBOL.test(symbol)) {
    return reject("UNKNOWN_SYMBOL", "symbol must be an uppercase market identifier", signalId);
  }

  const side = parseSide(input["side"]);
  if (side === null) return reject("INVALID_SIDE", "side must be LONG or SHORT", signalId);

  const timestampRaw = input["timestamp"] ?? input["time"];
  if (typeof timestampRaw !== "number" || !Number.isFinite(timestampRaw)) {
    return reject("MISSING_FIELD", "timestamp must be milliseconds since the epoch", signalId);
  }
  const timestamp = Math.trunc(timestampRaw);

  const age = context.now - timestamp;
  if (age > context.maxAgeMs) {
    return reject("SIGNAL_STALE", `signal is ${age}ms old, limit is ${context.maxAgeMs}ms`, signalId);
  }
  if (age < -context.maxClockSkewMs) {
    return reject(
      "SIGNAL_FROM_FUTURE",
      `signal is ${-age}ms in the future, tolerance is ${context.maxClockSkewMs}ms`,
      signalId,
    );
  }

  const setupId = input["setupId"] ?? input["setup_id"];
  if (typeof setupId !== "string" || !SETUP_ID.test(setupId)) {
    return reject("MISSING_FIELD", "setupId must be 1-128 chars of [A-Za-z0-9._:-]", signalId);
  }

  const entry = parseEntry(input["entry"]);
  if (isRejection(entry)) return { ...entry, signalId };

  const sizing = parseSizing(input["sizing"] ?? input["size"]);
  if (isRejection(sizing)) return { ...sizing, signalId };

  let leverage: number | undefined;
  if (input["leverage"] !== undefined && input["leverage"] !== null) {
    const value = input["leverage"];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 1000) {
      return reject("INVALID_LEVERAGE", "leverage must be an integer between 1 and 1000", signalId);
    }
    leverage = value;
  }

  let strategy: StrategyMetadata | undefined;
  if (input["strategy"] !== undefined && input["strategy"] !== null) {
    const parsed = parseMetadata(input["strategy"]);
    if (isRejection(parsed)) return { ...parsed, signalId };
    strategy = parsed;
  }

  // Advisory only. Validated for shape so it can be recorded, never consulted.
  const advisory = (key: string): string | undefined | Rejection => {
    const value = input[key];
    if (value === undefined || value === null) return undefined;
    if (!isPositiveDecimal(value)) {
      return reject("INVALID_PRICE", `${key} must be a positive decimal string`, signalId);
    }
    return value;
  };
  const advisoryStop = advisory("stop") ?? advisory("advisoryStop");
  if (isRejection(advisoryStop)) return advisoryStop;
  const advisoryTarget = advisory("target") ?? advisory("advisoryTarget");
  if (isRejection(advisoryTarget)) return advisoryTarget;

  return {
    ok: true,
    signal: {
      signalId,
      timestamp,
      symbol,
      side,
      entry,
      sizing,
      setupId,
      ...(leverage !== undefined ? { leverage } : {}),
      ...(strategy !== undefined ? { strategy } : {}),
      ...(advisoryStop !== undefined ? { advisoryStop } : {}),
      ...(advisoryTarget !== undefined ? { advisoryTarget } : {}),
    },
  };
}
