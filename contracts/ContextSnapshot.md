# ContextSnapshot — Contract Specification

```
Contract:   ContextSnapshot
Domain:     Identity
Kind:       State
Version:    v1
Status:     Draft
Depends on: Entity, Goal
```

> A ContextSnapshot is the situational frame *retained as history* — the salient slice
> of the model captured at a moment, typically to explain a decision later. It is the
> immutable, replayable counterpart to the live `LiveContext` process. See
> `../docs/DIGITAL_TWIN.md`.

**Why a permanent kernel contract?** Because explainability over decades requires that
*the frame in which a decision was made* be preserved exactly, not reconstructed. The
live situational frame is a process that comes and goes; but when Orb proposes or takes
an action, the slice of the model that justified it must become history, or the
decision stops being explainable. A ContextSnapshot is that frozen frame. *Process and
history must never share a contract* — so the snapshot is separated from the live
assembler (`LiveContext`). *Can it exist for twenty years?* Yes: "the context in which
this decision was made" is meaningful for as long as the decision is meaningful — a
snapshot taken in 2026 still explains a 2026 choice in 2046. That permanence is exactly
why it is State, not runtime.

---

## 1. Semantics

A **ContextSnapshot** is an immutable record of the **Entities** and active **Goals**
(and, through them, the Beliefs/Evidence beneath) that were salient at a moment. It
answers *"what frame was in force when this happened?"* — a historical question, not
*"what is true now."* A ContextSnapshot is **history**: once captured it never changes;
it is the durable residue of a `LiveContext` frame deliberately retained.

A ContextSnapshot is **not edited directly**, and indeed is not edited at all — it is
captured once and thereafter immutable. A correction does not alter it; it enters
history as a new Event and, if needed, a new snapshot.

### Composition (Immutable / Derived / Ephemeral)

- **Immutable** — the **entire snapshot**: its creation event and the captured slice
  (the member Entities and Goals, with their relevance as recorded at that instant).
- **Derived** — **none.** A snapshot is pure history; it computes nothing.
- **Ephemeral** — **none.** The momentary attention/focus that *produced* the frame
  lived in `LiveContext`; the snapshot is what was kept.

*Replay test:* the entire ContextSnapshot survives replay — it is immutable history.
Nothing about it is recomputed, and nothing is lost.

---

## 2. Lifecycle (begin → evolve → decay → merge → split → end)

1. **Begins** when a `LiveContext` frame is retained — typically at the moment a
   decision is framed — capturing the salient slice as an immutable record.
2. **Evolves** — it does not. A snapshot is frozen at capture; any "evolution" is a
   *new* snapshot, never a mutation of this one.
3. **Decays** — it does not. History does not decay; an old snapshot remains exactly
   as captured, however stale the world has become.
4. **Merges** — not in place. If two snapshots are later understood as one frame, that
   understanding is a new recorded interpretation; the originals are untouched.
5. **Splits** — likewise only by recorded re-interpretation; the original snapshot is
   never divided.
6. **Ends** — never erased. A snapshot persists as history for as long as the journal
   does; the decision it framed stays explainable.

---

## 3. State transitions

```
(LiveContext frame retained) ──▶ (ContextSnapshot captured, immutable)
                                        │
                                        └── referenced forever; never edited, merged,
                                            split, or deleted in place
```

A ContextSnapshot has exactly one transition — *captured* — after which it is
read-only history.

---

## 4. Invariants

1. **Pure history.** A ContextSnapshot is immutable once captured; it asserts no new
   truth and computes nothing.
2. **Grounded in durable identity.** Its members are resolved Entities and Goals (and
   the Belief/Evidence beneath them); a snapshot of unresolved members is invalid.
3. **Never edited directly — and never edited at all.** Corrections enter as new
   Events and, if needed, new snapshots (Constitution Art. XII §45, Art. I).
4. **All immutable.** No derived or ephemeral component exists; the live frame that
   produced it is the separate `LiveContext` Service (Art. XII §46 — it survives replay
   in full).
5. **Append-only.** A new snapshot never overwrites an old one.

Upholds Constitution Articles I (History), XII (Identity and Continuity), and II
(Truth and Interpretation).

---

## 5. Versioning rules

- New **snapshot dimensions** (temporal, spatial, social, task, device, …) may be
  captured and versioned; existing dimensions never change meaning.
- The core obligation — *an immutable, grounded record of the salient slice at a
  moment, never edited* — is frozen at v1.
- What *triggers* retention (which live frames become snapshots) is implementation in
  `LiveContext`; it may evolve, but never makes a captured snapshot mutable.

---

## 6. Compatibility guarantees

Consumers may permanently rely on:

- A ContextSnapshot, once captured, never changes and is never deleted.
- The decision a snapshot framed remains explainable from it for the life of the
  journal.
- A snapshot is always grounded in resolved Entities and Goals.

Not guaranteed:

- That a snapshot reflects the *current* situation — it is a frozen past frame by
  definition.
- That a snapshot was *complete* — it captured the best salient slice available at
  that instant, no more.

---

## 7. Failure modes

- **Over-retention.** Snapshotting every momentary frame would bloat the journal;
  retention is deliberate — `LiveContext` captures a snapshot only when explainability
  requires it (e.g. a decision), not continuously.
- **Stale members.** A captured Entity or Goal is later merged/split; the snapshot is
  *not* rewritten — it records the frame as it was; re-resolution is interpreted at
  read time without touching history.
- **Missing grounding.** A frame referencing an unresolved member cannot be captured;
  the snapshot is invalid until its members resolve.
- **Attempted edit.** A request to "fix" a snapshot is recorded as a new Event and, if
  needed, a new snapshot; the original remains.

Never permitted: editing a ContextSnapshot in place; capturing unresolved members;
deleting a snapshot's history.

---

## 8. Examples

- **Decision frame.** When Orb proposes an action, `LiveContext` retains a snapshot of
  the entities and active goals in force; years later the decision is still explainable
  from that exact frame (Art. II §10).
- **Audit trail.** A reviewer asks "what did Orb know to be relevant when it sent that
  email?" — the answer is the ContextSnapshot taken at that moment.
- **Frozen against drift.** The user's situation changes completely over a year; the
  old snapshot remains exactly as captured, never decaying to match the new world.
- **Re-resolution without rewrite.** A person Entity in an old snapshot later merges
  with another; the snapshot still names the original — re-resolution is applied in
  interpretation, not by editing the record.
