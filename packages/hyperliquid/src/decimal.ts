/**
 * Exact decimal arithmetic.
 *
 * Order prices and sizes are decimal strings on the wire, and binary floating
 * point cannot represent them faithfully — `0.1 + 0.2` is the classic example,
 * but the failure that matters here is a price that round-trips to a value the
 * exchange rejects, or a size that silently leaves dust on a position we
 * believe is flat. Everything is therefore held as an integer mantissa and a
 * base-10 exponent.
 *
 * Rounding is always *toward zero* (truncation). For a close order that is the
 * conservative direction: we never round a size up past what we actually hold.
 */

/** An exact base-10 value: `(negative ? -1 : 1) * digits * 10 ** exponent`. */
export class Decimal {
  /** Absolute mantissa, with trailing zeros stripped. */
  readonly digits: bigint;
  readonly exponent: number;
  readonly negative: boolean;

  private constructor(digits: bigint, exponent: number, negative: boolean) {
    if (digits === 0n) {
      this.digits = 0n;
      this.exponent = 0;
      this.negative = false;
      return;
    }
    // Normalise so equal values have one representation, and `toFixed`
    // never emits trailing zeros.
    let d = digits;
    let e = exponent;
    while (d % 10n === 0n) {
      d /= 10n;
      e += 1;
    }
    this.digits = d;
    this.exponent = e;
    this.negative = negative;
  }

  static readonly ZERO = Decimal.fromParts(0n, 0, false);

  static fromParts(digits: bigint, exponent: number, negative: boolean): Decimal {
    return new Decimal(digits < 0n ? -digits : digits, exponent, negative);
  }

  /**
   * Parses a decimal string or a finite number.
   *
   * Accepts optional sign, an optional fractional part and an optional
   * exponent (`1.5`, `-0.001`, `1e-8`, `.5`, `12`).
   */
  static parse(value: string | number | Decimal): Decimal {
    if (value instanceof Decimal) return value;

    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new TypeError(`not a finite number: ${value}`);
      // A round-trip through the shortest representation avoids importing the
      // binary artefacts of the double into the exact value.
      return Decimal.parse(String(value));
    }

    const text = value.trim();
    const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
    if (!match || (match[2] === "" && (match[3] ?? "") === "")) {
      throw new TypeError(`not a decimal: ${JSON.stringify(value)}`);
    }

    const [, sign, whole = "", fraction = "", exponent = "0"] = match;
    const digits = BigInt((whole === "" ? "0" : whole) + fraction);
    return new Decimal(digits, Number.parseInt(exponent, 10) - fraction.length, sign === "-");
  }

  static isDecimalString(value: string): boolean {
    try {
      Decimal.parse(value);
      return true;
    } catch {
      return false;
    }
  }

  get isZero(): boolean {
    return this.digits === 0n;
  }

  get isInteger(): boolean {
    return this.isZero || this.exponent >= 0;
  }

  get isNegative(): boolean {
    return this.negative && !this.isZero;
  }

  /** Count of significant decimal digits in the mantissa. */
  get significantDigits(): number {
    return this.isZero ? 1 : this.digits.toString(10).length;
  }

  negate(): Decimal {
    return this.isZero ? this : new Decimal(this.digits, this.exponent, !this.negative);
  }

  abs(): Decimal {
    return this.negative ? this.negate() : this;
  }

  /** Truncates toward zero to at most `places` digits after the decimal point. */
  toDecimalPlaces(places: number): Decimal {
    if (this.isZero || this.exponent >= -places) return this;
    const drop = -places - this.exponent;
    return new Decimal(this.digits / 10n ** BigInt(drop), -places, this.negative);
  }

  /** Truncates toward zero to at most `count` significant digits. */
  toSignificantDigits(count: number): Decimal {
    if (count < 1) throw new RangeError("significant digits must be at least 1");
    const drop = this.significantDigits - count;
    if (this.isZero || drop <= 0) return this;
    return new Decimal(this.digits / 10n ** BigInt(drop), this.exponent + drop, this.negative);
  }

  compare(other: Decimal): number {
    if (this.isNegative !== other.isNegative) return this.isNegative ? -1 : 1;
    const magnitude = this.#compareMagnitude(other);
    return this.isNegative ? -magnitude : magnitude;
  }

  #compareMagnitude(other: Decimal): number {
    const exponent = Math.min(this.exponent, other.exponent);
    const a = this.digits * 10n ** BigInt(this.exponent - exponent);
    const b = other.digits * 10n ** BigInt(other.exponent - exponent);
    return a === b ? 0 : a < b ? -1 : 1;
  }

  equals(other: Decimal): boolean {
    return this.compare(other) === 0;
  }

  /** Plain decimal notation — never exponential, never a trailing zero. */
  toFixed(): string {
    if (this.isZero) return "0";
    const sign = this.negative ? "-" : "";
    const digits = this.digits.toString(10);

    if (this.exponent >= 0) return sign + digits + "0".repeat(this.exponent);

    const fractionLength = -this.exponent;
    if (digits.length > fractionLength) {
      const split = digits.length - fractionLength;
      return `${sign}${digits.slice(0, split)}.${digits.slice(split)}`;
    }
    return `${sign}0.${"0".repeat(fractionLength - digits.length)}${digits}`;
  }

  toString(): string {
    return this.toFixed();
  }

  /**
   * Lossy conversion for risk arithmetic and reporting.
   *
   * Comparisons that decide whether to trade must use {@link compare}; this is
   * for ratios and percentages, where double precision is far finer than any
   * threshold a human configures.
   */
  toNumber(): number {
    return Number(this.toFixed());
  }
}
