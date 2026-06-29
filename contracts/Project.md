# Project — Contract Specification

```
Contract:   Project
Domain:     Identity
Kind:       State
Version:    v1
Status:     Draft
Depends on: Goal, Entity, Belief
```

> A Project is a coherent body of the user's ongoing work or intent that spans time
> — the sustained endeavor under which goals, entities, and observations cohere. See
> `../docs/DIGITAL_TWIN.md`.

**Why a permanent kernel contract?** Because much of a life is organized into
*endeavors* that outlast any single goal or task, and Orb must model that continuity
to reason usefully. A Project is the durable frame that gives scattered goals,
people, and events a shared meaning over months and years. *Can it exist for twenty
years?* Yes: "raising my children," "my career at Acme," "the house renovation" are
endeavors whose definition is fixed at creation while their progress, membership,
and health evolve continuously. That fixed-frame / evolving-content shape is kernel
identity, not an implementation's folder.

---

## 1. Semantics

A **Project** groups **Goals**, **Entities**, and observations under a sustained
endeavor, tracking that endeavor's state over time. It answers *"what can change
within this endeavor?"* — scope, progress, membership, and health all evolve.
A Project is **interpretation**: recomputable and revisable, never truth.

A Project is **not edited directly**. Its definition is stated (or inferred) as an
Event; its evolving state is derived from the goals, entities, and evidence it
gathers. Manual changes enter history as Events.

### Composition (Immutable / Derived / Ephemeral)

- **Immutable** — the **creation event** and the **original definition/intent** of
  the endeavor.
- **Derived** — **status**, **progress**, **member goals/entities**, and **health**,
  recomputed as constituent goals and evidence change.
- **Ephemeral** — the **current focus item** and **suggested next step**. Runtime-
  only; lost on replay.

*Replay test:* immutable + derived survive a complete replay; ephemeral does not.

---

## 2. Lifecycle (begin → evolve → decay → merge → split → end)

1. **Begins** when an endeavor is defined (stated by the user, or inferred from a
   cluster of related goals/observations), anchored to its creation event.
2. **Evolves** as goals are added, entities associated, and progress recomputed; the
   Project's health reflects its constituents.
3. **Decays** when the endeavor stalls: progress flatlines, health degrades; the
   Project goes dormant, retained not deleted.
4. **Merges** when two Projects are found to be one endeavor (recorded unification).
5. **Splits** when one Project is found to span two endeavors (recorded split,
   re-homing goals/entities).
6. **Ends** by **completion**, **abandonment**, or **supersession** — recorded; the
   Project and its trajectory remain history.

---

## 3. State transitions

```
(defined) ──▶ (active, status/progress/health recomputed from members)
     │              ├── dormant (stalled) ──▶ (revived)
     │              ├── merged / split
     │              └── completed / abandoned / superseded
     └────────────── creation event + original definition never change ──────────────┘
```

---

## 4. Invariants

1. **A sustained frame, not a task.** A Project spans time and gathers goals,
   entities, and observations under one meaning.
2. **Grounded.** References its constituent Goals/Entities and the Belief/Evidence
   that justify the endeavor; an ungrounded Project is invalid.
3. **Never edited directly.** Definition and changes enter as Events; state is
   derived (Constitution Art. XII §45).
4. **Immutable core, derived surface, ephemeral edge.** Creation event and original
   definition are immutable; status/progress/membership/health are derived; current
   focus/next step are ephemeral and do not survive replay (Art. XII §46).
5. **Recomputable; revision is append-only.** Prior values are retained.

Upholds Constitution Articles XII (Identity and Continuity) and II (Truth and
Interpretation).

---

## 5. Versioning rules

- New **Project categories** (work, personal, health, financial, …) are added and
  versioned; existing categories never change meaning.
- The core obligation — *time-spanning endeavor, grounded in goals/entities/evidence,
  immutable definition, derived state, never edited directly* — is frozen at v1.
- Health/progress scoring is implementation; it may evolve, but never rewrites the
  immutable definition.

---

## 6. Compatibility guarantees

Consumers may permanently rely on:

- A Project's original definition and creation event never change.
- Status, progress, membership, and health are recomputable from history.
- A dormant or ended Project retains its full trajectory.

Not guaranteed:

- That a Project is *active* — endeavors stall; status reflects this.
- That derived health is *correct* — it is the best current estimate, revisable.

---

## 7. Failure modes

- **Stalled project.** No progress for a long span; health degrades, the Project
  goes dormant — retained, revived if work resumes.
- **Mis-scoped project.** One record spans two endeavors; a recorded split re-homes
  its goals and entities; histories preserved.
- **Member re-resolution.** A constituent Goal or Entity merges/splits; the Project's
  membership is recomputed; nothing is rewritten.
- **Lost ephemeral state.** A crash loses the current focus item; it is recomputed
  from the durable Project and its goals.

Never permitted: editing a Project in place; a Project with no grounding; deleting an
ended Project's history.

---

## 8. Examples

- **Long-horizon.** "The house renovation" gathers goals (permits, contractor,
  budget), entities (architect, bank), and observations (invoices) over two years;
  its definition is fixed, its progress and health evolve.
- **Split.** "Work" turns out to conflate two distinct endeavors — a product launch
  and a hiring drive — and is split, each inheriting the relevant goals.
- **Completion.** "Move to Bangalore" completes when its goals are achieved and an
  Observation confirms the move; the Project is closed and kept.
- **Dormancy.** "Write a novel" stalls for a year and goes dormant; a new chapter
  drafted next month revives it.
