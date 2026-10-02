/** The committed vectors the phone's Kotlin handles are held to are current and cover every kind. */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildHandleVectors, handleVectorsPath } from "./handle-vectors-build.js";

describe("the vectors the phone's Kotlin Handles is held to", () => {
  test("are current (regenerate with node scripts/write-brain-vectors.mjs)", async () => {
    const fresh = JSON.stringify(buildHandleVectors(), null, 1) + "\n";
    assert.equal(await readFile(handleVectorsPath, "utf8"), fresh, "runtime/brain/tests/vectors/handles.json is stale");
  });

  test("they cover every kind and what must not match", () => {
    const { cases } = buildHandleVectors();
    const kinds = new Set(cases.flatMap((c) => c.expect.map((h) => h.kind)));
    assert.deepEqual([...kinds].sort(), ["amount", "date", "email", "phone", "site", "upi"]);
    assert.ok(cases.filter((c) => c.expect.length === 0).length >= 15, "the must-not-match cases are the point");
  });
});
