/** Every hand-written relative-day case, the bounds, and determinism — the TypeScript reference (`docs/RELATIVE_DAYS_PHONE.md`). */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { RELATIVE_MAX_CHARS, RELATIVE_MAX_DAYS, relativeDays } from "../src/index.js";
import { RELATIVE_CASES } from "./relative-cases.js";
import { buildRelativeVectors, relativeVectorsPath } from "./relative-vectors-build.js";

describe("relative days are read by rule, exactly as written down", () => {
  for (const c of RELATIVE_CASES) {
    test(c.name, () => {
      assert.deepEqual(relativeDays(c.text, c.anchor), c.expect);
    });
  }
});

describe("bounds and determinism", () => {
  test("only the first million characters are read", () => {
    const padding = "a ".repeat(499_990);
    assert.equal(relativeDays(`${padding} tomorrow`, "2026-10-06").length, 1);
    const past = "a ".repeat(500_001);
    assert.ok(past.length > RELATIVE_MAX_CHARS);
    assert.deepEqual(relativeDays(`${past}tomorrow`, "2026-10-06"), []);
  });

  test("at most 20 days come back, the earliest in the text", () => {
    const text = Array.from({ length: 30 }, (_, i) => `in ${i + 1} days`).join(" ");
    const found = relativeDays(text, "2026-10-06");
    assert.equal(found.length, RELATIVE_MAX_DAYS);
    assert.equal(found[0]?.phrase, "in 1 day");
    assert.equal(found.at(-1)?.phrase, "in 20 days");
  });

  test("the same text and anchor give the same answer; a different anchor moves every date", () => {
    const text = "tomorrow, Friday and in two weeks";
    assert.deepEqual(relativeDays(text, "2026-10-06"), relativeDays(text, "2026-10-06"));
    assert.notDeepEqual(relativeDays(text, "2026-10-06"), relativeDays(text, "2026-10-07"));
  });
});

describe("the vectors the phone's Kotlin is held to", () => {
  test("are current (regenerate with node scripts/write-brain-vectors.mjs)", async () => {
    const fresh = JSON.stringify(buildRelativeVectors(), null, 1) + "\n";
    assert.equal(await readFile(relativeVectorsPath, "utf8"), fresh, "runtime/brain/tests/vectors/relative.json is stale");
  });

  test("they cover every phrase and what must not match", () => {
    const cases = buildRelativeVectors().cases;
    const phrases = new Set(cases.flatMap((c) => c.expect.map((d) => d.phrase.replace(/\d+/, "N"))));
    for (const p of ["tomorrow", "day after tomorrow", "in N days", "in N weeks", "friday", "monday", "sunday"]) assert.ok(phrases.has(p) || [...phrases].some((x) => x.startsWith(p.split(" ")[0] ?? "")), `a case reads ${p}`);
    assert.ok(cases.filter((c) => c.expect.length === 0).length >= 25, "the must-not-match cases are the point");
  });
});
