/**
 * Hyperliquid tick and lot size rules.
 *
 * Verified against the exchange's published rules and cross-checked against the
 * reference SDK's behaviour (see `tests/fixtures/l1-signing-vectors.json`):
 *
 * - **Price** — at most 5 significant figures, and at most
 *   `MAX_DECIMALS - szDecimals` decimal places, where `MAX_DECIMALS` is 6 for
 *   perps and 8 for spot. Integer prices are exempt from the significant-figure
 *   cap: `123456` is valid even though `12345.6` is not.
 * - **Size** — truncated to the asset's `szDecimals`.
 *
 * An order that breaks either rule is rejected by the exchange, so formatting
 * happens once, at the edge, and never in the risk layer.
 */
import { Decimal } from "./decimal.js";

export type MarketKind = "perp" | "spot";

const MAX_DECIMALS: Record<MarketKind, number> = { perp: 6, spot: 8 };
const MAX_SIGNIFICANT_FIGURES = 5;

/** Raised when a value cannot be expressed as a valid wire price or size. */
export class FormatError extends Error {
  override readonly name = "FormatError";
}

/**
 * Formats a price for the wire.
 *
 * @throws {FormatError} if the price is not finite, is not positive, or
 *   truncates away to zero — submitting `0` would be a silently wrong order.
 */
export function formatPrice(
  price: string | number | Decimal,
  szDecimals: number,
  kind: MarketKind = "perp",
): string {
  let value: Decimal;
  try {
    value = Decimal.parse(price);
  } catch (cause) {
    throw new FormatError(`invalid price: ${String(price)}`, { cause });
  }
  if (value.isNegative) throw new FormatError(`price must be positive: ${value.toFixed()}`);

  const places = Math.max(MAX_DECIMALS[kind] - szDecimals, 0);
  let result = value.toDecimalPlaces(places);
  if (!result.isInteger) result = result.toSignificantDigits(MAX_SIGNIFICANT_FIGURES);

  if (result.isZero) throw new FormatError(`price truncates to zero: ${String(price)}`);
  return result.toFixed();
}

/**
 * Formats an order size for the wire.
 *
 * @throws {FormatError} if the size is not finite, is negative, or truncates to
 *   zero — a zero-size close would leave the position open while reporting success.
 */
export function formatSize(size: string | number | Decimal, szDecimals: number): string {
  let value: Decimal;
  try {
    value = Decimal.parse(size);
  } catch (cause) {
    throw new FormatError(`invalid size: ${String(size)}`, { cause });
  }
  if (value.isNegative) throw new FormatError(`size must not be negative: ${value.toFixed()}`);

  const result = value.toDecimalPlaces(szDecimals);
  if (result.isZero) throw new FormatError(`size truncates to zero: ${String(size)}`);
  return result.toFixed();
}

/** True when `size` survives lot-size truncation. Lets callers check without catching. */
export function isRepresentableSize(size: string | number | Decimal, szDecimals: number): boolean {
  try {
    formatSize(size, szDecimals);
    return true;
  } catch {
    return false;
  }
}
