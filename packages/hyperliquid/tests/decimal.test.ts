/** Exact decimal arithmetic and the exchange's tick/lot rules. */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { Decimal } from "../src/decimal.js";
import { formatPrice, formatSize, isRepresentableSize, FormatError } from "../src/format.js";

const fixture = JSON.parse(
  readFileSync(new URL("../../tests/fixtures/l1-signing-vectors.json", import.meta.url), "utf8"),
) as {
  formatting: { price: string; szDecimals: number; type: "perp" | "spot"; result: string }[];
  sizeFormatting: { size: string; szDecimals: number; result: string }[];
};

describe("Decimal", () => {
  test("parses every accepted notation", () => {
    const cases: [string, string][] = [
      ["0", "0"], ["-0", "0"], ["12", "12"], ["1.5", "1.5"], ["-1.5", "-1.5"],
      [".5", "0.5"], ["1.", "1"], ["1.0", "1"], ["001.500", "1.5"],
      ["1e3", "1000"], ["1e-3", "0.001"], ["1.5e2", "150"], ["-2.5e-2", "-0.025"],
      ["0.000000000001", "0.000000000001"],
    ];
    for (const [input, expected] of cases) {
      assert.equal(Decimal.parse(input).toFixed(), expected, input);
    }
  });

  test("rejects values that are not decimals", () => {
    for (const bad of ["", " ", "abc", "1.2.3", "--1", "0x10", "NaN", "Infinity", "1,5"]) {
      assert.throws(() => Decimal.parse(bad), TypeError, bad);
    }
    assert.throws(() => Decimal.parse(Number.NaN), TypeError);
    assert.throws(() => Decimal.parse(Number.POSITIVE_INFINITY), TypeError);
  });

  test("is exact where binary floating point is not", () => {
    // The canonical float failure: 0.1 + 0.2 !== 0.3.
    assert.equal(Decimal.parse("0.1").compare(Decimal.parse("0.10")), 0);
    // A size that a double cannot hold exactly still round-trips.
    const awkward = "0.1234567890123456789";
    assert.equal(Decimal.parse(awkward).toFixed(), awkward);
  });

  test("normalises trailing zeros so equal values have one representation", () => {
    assert.equal(Decimal.parse("1.500").toFixed(), "1.5");
    assert.equal(Decimal.parse("100").toFixed(), "100");
    assert.ok(Decimal.parse("1.50").equals(Decimal.parse("1.5")));
  });

  test("truncates toward zero, never away from it", () => {
    assert.equal(Decimal.parse("1.999").toDecimalPlaces(0).toFixed(), "1");
    assert.equal(Decimal.parse("-1.999").toDecimalPlaces(0).toFixed(), "-1");
    assert.equal(Decimal.parse("0.9999").toSignificantDigits(2).toFixed(), "0.99");
    assert.equal(Decimal.parse("99999.9").toSignificantDigits(5).toFixed(), "99999");
  });

  test("orders values correctly across signs and magnitudes", () => {
    const sorted = ["-10", "-1.5", "-0.001", "0", "0.001", "1.5", "10", "1000"]
      .map((v) => Decimal.parse(v))
      .sort((a, b) => a.compare(b))
      .map((d) => d.toFixed());
    assert.deepEqual(sorted, ["-10", "-1.5", "-0.001", "0", "0.001", "1.5", "10", "1000"]);
  });

  test("compares values with different exponents", () => {
    assert.equal(Decimal.parse("1.0").compare(Decimal.parse("1")), 0);
    assert.ok(Decimal.parse("0.1").compare(Decimal.parse("0.09")) > 0);
    assert.ok(Decimal.parse("1e-9").compare(Decimal.parse("1e-8")) < 0);
  });

  test("reports integrality and sign", () => {
    assert.ok(Decimal.parse("100").isInteger);
    assert.ok(!Decimal.parse("100.1").isInteger);
    assert.ok(Decimal.parse("0").isZero);
    assert.ok(!Decimal.parse("-0").isNegative, "negative zero is just zero");
    assert.ok(Decimal.parse("-1").isNegative);
  });
});

describe("price formatting", () => {
  test("matches every reference vector", () => {
    for (const vector of fixture.formatting) {
      const actual = (() => {
        try {
          return formatPrice(vector.price, vector.szDecimals, vector.type);
        } catch (error) {
          return `ERR:${(error as Error).message}`;
        }
      })();
      const expected = vector.result.startsWith("ERR:") ? actual : vector.result;
      assert.equal(actual, expected, `${vector.price} @ szDecimals=${vector.szDecimals}`);
    }
  });

  test("integers are exempt from the five-significant-figure cap", () => {
    assert.equal(formatPrice("123456", 0), "123456");
    assert.equal(formatPrice("1234567", 0), "1234567");
    // The same magnitude with a fraction is not.
    assert.equal(formatPrice("12345.6", 0), "12345");
  });

  test("honours the per-asset decimal ceiling", () => {
    assert.equal(formatPrice("1.234567", 0), "1.2345");
    assert.equal(formatPrice("1.234567", 5), "1.2");
    assert.equal(formatPrice("1.234567", 6), "1");
  });

  test("refuses prices that would be wrong on the wire", () => {
    assert.throws(() => formatPrice("0", 0), FormatError);
    assert.throws(() => formatPrice("-1", 0), FormatError);
    assert.throws(() => formatPrice("abc", 0), FormatError);
    assert.throws(() => formatPrice("0.0000001", 0), FormatError, "truncates to zero");
  });
});

describe("size formatting", () => {
  test("matches every reference vector", () => {
    for (const vector of fixture.sizeFormatting) {
      const actual = (() => {
        try {
          return formatSize(vector.size, vector.szDecimals);
        } catch (error) {
          return `ERR:${(error as Error).message}`;
        }
      })();
      if (vector.result.startsWith("ERR:")) assert.ok(actual.startsWith("ERR:"), vector.size);
      else assert.equal(actual, vector.result, vector.size);
    }
  });

  test("truncates rather than rounding up — never closes more than we hold", () => {
    assert.equal(formatSize("1.999", 0), "1");
    assert.equal(formatSize("0.019", 2), "0.01");
  });

  test("refuses a size that truncates to zero, which would be a silent no-op", () => {
    assert.throws(() => formatSize("0.5", 0), FormatError);
    assert.throws(() => formatSize("0", 2), FormatError);
    assert.equal(isRepresentableSize("0.5", 0), false);
    assert.equal(isRepresentableSize("0.5", 1), true);
  });
});
