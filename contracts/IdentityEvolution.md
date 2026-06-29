# IdentityEvolution — Contract Specification

```
Contract:   IdentityEvolution
Domain:     Identity
Kind:       State
Version:    v1
Status:     Draft
Depends on: Evidence, InferenceRecord
```

> An IdentityEvolution is the immutable record of *why the model changed* — a
> first-class, evidence-grounded, explainable transition of identity. It captures what
> changed, the evidence that drove it, the inference that interpreted that evidence, and
> the confidence held. See `../docs/DIGITAL_TWIN.md` and `EVIDENCE_GRAPH.md`.

**Why a permanent kernel contract?** Because identity must not only *evolve* — it must
*explain why it evolved*. Without this, replay rebuilds the current Twin but loses the
narrative of how it got there, and the model becomes a thing that changes for reasons
no one can recover. The crucial point is constitutional: the *explanation* of a change
is a model output, and **replay reproduces history, not intelligence** (Art. III §13) —
so the reason a belief shifted or a metric moved cannot be recomputed faithfully on
replay; it must be *recorded* when it happens. An IdentityEvolution is that record.
*Can it exist for twenty years?* Yes — more durably than almost anything: "execution
consistency rose from 71 to 78 because the user finished three long-running
initiatives" is a fact about the user's history that remains true and explanatory
forever. That permanence is why it is State.

---

## 1. Semantics

An **IdentityEvolution** records a single revision of the model: the **subject** that
changed (a Goal's confidence, a Relationship's strength, a Belief, a facet-level
metric such as "execution consistency"), its **before** and **after** as observed at
that moment, the **confidence** held, the **timestamp**, the **Evidence** that drove
the change, and the **Inference Record** that interpreted that evidence. It answers
*"why did the model change, and on what grounds?"*

An IdentityEvolution is the **audit of a transition, not a source of truth.** It never
supplies the *current* derived value — that remains recomputable from evidence; it
preserves the historical fact that a revision occurred and the reason for it. It
**references** the Inference Record's reasoning; it does not duplicate it. It is
immutable history, written when the change happens, never edited thereafter.

### Composition (Immutable / Derived / Ephemeral)

- **Immutable** — the **entire record**: subject reference, before/after as observed,
  confidence, timestamp, the Evidence reference, and the Inference Record reference.
- **Derived** — **none.** The record is history; the *current* value of the subject is
  derived elsewhere (on the Goal, Relationship, Twin facet, …) and is not stored here.
- **Ephemeral** — **none.**

*Replay test:* the entire IdentityEvolution survives replay — it is immutable history.
The current derived value of its subject is recomputed independently; this record is
the preserved *reason*, which replay reproduces rather than re-derives.

---

## 2. Lifecycle (begin → evolve → decay → merge → split → end)

1. **Begins** when a revision to the model is committed — a Reasoner concludes that an
   identity value should change — and the transition is recorded with its grounding and
   explanation.
2. **Evolves** — it does not. Each record is frozen; a further change to the same
   subject is a *new* IdentityEvolution, forming an append-only chain of reasons.
3. **Decays** — it does not. The reason a value changed in 2026 remains valid history
   forever, however much the value has since moved.
4. **Merges** — not in place. If two recorded transitions are later understood as one,
   that is a new recorded interpretation; the originals stand.
5. **Splits** — likewise only by recorded re-interpretation; the original is never
   divided.
6. **Ends** — never erased. The chain of IdentityEvolutions is the model's permanent
   explanation of itself.

---

## 3. State transitions

```
(revision committed) ──▶ (IdentityEvolution recorded, immutable)
                                │
                                └── chained, append-only, per subject; never edited,
                                    merged, split, or deleted in place
```

A subject's history is the ordered chain of its IdentityEvolution records — the
"why it changed" track alongside the recomputable "what it is now."

---

## 4. Invariants

1. **Immutable history.** Recorded once at the moment of change; never edited
   (Constitution Art. I, Art. XII §45).
2. **Audit, not truth.** It never supplies the current derived value of its subject;
   that stays recomputable. This contract is the *reason*, not the *value*
   (Art. II §9, Art. IX §33 — never duplicate sources of truth).
3. **Grounded and explained.** Every record references the **Evidence** that drove the
   change and the **Inference Record** that interpreted it; it references the
   explanation, never duplicating the reasoning (Art. II §8, Art. III §12).
4. **The explanation is preserved, not recomputed.** Because the reason is a model
   output, it is recorded when it happens — replay reproduces it, never re-derives it
   (Art. III §13, Art. XII §47).
5. **References its subject by identity, never depends on the aggregate.** It does not
   depend on the DigitalTwin, so the Twin may aggregate it without a cycle (mirrors how
   Evidence references what it bears upon).

Upholds Constitution Articles XII (Identity and Continuity), II (Truth and
Interpretation), III (Models and Reasoning), and I (History).

---

## 5. Versioning rules

- New **subject kinds** (goal-confidence, relationship-strength, belief-revision,
  facet-metric, …) are added and versioned; existing kinds never change meaning.
- The core obligation — *an immutable, grounded, explained record of a single model
  revision, that is audit not truth* — is frozen at v1.
- The form of the explanation (the Inference Record it links to) is the Reasoner's
  concern; IdentityEvolution always references it, never embeds or rewrites it.

---

## 6. Compatibility guarantees

Consumers may permanently rely on:

- Every recorded model revision is explainable from its IdentityEvolution — subject,
  before/after, evidence, inference, confidence, time.
- The record, once written, never changes and is never deleted.
- Replay reconstructs not only the current model but the chain of reasons it changed.

Not guaranteed:

- That the *current* value matches the record's `after` — later revisions may have
  moved it; the record is a point in history, not the present.
- That the original inference was *correct* — it is faithfully preserved as it was,
  including if later contradicted (the contradiction is itself a new record).

---

## 7. Failure modes

- **Unexplained change.** A value moves with no recorded IdentityEvolution; this is a
  defect — every model revision must be recorded with its grounding, or explainability
  is broken (Art. II §10).
- **Duplicated reasoning.** Embedding the Reasoner's full reasoning inside the record
  instead of referencing the Inference Record would create a second source of truth;
  forbidden — IdentityEvolution links, never copies.
- **Treating the audit as the value.** Reading `after` as the *current* value is a
  defect; the current value is recomputed from evidence, and may have since changed.
- **Contradicted inference.** A later revision contradicts an earlier one; both records
  remain, in order — the erroneous reason stays in history with its correction.

Never permitted: editing an IdentityEvolution in place; recording a change without
evidence and an inference reference; duplicating the reasoning; deleting the history of
why the model changed.

---

## 8. Examples

- **Metric with a reason.** "Execution consistency 71 → 78" is recorded with its
  grounds: finished 18 consecutive daily tasks, fewer abandoned projects, three
  long-running initiatives completed — linked to the Evidence and the Inference Record.
- **Emergent interest.** Over weeks, observations (rotor discussions, 16 aerospace
  papers, three founder meetings, 140 hours on drone software) drive a Belief from
  weak to strong; each step is an IdentityEvolution — identity *emerged*, it was never
  *edited*.
- **Revised then re-revised.** A relationship strength rises on new contact, then falls
  as contact lapses; two IdentityEvolutions record both moves and their reasons, in
  order.
- **Replay of why.** A full replay rebuilds the current Twin *and* the chain of
  IdentityEvolutions, so the user can ask not just "what does Orb think?" but "why does
  Orb think it, and when did that change?"
