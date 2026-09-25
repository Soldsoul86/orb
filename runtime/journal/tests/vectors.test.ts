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

import { canonicalJson, hashPayload, eventPreimage, hashEvent } from "../src/index.js";

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

  test("the vector's own canonical form round-trips to the same hash", async () => {
    const vectors = JSON.parse(await readFile(await findVectors(), "utf8")) as Vectors;
    // Guards the fixture itself: a vector whose stated canonical form and stated
    // hash disagree would pin nothing, and would look like a passing test.
    const { createHash } = await import("node:crypto");
    const digest = createHash("sha256").update(vectors.payloadCanonical, "utf8").digest("hex");
    assert.equal(digest, vectors.payloadHash);
  });
});
