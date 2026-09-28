# Journal — Contract Specification

```
Contract:   Journal
Domain:     Infrastructure
Kind:       Service
Version:    v1
Status:     Draft
Depends on: Event, Storage, Encryption
```

> The Journal is the single source of truth. Every other structure in Orb is a
> projection of it and may be destroyed and rebuilt. See `../docs/EVENT_MODEL.md`,
> `../docs/STORAGE.md` and `../docs/PARTIAL_REPLICATION.md`.

**Why a permanent kernel contract?** Because *"there is one journal; everything
else derives from it"* (Art. IX §33) is not a property any implementation can hold
on its own. The moment a second component may accept history — a cache that
outlives the events it describes, a projection written to directly, a side file
holding "the last known state" — the sentence stops being true and nothing detects
it. Fixing **append-only, single-writer-per-lane, hash-chained, replayable** as a
permanent obligation is what makes Art. I enforceable rather than aspirational. The
*storage engine* underneath is replaceable, the *encoding* is versioned, and an
implementation in a second language already exists; the obligation is not.

---

## 1. Semantics

A **Journal** is a Service that accepts appends to the device's own lane, preserves
each lane's hash chain, and exposes replayable, ordered reads.

It is organised as **lanes**: one per device, each with a single writer. A device
appends only to its own lane and adopts others' lanes by replication. That is what
makes "append-only" survivable in a distributed system without consensus — two
devices never contend for one chain, so no append ever has to be undone.

Order across lanes is by **`(hlc, lane)`** — a hybrid logical clock with the lane
id as a total-order tiebreak. This is causal order, not wall-clock order, and the
distinction is load-bearing: wall clocks jump, and a journal ordered by them would
reorder history when a device's clock corrected itself.

### The envelope and the payload

An event is an **envelope** plus a **payload**, and the two have different
durability. Every device holds every envelope of every lane it replicates; a device
may hold only *some* payloads.

This split is what makes Art. I §2 — *events are never edited, reordered, or
deleted* — hold in the presence of erasure. **Ruled 2026-09-25, operator**
(`../docs/ERASURE.md` §2): *erase the payload, keep the envelope.* The sequence
keeps its length, its order and every hash; one event has no readable content any
more and says so. **The envelope with no payload is the tombstone** — not a separate
record that could itself be erased, so there is no regress.

The cost was accepted at the moment of ruling rather than discovered later: the
envelope still carries type and wall clock. What was granted is the right to erase
*what happened*, never the right to erase *that something happened*.

### Absence is never one thing

A payload this device does not hold is absent for one of three reasons, and they
are not interchangeable:

| reason | means |
| --- | --- |
| `unfetched` | never held — policy did not want it. The key can still be sent |
| `pruned` | held, then dropped to reclaim space or satisfy a retention window |
| `erased` | the owner destroyed it. Never fetchable again, on any device |

`prunedBecause` says *what wanted it gone* — an expired window, or a device short
of room. Those are opposite facts about a device, and `absence: "pruned"` alone
says neither.

---

## 2. Lifecycle

1. **Open.** The journal restores the local lane's head and clock from storage, so
   a restarted process continues the same chain rather than forking it, and
   verifies the local lane's integrity. A head that cannot be read is recorded as a
   **discontinuity** before anything else is written, so the break in the chain has
   an explanation sitting beside it rather than looking like tampering to whoever
   verifies it later.
2. **Append.** Drafts become events: id, `hlc`, `wallClock` and `integrity`
   assigned, appended to the local lane as one atomic, durable batch. Concurrent
   callers are serialised — two appends interleaving would produce two events
   claiming one predecessor, which is the single corruption the chain exists to
   make impossible.
3. **Replicate.** Events from a foreign lane are adopted, chain-checked, and
   skipped if already held. Idempotent by event id.
4. **Detach.** Payloads are dropped and envelopes kept, under a recorded reason.
5. **Read and replay.** Lanes, or everything, in `(hlc, lane)` order. Any
   projection is a fold over that.
6. **Continuity.** A journal is never finished. It has no terminal state, only a
   last event so far.

---

## 3. State transitions

A **lane** has exactly one transition, and it is the whole of Art. I:

```
(empty) ──append──▶ (height n) ──append──▶ (height n+1) ──▶ …   never backwards
```

What changes after an event exists is never the event and never the sequence:

```
(payload held) ──detach(pruned)────▶ (envelope, absence: pruned)
               ──detach(erased)────▶ (envelope, absence: erased)   terminal
(never held)   ──────────────────── (envelope, absence: unfetched)
                                          │
                                          └──erasure declaration──▶ erased
```

**Reasons move only toward `erased`, never back.** `unfetched` is never raised to
`pruned`: that would claim this device once held something it never held, and a
horizon explained by a false history is worse than one left unexplained.

As a Service the journal is `open` or `closed`. There is no degraded mode in which
it accepts an append it cannot chain.

---

## 4. Invariants

1. **Append-only.** The only write to history is an append (Art. I §1).
2. **The sequence is never edited, reordered, or shortened** (Art. I §2). Height
   never decreases; no hash ever changes; erasure removes content, never an event.
3. **Single writer per lane.** A device appends only to its own lane. Replication
   adopts; it never authors.
4. **The envelope is never absent.** A device that holds a lane holds every
   envelope in it. Only payloads are separable.
5. **Hash-chained and verifiable.** Every event commits to its predecessor, so
   corruption or rewriting is detectable (Art. I §5).
6. **A resolved append is history.** Durable before the call returns; a crash after
   it never loses the event, and a crash during it never leaves half a batch.
7. **The only source of truth.** Everything else derives, and may be discarded and
   rebuilt without loss (Art. I §3, IX §33). Nothing may be reconstructable only
   from a projection.
8. **All history enters here** (Art. IX §34). A component that recorded history
   elsewhere would be a second journal whatever it was called.
9. **Replication is idempotent** by event id, and refuses a batch that breaks the
   chain rather than accepting a fork.
10. **Absence carries its reason**, and reasons never move backward.
11. **Encrypted at rest** — delegated to `Encryption`, never re-implemented here.

Upholds Constitution Articles I (History), IV (Distribution), and IX §33–§34.

---

## 5. Versioning rules

- **New event types** are added freely; the journal never interprets a payload and
  so never needs to change to carry one.
- **The envelope is versioned.** v1 carries the event's real type; **v2 coarsens it
  to `orb.content`** so the envelope discloses less (`ERASURE.md` §2a). Both are
  implemented; v1 is the default. A journal must be able to read every version it
  has ever written, for ever.
- **Migrating a running device's envelope version is not a configuration change.**
  Machinery that finds an event by its fine type stops matching under v2 — silently,
  and in the direction that looks like nothing happening. Any such migration lands
  with a way to find that event that does not read the fine type off the line.
- The core obligation — *append-only, single-writer-per-lane, chained, replayable,
  envelope-never-absent* — is frozen at v1. Weakening it requires `Journal v2`
  alongside v1, never replacing it.

---

## 6. Compatibility guarantees

Consumers may permanently rely on:

- Replaying the same events yields the same projection, on any device, in any
  implementation, for ever.
- Height, order and hashes are stable under erasure — **erasure never looks like
  truncation**, so a witness attestation still reconciles after two hundred
  payloads are destroyed.
- Re-appending a known event is a no-op; replication cannot duplicate history.
- An event's envelope is readable even when its payload is not, so *something
  happened at this time, of this type* survives everything except the loss of the
  lane.

Not guaranteed:

- **That a payload is present.** Partial replication is the normal case, not a
  degraded one.
- **That two devices hold the same events.** They hold overlapping histories and
  reconcile; neither is authoritative over the other.
- **Wall-clock accuracy.** `wallClock` is what the device believed; `hlc` is what
  orders.
- **That a lane is complete.** A device that cannot answer says so through its
  horizon rather than answering incompletely.

---

## 7. Failure modes

- **Chain break found on open.** Recorded as a discontinuity, then operation
  continues. **It is never repaired**, because repairing it would be an edit, and
  because the break is evidence. See §8.
- **Unreadable history is not empty history.** A read that fails must not present
  as a journal with nothing in it. Every projection built on that confusion would
  report that everything had just appeared, or just vanished.
- **A payload is absent.** Three reasons, never merged (§1). A reader that cannot
  distinguish them will restore what its owner destroyed.
- **Storage cannot durably append.** The append fails and no event exists. A
  journal never reports an append it could not persist; a resolved append is a
  promise, and a broken promise here is a fork.
- **Storage loses the head.** Recovered by re-reading the lane; if the head is
  genuinely unreadable, §2's discontinuity applies. What is never done is starting a
  fresh chain beside the old one and calling it continuous.
- **A replicated batch breaks the chain.** Refused whole. A partly-imported chain is
  the worst shape available: a gap that looks like history.
- **Two writers on one lane.** A defect, not a race to resolve. The chain makes it
  detectable and nothing in the contract makes it recoverable — which is why
  invariant 3 exists.

---

## 8. Examples

- **A chain that kept the evidence of its author's bug.** Pass 1's journal carries a
  break at line 4: `"previous": "35"`, the two-digit prefix of a hash, written by a
  build whose extractor read a number where a string was
  (`../docs/DEVICE_LOOP.md` §5d). Everything after it links perfectly across four
  restarts. **The break was never repaired** — Art. I forbids it — and five days
  later that immutable scar is still the clearest evidence the chain works. A
  journal that had quietly fixed itself would have deleted the proof.
- **A second implementation, in another language.** `apps/pixel/pass1/src/Journal.java.in`
  writes the same envelope with no shared code and no JSON parser — the canonical
  encoding is pinned from both sides by `tests/vectors.json`. The contract is not a
  TypeScript interface; it is a format two implementations agree on.
- **A check the writer cannot run on itself.** The phone verifies *linkage* only: it
  never recomputes a hash from the stored fields, so alteration in place would pass
  there. `verifyLane` off-device re-derives every envelope and payload hash over the
  device's real history. *A chain checked only by the device that wrote it is the
  weaker check* (`CLAIMS.md` C2c), and this is that stated as a difference in what
  two implementations can do.
- **Replication that is carrying, not retelling.** A pass-2 export **is** a lane:
  `importExport` replicates it with every id, hlc, hash and chain intact, so the
  desk holds a replica of the phone's history rather than a reconstruction of it
  (`../docs/DEVICE_LOOP.md` §7b1).
- **A projection thrown away and rebuilt.** `packages/device-watch` folds its whole
  state from events on every call and persists nothing. On 2026-09-28 a container
  died and the journal was rebuilt from exports alone, re-deriving every observation
  and alert (§7b3). Invariant 7, demonstrated by accident.
