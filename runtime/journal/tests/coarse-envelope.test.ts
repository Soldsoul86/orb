/**
 * What the envelope migration was for.
 *
 * Every other test in this suite survived v2 — they check properties the
 * migration was careful not to break. None of them check what it bought, and a
 * property no test asserts is a property the next refactor removes for free.
 *
 * The four claims, from `docs/ERASURE.md` §2a and §2b:
 *
 * 1. An envelope says an event happened, of a coarse kind, at a time — and
 *    nothing else. No real type, no schema, no stated lineage.
 * 2. Bookkeeping stays legible, because sync machinery on devices holding no
 *    keys reads it.
 * 3. A payload cannot be confirmed by guessing it, because a nonce inside it
 *    means the caller's own plaintext does not hash to the commitment.
 * 4. Erasing a payload erases the event's kind and its stated lineage with it,
 *    and what remains says *cannot say* rather than *nothing*.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  CONTENT_SCHEMA,
  CONTENT_TYPE,
  CUSTODY_RECEIPT_TYPE,
  Journal,
  MemoryJournalStore,
  ancestorsOf,
  custodyReceiptDraft,
  hasPayload,
  hashPayload,
  indexLineage,
  isWrapped,
  storedPayload,
  verifyEvent,
  verifyLane,
  type EventDraft,
} from "../src/index.js";

const SCHEMA = { id: "test.diagnosis", version: 3 } as const;
const diagnosis = (text: string, causes: readonly string[] = []): EventDraft => ({
  type: "health.diagnosis",
  schema: SCHEMA,
  payload: { text },
  causes,
});

async function withStore() {
  const store = new MemoryJournalStore();
  const journal = await Journal.open({ lane: "pixel", device: "pixel-01", store });
  return { store, journal };
}

describe("the envelope says an event happened, and nothing more", () => {
  test("no real type, no real schema, no stated lineage", async () => {
    const { store, journal } = await withStore();
    const first = await journal.appendOne(diagnosis("a"));
    await journal.appendOne(diagnosis("b", [first.id]));

    // Read below the journal: this is the form a witness holds and the form
    // that crosses the wire.
    const [, second] = await store.read("pixel");
    assert.ok(second);

    assert.equal(second.type, CONTENT_TYPE, "the kind of event is not disclosed");
    assert.deepEqual(second.schema, CONTENT_SCHEMA, "nor the shape of its payload");
    assert.equal(second.causes, undefined, "nor what it was built on");
    assert.equal(second.v, 2);

    // The words themselves are of course inside the payload, which a witness
    // does not hold. What matters here is that stripping it leaves nothing.
    const { payload: _payload, ...envelope } = second as { payload?: unknown };
    assert.ok(
      !JSON.stringify(envelope).includes("health") &&
        !JSON.stringify(envelope).includes("diagnosis"),
      "the envelope names nothing about the subject",
    );
  });

  test("an envelope alone still verifies, which is the whole point of hiding it", async () => {
    const { store, journal } = await withStore();
    await journal.append([diagnosis("a"), diagnosis("b"), diagnosis("c")]);

    const stored = await store.read("pixel");
    const envelopes = stored.map((event) => {
      const { payload: _payload, ...rest } = event as { payload?: unknown };
      return rest as (typeof stored)[number];
    });
    assert.doesNotThrow(() => verifyLane(envelopes));
  });

  test("bookkeeping keeps its real name", async () => {
    const { store, journal } = await withStore();
    await journal.appendOne(custodyReceiptDraft({ lane: "mac", throughHash: "h", count: 1 }));

    const [receipt] = await store.read("pixel");
    assert.ok(receipt);
    // A witness holds no payloads ever and can never decrypt to discover that
    // an event was a receipt. Coarsening this would take the sync layer with it.
    assert.equal(receipt.type, CUSTODY_RECEIPT_TYPE);
  });
});

describe("a payload cannot be confirmed by guessing it", () => {
  test("knowing the exact plaintext does not reproduce the commitment", async () => {
    const { journal } = await withStore();
    const event = await journal.appendOne(diagnosis("a rare and identifying condition"));

    // The attack this closes: `payloadHash` lives in the plaintext envelope, so
    // without a nonce an adversary hashes each guess until one matches and
    // reads a predictable event with no key at all.
    const guess = { text: "a rare and identifying condition" };
    assert.notEqual(hashPayload(guess), event.integrity.payloadHash);

    // And the nonce is inside what the hash covers, or it would buy nothing.
    const wrapper = storedPayload(event);
    assert.ok(isWrapped(wrapper));
    assert.equal(hashPayload(wrapper), event.integrity.payloadHash);
    assert.match(wrapper.nonce, /^[0-9a-f]{32}$/);
  });

  test("the same event written twice is two unlinkable events", async () => {
    const { journal } = await withStore();
    const [a, b] = await journal.append([diagnosis("same"), diagnosis("same")]);
    assert.ok(a && b);
    assert.notEqual(a.integrity.payloadHash, b.integrity.payloadHash);
  });
});

describe("what a reader gets back is what the writer wrote", () => {
  test("presentation restores the event, and it still verifies in the hand", async () => {
    const { journal } = await withStore();
    const first = await journal.appendOne(diagnosis("a"));
    const written = await journal.appendOne(diagnosis("b", [first.id]));

    const [, read] = await journal.readLane("pixel");
    assert.ok(read && hasPayload(read));

    assert.equal(read.type, "health.diagnosis");
    assert.deepEqual(read.schema, SCHEMA);
    assert.deepEqual(read.causes, [first.id]);
    assert.deepEqual(read.payload, { text: "b" });

    // Append and read must not disagree about what an event is.
    assert.deepEqual(read, written);

    // The failure this guards is the alarming one: a caller verifies what it
    // just read and is told its history is corrupt when nothing is wrong.
    assert.equal(verifyEvent(read), true);
    assert.equal(verifyEvent(written), true);
  });
});

describe("erasing a payload erases the event's kind and its lineage", () => {
  test("nothing survives that says what was erased", async () => {
    const { store, journal } = await withStore();
    const cause = await journal.appendOne(diagnosis("the finding"));
    const derived = await journal.appendOne(diagnosis("the conclusion", [cause.id]));

    await store.detach("pixel", [derived.id], "erased");

    const [, after] = await journal.readLane("pixel");
    assert.ok(after);
    assert.equal(hasPayload(after), false);
    assert.equal(after.type, CONTENT_TYPE, "not even its owner can see what kind it was");
    assert.equal(after.causes, undefined, "and its stated lineage went with it");

    // The residue is the fact that an event happened, and its place in the
    // chain. That is deliberate: history may not shrink silently.
    assert.equal(after.integrity.hash, derived.integrity.hash);
  });

  test("a provenance walk across an erased event is open, not closed", async () => {
    const { store, journal } = await withStore();
    const cause = await journal.appendOne(diagnosis("the finding"));
    const derived = await journal.appendOne(diagnosis("the conclusion", [cause.id]));

    const before = ancestorsOf(indexLineage(await journal.readLane("pixel")), [derived.id]);
    assert.deepEqual(before.ids, [cause.id]);
    assert.equal(before.closed, true);

    await store.detach("pixel", [derived.id], "erased");

    // The distinction the whole design turns on. An erased event states no
    // causes, and reporting that as "built on nothing" would be a closed walk
    // over a history nobody read — a false claim of completeness, in the
    // direction that hides the erasure.
    const after = ancestorsOf(indexLineage(await journal.readLane("pixel")), [derived.id]);
    assert.deepEqual(after.ids, [], "the walk cannot continue");
    assert.equal(after.closed, false, "and says so");
    assert.deepEqual(after.unresolved, [derived.id]);
  });
});
