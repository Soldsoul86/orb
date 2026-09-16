/**
 * The executor's entry path, expressed as a spend.
 *
 * `RiskConfig` caps a *single* entry: notional, leverage, concurrent
 * positions, symbol. It has no notion of time. Nothing in it stops fifty
 * entries of $1,000 in one afternoon — each one individually inside every
 * limit, together a $50,000 day nobody authorised.
 *
 * That gap is not an oversight in the risk config; it is a different kind of
 * control. A per-entry limit answers *"is this trade too big?"*. A budget
 * answers *"has this provider had enough for today?"*, and answering it needs
 * a durable record of what already happened. That record is
 * `@orb/payment-policy`'s ledger, which is a projection of the Event Journal.
 *
 * `CAPABILITY_MODEL.md` §5 places financial actions in the irreversible tier
 * and requires *explicit, per-scope authorization* for them. This is the seam
 * where the executor asks for it.
 *
 * ## What is being metered
 *
 * **Exposure opened, not cash withdrawn.** A perpetual entry does not move
 * money out; it commits margin and takes on notional risk. Notional is the
 * honest meter for "how much did this provider commit today", and it is the
 * number both `maxPositionNotionalUsd` and a daily budget are denominated in,
 * so the two compose instead of contradicting.
 *
 * Naming it `usd:notional` rather than `USD` is deliberate. A reader must
 * never mistake this ledger for a cash balance, and an asset allowlist that
 * admits `USD` must not silently admit exposure.
 */
import type { Amount, AssetUnit, Requester, SpendDraft, SpendGuard } from "@orb/payment-policy";

import type { AcceptedEntry } from "./entry-guards.js";
import type { TradeSignal } from "../signal/model.js";

/** The asset id under which entry exposure is metered. */
export const NOTIONAL_ASSET = "usd:notional";

/**
 * Six decimals, matching USDC, so a notional and a stablecoin balance are
 * denominated alike and a policy can be written against either without the
 * author having to remember which is which.
 */
export const NOTIONAL_DECIMALS = 6;

export const NOTIONAL_UNIT: AssetUnit = Object.freeze({
  asset: NOTIONAL_ASSET,
  decimals: NOTIONAL_DECIMALS,
  symbol: "USD(notional)",
  // A single entry above a billion dollars is a bug in the caller, not a
  // trade. The engine range-checks against this before any rule runs.
  maxAmount: 1_000_000_000n * 10n ** BigInt(NOTIONAL_DECIMALS),
});

const SCALE = 10n ** BigInt(NOTIONAL_DECIMALS);

/**
 * Dollars to base units, rounded **up**.
 *
 * Up, because this number is compared against a ceiling. Rounding a spend
 * down is how a budget is exceeded by a rounding error a few thousand times,
 * and the direction of a rounding rule in a limit check is never arbitrary.
 *
 * The float arrives from price × size arithmetic upstream; it is converted
 * through a fixed-precision string rather than by multiplying, because
 * `1234.56 * 1e6` is not `1234560000` in binary floating point.
 */
export function usdToBaseUnits(usd: number): Amount {
  if (!Number.isFinite(usd) || usd < 0) {
    throw new RangeError(`notional must be a finite, non-negative number, got ${usd}`);
  }
  const [whole = "0", fraction = ""] = usd.toFixed(NOTIONAL_DECIMALS + 1).split(".");
  const kept = fraction.slice(0, NOTIONAL_DECIMALS).padEnd(NOTIONAL_DECIMALS, "0");
  const dropped = fraction.slice(NOTIONAL_DECIMALS);
  const base = BigInt(whole) * SCALE + BigInt(kept);
  return /[1-9]/.test(dropped) ? base + 1n : base;
}

/** Base units back to a human figure. Presentation only; never fed to a rule. */
export function baseUnitsToUsd(amount: Amount): string {
  const whole = amount / SCALE;
  const fraction = (amount % SCALE).toString().padStart(NOTIONAL_DECIMALS, "0");
  return `${whole}.${fraction}`;
}

export interface SpendAuthorityConfig {
  /**
   * The account the exposure is charged to. One account per trading venue or
   * sub-account; it is the scope a budget is written against.
   */
  readonly account: string;
  /**
   * Who is asking. Signals arrive from one authenticated provider, so the
   * default names that provider — but an operator running several strategies
   * through one executor should give each its own requester, because a budget
   * that cannot tell them apart cannot throttle one without throttling all.
   */
  readonly requester?: Requester;
}

/** A guard plus the scope its decisions are charged to. */
export interface SpendAuthority extends SpendAuthorityConfig {
  readonly guard: SpendGuard;
}

const DEFAULT_REQUESTER: Requester = Object.freeze({
  kind: "DELEGATE",
  delegateId: "signal-provider",
});

/**
 * Builds the authorization request for one validated entry.
 *
 * `requestId` is the signal id, not a fresh id. The guard's idempotency is
 * keyed on it, so a signal redelivered after a crash asks the same question
 * and gets the same answer instead of reserving a second time. That is the
 * same reason the executor derives its client order id from the signal id.
 */
export function entryDraft(
  signal: TradeSignal,
  decision: AcceptedEntry,
  config: SpendAuthorityConfig,
): SpendDraft {
  return {
    requestId: `entry:${signal.signalId}`,
    account: config.account,
    requester: config.requester ?? DEFAULT_REQUESTER,
    asset: NOTIONAL_ASSET,
    amount: usdToBaseUnits(decision.notionalUsd),
    // The venue and instrument. A destination allowlist is then the same
    // control as the symbol allowlist, written one layer up.
    destination: `hyperliquid:${signal.symbol}`,
    memo: `${signal.side} ${signal.symbol} x${decision.leverage} (setup ${signal.setupId})`,
  };
}

/**
 * The exposure a confirmed position actually opened.
 *
 * Read from what the **exchange** reports, never from what was requested. A
 * partial fill, a different average price, or a size the venue rounded all
 * make the true figure differ from the estimate, and the ledger must carry
 * the truth or the next budget check is wrong.
 */
export function confirmedNotional(size: string, entryPrice: string): Amount {
  const magnitude = Math.abs(Number.parseFloat(size));
  const price = Number.parseFloat(entryPrice);
  if (!Number.isFinite(magnitude) || !Number.isFinite(price)) return 0n;
  return usdToBaseUnits(magnitude * price);
}
