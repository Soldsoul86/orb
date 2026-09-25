# Attachment — Contract Specification

```
Contract:   Attachment
Domain:     Reality
Kind:       State
Version:    v1
Status:     Accepted
Depends on: Storage, Encryption
```

> An Attachment is the raw matter of reality — the bytes a photo, recording, or
> file is made of — held immutably and by reference. See `../docs/STORAGE.md` and
> `SECURITY.md`.

**Why a permanent kernel contract?** Because separating immutable, content-
addressed raw bytes from the replayable structured record is an architectural
decision, not an implementation detail. It is what keeps history small, uniform,
deduplicated, and replayable while the heavy content lives beside it and is
fetched only when needed. Any implementation must preserve this separation and the
content-addressed identity; therefore it is a contract, not a storage choice.

---

## 1. Semantics

An **Attachment** is an immutable, content-addressed blob of raw content that an
Observation or Evidence refers to: an image, an audio clip, a document, a message
body, a file. It is the unstructured payload of reality, separated from the
structured record that points at it.

Attachments exist so that history (Events, Observations) stays small, uniform,
and replayable while the heavy raw bytes live beside it, fetched only when
needed. An Attachment's **identity is its content**: the same bytes are the same
Attachment, always.

---

## 2. Lifecycle

1. **Ingestion.** A Sensor (or import) produces raw content; the content is hashed
   and stored, yielding an Attachment identified by that hash. It is *stored
   under a blinded address* derived from that identity, never under the identity
   itself (inv. 7).
2. **Reference.** An Observation or Evidence references the Attachment by its
   content hash. The reference enters history as an Event; the bytes do not.
3. **Resolution.** When a layer needs the raw content, it resolves the hash
   through Storage and decrypts it.
4. **Existence.** The Attachment persists, encrypted, for as long as anything
   references it (and, by default, for the life of the journal — continuity is the
   product). Cold raw content may be archived but remains resolvable.

---

## 3. State transitions

An Attachment is immutable State; its content never changes (a changed byte is a
*different* Attachment). Its operational states concern **availability**, not
content:

```
(stored, resolvable) ⇄ (cold/archived, resolvable on fetch)
        │
        └──(temporarily unavailable on this device)──▶ (re-replicated) ──▶ resolvable
```

Content is fixed at creation; only *where the bytes are* and *whether this device
currently holds them* may change. No transition alters the bytes or the identity.

---

## 4. Invariants

1. **Immutable.** Content never changes; identity equals the content hash.
2. **Content-addressed.** Identical content yields one identity; deduplication is
   inherent.
3. **Referenced, never inlined.** History points at Attachments by hash; raw
   bytes are never copied mutably into Events.
4. **Encrypted at rest.** Attachment bytes are always stored encrypted.
5. **Verifiable.** Resolved content can be re-hashed and checked against its
   identity; mismatch means corruption.
6. **Decoupled availability.** An Attachment may be unavailable on a device
   without invalidating the history that references it, and **absence always
   carries a reason**: never fetched, dropped for space, or destroyed by the
   owner. The three are not interchangeable — a peer that confuses the last with
   the first helpfully restores content its owner erased.
7. **Addressed by a blinded identity.** Identity is the content hash (inv. 2);
   the **storage address is not**. A store addressed by identity is a list of
   identities, so anyone reading it can test any file they already hold against
   it — encrypting the bytes hides the content, never *which* content. The
   address is therefore derived, `HMAC(addressSecret, identity)`: unguessable
   without the secret, recomputable from the identity so nothing extra is
   persisted, and rotatable, because nothing depends on it but local store
   layout. Rotation voids every address an adversary has collected. This secret
   is derived-by-design and is **not** an erasure key — inv. 8 destroys those.
8. **Erasable with its last reader.** An Attachment is encrypted under its own
   key, and that key is destroyed when no *readable* event references it any
   more. An erased event does not keep an Attachment alive: its payload is gone,
   so the reference is gone, and it can never resolve the content again. An
   event whose payload is merely unfetched or pruned is **unknown, not absent**,
   and blocks destruction until it can be read. Keys are stored, never derived —
   a derived key is re-derivable, and destroying it destroys nothing.

Upholds Constitution Articles I (History) and VIII (Ownership and Trust).

---

## 5. Versioning rules

- The **content-addressing scheme** (how identity is derived from content) is part
  of the v1 contract. Introducing a new hashing scheme is an *addition*: new
  Attachments may use a new scheme tag; existing Attachments keep their original
  identity and remain valid forever. The two coexist; old references never break.
- The **address-blinding scheme** (inv. 7) is deliberately **not** frozen, and
  this is the one asymmetry in this section. Identity is frozen because history
  references it and history is immutable; an address is referenced by nothing but
  the local store, so changing the scheme or rotating the secret re-addresses
  that store and breaks nothing. Rotation is a feature, not a migration: it voids
  every address an adversary has already collected. An implementation that froze
  the address scheme alongside the identity scheme would have thrown that away
  for symmetry's sake.
- The **at-rest encryption** obligation is frozen; strengthening the cipher is an
  implementation change behind `Encryption`, not a contract change.
- No change ever rewrites an existing Attachment's identity or content.

---

## 6. Compatibility guarantees

Consumers may permanently rely on:

- An Attachment's content and identity never change.
- A reference by content hash resolves to exactly those bytes, on any device that
  holds them, forever.
- Resolved content is verifiable against its hash.

Not guaranteed:

- That every device holds every Attachment's bytes at all times (large blobs may
  replicate lazily; references remain valid meanwhile).
- That an Attachment is *meaningful* — interpretation of its content is the job of
  Observation/Evidence and the layers above.

---

## 7. Failure modes

- **Unavailable bytes.** If the content is not present on this device, resolution
  fails gracefully and is retried via replication; the referencing history stays
  valid. The reference is never dropped to "fix" the gap.
- **Corruption.** Bytes that fail hash verification are rejected as corrupt and
  re-fetched from a peer; corrupt content never satisfies a resolution.
- **Storage pressure.** Cold Attachments may be archived to encrypted cold
  storage; they remain resolvable. Raw content is never silently destroyed while
  references exist.
- **Oversized content.** Ingestion bounds and chunking are implementation
  concerns; the contract guarantees only that whatever is ingested is immutable,
  addressed, and encrypted.

Never permitted: mutating Attachment content; storing it unencrypted; satisfying a
resolution with bytes that do not match the requested hash.

---

## 8. Examples

- **A photo.** A 4 MB image is hashed to `sha…abc` and stored encrypted; the
  camera Observation references `sha…abc`. The 4 MB never enters the journal.
- **Deduplication.** The same meme arrives twice over two messaging sensors; both
  Observations reference the identical hash; the bytes are stored once.
- **Cross-device fetch.** The Mac shows a timeline entry for a photo taken on the
  Pixel; on tap, it resolves the hash, fetches the encrypted bytes from the Pixel,
  verifies, and decrypts locally.
- **Tamper check.** A backup process flips a bit in a stored blob; on next
  resolution the re-hash mismatches, the blob is treated as corrupt, and an intact
  copy is re-replicated from a peer.

---

## 9. Open — non-normative

Nothing in this section is part of the contract. It records two questions this
contract does not answer, raised 2026-09-25 and set out in full in
`docs/ERASURE.md` §2c. **Both need answering before the first implementation,**
because §5 freezes content-addressing deliberately and a kernel contract is the
wrong thing to amend afterwards.

1. ~~**Erasure is not mentioned by any invariant above.**~~ **Ruled 2026-09-25
   by the operator: a per-Attachment key that dies with the last reference.**
   Now inv. 8, and set out with its mechanism in `ERASURE.md` §2c. Note that §1's
   *"persists for the life of the journal"* is a **retention default, not a
   guarantee against the owner** — it describes what happens when nobody erases
   anything, and inv. 8 governs when somebody does.

2. ~~**Inv. 2's deduplication is a confirmation oracle.**~~ **Ruled 2026-09-25:
   keep the identity, blind the address.** Now inv. 7, with the reasoning in
   `ERASURE.md` §2a. Inv. 2 and inv. 5 are deliberately untouched: the defect
   was never that identity is the content hash, but that the *address* was the
   same value, making the store a list of identities. Note that "the bytes are
   high-entropy so this is weak" was considered and rejected — the adversary
   does not guess, they hold the file and test it, which is how known-file
   detection works at scale. Two residuals stay open and are **not** closed by
   inv. 7: a durability peer holding encrypted blobs without keys still sees
   content hashes cross the wire (§2 step 3), and blob sizes remain visible in
   any store.

Closed alongside the first: inv. 6 previously let an Attachment be *"momentarily
unavailable"* with no reason recorded. Events had the same gap and it was closed
with `AbsenceReason` (`ERASURE.md` §7). Inv. 6 now carries the same three
reasons, and inv. 8 needs the distinction to work at all — *unknown* must block
a key destruction that *absent* would allow.
