/**
 * "Show your working", enforced at the one moment it can be.
 *
 * `InferenceRecord.md` inv. 7, `Fact.md` and `Belief.md`: a derivation's inputs
 * appear in its `causes`, because erasure walks `causes` forward to find
 * everything built on erased content (`ERASURE.md` §3). Once an envelope is
 * coarsened it only says *content*, so the journal cannot tell a conclusion from
 * an observation afterwards. At append it still can — if the producer says so.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  Journal,
  MemoryJournalStore,
  UngroundedDerivationError,
  derivation,
  type EventDraft,
} from "../src/index.js";

const note = (text: string): EventDraft => ({
  type: "note",
  schema: { id: "test.note", version: 1 },
  payload: { text },
});
const CONCLUSION = { id: "test.conclusion", version: 1 } as const;

describe("a declared derivation must name what it was built from", () => {
  test("one that cites nothing is refused, and nothing is written", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    await journal.appendOne(note("ground"));
    const before = (await journal.readLane("pixel")).length;

    await assert.rejects(
      journal.appendOne({ type: "conclusion", schema: CONCLUSION, payload: {}, derivation: true }),
      UngroundedDerivationError,
    );
    assert.equal((await journal.readLane("pixel")).length, before);
  });

  test("an empty cause is not a cause", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    await assert.rejects(
      journal.appendOne({ type: "conclusion", schema: CONCLUSION, payload: {}, causes: [""], derivation: true }),
      UngroundedDerivationError,
    );
  });

  test("one bad draft refuses the whole batch", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const ground = await journal.appendOne(note("ground"));
    const before = (await journal.readLane("pixel")).length;

    await assert.rejects(
      journal.append([
        derivation({ type: "conclusion", schema: CONCLUSION, payload: { ok: true }, causes: [ground.id] }),
        { type: "conclusion", schema: CONCLUSION, payload: { ok: false }, derivation: true },
      ]),
      UngroundedDerivationError,
    );
    assert.equal((await journal.readLane("pixel")).length, before, "a half-appended batch would be worse");
  });

  test("a grounded derivation is written, with its causes", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const ground = await journal.appendOne(note("ground"));
    const written = await journal.appendOne(
      derivation({ type: "conclusion", schema: CONCLUSION, payload: { text: "built on it" }, causes: [ground.id] }),
    );
    assert.deepEqual(written.causes, [ground.id]);
  });

  test("the declaration is never stored — history's format does not change", async () => {
    const store = new MemoryJournalStore();
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01", store });
    const ground = await journal.appendOne(note("ground"));
    await journal.appendOne(
      derivation({ type: "conclusion", schema: CONCLUSION, payload: {}, causes: [ground.id] }),
    );
    for (const event of await store.read("pixel")) {
      assert.ok(!("derivation" in event), "the envelope must not grow a field");
      assert.ok(!JSON.stringify(event).includes("derivation"), "nor may the wrapped payload");
    }
    for (const event of await journal.readLane("pixel")) {
      assert.ok(!("derivation" in event));
    }
  });

  test("an observation still cites nothing, and that is legitimate", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const written = await journal.appendOne(note("the world said so"));
    assert.deepEqual(written.causes, []);
  });
});
