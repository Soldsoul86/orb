/**
 * Erasure: absence carries a reason, and the reason is obeyed.
 *
 * `docs/ERASURE.md`. Before this, `DetachedEvent` was `payload?: undefined` and
 * nothing else, so *dropped for space* and *destroyed by its owner* were the
 * same value. They mean opposite things to a peer, and the peer that restored a
 * destroyed payload would have been behaving correctly.
 *
 * The negative controls matter more than the positive ones here. A test that
 * only shows an erased payload is refused proves nothing on its own — a store
 * that refused everything would pass it. Each refusal below is paired with a
 * pruned payload travelling the same path and being restored.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ERASURE_SCHEMA,
  ERASURE_TYPE,
  FileJournalStore,
  Journal,
  LocalSyncPeer,
  MemoryJournalStore,
  erasedHashes,
  erasureDraft,
  hasPayload,
  holdEverything,
  isErased,
  isErasureDeclaration,
  pullFrom,
  type ErasureRecord,
  type LaneId,
  type PayloadRecord,
  type StoredEvent,
  type SyncPeer,
  type LaneWatermark,
  type EventEnvelope,
} from "../src/index.js";

const NOTE_SCHEMA = { id: "test.note", version: 1 } as const;
const note = (text: string) => ({ type: "note", schema: NOTE_SCHEMA, payload: { text } });

function detached(event: StoredEvent) {
  assert.ok(!hasPayload(event), "expected the payload to be gone");
  return event;
}

describe("absence carries a reason", () => {
  test("a payload this device never asked for is unfetched, not pruned", async () => {
    const pixel = await Journal.open({ lane: "pixel", device: "pixel-01" });
    await pixel.append([note("a"), note("b")]);

    const mac = await Journal.open({ lane: "mac", device: "mac-01" });
    await pullFrom(mac, new LocalSyncPeer(pixel), {
      describe: "hold:nothing",
      wants: () => false,
    });

    const replicated = await mac.readLane("pixel");
    assert.equal(replicated.length, 2);
    for (const event of replicated) {
      assert.equal(detached(event).absence, "unfetched");
      assert.equal(isErased(event), false);
    }
  });

  test("a payload dropped for space is pruned", async () => {
    const store = new MemoryJournalStore();
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01", store });
    const event = await journal.appendOne(note("a"));

    await store.detach("pixel", [event.id], "pruned");

    const [stored] = await journal.readLane("pixel");
    assert.ok(stored);
    assert.equal(detached(stored).absence, "pruned");
    assert.equal(isErased(stored), false);
  });

  test("a payload destroyed by its owner is erased", async () => {
    const store = new MemoryJournalStore();
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01", store });
    const event = await journal.appendOne(note("a"));

    await store.detach("pixel", [event.id], "erased");

    const [stored] = await journal.readLane("pixel");
    assert.ok(stored);
    assert.equal(detached(stored).absence, "erased");
    assert.equal(isErased(stored), true);
  });

  test("the reason survives a round trip through the file store", async () => {
    const directory = await mkdtemp(join(tmpdir(), "orb-erasure-"));
    try {
      const store = await FileJournalStore.open(directory);
      const journal = await Journal.open({ lane: "pixel", device: "pixel-01", store });
      const [kept, gone] = await journal.append([note("a"), note("b")]);
      assert.ok(kept && gone);

      await store.detach("pixel", [gone.id], "erased");
      await store.close();

      // A second store over the same directory: nothing is held in memory.
      const reopened = await FileJournalStore.open(directory);
      const events: readonly StoredEvent[] = await reopened.read("pixel");
      const revived = events.find((event) => event.id === gone.id);
      assert.ok(revived);
      assert.equal(detached(revived).absence, "erased");
      assert.ok(hasPayload(events.find((event) => event.id === kept.id)!));
      await reopened.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("a reason only ever moves toward erased", () => {
  /**
   * Found by a failing test rather than by review. A device that never held a
   * payload is `unfetched`, and `detach` originally acted only on payloads that
   * were present — so the owner's declaration reached it and changed nothing,
   * leaving it free to fetch the erased payload forever, purely because it had
   * not got round to asking yet.
   */
  test("an unfetched payload can still be raised to erased", async () => {
    const pixel = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const event = await pixel.appendOne(note("a"));

    const store = new MemoryJournalStore();
    const mac = await Journal.open({ lane: "mac", device: "mac-01", store });
    await pullFrom(mac, new LocalSyncPeer(pixel), { describe: "hold:nothing", wants: () => false });

    const before = (await mac.readLane("pixel")).find((held) => held.id === event.id);
    assert.ok(before);
    assert.equal(detached(before).absence, "unfetched");

    const changed = await store.detach("pixel", [event.id], "erased");
    assert.equal(changed, 1, "raising an absence is a change");

    const after = (await mac.readLane("pixel")).find((held) => held.id === event.id);
    assert.ok(after);
    assert.equal(isErased(after), true);
  });

  test("an unfetched payload is never relabelled pruned", async () => {
    const pixel = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const event = await pixel.appendOne(note("a"));

    const store = new MemoryJournalStore();
    const mac = await Journal.open({ lane: "mac", device: "mac-01", store });
    await pullFrom(mac, new LocalSyncPeer(pixel), { describe: "hold:nothing", wants: () => false });

    const changed = await store.detach("pixel", [event.id], "pruned");
    assert.equal(changed, 0, "nothing to drop, and nothing true to say");

    const after = (await mac.readLane("pixel")).find((held) => held.id === event.id);
    assert.ok(after);
    // `pruned` would claim this device once held the payload. It never did, and
    // a horizon explained by a false history is worse than an unexplained one.
    assert.equal(detached(after).absence, "unfetched");
  });

  test("erased is terminal — nothing downgrades it", async () => {
    const store = new MemoryJournalStore();
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01", store });
    const event = await journal.appendOne(note("a"));

    await store.detach("pixel", [event.id], "erased");
    assert.equal(await store.detach("pixel", [event.id], "pruned"), 0);
    assert.equal(await store.detach("pixel", [event.id], "erased"), 0, "and it is idempotent");

    const [after] = await journal.readLane("pixel");
    assert.ok(after);
    assert.equal(isErased(after), true);
  });
});

describe("the erasure declaration says almost nothing", () => {
  test("it carries a reference and the fact, and no more", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const target = await journal.appendOne(note("private"));

    const declaration = await journal.appendOne(
      erasureDraft({ lane: "pixel", hash: target.integrity.hash }),
    );

    assert.equal(declaration.type, ERASURE_TYPE);
    assert.deepEqual(declaration.schema, ERASURE_SCHEMA);
    // Guards the shape against drift. A record of *what* was erased is an
    // oracle (`ERASURE.md` §2b), so an added field is a defect until argued.
    assert.deepEqual(Object.keys(declaration.payload as object).sort(), ["hash", "lane"]);
    const record = declaration.payload as ErasureRecord;
    assert.equal(record.hash, target.integrity.hash);
    assert.ok(!JSON.stringify(record).includes("private"), "the subject must not appear");
  });

  test("declarations are collected from history, not stored as a set", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const [one, two, three] = await journal.append([note("a"), note("b"), note("c")]);
    assert.ok(one && two && three);

    await journal.append([
      erasureDraft({ lane: "pixel", hash: one.integrity.hash }),
      erasureDraft({ lane: "pixel", hash: three.integrity.hash }),
    ]);

    const erased = erasedHashes(await journal.readLane("pixel"));
    assert.equal(erased.size, 2);
    assert.ok(erased.has(one.integrity.hash));
    assert.ok(erased.has(three.integrity.hash));
    assert.ok(!erased.has(two.integrity.hash), "only what was declared");
  });

  test("a declaration whose own payload is gone is skipped, never guessed", async () => {
    const store = new MemoryJournalStore();
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01", store });
    const target = await journal.appendOne(note("a"));
    const declaration = await journal.appendOne(
      erasureDraft({ lane: "pixel", hash: target.integrity.hash }),
    );

    await store.detach("pixel", [declaration.id], "pruned");

    const events = await journal.readLane("pixel");
    assert.ok(events.some(isErasureDeclaration), "the declaration is still in history");
    // It is still a declaration, and it can no longer say what it referred to.
    // Acting on a guess would erase the wrong thing.
    assert.equal(erasedHashes(events).size, 0);
  });
});

describe("what was erased is never brought back", () => {
  test("attach restores a pruned payload and refuses an erased one", async () => {
    const store = new MemoryJournalStore();
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01", store });
    const [pruned, destroyed] = await journal.append([note("keep"), note("gone")]);
    assert.ok(pruned && destroyed);
    assert.ok(hasPayload(pruned) && hasPayload(destroyed));

    // What a peer would be holding, taken the way a peer gets it. Under v2 a
    // payload on the wire is the wrapper, nonce included — the caller's own
    // object no longer hashes to what the envelope commits to, which is the
    // confirmation oracle being closed rather than an inconvenience.
    const held = await journal.payloads("pixel", [pruned.id, destroyed.id]);
    assert.equal(held.length, 2);

    await store.detach("pixel", [pruned.id], "pruned");
    await store.detach("pixel", [destroyed.id], "erased");

    // Both payloads verify against their envelopes: the refusal is about the
    // reason for absence, never about the bytes failing a check.
    const restored = await journal.attach("pixel", held satisfies readonly PayloadRecord[]);

    assert.equal(restored, 1, "exactly the pruned one comes back");

    const events = await journal.readLane("pixel");
    const back = events.find((event) => event.id === pruned.id);
    const still = events.find((event) => event.id === destroyed.id);
    assert.ok(back && still);
    assert.ok(hasPayload(back), "pruned payloads are recoverable");
    assert.equal(isErased(still), true, "erased stays erased");
  });

  test("sync never asks a peer for an erased payload", async () => {
    const pixel = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const [kept, destroyed] = await pixel.append([note("a"), note("b")]);
    assert.ok(kept && destroyed);

    const store = new MemoryJournalStore();
    const mac = await Journal.open({ lane: "mac", device: "mac-01", store });
    await pullFrom(mac, new LocalSyncPeer(pixel), { describe: "hold:nothing", wants: () => false });

    // The mac holds both envelopes and neither payload. One of them it will
    // never be allowed to want again.
    await store.detach("pixel", [destroyed.id], "erased");

    const asked: string[] = [];
    const watched: SyncPeer = {
      device: "pixel-01",
      advertise: (): Promise<readonly LaneWatermark[]> => pixel.advertise(),
      tail: (lane: LaneId, after: string | null): Promise<readonly EventEnvelope[]> =>
        pixel.tail(lane, after),
      payloads: async (lane: LaneId, ids: readonly string[]) => {
        asked.push(...ids);
        return pixel.payloads(lane, ids);
      },
    };

    await pullFrom(mac, watched, holdEverything());

    // Asking is itself a disclosure: a request names the envelope to the peer.
    assert.ok(!asked.includes(destroyed.id), "the erased envelope was never named");
    assert.ok(asked.includes(kept.id), "and the request that should happen still does");

    const events = await mac.readLane("pixel");
    const still = events.find((event) => event.id === destroyed.id);
    assert.ok(still);
    assert.equal(isErased(still), true);
  });
});
