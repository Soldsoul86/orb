/**
 * The three records that had no home — `docs/reviews/RECORDS.md`.
 *
 * Erasure confirmation, device revocation and unbindable intent were each raised
 * in a different domain review as *the kernel is missing a State contract*. None
 * of them was. Two are new Event types; the third already existed and was missing
 * only a reader.
 *
 * The negative controls carry the weight here. A projection that returned
 * everything would pass every positive assertion below, so each one is paired
 * with a record that must **not** be counted: a declaration for a different hash,
 * a device nobody revoked, a repeat that must not be collapsed.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  Journal,
  MemoryJournalStore,
  confirmationsFor,
  erasureDraft,
  revocationDraft,
  revokedDevices,
  unbindableDraft,
  unbindableIntents,
  unconfirmedHolders,
} from "../src/index.js";

/** A journal on its own lane, as a distinct device. */
async function deviceLane(lane: string, device: string) {
  const store = new MemoryJournalStore();
  const journal = await Journal.open({ lane, device, store });
  return { store, journal };
}

describe("erasure confirmation — the record already existed", () => {
  test("the confirming device is the lane, never a field", async () => {
    // Two devices each declare the same payload erased, on their own lanes.
    const a = await deviceLane("phone", "phone-01");
    const b = await deviceLane("mac", "mac-01");
    await a.journal.appendOne(erasureDraft({ lane: "phone", hash: "target" }));
    await b.journal.appendOne(erasureDraft({ lane: "phone", hash: "target" }));

    const events = [...(await a.store.read("phone")), ...(await b.store.read("mac"))];
    const confirmed = confirmationsFor(events, "target");

    assert.deepEqual([...confirmed].sort(), ["mac-01", "phone-01"]);
    // The payload carries `{lane, hash}` and nothing else. Who confirmed comes
    // from the envelope, which is what makes it unforgeable: a device writes
    // only its own lane.
    const [declaration] = await b.store.read("mac");
    assert.ok(declaration);
    assert.equal(declaration.device, "mac-01");
  });

  test("a declaration for a different payload is not a confirmation", async () => {
    const a = await deviceLane("phone", "phone-01");
    await a.journal.appendOne(erasureDraft({ lane: "phone", hash: "other" }));

    const confirmed = confirmationsFor(await a.store.read("phone"), "target");
    assert.equal(confirmed.size, 0, "erasing something else confirms nothing");
  });

  test("unconfirmed is not refusing — and names who is missing", async () => {
    const a = await deviceLane("phone", "phone-01");
    await a.journal.appendOne(erasureDraft({ lane: "phone", hash: "target" }));

    const confirmed = confirmationsFor(await a.store.read("phone"), "target");
    const holders = ["phone-01", "mac-01", "tablet-01"];

    // D5's honest sentence: gone here, one of three confirmed, two not seen.
    assert.deepEqual(unconfirmedHolders(holders, confirmed), ["mac-01", "tablet-01"]);
  });
});

describe("device revocation — a statement about the future", () => {
  test("history written while trusted stays valid", async () => {
    const a = await deviceLane("phone", "phone-01");
    await a.journal.appendOne(revocationDraft({ device: "lost-02", fromHash: "h9" }));

    const revoked = revokedDevices(await a.store.read("phone"));
    assert.equal(revoked.get("lost-02"), "h9");
    // The point acceptance stops is the whole record. Without it, "revoked"
    // would be ambiguous between *stop here* and *none of it ever counted*,
    // and the second reading would rewrite history nobody is allowed to rewrite.
    assert.notEqual(revoked.get("lost-02"), null);
  });

  test("a device nobody revoked is absent, not present-and-null", async () => {
    const a = await deviceLane("phone", "phone-01");
    await a.journal.appendOne(revocationDraft({ device: "lost-02", fromHash: "h9" }));

    const revoked = revokedDevices(await a.store.read("phone"));
    assert.equal(revoked.has("mac-01"), false);
    // `absent` and `revoked from the beginning` are different facts and a caller
    // that read a missing key as null would revoke every device it had not heard
    // about — the keyring's absent/destroyed confusion, one layer up.
    assert.equal(revoked.get("mac-01"), undefined);
  });

  test("revoked from the beginning is spelled differently, and wins", async () => {
    const a = await deviceLane("phone", "phone-01");
    await a.journal.appendOne(revocationDraft({ device: "bad-03", fromHash: null }));
    // A later, wider revocation must not widen it back.
    await a.journal.appendOne(revocationDraft({ device: "bad-03", fromHash: "h5" }));

    const revoked = revokedDevices(await a.store.read("phone"));
    assert.equal(revoked.get("bad-03"), null, "the narrower bound holds");
  });
});

describe("unbindable intent — a record of could not, not of chose not", () => {
  test("the count separates an empty runtime from a real gap", async () => {
    const a = await deviceLane("phone", "phone-01");
    await a.journal.appendOne(unbindableDraft({ intent: "intent-1", consideredCount: 0 }));
    await a.journal.appendOne(unbindableDraft({ intent: "intent-2", consideredCount: 40 }));

    // Read through the journal, not the store: an unbindable intent is content,
    // so its envelope says `orb.content` and its real type lives in the payload.
    // That is the coarsening working, not a defect — see `vocabulary.ts`.
    const found = unbindableIntents(await a.journal.readAll());
    assert.equal(found.length, 2);
    // Nothing loaded versus forty loaded and none fitting are different
    // findings. A bare absence renders them identically.
    assert.equal(found[0]?.consideredCount, 0);
    assert.equal(found[1]?.consideredCount, 40);
  });

  test("the same intent failing twice is two findings, not one", async () => {
    const a = await deviceLane("phone", "phone-01");
    await a.journal.appendOne(unbindableDraft({ intent: "intent-1", consideredCount: 3 }));
    await a.journal.appendOne(unbindableDraft({ intent: "intent-1", consideredCount: 9 }));

    const found = unbindableIntents(await a.journal.readAll());
    // De-duplicating would hide that the gap survived a change to the
    // capability set — which is the one thing a run of these is evidence of.
    assert.equal(found.length, 2);
    assert.notEqual(found[0]?.consideredCount, found[1]?.consideredCount);
  });

  test("other events are not swept in", async () => {
    const a = await deviceLane("phone", "phone-01");
    await a.journal.appendOne(erasureDraft({ lane: "phone", hash: "target" }));
    await a.journal.appendOne(revocationDraft({ device: "lost-02", fromHash: "h9" }));

    const events = await a.store.read("phone");
    assert.equal(unbindableIntents(events).length, 0);
    // And the coarsening is why: revocation keeps its name on the wire,
    // unbindable does not.
    assert.equal(confirmationsFor(events, "nothing").size, 0);
    assert.equal(revokedDevices(events).size, 1, "and each reader sees only its own");
  });
});
