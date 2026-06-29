# Storage

> Status: Phase 1 architecture. Reviewed before implementation.
> Defines how the journal and its projections persist on each device.
> See `EVENT_MODEL.md`, `SYNC_PROTOCOL.md`, `SECURITY.md`.

---

## 1. Purpose

Storage is how a device durably holds Orb's two kinds of state: the **immutable
journal** (the source of truth) and the **derived projections** (Evidence Graph,
Digital Twin, indexes). The design follows directly from the event model:
append-only history, rebuildable everything-else.

> Constitutional laws: *Events are append-only. History is never mutated.
> Understanding is always recomputable.*

---

## 2. Two Tiers of Storage

| Tier | Holds | Property | If lost |
| --- | --- | --- | --- |
| **Journal store** | The event lanes (history) | Append-only, immutable, durable | Catastrophic — restore from a peer replica. |
| **Projection store** | Evidence Graph, Twin, indexes | Derived, disposable | Rebuild by replay. |

Only the journal store is precious. Projections are caches: optimised for read,
discardable, and always reconstructible from the journal. This is the storage
expression of the History/Interpretation split.

---

## 3. Journal Store

### Structure

- One **append-only segment set per lane** (the local device's own lane is
  writable; replicated foreign lanes are read-only copies).
- Within a lane, events are stored in **append order**, each **hash-chained** to
  its predecessor (tamper-evidence; corruption is detectable).
- The store never offers an in-place update or delete primitive. The only write
  operation is **append to own lane**.

### Local-first

- The journal lives entirely on the device. The device is a **complete runtime**
  with no remote dependency for reading or writing its own history.
- Encryption at rest is mandatory (see `SECURITY.md`); the journal store holds
  ciphertext.

### Integrity

- Per-lane hash chaining detects tampering and corruption.
- On open, a device may verify chain integrity for its own lane and for
  replicated lanes before trusting them.

---

## 4. Projection Store

- Holds materialized views: the Evidence Graph, the Digital Twin, and read
  indexes (temporal, entity, full-text).
- Built by **replaying the journal** through projection functions; kept current
  incrementally as new events arrive (local or replicated).
- May be **versioned by projection logic**: when projection code changes, the
  affected projection can be rebuilt from scratch without touching the journal.
- Is explicitly a cache. A device may delete the entire projection store and
  rebuild it. No data is lost because no truth lives here.

---

## 5. Replay & Rebuild

Rebuild = fold the union of all lanes, in HLC order (`EVENT_MODEL.md` §Ordering),
through projection functions.

- **History rebuild** (journal integrity check) is deterministic and exact.
- **Interpretation rebuild** (Twin) reconstructs structure and lineage; it may
  produce different beliefs if models changed — by design.
- Rebuild is the recovery path, the migration path (new projection logic), and
  the consistency guarantee (a projection can always be re-derived to match the
  journal).

---

## 6. Storage Engine Independence

- The concrete engine (embedded KV store, log files, embedded SQL) is an
  **implementation detail behind a storage interface**. No higher layer depends
  on a specific engine — no vendor lock-in.
- Requirements the engine must meet: durable append, ordered scan within a lane,
  efficient key/range lookup for projections, crash consistency.
- Different devices (Mac, Pixel) may use different engines as long as they honor
  the same interface and the same event/lane semantics.

---

## 7. Retention

- The journal is, in principle, **kept forever** — continuity is the product.
- Storage pressure is addressed by **projection eviction** (rebuildable) and, if
  ever necessary, by **archival of cold journal segments** to encrypted
  cold storage — never by mutation or silent deletion of history. Any archival
  policy must preserve the ability to replay.

---

## 8. Invariants

1. The journal store is append-only; it offers no update/delete of events.
2. A device writes only its own lane; foreign lanes are read-only replicas.
3. Per-lane hash chaining makes corruption/tampering detectable.
4. Projections are disposable and always rebuildable by replay.
5. The journal is encrypted at rest.
6. The storage engine is interchangeable behind an interface.
7. Retention never mutates history; archival preserves replayability.

---

## 9. Out of Scope

- How lanes move between devices → `SYNC_PROTOCOL.md`.
- Keys, encryption scheme, threat model → `SECURITY.md`.
- Event shape and ordering → `EVENT_MODEL.md`.
