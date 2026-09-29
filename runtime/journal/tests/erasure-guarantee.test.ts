/**
 * What an erasure can promise about the bytes — `contracts/Storage.md` §7.
 *
 * The contract calls it a breach for a store that cannot reclaim bytes to report
 * success. These tests hold each store to the declaration it makes, and hold the
 * erasure plan to telling the owner what that declaration means — including the
 * case where nobody declared anything, which must read as *unknown*, never as
 * *nothing remains*.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  FileJournalStore,
  Journal,
  MemoryAttachmentStore,
  MemoryJournalStore,
  MemoryPayloadKeyring,
  decisionsRequired,
  planErasure,
  sealedStore,
  type EventDraft,
} from "../src/index.js";

const note = (text: string): EventDraft => ({
  type: "note",
  schema: { id: "test.note", version: 1 },
  payload: { text },
});

describe("every store declares what its erasure guarantees", () => {
  test("the memory store only unlinks", () => {
    assert.equal(new MemoryJournalStore().erasure, "bytes-unlinked");
  });

  test("the file store only unlinks — the disk may keep a copy", async () => {
    const directory = await mkdtemp(join(tmpdir(), "orb-erasure-"));
    try {
      const store = await FileJournalStore.open(directory);
      assert.equal(store.erasure, "bytes-unlinked");
      await store.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("the sealed store destroys the key, whatever it wraps", () => {
    const sealed = sealedStore(new MemoryJournalStore(), new MemoryPayloadKeyring());
    assert.equal(sealed.erasure, "key-destroyed");
  });

  test("the attachment store only unlinks; the keyring is what destroys", () => {
    assert.equal(new MemoryAttachmentStore().erasure, "bytes-unlinked");
  });

  test("a journal reports its store's declaration", async () => {
    const plain = await Journal.open({ lane: "pixel", device: "pixel-01" });
    assert.equal(plain.erasure, "bytes-unlinked");
    const sealed = await Journal.open({
      lane: "pixel",
      device: "pixel-01",
      store: sealedStore(new MemoryJournalStore(), new MemoryPayloadKeyring()),
    });
    assert.equal(sealed.erasure, "key-destroyed");
  });
});

describe("the plan tells the owner what the medium may still hold", () => {
  const setup = async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const target = await journal.appendOne(note("target"));
    return { events: await journal.readLane("pixel"), target };
  };

  test("an undeclared store is unknown, and D7 is asked — never silently skipped", async () => {
    const { events, target } = await setup();
    const plan = planErasure({ events, lane: "pixel", targets: [target.id] });
    assert.equal(plan.medium, "unknown");
    const d7 = plan.unavailable.find((gap) => gap.point === "D7");
    assert.ok(d7, "not knowing must be stated, not left to read as 'nothing remains'");
    assert.match(d7.reason, /Assume they can/);
    assert.ok(decisionsRequired(plan).includes("D7"));
  });

  test("bytes that may survive on the disk are a question the owner must answer", async () => {
    const { events, target } = await setup();
    const plan = planErasure({ events, lane: "pixel", targets: [target.id], medium: "bytes-unlinked" });
    assert.equal(plan.medium, "bytes-unlinked");
    assert.ok(!plan.unavailable.some((gap) => gap.point === "D7"), "it is known, so not unavailable");
    assert.ok(decisionsRequired(plan).includes("D7"));
  });

  test("a destroyed key leaves nothing readable, and is reported as such", async () => {
    const { events, target } = await setup();
    const plan = planErasure({ events, lane: "pixel", targets: [target.id], medium: "key-destroyed" });
    assert.equal(plan.medium, "key-destroyed");
    assert.ok(!plan.unavailable.some((gap) => gap.point === "D7"));
  });
});
