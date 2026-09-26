/**
 * Cross-implementation vectors.
 *
 * The phone's journal is a second implementation of this encoding
 * (`apps/pixel/pass1/src/Json.java.in`), and two implementations can disagree.
 * If they do, the symptom is not a wrong answer — it is two devices that can
 * never agree they hold the same history, which would surface as a permanent,
 * unexplained sync failure long after the cause was introduced.
 *
 * So the agreement is pinned here, against a fixture that exercises what is
 * easy to get wrong: key ordering, a nested object, an empty array, escaped
 * quotes and backslashes, a control character, and a non-ASCII codepoint that
 * `JSON.stringify` deliberately leaves raw.
 *
 * `DEVICE_LOOP.md` §7 R2. Verified equal against the Java encoder 2026-09-25.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, parse } from "node:path";

import {
  canonicalJson,
  coarseSchema,
  coarseType,
  eventPreimage,
  hashEvent,
  hashPayload,
} from "../src/index.js";

const RELATIVE = join("apps", "pixel", "pass1", "tests", "vectors.json");

/**
 * Walks up to the repository root rather than counting directory levels,
 * because this file runs from `dist/` and a hard-coded depth would silently
 * break the moment the build layout changed.
 */
async function findVectors(): Promise<string> {
  let directory = dirname(fileURLToPath(import.meta.url));
  const { root } = parse(directory);
  while (true) {
    const candidate = join(directory, RELATIVE);
    try {
      await access(candidate);
      return candidate;
    } catch {
      if (directory === root) throw new Error(`vectors not found above ${directory}`);
      directory = dirname(directory);
    }
  }
}

interface Vectors {
  readonly payload: Record<string, unknown>;
  readonly payloadCanonical: string;
  readonly payloadHash: string;
  readonly preimageInput: Record<string, unknown>;
  readonly hash: string;
  readonly v2: V2Section;
  readonly v2Bookkeeping: V2Section;
}

/**
 * A v2 section of the fixture.
 *
 * `fineType` rather than the coarse one on purpose: each implementation derives
 * the envelope's type with its own `coarseType`, so one check pins the rule and
 * the bytes together. A Java rule that disagreed with this one would fail even
 * though both encoders were byte-perfect.
 */
interface V2Section {
  readonly fineType: string;
  readonly payload: Record<string, unknown>;
  readonly payloadCanonical: string;
  readonly payloadHash: string;
  /** Typed rather than a bare record, so a missing identity field fails the build. */
  readonly preimageInput: {
    readonly id: string;
    readonly lane: string;
    readonly device: string;
    readonly hlc: { readonly physical: number; readonly counter: number };
    readonly wallClock: number;
    readonly previous: string | null;
  };
  readonly preimageCanonical: string;
  readonly hash: string;
}

describe("cross-implementation encoding", () => {
  test("the TypeScript encoder matches the vectors the Java encoder produces", async () => {
    const vectors = JSON.parse(await readFile(await findVectors(), "utf8")) as Vectors;

    assert.equal(canonicalJson(vectors.payload), vectors.payloadCanonical);
    assert.equal(hashPayload(vectors.payload), vectors.payloadHash);

    const input = {
      ...vectors.preimageInput,
      payloadHash: vectors.payloadHash,
    } as Parameters<typeof eventPreimage>[0];

    assert.equal(hashEvent(input), vectors.hash);
  });

  test("both v2 branches match, with the coarse type derived here rather than read", async () => {
    const vectors = JSON.parse(await readFile(await findVectors(), "utf8")) as Vectors;

    for (const [label, section] of [
      ["content", vectors.v2],
      ["bookkeeping", vectors.v2Bookkeeping],
    ] as const) {
      assert.equal(canonicalJson(section.payload), section.payloadCanonical, `${label}: payload`);
      assert.equal(hashPayload(section.payload), section.payloadHash, `${label}: payloadHash`);

      const schema = { id: section.fineType, version: 1 };
      const input = {
        ...section.preimageInput,
        v: 2,
        type: section.fineType,
        schema: coarseSchema(section.fineType, schema),
        causes: [],
        payloadHash: section.payloadHash,
      } satisfies Parameters<typeof eventPreimage>[0];

      // `eventPreimage` coarsens the type itself under v2, and drops `causes`
      // and `schema`. Passing the fine ones in is the point: what comes out must
      // be the coarse form the Java side independently produced.
      assert.equal(eventPreimage(input), section.preimageCanonical, `${label}: preimage`);
      assert.equal(hashEvent(input), section.hash, `${label}: hash`);
    }

    // The rule itself, on both branches, against the same literals the Java
    // suite checks. This is the piece that would diverge unnoticed.
    assert.equal(coarseType(vectors.v2.fineType), "orb.content");
    assert.equal(coarseType(vectors.v2Bookkeeping.fineType), vectors.v2Bookkeeping.fineType);
  });

  test("the vector's own canonical form round-trips to the same hash", async () => {
    const vectors = JSON.parse(await readFile(await findVectors(), "utf8")) as Vectors;
    // Guards the fixture itself: a vector whose stated canonical form and stated
    // hash disagree would pin nothing, and would look like a passing test.
    const { createHash } = await import("node:crypto");
    const digest = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
    assert.equal(digest(vectors.payloadCanonical), vectors.payloadHash);

    for (const section of [vectors.v2, vectors.v2Bookkeeping]) {
      assert.equal(digest(section.payloadCanonical), section.payloadHash);
      assert.equal(digest(section.preimageCanonical), section.hash);
    }
  });
});

/**
 * The half of the cross-implementation agreement a fixture cannot carry.
 *
 * `gen-vectors.py` refuses to put a float in `vectors.json` — so the vectors
 * structurally cannot exercise the case, and the guard that would have surfaced
 * this divergence is the same one that concealed it. Both encoders passed every
 * test while disagreeing about `1.0`.
 *
 * So agreement is asserted as *both sides refusing the same values*. The Java
 * mirror of this block is `apps/pixel/pass1/tests/JsonTest.java.in`, under
 * "numbers both journals can represent, and only those".
 */
describe("numbers both journals can represent, and only those", () => {
  test("a fraction is refused, because the two languages spell it differently", () => {
    // Measured 2026-09-26: Java `Double.toString` vs JS `JSON.stringify` give
    // 1.0/1, 100.0/100 and 1.0E21/1e+21. Three of six ordinary values.
    for (const value of [0.95, 0.1, -0.5, 1e-7]) {
      assert.throws(() => canonicalJson({ v: value }), /safe\s+integers only/);
    }
  });

  test("a whole number is fine however it was written", () => {
    // `1.0` in JavaScript *is* `1` — there is no separate float type — so the
    // rule is about the value, not about how the literal was typed.
    assert.equal(canonicalJson({ v: 1.0 }), '{"v":1}');
    assert.equal(canonicalJson({ v: 100.0 }), '{"v":100}');
  });

  test("an integer past 2^53 is refused, and that is a different bug", () => {
    // Not a spelling disagreement but a value one: a Java `long` reaches 2^63,
    // a JavaScript number holds every integer only to 2^53-1. Writing a larger
    // one on the phone would read back here as a different number, silently.
    assert.equal(canonicalJson({ v: 9007199254740991 }), '{"v":9007199254740991}');
    assert.throws(() => canonicalJson({ v: 9007199254740993 }), /safe\s+integers only/);
  });

  test("the rejection also covers what it used to cover", () => {
    assert.throws(() => canonicalJson({ v: Number.NaN }));
    assert.throws(() => canonicalJson({ v: Number.POSITIVE_INFINITY }));
  });

  test("no safe integer ever stringifies to exponent notation", () => {
    // Why `isSafeInteger` is the whole check: the largest is sixteen digits, so
    // JavaScript never switches to the `1e+21` form that Java spells `1.0E21`.
    for (const value of [Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, 0, 1, -1]) {
      assert.doesNotMatch(canonicalJson({ v: value }), /[eE]/);
    }
  });
});
