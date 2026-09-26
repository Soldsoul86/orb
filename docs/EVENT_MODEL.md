# Event Model

> Status: Phase 1 architecture. Reviewed before implementation.
> Incorporates the frozen decision on multi-writer ordering (HLC) and on model
> outputs as immutable observations. See `SYSTEM_OVERVIEW.md` for vocabulary.

---

## 1. Purpose

The Event Journal is the foundation of Orb and its single source of truth.
Everything else is a projection that can be rebuilt by replaying events. This
document defines what an event is, how events are ordered across equal-peer
devices, and how non-deterministic model outputs are captured deterministically.

---

## 2. First Principles

- Everything begins as an **immutable event**.
- Events are **append-only**. History is never mutated, reordered, or deleted.
- The journal is the **only** source of truth; all other state is derived.
- Time is a **first-class dimension**: every event is placed in causal time.
- Orb is **multi-writer**: every device appends to its own lane independently.

> Constitutional laws: *Events are append-only. History is never mutated.
> Every feature must be replayable from events.*

---

## 3. The Event

An event is the atomic, immutable unit of history. Conceptually (the binding
interface is frozen in Phase 3, `contracts/Event`):

| Field | Meaning | Notes |
| --- | --- | --- |
| `v` | Envelope format version | **Absent means 1.** Inside the hash preimage, so it cannot be flipped to make a verifier apply the wrong rule; in the envelope rather than the payload, so a device holding no keys can still tell which rule to use. |
| `id` | Globally unique identifier | Content-addressed or ULID-class; never reused. |
| `lane` | Originating device's lane id | Identifies the writer. |
| `device` | Originating device descriptor | Stable device identity. |
| `hlc` | Hybrid Logical Clock timestamp | Defines public ordering (§5). |
| `wallClock` | Best-effort physical timestamp | Human-facing only; never used for ordering. |
| `type` | Event type | **v1:** the real type. **v2:** `orb.content`, or a bookkeeping type. |
| `causes` | Optional causal parents | Event ids this event was derived from / reacted to. **v2: not in the envelope at all** — and absent is *cannot say*, never *built on nothing*. |
| `payload` | Type-specific immutable body | Opaque to the journal. **v2:** a wrapper carrying the real type, schema and causes, the caller's data, and a nonce. |
| `schema` | Payload schema id + version | Enables forward-compatible evolution. **v2:** one describing *an encrypted payload*; the real schema is inside. |
| `integrity` | Cryptographic hash of the above | Tamper-evidence; chains within a lane. |

The journal treats `payload` as opaque. Meaning is assigned by higher layers
(Evidence Graph, Knowledge Engine).

### Two envelope formats, and why

**v1 is frozen and stays valid forever** (`contracts/Event.md` §5). **v2** is the
coarse envelope ruled in `docs/ERASURE.md` §2a and §2b, implemented in
`runtime/journal` and in `apps/pixel/pass1` (which still writes v1 by choice).

A v2 envelope says *an event happened, of a coarse kind, at a time* — and nothing
else. Three fields moved into the payload and one was added:

- **`type`, `schema` and `causes`**, so a witness holding envelopes learns
  nothing about the shape of the owner's reasoning, and so that **erasing a
  payload erases that event's kind and its stated lineage with it.**
- **a nonce**, because `payloadHash` commits to the plaintext and lives in a
  plaintext envelope: without it a guessable payload is a confirmation oracle —
  hash `{"beat":1}`, `{"beat":2}`, … until one matches, and read the event with
  no key at all.

Bookkeeping types keep their real names, because sync machinery on a device that
holds no keys reads them and can never decrypt to find out.

`append` and `readLane` present an event with its real type, schema, causes and
payload restored, plus the wrapper's nonce so the stored form can be rebuilt and
the event stays verifiable in the hand. **A projection sees exactly the event that
was written**, which is what keeps inv. 8 (replayability) true — and is why the
alternative, making every caller unwrap, was rejected.

Two costs, recorded rather than discovered later: `payloadHash` is no longer a
content address, so payloads cannot be deduplicated by hash (`ERASURE.md` §2a);
and a payload policy reads envelopes before it has the payload, so selective
retention by kind of content is gone — `holdTypes` holds nothing and
`holdContent` is the honest replacement.

---

## 4. Lanes (Multi-Writer Log)

> Frozen decision: **Devices are equal peers. No device is authoritative.**

- Each device owns exactly one **append-only lane**.
- A device only ever appends to **its own** lane. It never writes another
  device's lane; it only **replicates** copies of foreign lanes (read-only).
- Within a lane, events form a **hash-chained** sequence (each event commits to
  the previous), giving per-lane total order and tamper-evidence.
- The global journal is the **set union of all lanes**. There is no single global
  append point — that is the whole point of equal peers.

This makes Orb a **multi-lane, single-writer-per-lane** log: simple to reason
about, trivially mergeable (union of immutable lanes), and free of write
contention between devices.

---

## 5. Ordering — Hybrid Logical Clocks

> Frozen decision: **HLC defines the public event ordering model. Global ordering
> is derived, never stored.**

Physical wall-clocks across devices are unreliable and unsynchronised. Pure
logical clocks lose human-meaningful time. **Hybrid Logical Clocks** combine both:
a monotonic logical component bounded close to physical time.

Rules:

1. On each local append, the device advances its HLC: `hlc = max(localPhysical,
   lastHlc) (+ counter on ties)`.
2. On receiving a replicated event, the device merges: `hlc = max(localPhysical,
   lastHlc, incomingHlc) (+ counter)`. This carries causal knowledge forward.
3. **Public ordering** of any two events is by `(hlc, lane)` — HLC first, lane id
   as a deterministic tiebreaker. This yields a total order that is consistent
   with causality across all devices.

Properties:

- Two events where A causally precedes B always satisfy `A.hlc < B.hlc`.
- The order is **derived on read**, identically on every device, and **never
  persisted** as a global sequence number. Persisting a global order would
  reintroduce an authority and break equal-peer replication.

### Vector clocks (internal only)

Where the system must answer *true* concurrency/causality questions (e.g.
conflict detection in projections), it may maintain **vector clocks internally**.
HLC remains the public ordering model; vector clocks are an implementation detail
that never leaks into the event contract.

---

## 6. Model Outputs as Observations

> Frozen decision: **Model outputs are historical observations**, recorded
> immutably with full provenance. Replay reproduces history, not intelligence.

Running a model is non-deterministic. To keep history deterministic, Orb does not
replay models during reconstruction — it replays the **recorded outputs** of past
model runs. Each model invocation that influences interpretation appends a
`model_output` event whose payload records, at minimum:

- **Model provider**
- **Model version**
- **Prompt template version**
- **Input references** (event ids of the inputs — never copies, just references)
- **Parameters** (temperature, decoding settings, etc.)
- **Timestamp** (HLC + wallClock)
- **Execution environment** (runtime, device, library versions)
- **Output** (the produced artifact)

Consequences:

- Replaying the journal reproduces *that this output existed and where it came
  from* — exactly. It does **not** re-run the model.
- Future reasoning may reach different conclusions from the same evidence; the
  full lineage of past conclusions is preserved alongside.
- A `model_output` event is, from the journal's perspective, just another
  immutable observation. It is **evidence about what a model said**, not truth.

---

## 7. Replay

Replay = fold the union of all lanes, in HLC order, through a projection
function to rebuild a derived view (Evidence Graph, Digital Twin, etc.).

- Replay of **history** (journal, evidence) is deterministic and exact.
- Replay of **interpretation** rebuilds structure and lineage but may yield
  different conclusions if models changed (by design).
- Any projection can be deleted and fully rebuilt from the journal. No projection
  is ever a source of truth.

---

## 8. Schema Evolution

History is immutable, so payload schemas can only ever be **added**, never
changed in place.

- Every payload carries `schema = {id, version}`.
- Readers must handle every historical version they may encounter (forward-only
  upcasting at read time, in the projection layer — never by rewriting events).
- A new schema version is a new shape; old events keep their old shape forever.

---

## 9. Invariants

1. Events are immutable and append-only.
2. A device writes only its own lane.
3. Every event has a globally unique id, a lane, a device, and an HLC.
4. Public ordering is `(hlc, lane)`, derived on read, never stored.
5. Merge is set union of immutable lanes; it never rewrites history.
6. Model outputs are recorded with full provenance and treated as observations.
7. Wall-clock time is never used for ordering.
8. Any derived view is reconstructible by replay.

---

## 10. Out of Scope (defined elsewhere)

- How lanes are replicated between peers → `SYNC_PROTOCOL.md`.
- How events are encrypted and stored on disk → `STORAGE.md`, `SECURITY.md`.
- How evidence links observations → `EVIDENCE_GRAPH.md`.
