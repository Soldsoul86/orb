# Storage — Contract Specification

```
Contract:   Storage
Domain:     Infrastructure
Kind:       Service
Version:    v1
Status:     Draft
Depends on: Encryption
```

> Storage owns durability and nothing else. Every invariant about history belongs
> to `Journal`; a store only has to keep what it was given and give it back in
> order. See `../docs/STORAGE.md`.

**Why a permanent kernel contract?** Because *the storage engine is
interchangeable* (Art. IX, `STORAGE.md` §6) is only true if the engine holds none
of the meaning. The moment a store decides what may be written, interprets why
something was deleted, or is consulted in preference to the journal, swapping it
changes Orb's behaviour and the interchangeability claim is false. Fixing the split
— **the journal owns the invariants, the store owns durability** — is what keeps
a decade of engine churn beneath an unchanged history. It is also where Art. I's
promises stop being abstractions: *append-only* means a file that is only appended
to, and *the payload is gone* means the bytes are actually gone.

---

## 1. Semantics

A **Storage** is a Service that durably persists what the `Journal` gives it and
returns it in the order it was given.

It has **no opinion**. It does not validate a chain, does not order events, does
not decide what may be detached, and does not know what a payload means. The
journal gates every call it makes; a store that second-guessed a decision would be
a second place where history is governed, and there is only supposed to be one.

### Two tiers, and only one of them is history

| tier | what it holds | if it is lost |
| --- | --- | --- |
| **journal store** | immutable events — envelopes, and the payloads this device holds | **history is lost**; this is the thing that must be durable |
| **projection store** | derived state, held only to avoid recomputing it | nothing is lost; rebuild by replay |

**A persisted projection is a cache and must behave like one.** It is discardable
at any moment without loss, it is never consulted in preference to the journal when
correctness is at stake, and it never holds anything not derivable from events. A
projection store that outlived the events it described would be the second source
of truth Art. IX §33 forbids — and the failure would be invisible, because a stale
cache answers confidently.

**Persisting projections is permitted, never required.** An implementation that
folds from events on every read is a complete implementation of this contract.

### Detach removes bytes

`detach` is not a flag. A store that marks a payload absent while keeping it on
disk **has not implemented this method**, because the whole purpose is that a
device which no longer holds content cannot be made to produce it. Under erasure
that is not a performance matter; it is the difference between a destroyed payload
and a hidden one.

---

## 2. Lifecycle

1. **Open.** A store is opened over a location and makes existing lanes readable.
2. **Append.** Events are written to a lane, **atomically per call and durable
   before the call resolves.** The journal treats a resolved append as history; a
   store that resolves early has made the journal lie.
3. **Read back.** Every event in a lane, in append order, envelopes included for
   payloads this device does not hold.
4. **Detach.** Named payloads are destroyed, their envelopes kept, and the recorded
   absence reason is stored against each.
5. **Close.** No pending write survives unresolved. A store that was closed and
   reopened returns exactly what it returned before.

A store has no notion of the journal's lifecycle and never initiates anything.

---

## 3. State transitions

```
closed ──open──▶ available ──append/detach──▶ available ──close──▶ closed
                     │
                     └──cannot persist──▶ failing   (every write refused, loudly)
```

**`failing` is a refusal, never a silent degradation.** A store that cannot durably
write must fail the call. The forbidden state is the one where writes appear to
succeed and do not — there is no recovery from that, because the journal has
already told its callers the events exist.

---

## 4. Invariants

1. **The journal store is append-only.** Existing bytes of an event's envelope are
   never rewritten, and no event is removed.
2. **Append is atomic per call.** All of a batch or none of it. A crash mid-append
   leaves the lane as it was, never half a batch.
3. **Durable before resolving.** A resolved append survives process death and power
   loss.
4. **Read returns append order**, exactly, every time, for ever.
5. **The envelope survives detach.** Only payloads are removable (`Journal.md` §1).
6. **Detach reclaims the bytes.** Not a flag, not a tombstone beside the data.
7. **The absence reason is stored and never invented.** A store records what it was
   told and never infers `pruned` from a missing file.
8. **Projections are disposable**, never authoritative, and never hold what events
   cannot rebuild.
9. **Encrypted at rest**, delegated to `Encryption` rather than re-implemented.
10. **No opinion.** A store never validates a chain, never reorders, never refuses
    on grounds of content, and never decides what may be detached.
11. **Interchangeable.** Two conforming stores are indistinguishable to the journal
    except in speed and durability characteristics.

Upholds Constitution Articles I (History), VIII (ownership — data at rest is the
user's), and IX §33 (no duplicate sources of truth).

---

## 5. Versioning rules

- **New store implementations** are added freely. They are not versions of each
  other and never need to interoperate — each holds one device's data.
- **An on-disk layout may change**, provided a store can still read every layout it
  has written. The journal never learns that it changed.
- The core obligation — *append-only, atomic, durable-before-resolving, ordered
  read-back, bytes actually removed, no opinion* — is frozen at v1.
- A store may add capabilities (compaction of free space, a different index) so
  long as none of them is observable as a change in what the journal reads back.

---

## 6. Compatibility guarantees

Consumers may permanently rely on:

- What was appended is what is read back, in that order, after any number of
  restarts.
- A resolved append is durable.
- A detached payload is unrecoverable from this store.
- Swapping the engine changes nothing a replay can observe.

Not guaranteed:

- **Speed, or any particular access pattern.** The journal reads lanes; a store
  that makes that fast is better, not more correct.
- **Space.** A store may run out, and §7 says what that means.
- **That two devices' stores agree.** They hold different subsets by design.
- **Atomicity across lanes.** Atomicity is per call, per lane; nothing here offers
  a cross-lane transaction, and a caller needing one has misplaced a boundary.

---

## 7. Failure modes

- **Crash mid-append.** The lane is as it was. Invariant 2 makes this the only
  possible outcome; a store that can leave half a batch has not implemented it.
- **Out of space.** The append fails and says so. It never drops an older event to
  make room — that would be the store deciding what history to keep, which is
  invariant 10 and Art. I at once. Reclaiming space is the journal's business,
  through `detach`, under a recorded policy.
- **Corruption found on read-back.** Reported, never repaired and never skipped
  over. A store that silently omitted an unreadable event would turn corruption
  into a gap that looks like history — and the journal's chain would then flag a
  break whose cause had been hidden.
- **Detach on a payload already absent.** Not an error. Raising an absence toward
  `erased` is legitimate and expected: a device that never fetched a payload still
  receives the owner's erasure declaration and must honour it from that moment.
- **The store cannot actually reclaim bytes** (a filesystem that keeps snapshots, a
  medium that cannot overwrite). **This is a breach of the contract and must be
  declared, not worked around.** `ERASURE.md` §2a turns on bytes being gone; a store
  that cannot promise it is not an erasure-capable store, and the honest move is to
  say so rather than to report success.
- **Closed with writes in flight.** There are none — invariant 3 means a write is
  resolved or it did not happen.

---

## 8. Examples

- **`FileJournalStore`.** One append-only file per lane, `<lane>.lane.jsonl`, one
  canonical-JSON event per line. The device runtime uses it; it is also what an
  export is a copy of, which is why replication is carrying rather than retelling.
- **`MemoryJournalStore`.** The same contract with no durability, for tests. It is
  a legitimate implementation of everything except invariant 3, and the test suite
  that uses it is the evidence that the journal's semantics do not depend on the
  engine — which is invariant 11 stated as a build artefact.
- **The phone's store.** `Journal.java.in` writes the same line format to app-private
  storage in Java, with no shared code. Two engines, two languages, one format
  (`Journal.md` §8).
- **A store that resolves early.** Forbidden, and worth naming because it is the
  tempting optimisation: buffering an append and returning before `fsync` makes
  every call faster and makes a power loss silently fork the chain. The journal has
  already told its caller the event exists.
- **No projection store exists yet, and nothing is broken.** `device-watch` folds
  its state from events on every call. On 2026-09-28 the whole journal was rebuilt
  from exports and every observation and alert re-derived identically
  (`../docs/DEVICE_LOOP.md` §7b3). That is §1's *persisting projections is permitted,
  never required*, demonstrated rather than asserted.
- **Bytes that had to be gone.** `detach` under an erasure is the one place where a
  store's honesty is load-bearing rather than a quality concern: the operator was
  told the content was destroyed.
