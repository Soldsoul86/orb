/**
 * Why a payload was pruned — `docs/DECISIONS.md` DR-7 and the gap its audit
 * found: `absence: "pruned"` alone cannot tell **a retention window that
 * expired** from **a device that ran short of room**.
 *
 * Those are opposite facts. The first is the system doing what it was told; the
 * second is a horizon quietly shortened by circumstance, with nobody having
 * agreed to the shorter one. A seven-day window is only auditable if a prune
 * says whether seven days is what ended it.
 *
 * The same three-way discipline as everywhere else applies to the field itself:
 * **absent means nobody recorded why**, and never a default.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  FileJournalStore,
  Journal,
  MemoryJournalStore,
  hasPayload,
  holdSince,
  type JournalStore,
  type RetentionPolicy,
  type StoredEvent,
} from "../src/index.js";

const NOTE_SCHEMA = { id: "test.note", version: 1 } as const;
const note = (text: string) => ({ type: "note", schema: NOTE_SCHEMA, payload: { text } });

const policy: RetentionPolicy = {
  ownedDevices: ["mac-01", "home-01"],
  pruneOrder: ["pixel-01", "mac-01"],
};

function reasonOf(event: StoredEvent | undefined): string | undefined {
  assert.ok(event, "the event should still be in the lane");
  assert.equal(hasPayload(event), false, "and its payload should be gone");
  return (event as { prunedBecause?: string }).prunedBecause;
}

/** Enough custody for the guard to permit, so refusals are never the reason. */
async function prunable(store: JournalStore = new MemoryJournalStore()) {
  const pixel = await Journal.open({ lane: "pixel", device: "pixel-01", store });
  const [first, second] = await pixel.append([note("a"), note("b")]);
  assert.ok(first && second);

  const lane = await pixel.readLane("pixel");
  const receipt = { lane: "pixel", throughHash: lane.at(-1)!.integrity.hash, count: lane.length };
  // Three other holders, not two: this device produced these events, so the
  // guard's backstop rule asks for one more than the usual K.
  for (const [lane, device] of [
    ["mac", "mac-01"],
    ["home", "home-01"],
    ["relay", "relay-01"],
  ] as const) {
    const peer = await Journal.open({ lane, device, store });
    await peer.append([
      {
        type: "orb.custody.receipt",
        schema: { id: "orb.custody.receipt", version: 1 },
        payload: receipt,
      },
    ]);
  }

  return { pixel, first, second };
}

describe("a prune says what wanted the payload gone", () => {
  test("a policy expiry names the policy", async () => {
    const { pixel, first } = await prunable();
    // The case DR-7 turns on: seven days, stated as the policy's own account of
    // itself rather than as a category someone chose afterwards.
    const window = holdSince(7 * 24 * 60 * 60 * 1000);
    await pixel.detach("pixel", [first.id], policy, window.describe);

    const lane = await pixel.readLane("pixel");
    assert.equal(reasonOf(lane.find((e) => e.id === first.id)), "hold:since:604800000ms");
  });

  test("space pressure says so, and reads differently", async () => {
    const { pixel, first } = await prunable();
    await pixel.detach("pixel", [first.id], policy, "space");

    const lane = await pixel.readLane("pixel");
    const reason = reasonOf(lane.find((e) => e.id === first.id));
    assert.equal(reason, "space");
    // The whole point: the two are distinguishable after the fact.
    assert.notEqual(reason, holdSince(7 * 24 * 60 * 60 * 1000).describe);
  });

  test("each prune keeps its own reason", async () => {
    const { pixel, first, second } = await prunable();
    await pixel.detach("pixel", [first.id], policy, "hold:since:604800000ms");
    await pixel.detach("pixel", [second.id], policy, "space");

    const lane = await pixel.readLane("pixel");
    assert.equal(reasonOf(lane.find((e) => e.id === first.id)), "hold:since:604800000ms");
    assert.equal(reasonOf(lane.find((e) => e.id === second.id)), "space");
  });

  test("a second prune does not rewrite the first one's reason", async () => {
    // The payload went when it went, for the reason it went. A later call
    // dropped nothing, so it has nothing to explain.
    const { pixel, first } = await prunable();
    await pixel.detach("pixel", [first.id], policy, "space");
    assert.equal(await pixel.detach("pixel", [first.id], policy, "a later excuse"), 0);

    const lane = await pixel.readLane("pixel");
    assert.equal(reasonOf(lane.find((e) => e.id === first.id)), "space");
  });
});

describe("absence of a reason is not a reason", () => {
  test("a store-level prune with nothing supplied records no reason at all", async () => {
    const store = new MemoryJournalStore();
    const pixel = await Journal.open({ lane: "pixel", device: "pixel-01", store });
    const [first] = await pixel.append([note("a")]);
    assert.ok(first);
    await store.detach("pixel", [first.id], "pruned");

    const [event] = await store.read("pixel");
    assert.equal(reasonOf(event), undefined);
    // Omitted, not present-and-undefined. A reader asking *was a reason
    // recorded* must get one answer, and `in` is the question they ask.
    assert.equal("prunedBecause" in (event as object), false);
  });

  test("an erasure never carries a prune motive, even when one is offered", async () => {
    const store = new MemoryJournalStore();
    const pixel = await Journal.open({ lane: "pixel", device: "pixel-01", store });
    const [first] = await pixel.append([note("a")]);
    assert.ok(first);
    await store.detach("pixel", [first.id], "erased", "hold:since:604800000ms");

    const [event] = await store.read("pixel");
    assert.equal(reasonOf(event), undefined);
    assert.equal((event as { absence?: string }).absence, "erased");
    // An erasure is explained by its declaration. A prune motive beside it
    // would explain the wrong disappearance.
  });

  test("raising a prune to an erasure drops the motive with it", async () => {
    const store = new MemoryJournalStore();
    const pixel = await Journal.open({ lane: "pixel", device: "pixel-01", store });
    const [first] = await pixel.append([note("a")]);
    assert.ok(first);
    await store.detach("pixel", [first.id], "pruned", "space");
    await store.detach("pixel", [first.id], "erased");

    const [event] = await store.read("pixel");
    assert.equal((event as { absence?: string }).absence, "erased");
    assert.equal("prunedBecause" in (event as object), false, "the motive went with the prune");
  });
});

describe("a restored payload carries no explanation for its absence", () => {
  for (const kind of ["memory", "file"] as const) {
    test(`${kind}: reattaching clears both the absence and its motive`, async (t) => {
      let directory: string | undefined;
      let store: JournalStore;
      if (kind === "file") {
        directory = await mkdtemp(join(tmpdir(), "orb-prune-"));
        store = await FileJournalStore.open(directory);
      } else {
        store = new MemoryJournalStore();
      }
      t.after(async () => {
        if (directory) await rm(directory, { recursive: true, force: true });
      });

      const pixel = await Journal.open({ lane: "pixel", device: "pixel-01", store });
      const [first] = await pixel.append([note("a")]);
      assert.ok(first);
      const payload = (first as { payload: unknown }).payload;

      await store.detach("pixel", [first.id], "pruned", "space");
      await store.attach("pixel", [{ eventId: first.id, payload }]);

      const [event] = await store.read("pixel");
      assert.ok(event);
      assert.equal(hasPayload(event), true, "the payload is back");
      // Both stores must agree on the shape. A reason for not holding something
      // held is a stale contradiction inside the same object, and the file store
      // used to keep `absence` here while the memory store dropped it.
      assert.equal("absence" in (event as object), false);
      assert.equal("prunedBecause" in (event as object), false);
    });
  }

  test("a reason survives a file store round trip through JSON", async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "orb-prune-"));
    t.after(async () => rm(directory, { recursive: true, force: true }));

    const store = await FileJournalStore.open(directory);
    const pixel = await Journal.open({ lane: "pixel", device: "pixel-01", store });
    const [first] = await pixel.append([note("a")]);
    assert.ok(first);
    await store.detach("pixel", [first.id], "pruned", "hold:since:604800000ms");

    // Reopened, so the assertion is about what reached the disk rather than what
    // is still in memory.
    const reopened = await FileJournalStore.open(directory);
    const [event] = await reopened.read("pixel");
    assert.equal(reasonOf(event), "hold:since:604800000ms");
  });
});
