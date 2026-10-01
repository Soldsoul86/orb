/**
 * The phone's erasures, read by the TypeScript side.
 *
 * `tests/fixtures/erasure-export.txt` is **written by `Erase.execute`** on real keys
 * (`tools/gen-erasure-export.sh`): the same photograph shared twice, the first erasure
 * kept by the second citation, the second destroying the key, and the same bytes then
 * offered again and refused. Two implementations of one rule — *a key is destroyed only
 * when no readable event still cites it* — are tested against each other, not against a
 * description (`DEVICE_LOOP.md` R2).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  Journal,
  MemoryJournalStore,
  confirmationsFor,
  erasedHashes,
  unwrapPayload,
  verifyLane,
} from "@orb/journal";
import { importExport, parseExport } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = () => readFile(join(here, "../../tests/fixtures/erasure-export.txt"), "utf8");

describe("an export in which the phone erased things", () => {
  test("verifies under the TypeScript verifier", async () => {
    const events = parseExport(await fixture());
    assert.doesNotThrow(() => verifyLane(events));
  });

  test("its declarations name the envelope hashes the TypeScript side computes", async () => {
    const events = parseExport(await fixture());
    const shares = events.filter((event) => event.type === "orb.shared");
    assert.equal(shares.length, 3);

    // The phone extracted these hashes from its own lines with a regex; they must be the
    // hashes the chain actually commits to, or every declaration would name nothing.
    const erased = erasedHashes(events);
    assert.equal(erased.size, 2);
    assert.ok(erased.has(shares[0]!.integrity.hash), "the first citation was declared erased");
    assert.ok(erased.has(shares[1]!.integrity.hash), "and the second");
    assert.ok(!erased.has(shares[2]!.integrity.hash), "the refused re-share was not");
  });

  test("a declaration says a lane and a hash, and nothing else", async () => {
    const declarations = parseExport(await fixture()).filter((event) => event.type === "orb.erasure");
    assert.equal(declarations.length, 2);
    for (const declaration of declarations) {
      const payload = unwrapPayload(declaration.payload) as Record<string, unknown>;
      assert.deepEqual(Object.keys(payload).sort(), ["hash", "lane"]);
    }
  });

  test("the phone is the confirming device, so declared-and-done is distinguishable from declared-only", async () => {
    const events = parseExport(await fixture());
    const first = events.find((event) => event.type === "orb.shared")!;
    const confirmed = confirmationsFor(events, first.integrity.hash);
    assert.deepEqual([...confirmed], [first.device]);
  });

  test("the refused re-share records erased, which is not unfetched", async () => {
    const shares = parseExport(await fixture()).filter((event) => event.type === "orb.shared");
    const refused = unwrapPayload(shares[2]!.payload) as Record<string, unknown>;
    assert.equal(refused["resolveOutcome"], "erased");
    assert.equal(refused["absenceReason"], "erased");
    assert.equal(refused["resolved"], false);
    assert.equal(refused["attachment"], undefined, "no identity is claimed for content that is not held");
  });

  test("the first two citations carry the same identity — one Attachment, two readers", async () => {
    const shares = parseExport(await fixture()).filter((event) => event.type === "orb.shared");
    const a = unwrapPayload(shares[0]!.payload) as Record<string, unknown>;
    const b = unwrapPayload(shares[1]!.payload) as Record<string, unknown>;
    assert.equal(a["attachment"], b["attachment"]);
    assert.equal(a["resolveOutcome"], "stored");
    assert.equal(b["resolveOutcome"], "held");
  });
});

describe("importing it", () => {
  const desk = () => Journal.open({ lane: "mac", device: "mac-01", store: new MemoryJournalStore() });

  test("the erasures are bookkeeping, not Observations; the three shares still are", async () => {
    const j = await desk();
    const result = await importExport(j, await fixture());
    assert.equal(result.replicated, 6);
    assert.equal(result.observed, 3, "an erasure declaration and a process start are Events");
  });

  test("and importing it again is a no-op", async () => {
    const j = await desk();
    await importExport(j, await fixture());
    const again = await importExport(j, await fixture());
    assert.equal(again.replicated, 0);
    assert.equal(again.observed, 0);
  });
});
