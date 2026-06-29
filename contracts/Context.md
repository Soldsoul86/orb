# Context — Contract Specification

```
Contract:   Context
Domain:     Identity
Kind:       State
Version:    v1
Status:     Draft
Depends on: Entity, Goal
```

> A Context is the salient slice of the user's situation at a moment — who and what
> is relevant now, under which goals — assembled so reasoning has the right frame.
> See `../docs/DIGITAL_TWIN.md` and `RUNTIME_LOOP.md`.

**Why a permanent kernel contract?** Because reasoning is always *situated*: the same
question deserves different answers depending on where the user is, what they are
doing, and what they are trying to achieve. Context is how Orb decides *what to bring
to bear* — the durable, recomputable frame that focuses attention without inventing
truth. It is the most ephemeral-leaning Identity contract, yet it earns kernel
standing because *what counts as relevant* must be derivable from history, not held
in a process. *Can it exist for twenty years?* Yes: the **notion** of a salient slice
— a recomputable projection over entities and goals — is stable for decades, even as
any individual context is assembled, used, and discarded minute to minute. The
contract is the durable rule for assembly; the momentary focus it produces is not.

---

## 1. Semantics

A **Context** is a derived projection that selects, from the whole Digital Twin, the
**Entities** and **Goals** (and the Beliefs/Evidence beneath them) that are *salient*
to a given moment or task. It answers *"what should influence the decision in front
of us right now?"* — never *"what is true."* A Context is **interpretation**:
recomputable, revisable, and grounded in the durable identity it draws from.

A Context is **not edited directly**. It is assembled by recomputation over durable
identity in response to a situation (a time, a place, an active goal, an incoming
observation). If the user pins or corrects what is relevant, that intent enters
history as an Event; the Context itself is re-derived.

### Composition (Immutable / Derived / Ephemeral)

- **Immutable** — only the **creation event of a context *snapshot*** if one is
  deliberately retained (e.g. "the context in which this decision was made," kept for
  explainability). The default, live context retains nothing immutable of its own.
- **Derived** — the **salient slice**: the selected member Entities and Goals, their
  relevance weighting, and the assembled frame, recomputed from durable identity.
- **Ephemeral** — the **current attention / focus** (what is foregrounded this
  instant) and any working assembly buffers. Runtime-only; lost on replay.

*Replay test:* a retained snapshot's creation event survives replay; the salient
slice is recomputable and so survives as derivation; the live attention/focus does
not survive and need not.

---

## 2. Lifecycle (begin → evolve → decay → merge → split → end)

1. **Begins** when a situation calls for a frame — a task starts, an observation
   arrives, the user asks something — and Orb assembles a salient slice over the
   relevant Entities and Goals.
2. **Evolves** as the situation shifts: members are added or dropped, relevance
   re-weighted, the frame tightened as evidence narrows what matters.
3. **Decays** as the moment passes: relevance fades, the slice is no longer
   foregrounded; a live context simply dissolves (it held nothing of value to lose).
4. **Merges** when two concurrent frames are recognized as one situation (a recorded
   unification, relevant only for retained snapshots).
5. **Splits** when one frame conflates two situations and is re-assembled as two
   (recorded only for retained snapshots).
6. **Ends** when the situation closes. A live context ends by dissolution; a retained
   **snapshot** is closed and kept as history for explainability.

---

## 3. State transitions

```
(situation) ──▶ (assembled salient slice over Entities/Goals)
     │                ├── re-weighted / members added/dropped (evolves)
     │                ├── dissolved (live context, moment passes)
     │                └── retained as snapshot ──▶ (immutable, kept for explainability)
     └────────────── a retained snapshot's creation event never changes ──────────────┘
```

---

## 4. Invariants

1. **A derived frame, not a store of truth.** A Context selects what is relevant; it
   asserts nothing new and owns no fact of its own.
2. **Grounded in durable identity.** Its members are resolved Entities and Goals (and
   the Belief/Evidence beneath them); a Context referencing unresolved members is
   invalid.
3. **Never edited directly.** Pins and corrections enter as Events; the slice is
   re-derived (Constitution Art. XII §45).
4. **Immutable core, derived surface, ephemeral edge.** Only a retained snapshot's
   creation event is immutable; the salient slice is derived; current attention/focus
   is ephemeral and does not survive replay (Art. XII §46).
5. **Recomputable; revision is append-only.** Nothing durable is overwritten; retained
   snapshots are immutable once kept.

Upholds Constitution Articles XII (Identity and Continuity) and II (Truth and
Interpretation).

---

## 5. Versioning rules

- New **Context dimensions** (temporal, spatial, social, task, device, …) are added
  and versioned; existing dimensions never change meaning.
- The core obligation — *a derived salient slice over Entities/Goals, grounded,
  never edited directly, recomputable* — is frozen at v1.
- Relevance/salience scoring is implementation; it may evolve and yield different
  slices over time, but never converts a Context into a store of truth.

---

## 6. Compatibility guarantees

Consumers may permanently rely on:

- A Context is always a projection over durable identity — never an independent
  source of fact.
- A live Context is fully recomputable from the Digital Twin and the situation.
- A retained context snapshot, and the decision it framed, are kept for
  explainability and never rewritten.

Not guaranteed:

- That a live Context persists — it is momentary and dissolves by design.
- That the salient slice is *complete* or *correct* — it is the best current frame,
  revisable as relevance is recomputed.

---

## 7. Failure modes

- **Lost live context.** A crash loses current attention/focus; the slice is
  recomputed from the durable Twin and the situation — by design, nothing of value is
  lost.
- **Mis-framed context.** The slice omits a relevant member or includes an irrelevant
  one; later evidence re-weights it; for a retained snapshot, a correction is appended,
  the original frame preserved.
- **Member re-resolution.** A member Entity or Goal merges/splits; the Context's
  membership is recomputed; nothing is rewritten.
- **Over-retention.** Snapshotting every momentary frame as history would bloat the
  journal; snapshots are retained only when explainability requires it — the default
  context retains nothing.

Never permitted: editing a Context in place; a Context with unresolved members;
treating a Context as a source of truth; deleting a retained snapshot's history.

---

## 8. Examples

- **Live frame.** The user asks "what should I prep for?" at 8am; Orb assembles a
  context of today's meeting Entities and the Goals they serve, answers, and lets the
  frame dissolve — recomputed fresh tomorrow.
- **Decision snapshot.** When Orb proposes an action, the context that framed it is
  retained as a snapshot so the decision stays explainable years later (Art. II §10).
- **Shift.** Walking into the office re-weights the social and task dimensions; the
  salient slice updates without any record being edited.
- **Re-resolution.** Two duplicate person Entities in a live context merge upstream;
  the context's membership is recomputed, not rewritten.
