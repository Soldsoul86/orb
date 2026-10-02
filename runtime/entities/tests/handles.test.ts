/** Every hand-written handle case, the bounds, and determinism — the TypeScript reference (`docs/ENTITIES_PHONE.md`). */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { MAX_CHARS, MAX_HANDLES, extractHandles } from "../src/index.js";
import { CASES } from "./handle-cases.js";

describe("handles are found by rule, exactly as written down", () => {
  for (const c of CASES) {
    test(c.name, () => {
      assert.deepEqual(extractHandles(c.text), c.expect);
    });
  }
});

describe("bounds", () => {
  test("only the first million characters are read", () => {
    const padding = "a ".repeat(499_990); // 999,980 characters
    assert.deepEqual(extractHandles(`${padding} 9876543210`).map((h) => h.kind), ["phone"]);
    const past = "a ".repeat(500_001); // 1,000,002 characters
    assert.ok(past.length > MAX_CHARS);
    assert.deepEqual(extractHandles(`${past}9876543210`), []);
  });

  test("at most 200 distinct handles come back, the earliest", () => {
    const numbers = Array.from({ length: 300 }, (_, i) => `98765${String(10_000 + i).slice(-5)}`);
    const found = extractHandles(numbers.join(" "));
    assert.equal(found.length, MAX_HANDLES);
    assert.equal(found[0]?.value, `+91${numbers[0]}`);
    assert.equal(found.at(-1)?.value, `+91${numbers[199]}`);
  });
});

describe("determinism and purity", () => {
  test("the same text gives the same answer, and the input is not changed", () => {
    const text = "call 9876543210, pay ravi@oksbi, ₹1,200 on 12/10/2026 at https://example.com";
    const copy = `${text}`;
    assert.deepEqual(extractHandles(text), extractHandles(text));
    assert.equal(text, copy);
    assert.equal(extractHandles(text).length, 5);
  });

  test("a non-breaking space ends a link as a space does", () => {
    assert.deepEqual(extractHandles("https://example.com/a\u00a09876543210").map((h) => h.value), ["example.com", "+919876543210"]);
  });

  test("a card number appears nowhere in the answer", () => {
    const answer = JSON.stringify(extractHandles("card 4111 1111 1111 1111 and 9876543210"));
    assert.ok(!answer.includes("4111"));
  });
});
