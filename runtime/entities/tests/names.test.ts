/** Every hand-written name case, the bounds, determinism and the vectors — the TypeScript reference (`docs/PEOPLE_PHONE.md`). */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { NAME_MAX_CHARS, matchNames, sharedFirstNames } from "../src/index.js";
import { NAME_CASES } from "./name-cases.js";
import { buildNameVectors, nameVectorsPath } from "./name-vectors-build.js";

describe("names are matched by rule, exactly as written down", () => {
  for (const c of NAME_CASES) {
    test(c.name, () => {
      assert.deepEqual(matchNames(c.text, c.contacts), c.expect);
      if (c.shared !== undefined) assert.deepEqual(sharedFirstNames(c.contacts), c.shared);
    });
  }
});

describe("bounds and determinism", () => {
  test("only the first million characters are read", () => {
    const contacts = [{ id: "1", name: "Priya Shah" }];
    assert.equal(matchNames(`${"a ".repeat(499_990)} Priya`, contacts).length, 1);
    assert.deepEqual(matchNames(`${"a ".repeat(500_001)}Priya`, contacts), []);
    assert.ok("a ".repeat(500_001).length > NAME_MAX_CHARS);
  });

  test("the same input gives the same answer", () => {
    const contacts = [{ id: "1", name: "Priya Shah" }, { id: "2", name: "Anil" }];
    assert.deepEqual(matchNames("Anil and Priya", contacts), matchNames("Anil and Priya", contacts));
  });
});

describe("the vectors the phone's Kotlin is held to", () => {
  test("are current (regenerate with node scripts/write-brain-vectors.mjs)", async () => {
    const fresh = JSON.stringify(buildNameVectors(), null, 1) + "\n";
    assert.equal(await readFile(nameVectorsPath, "utf8"), fresh, "runtime/brain/tests/vectors/names.json is stale");
  });

  test("they cover both kinds of match and what must not match", () => {
    const cases = buildNameVectors().cases;
    const kinds = new Set(cases.flatMap((c) => c.expect.map((m) => m.by)));
    assert.deepEqual([...kinds].sort(), ["first", "full"]);
    assert.ok(cases.filter((c) => c.expect.length === 0).length >= 10, "the must-not-match cases are the point");
  });
});
