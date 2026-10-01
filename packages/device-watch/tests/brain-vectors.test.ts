/**
 * The vectors the phone's Kotlin translation is held to are current, and they cover what they claim.
 * Built by `brain-vectors-build.ts`; see there for why they are computed here and checked in Kotlin.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { translateEvent } from "../src/index.js";
import { buildVectors, vectorsPath } from "./brain-vectors-build.js";

const DEVICE = "orb-0123456789abcdef01234567";
const ASSIST = "orb.assist.captured";
const SHARED = "orb.shared";

describe("the vectors the phone's Kotlin translation is held to", () => {
  test("are current (regenerate with node scripts/write-brain-vectors.mjs)", async () => {
    const fresh = JSON.stringify(await buildVectors(), null, 1) + "\n";
    const committed = await readFile(vectorsPath, "utf8");
    assert.equal(committed, fresh, "runtime/brain/tests/vectors/observations.json is stale");
  });

  test("cover both sensors, an omission, a refusal and a real phone-written line", async () => {
    const v = await buildVectors();
    const kinds = new Set(v.cases.filter((c) => c.expected !== null).map((c) => (c.expected as { source: string }).source.split("@")[0]));
    assert.deepEqual([...kinds].sort(), ["orb.sensor.assist", "orb.sensor.share"]);
    assert.ok(v.cases.some((c) => c.expected === null), "a case that translates to nothing");
    for (const f of v.fixtures) assert.ok(f.expected.length > 0, `${f.file} contributes cases`);
  });

  test("an array payload is not an object (both translations agree)", () => {
    assert.equal(translateEvent(ASSIST, DEVICE, []), null);
    assert.equal(translateEvent(SHARED, DEVICE, []), null);
  });
});
