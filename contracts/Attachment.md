# Attachment — Contract Specification

```
Contract:   Attachment
Domain:     Reality
Kind:       State
Version:    v1
Status:     Draft
Depends on: Storage, Encryption
```

> An Attachment is the raw matter of reality — the bytes a photo, recording, or
> file is made of — held immutably and by reference. See `../docs/STORAGE.md` and
> `SECURITY.md`.

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
   and stored, yielding an Attachment identified by that hash.
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
6. **Decoupled availability.** An Attachment may be momentarily unavailable on a
   device without invalidating the history that references it.

Upholds Constitution Articles I (History) and VIII (Ownership and Trust).

---

## 5. Versioning rules

- The **content-addressing scheme** (how identity is derived from content) is part
  of the v1 contract. Introducing a new hashing scheme is an *addition*: new
  Attachments may use a new scheme tag; existing Attachments keep their original
  identity and remain valid forever. The two coexist; old references never break.
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
