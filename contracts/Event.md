# Event — Contract Specification

```
Contract:   Event
Domain:     Reality
Kind:       State
Version:    v1
Status:     Accepted
Depends on: (none — the kernel's atom)
```

> The Event is the foundation of Orb. Every other contract ultimately reduces to,
> or is reconstructed from, Events. This specification is therefore the most
> load-bearing in the kernel. See `../docs/EVENT_MODEL.md` for the architecture it
> realizes.

**Why a permanent kernel contract?** Because it is the single irreducible unit of
history and the *only* write-path into the past. Every other contract is defined
in terms of, or reconstructed from, Events; remove it and there is no replay, no
provenance, no continuity — no Orb. Any future implementation, in any language,
must preserve exactly this atom. It is the most permanent contract in the system.

---

## 1. Semantics

An **Event** is the immutable, atomic record that *something happened* at a point
in causal time, on a specific device. It is the smallest indivisible unit of
history.

An Event is not an interpretation and asserts no truth beyond its own existence:
it states only "this payload was recorded, here, then." Meaning is assigned by the
layers above (Observation, Evidence, …); the Event itself is a sealed,
self-describing fact of the historical record.

Events are the **only** way information becomes part of Orb's history. There is no
other write path into the past.

---

## 2. Lifecycle

An Event has exactly two lifecycle moments and no third:

1. **Creation (append).** An Event is created only by being appended to its
   originating device's own lane. At creation it is assigned its identity, its
   lane position, its HLC timestamp, and its commitment to the prior Event in the
   lane. Creation is the only mutation an Event ever undergoes.
2. **Existence (forever).** Once appended, the Event exists unchanged for the life
   of the journal. It may be **read**, **replicated** to other devices, and
   **referenced** by later Events and by projections — none of which alter it.

There is no update, no deletion, and no archival that destroys an Event. Cold
storage may relocate an Event's bytes (`STORAGE.md`) but never changes its
identity, content, or replayability.

---

## 3. State transitions

An Event is **immutable State**, so it has no internal state machine of its own.
Its only transition is the one-way step into existence:

```
(absent) ──append──▶ (committed, immutable, forever)
```

What *does* transition is the **lane** the Event belongs to: appending an Event
advances the lane's head and extends its hash chain. The Event participates in
that transition exactly once, at creation, and never again. No transition can
move a committed Event back out of existence or into a modified form.

---

## 4. Invariants

1. **Immutable.** After creation, no field of an Event ever changes.
2. **Append-only.** An Event enters history only by appending to the creating
   device's own lane; it is never inserted, reordered, or removed.
3. **Globally unique identity.** Every Event has an identity unique across all
   devices and all time; identities are never reused.
4. **Single-writer provenance.** An Event records exactly one originating device
   and lane; a device appends only to its own lane.
5. **Causally placed.** Every Event carries an HLC timestamp; public ordering is
   `(HLC, lane)`, derived on read and never stored as a global sequence.
6. **Chained integrity.** Every Event commits to its predecessor in the lane, so
   any tampering, gap, or reordering is detectable.
7. **Opaque, versioned payload.** The Event carries a payload tagged with a schema
   id and version; the Event layer never interprets the payload.
8. **Replayable.** The set of all Events, folded in `(HLC, lane)` order,
   reconstructs all derived state exactly (for history) and structurally (for
   interpretation).

These invariants directly uphold Constitution Articles I (History) and IV
(Distribution).

---

## 5. Versioning rules

Under Article X, the Event contract evolves by **addition only**:

- **Payload schemas** may be added freely; each Event names its schema version.
  Old schemas remain valid forever; old Events keep their original schema.
- **New Event types** may be introduced as new payload schemas. They never change
  the meaning of existing types.
- The **envelope** of an Event (identity, lane, device, HLC, predecessor
  commitment, integrity) is **frozen at v1**. A change to the envelope's meaning
  is a breaking change and requires `Event v2` existing *alongside* v1 — never
  replacing it. v1 Events remain valid and replayable forever.
- No field is ever removed or repurposed; no existing field's semantics change.

---

## 6. Compatibility guarantees

Consumers may **permanently** rely on:

- An Event, once observed, never changes or disappears.
- An Event's identity is stable and globally unique forever.
- Ordering by `(HLC, lane)` is total, deterministic, and identical on every
  device.
- Integrity verification of a lane is always possible from the Events alone.
- Any historical schema version remains readable; readers upcast at read time and
  never by rewriting Events.

Explicitly **not** guaranteed:

- That two devices hold the *same set* of Events at the same wall-clock moment
  (replication is eventual; the union converges — `SYNC_PROTOCOL.md`).
- That wall-clock timestamps are accurate or monotonic; they are advisory only and
  never used for ordering.
- That payload *meaning* is stable across interpretation-layer model changes (the
  Event is stable; downstream interpretation may differ — determinism boundary).

---

## 7. Failure modes

- **Append failure (storage/crash).** If an append does not durably complete, the
  Event does **not** exist: there is no partially-committed Event. Recovery
  re-attempts the append idempotently by identity; a duplicate append of a known
  identity is a no-op.
- **Corruption detected on read.** A broken hash chain or failed integrity check
  marks the affected segment untrusted; it is never silently repaired. Recovery is
  by re-replicating the lane from a peer that holds an intact copy.
- **Foreign-lane injection attempt.** An Event purporting to extend a lane the
  device does not own, or that breaks the lane's chain, is **rejected**, never
  patched in.
- **Clock anomaly.** A misbehaving physical clock cannot corrupt ordering: HLC's
  logical component preserves causality regardless, and wall-clock is non-binding.

Never permitted, even under failure: mutating, reordering, or deleting a committed
Event; fabricating an identity; or accepting an unverified Event into history.

---

## 8. Examples

- **A photo is taken.** The camera sensor appends an Event on the Pixel's lane:
  type `observation`, payload referencing an Attachment, HLC stamped, chained to
  the prior Pixel Event. It is now permanent history.
- **The same moment, on two devices.** The Pixel records the photo; the Mac,
  minutes later, records an unrelated file edit. After sync, both devices hold
  both Events and order them identically by `(HLC, lane)` — with neither device
  acting as authority.
- **A model runs.** A Reasoner produces a belief; a `model_output` Event records
  the provider, version, prompt-template version, inputs (by Event reference),
  parameters, and output. Years later this Event still explains exactly what was
  concluded and how — even though a newer model would now conclude differently.
- **Tampering attempt.** An adversary edits a stored Event's payload. On next
  read, the lane's hash chain no longer verifies; the segment is flagged
  untrusted and re-replicated from a peer. The original history is restored; the
  edit never becomes truth.
