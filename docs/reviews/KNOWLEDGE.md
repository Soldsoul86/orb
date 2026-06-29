# Domain Integrity Report — 2. Knowledge

> Phase 3b architectural review. The Knowledge domain answers: **how Orb
> understands reality.** **Status: Accepted** (with the decisions below applied).
> Specs: `../../contracts/{Evidence,Entity,Fact,Belief,Prediction}.md`.

---

## Decisions (ratified)

1. **"Persistent state shall never depend on a running process"** is ratified as a
   kernel-wide law — Constitution **Article X §40** — strengthening the earlier
   "State never depends on a Service." A State contract depends only on State (or
   nothing); a Service's derivation is referenced through the immutable record it
   produced, never the live process. This guarantees replay is always possible.
2. **Fact and Belief are kept as distinct epistemic objects** (not two confidence
   levels of one claim). A **Fact** is the runtime's best-supported *objective*
   statement ("the meeting lasted 43 minutes"), persisting until contradicted by
   better evidence; a **Belief** is *contextual* ("this customer is becoming
   disengaged") and may disappear tomorrow. Neither reclassifies into the other.
   The stack is `Observation → Evidence → Fact → Belief`, so **Belief now depends
   on Fact**.
3. **Prediction is kept separate** — it is where Orb learns. The loop
   `Belief → Prediction → Reality → Observation → Belief Revision` is the basis of
   continuous learning.
4. **"Model-output Evidence" is renamed to `Inference Record`** and made a *distinct
   kind of State*, not Evidence. **Evidence is external grounding only**
   (observation, attachment, external source); the model contributes an Inference
   Record that explains *how* evidence was interpreted. The `InferenceRecord`
   contract is specified together with its producer, the `Reasoner`, in the
   **Intelligence** domain review (kernel State count then grows by one under
   Article X). Knowledge contracts already reference it by name.
5. **`Claim` is logged as Architectural Debt** (`../ARCHITECTURAL_DEBT.md`, item
   AD-1) for evaluation in v2 — a layer between Evidence and Fact for statements
   *people make* ("John likes Rust"), distinct from runtime Facts and Beliefs.
   Phase 3 does not stop for it.

---

## Contracts

| Contract | Kind | Why it deserves to be a permanent kernel contract (summary) |
| --- | --- | --- |
| **Evidence** | State | The grounding of all interpretation: the immutable, polarity-bearing link between what was observed and what it bears upon. **External grounding only** — a model's reading is an Inference Record, not Evidence. |
| **Entity** | State | The resolved *subject* interpretation is about — one subject inferred across many signals; recomputable and revisable by merge/split. |
| **Fact** | State | The runtime's best-supported *objective* statement, grounded in evidence; persists until contradicted. A distinct object from Belief. |
| **Belief** | State | *Contextual* interpretation held with confidence — how Orb represents what it thinks and how strongly, never as truth. May disappear as context shifts. |
| **Prediction** | State | A falsifiable belief about the future: the recorded expectation that lets Reflection check understanding against reality. |

All five answer the justification question convincingly. None is a candidate for
demotion to implementation. The Belief/Fact and Belief/Prediction distinctions —
the domain's only near-overlaps — were the subject of review Questions 2–3 and are
ratified as **distinct objects** (see *Decisions*).

---

## Dependency Graph

Directed edges = "depends on". `*` marks a forward/backward edge into another
domain. "produces" edges (Service → the State it emits) are shown dashed and are
one-directional.

```
Evidence    → Observation*, Event*, Attachment*   (Reality)
Entity      → Evidence
Fact        → Evidence, Entity
Belief      → Evidence, Entity, Fact
Prediction  → Belief, Evidence
```

```
   Reality plane: Observation, Event, Attachment
                     ▲
                     │ (depends on)
              ┌──────┴──────┐
              │  Evidence   │
              └──────┬──────┘
                     ▲
              ┌──────┴──────┐
              │   Entity    │
              └──────┬──────┘
                     ▲
              ┌──────┴──────┐
              │    Fact     │
              └──────┬──────┘
                     ▲
              ┌──────┴──────┐
              │   Belief    │
              └──────┬──────┘
                     ▲
              ┌──────┴──────┐
              │ Prediction  │
              └─────────────┘
```

With **Belief → Fact** added (decision 2), the domain collapses to a clean linear
spine: `Evidence → Entity → Fact → Belief → Prediction`. (Entity, Fact, and Belief
each also reference Evidence directly; the spine shows the strongest edge.) All
cross-domain edges point *backward* into Reality (already accepted), never forward.
The `InferenceRecord` (decision 4; now an accepted Intelligence-domain State contract)
is produced by the Reasoner and references Knowledge State as inputs/outputs; it is a
sink — nothing in Knowledge depends on it — so it cannot introduce a cycle.

---

## Cycles

Two genuine cycles existed in the kernel draft before this review; both are now
resolved.

**Cycle 1 — `Entity ↔ Belief` (intra-domain).**
- *Before:* `Entity → Belief` (draft KERNEL listed Entity depending on Belief) and
  `Belief → Entity`. A subject's identity depended on beliefs about it, while
  beliefs depended on the subject.
- *Resolution:* **`Entity → Evidence` only.** An Entity's identity is justified by
  the *Evidence* that resolves it, not by Beliefs. Beliefs (and Facts) reference
  Entities; the reverse edge is removed. Direction is now strictly
  `Evidence → Entity → Belief`.

**Cycle 2 — `Belief ↔ Reasoner` and `Prediction ↔ Reasoner` (cross-domain, Intelligence).**
- *Before:* `Belief → Reasoner` and `Prediction → Reasoner`, while a Reasoner
  *produces* Beliefs and Predictions — a State-depends-on-Service edge that closes
  a cycle.
- *Resolution:* **`Belief → Evidence, Entity, Fact`** and **`Prediction → Belief,
  Evidence`** (Reasoner removed from both). The derivation a Reasoner performed is
  recorded as an immutable **Inference Record** carrying full provenance; the
  Belief/Prediction is grounded in State (Facts/Evidence/Beliefs) and the Inference
  Record links to it — no live Service is depended upon.

**After amendment:** **No cycles exist.** The Knowledge domain is a DAG, and all
its outward edges point backward into the already-accepted Reality domain.

### The rule that prevents recurrence

Both fixes are the same rule, now **ratified** as Constitution Article X §40 and
documented in `KERNEL.md` (§Dependency Direction):

> **Persistent state shall never depend on a running process.** A State contract
> depends only on other State (or on nothing); it never depends on a Service.

The justification is the History/Interpretation separation itself: a durable record
must point at the immutable *output* a Service produced (recorded as an Inference
Record with provenance), never at the live Service — otherwise the record cannot
outlive a model swap, and *replay would reproduce intelligence instead of history*.
This rule is the domain's central structural finding.

---

## Hidden State

State that lives outside the five State contracts, and why it is permissible:

- **Evidence Graph adjacency / indexes** — derived projections owned by the
  Knowledge-Plane services for traversal. Not source-of-truth: rebuildable by
  replaying the Evidence Events.
- **Digital Twin current projection** (current Entities/Facts/Beliefs) — the live
  recomputed view; fully rebuildable from the journal. Source of truth remains the
  Events, never the Twin (covered in the Identity-domain review).
- **Confidence-scoring / resolution model state** — operational Service state of
  the Reasoner/Memory (Intelligence domain); owns no durable truth. Its outputs are
  recorded as Inference Records (and the Beliefs/Predictions they explain).

**Conclusion:** No *source-of-truth* state exists outside the State contracts. All
interpretation is recomputable from recorded Events and Evidence, consistent with
Constitution Art. I §3 (journal is the only source of truth) and Art. V §22
(services own no durable truth).

---

## Constitution Coverage

Articles exercised by the Knowledge domain:

- **Article I — History** (Evidence): interpretation is grounded in immutable,
  replayable Events; revision is append-only.
- **Article II — Truth and Interpretation** (Entity, Fact, Belief, Prediction):
  recomputable, revisable, never truth; corrections accumulate, never rewrite.
- **Article III — Models and Reasoning** (Belief, Prediction, Inference Record):
  model conclusions recorded with full provenance; *replay reproduces history, not
  intelligence*.
- **Article XI — Reality and Confidence** (Prediction ↔ Observation): predictions
  are checked only when reality confirms; the learning loop closes on observation.

Not exercised here (belong to later domains): Art. IV (Distribution), V (Runtime),
VI (Three Planes — boundary itself), VII (Capabilities/Human Agency), VIII
(Ownership/Trust), IX (Engineering), X (already applied to versioning).

---

## Future Extension Points

All additive under Article X (v1 contracts remain valid forever):

- **New Evidence kinds** (corroboration, contradiction, citation, external-source,
  …) — added and versioned without touching existing kinds. (Model interpretations
  are Inference Records, not Evidence kinds.)
- **New Entity types, Fact categories, Belief categories, Prediction categories** —
  value/schema-level additions; existing meanings frozen.
- **New resolution / settlement / projection strategies** — implementation behind
  the contracts; interpretation may evolve and reach different conclusions over
  time, but never rewrites recorded history.
- **New confidence representations** — added and tagged; old records keep their
  original representation forever.

---

## Questions — resolved

All four review questions were ratified by the reviewer (see *Decisions* above):

1. **Dependency Direction → ratified and strengthened** to "persistent state shall
   never depend on a running process" (Constitution Art. X §40). It must be applied
   preemptively to the remaining domains; `Attachment → Storage, Encryption` in
   Reality is the first to reconcile, in the Infrastructure review.
2. **Belief vs. Fact → keep both**, sharpened: they are *distinct epistemic
   objects* (objective Fact vs. contextual Belief), not stances on one claim, and
   neither reclassifies into the other. Belief now depends on Fact.
3. **Prediction vs. Belief → keep separate** — Prediction is where Orb learns.
4. **Model-output Evidence → renamed `Inference Record`** and separated from
   Evidence (external grounding only). Its contract is formalized with the
   `Reasoner` in the Intelligence review.

One new item was raised by the reviewer and **logged as Architectural Debt** rather
than actioned now: a `Claim` layer between Evidence and Fact (`../ARCHITECTURAL_DEBT.md`,
AD-1), for v2 evaluation.

---

## Recommendation

**Amend (applied) → Accepted.**

The two structural defects (`Entity ↔ Belief` and the `Belief/Prediction ↔
Reasoner` cross-domain cycles) are resolved by a single ratified principle —
*persistent state never depends on a running process* — which also makes the domain
smaller and more correct and records model derivations as auditable Inference
Records. With the reviewer's decisions applied, the Knowledge domain is acyclic
(linear spine `Evidence → Entity → Fact → Belief → Prediction`), minimal, fully
grounded in Reality, and closed under the Constitution. The domain is **accepted**;
the `InferenceRecord` contract and the `Claim` debt item carry forward to the
Intelligence review and v2 respectively.
