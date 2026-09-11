/**
 * The internal signal contract.
 *
 * A signal is an **entry intent**, nothing more. It cannot request an exit, set
 * a risk threshold, or reach the exchange directly. Everything a provider sends
 * that is not in this shape is recorded as opaque metadata and never read by
 * the execution path — that is what stops "arbitrary signal fields directly
 * controlling execution".
 *
 * The executor does not know or care how the signal was generated.
 */

export type Side = "LONG" | "SHORT";

/** How the position should be entered. */
export type EntryIntent =
  /** Cross the spread now, bounded by the configured slippage limit. */
  | { readonly kind: "MARKET" }
  /** Rest at a price. Abandoned if unfilled by the configured entry timeout. */
  | { readonly kind: "LIMIT"; readonly price: string };

/** How large the position should be. Always re-validated against risk limits. */
export type Sizing =
  /** An explicit size in the base asset. */
  | { readonly kind: "BASE_SIZE"; readonly size: string }
  /** A notional value in USD; converted at the entry mark price. */
  | { readonly kind: "NOTIONAL_USD"; readonly notionalUsd: string };

/**
 * Metadata a provider may attach. Recorded for audit and later analysis.
 *
 * Deliberately typed as flat scalars, and deliberately never consulted by the
 * risk layer, the sentinel, or the order path.
 */
export type StrategyMetadata = Readonly<Record<string, string | number | boolean>>;

/** A validated signal. Producing one of these is the validator's only job. */
export interface TradeSignal {
  readonly signalId: string;
  /** Provider's timestamp, milliseconds since the epoch. Checked for freshness. */
  readonly timestamp: number;
  readonly symbol: string;
  readonly side: Side;
  readonly entry: EntryIntent;
  readonly sizing: Sizing;
  readonly leverage?: number;
  readonly setupId: string;
  readonly strategy?: StrategyMetadata;
  /**
   * The provider's own stop, if it sent one.
   *
   * **Advisory only.** It is recorded so a trade can be analysed against the
   * provider's intent, and it is never used to decide an exit. Exit authority
   * belongs to the executor's risk layer.
   */
  readonly advisoryStop?: string;
  /** The provider's target. Advisory, on the same terms as {@link advisoryStop}. */
  readonly advisoryTarget?: string;
}

/** The opposite side — the direction that closes a position. */
export function opposite(side: Side): Side {
  return side === "LONG" ? "SHORT" : "LONG";
}

/** `+1` for a long, `-1` for a short. The sign convention for all PnL maths. */
export function sideSign(side: Side): 1 | -1 {
  return side === "LONG" ? 1 : -1;
}

/** A buy order opens a long and closes a short. */
export function isBuy(side: Side): boolean {
  return side === "LONG";
}
