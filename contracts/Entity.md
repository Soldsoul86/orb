# Entity — Contract Specification

```
Contract:   Entity
Domain:     Knowledge
Kind:       State
Version:    v1
Status:     Draft
Depends on: Evidence
```

> An Entity is a resolved subject of interpretation — the *who* and *what* that
> observations are about. See `../docs/EVIDENCE_GRAPH.md` and `DIGITAL_TWIN.md`.

**Why a permanent kernel contract?** Because Orb must be able to say *what its
knowledge is about*, and that subject — a person, place, organization, device, or
thing — is resolved across many signals, not given by any one of them. Resolution
(deciding that these scattered observations concern *one* subject) is a permanent,
load-bearing interpretation that everything downstream (Facts, Beliefs,
Relationships, the Digital Twin) refers to. If Entity were not a contract, identity
resolution would be re-invented per feature and the "one subject, many signals"
guarantee would dissolve. Crucially, an Entity is **interpretation, not truth**:
it is recomputable and revisable, which is exactly why it is grounded in Evidence
and never in raw belief.

---

## 1. Semantics

An **Entity** is a stable handle for a subject that Orb has resolved across
signals: "John Doe," "the Bangalore office," "this Pixel," "the Q3 budget." It
aggregates the observations and evidence that concern one subject and carries an
identity *inferred by resolution*, not asserted as fact.

An Entity is **interpretation**: it is the current best resolution given the
evidence, recomputable from history and revisable as evidence accumulates. Two
Entities may later be **merged** (discovered to be the same subject) or **split**
(discovered to be different) — and that is normal interpretation, never a rewrite
of the underlying events.

An Entity's identity is justified by **Evidence**, and only by Evidence. It does
not depend on Beliefs *about* it; rather, Beliefs and Facts reference the Entity.
This direction is deliberate (see Dependencies).

---

## 2. Lifecycle

1. **Resolution.** During Understand, the runtime resolves signals that appear to
   concern one subject into an Entity, grounded by the Evidence that justifies the
   resolution.
2. **Recording.** The resolution is recorded as an Event; the Entity becomes part
   of the recomputable Digital Twin. Its *resolution decisions* are history; the
   Entity projection is rebuildable from them.
3. **Existence.** It is referenced by Facts, Beliefs, Relationships, Projects, and
   the Digital Twin as the subject they concern.
4. **Revision (merge / split).** As evidence accumulates, two Entities may merge
   or one may split. Each revision is a new recorded interpretation grounded in
   Evidence; prior resolutions remain in history.

---

## 3. State transitions

An Entity is recomputable interpretation. Its legal moves are resolution
revisions, each appended, never destructive:

```
(resolved) ──▶ (referenced) ──merge/split (new evidence)──▶ (re-resolved)
        └────────────── recomputable from history ──────────────┘
```

No transition rewrites the events under an Entity. A merge or split changes the
*current* resolution; the evidence and the prior resolution remain.

---

## 4. Invariants

1. **Interpretation, not truth.** An Entity is the current resolution, never a
   settled fact about reality; it is recomputable from the journal.
2. **Grounded in Evidence.** Every Entity references the Evidence that justifies
   its identity; an Entity with no grounding is invalid.
3. **Resolution never rewrites history.** Merge and split change current
   interpretation only; underlying Events and Observations are untouched.
4. **Stable reference under revision.** Downstream references to an Entity survive
   merge/split via recorded re-resolution; references are never silently broken.
5. **Knowledge plane only.** An Entity holds no power to act and no source-of-truth
   state; it is a projection of history.

Upholds Constitution Articles II (Truth and Interpretation) and I (History).

---

## 5. Versioning rules

- New **Entity types** (person, place, organization, device, account, document, …)
  are added freely and versioned; existing types never change meaning.
- New **resolution strategies** are implementation behind the contract; they may
  change conclusions over time (interpretation is not frozen), but never rewrite
  history.
- The core obligation — *a recomputable, evidence-grounded subject, revisable by
  merge/split without rewriting events* — is frozen at v1.

---

## 6. Compatibility guarantees

Consumers may permanently rely on:

- Every Entity is traceable, through Evidence, to recorded history.
- An Entity may be merged or split, but its underlying events never change.
- The set of an Entity's groundings can be recomputed from the journal.

Not guaranteed:

- That a resolution is *correct* — two people may be conflated, or one split in
  two; new evidence revises the resolution.
- That an Entity's identity is *stable forever* — better evidence may re-resolve
  it. Stability is of *history*, not of *interpretation*.

---

## 7. Failure modes

- **Mis-resolution (false merge).** Two distinct subjects resolved as one are
  split when contradicting Evidence arrives; the split is recorded, history
  untouched.
- **Fragmentation (false split).** One subject seen as two is merged when
  corroborating Evidence arrives; references re-point via recorded re-resolution.
- **Insufficient grounding.** A would-be Entity with no supporting Evidence is not
  recorded as an Entity; it remains raw observation until grounding exists.
- **Recompute drift.** If resolution logic improves, recomputation may yield a
  different current resolution; prior resolutions remain in history with their
  evidence. *Replay reproduces history, not intelligence.*

Never permitted: asserting an Entity as truth; grounding an Entity in Belief
rather than Evidence; rewriting events to "fix" a resolution; silently dropping a
reference on merge/split.

---

## 8. Examples

- **Person.** Emails, calendar entries, and chat messages mentioning "John,"
  "J. Doe," and a phone number resolve into one Entity *John Doe*, grounded by the
  Evidence linking those signals.
- **Merge.** Two contact Entities, *John D.* and *John Doe*, are later found (via
  a shared verified email) to be the same person; a recorded merge unifies them,
  references re-point, prior history stays.
- **Split.** A single Entity *"Sam"* turns out to be two colleagues with the same
  first name; contradicting Evidence triggers a recorded split.
- **Device.** Observations attributed to a hardware identifier resolve into the
  Entity *"Pixel 8 (user's phone)"*, referenced by Relationships and Context.
