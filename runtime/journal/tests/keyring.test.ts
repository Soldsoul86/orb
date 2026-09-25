/**
 * Per-payload keys, and what destroying one actually achieves.
 *
 * `docs/ERASURE.md` §2a. The operator ruled that erasure destroys rather than
 * deletes, because deletion reaches neither the residue in flash nor the copy on
 * a peer's disk. These tests are about the difference.
 *
 * Real AES-256-GCM rather than a stub, so what passes here is the property
 * itself — ciphertext nobody can open — and not the observation that a boolean
 * changed.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  Journal,
  MemoryJournalStore,
  MemoryPayloadKeyring,
  hasPayload,
  isErased,
  isSealed,
  sealedStore,
  verifiablePayload,
  verifyEvent,
  verifyLane,
  type EventDraft,
} from "../src/index.js";

const SCHEMA = { id: "test.note", version: 1 } as const;
const note = (text: string): EventDraft => ({ type: "note", schema: SCHEMA, payload: { text } });

function sealed() {
  const inner = new MemoryJournalStore();
  const keyring = new MemoryPayloadKeyring();
  return { inner, keyring, store: sealedStore(inner, keyring) };
}

describe("the store holds ciphertext, the journal sees plaintext", () => {
  test("a caller reads back exactly what it wrote", async () => {
    const { store } = sealed();
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01", store });
    await journal.append([note("a"), note("b")]);

    const events = await journal.readLane("pixel");
    assert.equal(events.length, 2);
    assert.deepEqual(events.map((e) => (hasPayload(e) ? e.payload : null)), [
      { text: "a" },
      { text: "b" },
    ]);
  });

  test("what actually sits in the store underneath is unreadable", async () => {
    const { inner, store } = sealed();
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01", store });
    await journal.appendOne(note("private"));

    const [raw] = await inner.read("pixel");
    assert.ok(raw && hasPayload(raw));
    assert.ok(isSealed(raw.payload), "the store below holds a sealed blob");
    assert.ok(
      !JSON.stringify(raw.payload).includes("private"),
      "and the plaintext is nowhere in it",
    );
  });

  test("the envelope stays plaintext, so a keyless device can still verify", async () => {
    const { inner, store } = sealed();
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01", store });
    await journal.append([note("a"), note("b"), note("c")]);

    // A witness holds envelopes and no keys at all (`WITNESSES.md` W2). Sealing
    // the envelope too would make integrity checkable only by the owner, which
    // would take the whole witness scheme with it.
    const stored = await inner.read("pixel");
    assert.doesNotThrow(() => verifyLane(stored));

    // And the reason this passes matters. Hashing a sealed blob against a
    // commitment made over the plaintext compares unrelated values: reporting
    // that as corruption would tell a witness its history was tampered with
    // every single time it looked. "Cannot check" is not "failed the check".
    const [first] = stored;
    assert.ok(first && hasPayload(first));
    assert.equal(verifiablePayload(first), false, "sealed payloads are not checkable here");
  });

  test("hashes are over plaintext, so sealing changes no integrity", async () => {
    const { inner, store } = sealed();
    const enciphered = await Journal.open({ lane: "pixel", device: "pixel-01", store });
    const written = await enciphered.appendOne(note("same"));

    // The store below holds ciphertext; the hash was taken over the plaintext
    // and still checks out when the payload is read back through the keyring.
    const [sealedRaw] = await inner.read("pixel");
    assert.ok(sealedRaw && hasPayload(sealedRaw) && isSealed(sealedRaw.payload));

    const [read] = await enciphered.readLane("pixel");
    assert.ok(read && hasPayload(read));
    assert.equal(read.integrity.payloadHash, written.integrity.payloadHash);
    assert.equal(verifyEvent(read), true, "sealing is invisible to verification");
  });

  test("two devices writing the same thing do not produce the same hash", async () => {
    const a = await Journal.open({ lane: "a", device: "a-01" });
    const b = await Journal.open({ lane: "b", device: "b-01" });

    const one = await a.appendOne(note("same"));
    const two = await b.appendOne(note("same"));

    // The v1 property this replaces was that identical payloads hash alike,
    // which made `payloadHash` a content address. The per-event nonce
    // (`payload.ts`) ends that deliberately: a guessable payload with a
    // convergent hash is a confirmation oracle — hash the guess, compare, and
    // read the event with no key at all.
    //
    // The cost is named here so it is not rediscovered as a bug: two devices
    // recording the same observation produce unlinkable events, so payloads
    // can never be deduplicated by hash across devices.
    assert.notEqual(one.integrity.payloadHash, two.integrity.payloadHash);
  });
});

describe("destroying the key is what erasure is", () => {
  test("the ciphertext survives and decodes nowhere", async () => {
    const { inner, keyring, store } = sealed();
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01", store });
    const target = await journal.appendOne(note("destroy me"));

    const before = await inner.read("pixel");
    const ciphertextBefore = hasPayload(before[0]!) ? before[0]!.payload : null;
    assert.ok(isSealed(ciphertextBefore));

    await store.detach("pixel", [target.id], "erased");

    // The bytes the store below was told to drop are gone, but the point is the
    // key: any copy of that ciphertext, anywhere, is now inert.
    assert.equal(await keyring.holds(target.id), false);
    assert.equal(await keyring.open(target.id, ciphertextBefore), null);
  });

  test("a peer's copy of the ciphertext is inert too", async () => {
    const { keyring, store } = sealed();
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01", store });
    const target = await journal.appendOne(note("shared"));

    // What a peer would be holding: the sealed blob, taken before the erasure.
    const copyHeldElsewhere = await keyring.seal(target.id, JSON.stringify({ text: "shared" }));

    await store.detach("pixel", [target.id], "erased");

    // This is the property deletion cannot deliver (§2a): erasure is local, and
    // a key that no longer exists reaches every copy regardless.
    assert.equal(await keyring.open(target.id, copyHeldElsewhere), null);
  });

  test("a pruned payload keeps its key, and comes back", async () => {
    const { keyring, store } = sealed();
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01", store });
    const target = await journal.appendOne(note("kept"));

    // Taken before the drop, the way a peer holds it: the v2 wrapper, not the
    // caller's own object, which no longer hashes to the envelope's commitment.
    const held = await journal.payloads("pixel", [target.id]);

    await store.detach("pixel", [target.id], "pruned");

    // The negative control. A keyring that destroyed keys on every detach would
    // pass every test above while making pruning silently irreversible.
    assert.equal(await keyring.holds(target.id), true);
    assert.equal(await journal.attach("pixel", held), 1);

    const [back] = await journal.readLane("pixel");
    assert.ok(back && hasPayload(back));
    assert.deepEqual(back.payload, { text: "kept" });
  });

  test("the keyring is the ground truth, not the stored marker", async () => {
    const { inner, keyring, store } = sealed();
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01", store });
    const target = await journal.appendOne(note("a"));

    // Destroy the key behind the store's back, leaving its marker untouched: the
    // state after a keyring restored from backup without its journal, or after
    // a partial failure. Reading must still report erasure.
    await keyring.destroy(target.id);
    assert.ok(hasPayload((await inner.read("pixel"))[0]!), "the store still thinks it has it");

    const [seen] = await journal.readLane("pixel");
    assert.ok(seen);
    assert.equal(isErased(seen), true);
  });

  test("a destroyed payload cannot be re-sealed back into existence", async () => {
    const { keyring, store } = sealed();
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01", store });
    const target = await journal.appendOne(note("gone"));
    const held = await journal.payloads("pixel", [target.id]);

    await store.detach("pixel", [target.id], "erased");

    // A peer helpfully returning the payload must not mint a fresh key for it.
    // That would undo an erasure without anyone deciding to. The payload is the
    // real one, taken before the erasure, so the refusal is about the reason for
    // absence and not about bytes that failed a check.
    const restored = await journal.attach("pixel", held);
    assert.equal(restored, 0);
    assert.equal(await keyring.holds(target.id), false);

    const [still] = await journal.readLane("pixel");
    assert.ok(still);
    assert.equal(isErased(still), true);
  });
});
