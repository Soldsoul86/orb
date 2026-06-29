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
| `id` | Globally unique identifier | Content-addressed or ULID-class; never reused. |
| `lane` | Originating device's lane id | Identifies the writer. |
| `device` | Originating device descriptor | Stable device identity. |
| `hlc` | Hybrid Logical Clock timestamp | Defines public ordering (§5). |
| `wallClock` | Best-effort physical timestamp | Human-facing only; never used for ordering. |
| `type` | Event type | e.g. `observation`, `evidence`, `model_output`, `action`. |
| `causes` | Optional causal parents | Event ids this event was derived from / reacted to. |
| `payload` | Type-specific immutable body | Opaque to the journal. |
| `schema` | Payload schema id + version | Enables forward-compatible evolution. |
| `integrity` | Cryptographic hash of the above | Tamper-evidence; chains within a lane. |

The journal treats `payload` as opaque. Meaning is assigned by higher layers
(Evidence Graph, Knowledge Engine).

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
