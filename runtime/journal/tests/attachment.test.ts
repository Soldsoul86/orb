/**
 * Attachments — `contracts/Attachment.md`.
 *
 * The invariants that carry the weight here are the two operator rulings —
 * inv. 7's blinded address and inv. 8's key that dies with the last reader — and
 * inv. 6's rule that absence always carries a reason, since *"a peer that
 * confuses the last with the first helpfully restores content its owner
 * erased."*
 *
 * Encryption is real rather than stubbed, so these demonstrate the property
 * itself — ciphertext nobody can open — instead of demonstrating that a flag
 * was flipped.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import {
  AttachmentCorrupt,
  Journal,
  MemoryAttachmentKeyring,
  MemoryAttachmentStore,
  MemoryJournalStore,
  attachmentIdentity,
  blindedAddress,
  destroyAttachment,
  evaluateDestruction,
  putAttachment,
  resolveAttachment,
  rotateAddresses,
  type AttachmentPorts,
  type AttachmentReferences,
  type DetachedEvent,
  type OrbEvent,
  type StoredEvent,
} from "../src/index.js";

const photo = Buffer.from("the bytes of a photograph");
const other = Buffer.from("a different photograph");

function ports(addressSecret: Buffer = randomBytes(32)): AttachmentPorts {
  return { store: new MemoryAttachmentStore(), keyring: new MemoryAttachmentKeyring(), addressSecret };
}

const NOTE_SCHEMA = { id: "test.note", version: 1 } as const;
const citing = (identity: string) => ({
  type: "note",
  schema: NOTE_SCHEMA,
  payload: { attachments: [identity] },
});

/** The extractor a real caller supplies: which identities a payload cites. */
const references: AttachmentReferences = (event) => {
  const payload = (event as OrbEvent).payload as { attachments?: readonly string[] };
  return payload?.attachments ?? [];
};

function detach(event: StoredEvent, absence: "unfetched" | "pruned" | "erased"): DetachedEvent {
  const { payload: _payload, ...envelope } = event as OrbEvent;
  return { ...envelope, absence };
}

async function laneCiting(identity: string) {
  const journal = await Journal.open({
    lane: "pixel",
    device: "pixel-01",
    store: new MemoryJournalStore(),
  });
  const [event] = await journal.append([citing(identity)]);
  assert.ok(event);
  return event;
}

describe("identity is content, and content alone", () => {
  test("the same bytes are the same Attachment, always", () => {
    assert.equal(attachmentIdentity(photo), attachmentIdentity(Buffer.from(photo)));
    assert.notEqual(attachmentIdentity(photo), attachmentIdentity(other));
  });

  test("identity is scheme-tagged, so a new scheme can be an addition", () => {
    // §5: a new hashing scheme is an addition, not a migration — new Attachments
    // may carry a new tag while old ones stay valid for ever. An untagged
    // identity would make that a guess.
    assert.match(attachmentIdentity(photo), /^sha256:[0-9a-f]{64}$/);
  });

  test("storing the same content twice is one Attachment", async () => {
    const p = ports();
    const first = await putAttachment(p, photo);
    const second = await putAttachment(p, Buffer.from(photo));

    assert.equal(first, second);
    assert.equal((await p.store.addresses()).length, 1, "deduplication is inherent, not a feature");
  });

  test("a second put does not mint a second key", async () => {
    // Resealing would leave the first ciphertext unreadable but undestroyed, and
    // inv. 8 counts keys rather than copies.
    const p = ports();
    const identity = await putAttachment(p, photo);
    const sealedFirst = await p.store.get(blindedAddress(p.addressSecret, identity));
    await putAttachment(p, Buffer.from(photo));
    const sealedAfter = await p.store.get(blindedAddress(p.addressSecret, identity));

    assert.equal(sealedFirst.state, "held");
    assert.equal(sealedAfter.state, "held");
    if (sealedFirst.state !== "held" || sealedAfter.state !== "held") return;
    assert.deepEqual(sealedAfter.sealed.sealed, sealedFirst.sealed.sealed, "untouched");
  });
});

describe("the address is not the identity", () => {
  test("a store holds no identities, so it cannot be tested against a file", async () => {
    // inv. 7: a store addressed by identity is a list of identities, and anyone
    // reading it can test any file they already hold against it. Encrypting the
    // bytes hides the content, never *which* content.
    const p = ports();
    const identity = await putAttachment(p, photo);
    const [address] = await p.store.addresses();

    assert.ok(address);
    assert.notEqual(address, identity);
    assert.equal(address.includes(identity.split(":")[1] ?? ""), false);
  });

  test("two devices with different secrets store one photo at different addresses", async () => {
    const mine = ports();
    const theirs = ports();
    const identity = await putAttachment(mine, photo);
    await putAttachment(theirs, photo);

    assert.notDeepEqual(await mine.store.addresses(), await theirs.store.addresses());
    assert.equal(attachmentIdentity(photo), identity, "while the identity is shared");
  });

  test("rotation re-addresses and voids what an adversary collected", async () => {
    // inv. 7 calls rotation a feature rather than a migration, because nothing
    // depends on an address but local store layout.
    const p = ports();
    const identity = await putAttachment(p, photo);
    const before = (await p.store.addresses())[0];

    const next = randomBytes(32);
    assert.equal(await rotateAddresses(p, next, [identity]), 1);

    const rotated: AttachmentPorts = { ...p, addressSecret: next };
    const after = await rotated.store.get(blindedAddress(next, identity));
    assert.equal(after.state, "held", "and the bytes are still resolvable");
    assert.notEqual(blindedAddress(next, identity), before);

    const held = await resolveAttachment(rotated, identity);
    assert.equal(held.state, "held");
  });
});

describe("resolving, and why it is not here", () => {
  test("bytes come back, verified against their identity", async () => {
    const p = ports();
    const identity = await putAttachment(p, photo);
    const resolved = await resolveAttachment(p, identity);

    assert.equal(resolved.state, "held");
    if (resolved.state !== "held") return;
    assert.deepEqual(resolved.bytes, photo);
  });

  test("content that does not hash to its identity is corruption, not content", async () => {
    // inv. 5. The check is what makes the source not matter: bytes from a peer,
    // a relay or a stranger are checked against history before being trusted.
    const p = ports();
    const identity = await putAttachment(p, photo);
    const address = blindedAddress(p.addressSecret, identity);
    // Seal *different* bytes under the same identity's key, as a tampering peer
    // with the key would.
    await p.store.put(address, await p.keyring.seal(identity, other));

    await assert.rejects(() => resolveAttachment(p, identity), AttachmentCorrupt);
  });

  test("never fetched and dropped for space are different answers", async () => {
    const p = ports();
    const identity = await putAttachment(p, photo);

    // The key is here and the bytes are not: a device that has not fetched them.
    const elsewhere: AttachmentPorts = { ...p, store: new MemoryAttachmentStore() };
    const unfetched = await resolveAttachment(elsewhere, identity);
    assert.equal(unfetched.state, "absent");
    if (unfetched.state === "absent") assert.equal(unfetched.reason, "unfetched");

    await p.store.drop(blindedAddress(p.addressSecret, identity), "pruned");
    const pruned = await resolveAttachment(p, identity);
    assert.equal(pruned.state, "absent");
    if (pruned.state === "absent") assert.equal(pruned.reason, "pruned");
  });

  test("a key that has not arrived is not an erasure", async () => {
    // The confusion inv. 6 warns about, facing the other way. A device the key
    // has not reached is missing something it can still be sent; telling its
    // owner the photo was destroyed would be false and unrecoverable-sounding.
    const p = ports();
    const identity = await putAttachment(p, photo);
    const noKey: AttachmentPorts = { ...p, keyring: new MemoryAttachmentKeyring() };

    const resolved = await resolveAttachment(noKey, identity);
    assert.equal(resolved.state, "absent");
    if (resolved.state !== "absent") return;
    assert.equal(resolved.reason, "unfetched");
    assert.notEqual(resolved.reason, "erased");
  });

  test("an erasure cannot be undone by the same bytes arriving again", async () => {
    // Without a tombstone, a keyring would mint a fresh key on the next `put`
    // and the identical photo would become readable again — the erasure quietly
    // reversed by an accident of timing.
    const p = ports();
    const identity = await putAttachment(p, photo);
    await p.keyring.destroy(identity);

    await assert.rejects(() => putAttachment(p, Buffer.from(photo)), /destroyed/);
    assert.equal(await p.keyring.state(identity), "destroyed");
  });

  test("a destroyed key reads as erased even with the ciphertext still there", async () => {
    // inv. 8's whole point, and inv. 6's warning: reporting `unfetched` here
    // would invite a peer to helpfully restore content its owner destroyed.
    const p = ports();
    const identity = await putAttachment(p, photo);
    await p.keyring.destroy(identity);

    const held = await p.store.get(blindedAddress(p.addressSecret, identity));
    assert.equal(held.state, "held", "the bytes are still on the disk");

    const resolved = await resolveAttachment(p, identity);
    assert.equal(resolved.state, "absent");
    if (resolved.state === "absent") assert.equal(resolved.reason, "erased");
  });
});

describe("erasable with its last reader", () => {
  test("a readable event citing it keeps it", async () => {
    const identity = attachmentIdentity(photo);
    const event = await laneCiting(identity);

    const verdict = evaluateDestruction([event], identity, references);
    assert.equal(verdict.state, "referenced");
    if (verdict.state === "referenced") assert.deepEqual(verdict.by, [event.id]);
  });

  test("nothing citing it, and nothing that might, means destroy", async () => {
    const event = await laneCiting(attachmentIdentity(other));
    const verdict = evaluateDestruction([event], attachmentIdentity(photo), references);
    assert.equal(verdict.state, "unreferenced");
  });

  test("an erased event does not keep an Attachment alive", async () => {
    // inv. 8: its payload is gone, so the reference is gone, and it can never
    // resolve the content again. Otherwise an erasure would pin the bytes it was
    // meant to release.
    const identity = attachmentIdentity(photo);
    const event = await laneCiting(identity);

    const verdict = evaluateDestruction([detach(event, "erased")], identity, references);
    assert.equal(verdict.state, "unreferenced");
  });

  test("an unfetched or pruned event blocks destruction — unknown, not absent", async () => {
    const identity = attachmentIdentity(photo);
    const event = await laneCiting(identity);

    for (const absence of ["unfetched", "pruned"] as const) {
      const verdict = evaluateDestruction([detach(event, absence)], identity, references);
      assert.equal(verdict.state, "unknown", `${absence} is not an answer`);
      if (verdict.state === "unknown") assert.deepEqual(verdict.blockedBy, [event.id]);
    }
  });

  test("destruction refuses on every verdict but unreferenced", async () => {
    const identity = attachmentIdentity(photo);
    const event = await laneCiting(identity);

    for (const [events, expected] of [
      [[event], "referenced"],
      [[detach(event, "pruned")], "unknown"],
    ] as const) {
      const p = ports();
      await putAttachment(p, photo);
      const result = await destroyAttachment(p, identity, events, references);

      assert.equal(result.destroyed, false);
      assert.equal(result.verdict.state, expected);
      assert.equal(await p.keyring.holds(identity), true, "the key survives a refusal");
    }
  });

  test("when nothing readable cites it, the key goes and the bytes go inert", async () => {
    const identity = attachmentIdentity(photo);
    const p = ports();
    await putAttachment(p, photo);
    const gone = await laneCiting(attachmentIdentity(other));

    const result = await destroyAttachment(p, identity, [gone], references);
    assert.equal(result.destroyed, true);
    assert.equal(await p.keyring.holds(identity), false);

    const resolved = await resolveAttachment(p, identity);
    assert.equal(resolved.state, "absent");
    if (resolved.state === "absent") assert.equal(resolved.reason, "erased");
  });

  test("one readable citation outweighs any number of unknowns", async () => {
    const identity = attachmentIdentity(photo);
    const reader = await laneCiting(identity);
    const maybe = await laneCiting(identity);

    const verdict = evaluateDestruction(
      [detach(maybe, "pruned"), reader, detach(maybe, "unfetched")],
      identity,
      references,
    );
    // Both block, but only one of them is a *reason* — and the caller needs the
    // informative answer, not merely the safe one.
    assert.equal(verdict.state, "referenced");
  });
});
