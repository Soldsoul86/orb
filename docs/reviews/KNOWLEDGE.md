# Domain Integrity Report — 2. Knowledge

> Phase 3b architectural review. The Knowledge domain answers: **how Orb
> understands reality.** Reviewed before freezing. Specs:
> `../../contracts/{Evidence,Entity,Fact,Belief,Prediction}.md`.

---

## Contracts

| Contract | Kind | Why it deserves to be a permanent kernel contract (summary) |
| --- | --- | --- |
| **Evidence** | State | The grounding of all interpretation: the immutable, polarity-bearing link between what was observed and what it bears upon. Also where a model's derivation is recorded as history. |
| **Entity** | State | The resolved *subject* interpretation is about — one subject inferred across many signals; recomputable and revisable by merge/split. |
| **Fact** | State | The claim Orb currently relies upon: "settled until contradicted," distinct from both raw observation and uncertain belief. |
| **Belief** | State | Interpretation held with explicit confidence and provenance — how Orb represents what it thinks and how strongly, never as truth. |
| **Prediction** | State | A falsifiable belief about the future: the recorded expectation that lets Reflection check understanding against reality. |

All five answer the justification question convincingly. None is a candidate for
demotion to implementation. (Note: the present-tense vs. future-tense split between
**Belief** and **Prediction**, and the stance split between **Belief** and **Fact**,
are flagged in Questions for explicit ratification — they are the domain's only
near-overlaps.)

---

## Dependency Graph

Directed edges = "depends on". `*` marks a forward/backward edge into another
domain. "produces" edges (Service → the State it emits) are shown dashed and are
one-directional.

```
Evidence    → Observation*, Event*, Attachment*   (Reality)
Entity      → Evidence
Fact        → Evidence, Entity
Belief      → Evidence, Entity
Prediction  → Belief, Evidence
```

```
         Reality plane
   Observation, Event, Attachment
              ▲
              │ (depends on)
        ┌─────┴──────┐
        │  Evidence  │◀───────────────┐──────────────┐
        └─────┬──────┘                │              │
              ▲                        │              │
        ┌─────┴──────┐          ┌──────┴─────┐  ┌─────┴──────┐
        │   Entity   │◀─────────│   Belief   │  │    Fact    │
        └─────┬──────┘          └──────┬─────┘  └────────────┘
              ▲                        ▲   (Entity ◀── Fact too)
              │                  ┌─────┴──────┐
              └──────────────────│ Prediction │
                  (via Belief)   └────────────┘
```

Intra-domain topological order (no back-edges): `Evidence` → `Entity` →
`{Fact, Belief}` → `Prediction`. All cross-domain edges point *backward* into
Reality (already accepted), never forward.

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
- *Resolution:* **`Belief → Evidence, Entity`** and **`Prediction → Belief,
  Evidence`** (Reasoner removed from both). The derivation a Reasoner performed is
  recorded as an immutable **model-output Evidence** carrying full provenance; the
  Belief/Prediction references that Evidence, not the live Service.

**After amendment:** **No cycles exist.** The Knowledge domain is a DAG, and all
its outward edges point backward into the already-accepted Reality domain.

### The rule that prevents recurrence

Both fixes are the same rule, now documented in `KERNEL.md` (§Dependency
Direction):

> **State depends only on State (or nothing). Services depend on State and
> Services. A State contract never depends on a Service.**

The justification is the History/Interpretation separation itself: a durable record
must point at the immutable *output* a Service produced (recorded as Evidence with
provenance), never at the live Service — otherwise the record cannot outlive a model
swap, and *replay would reproduce intelligence instead of history*. This rule is the
domain's central structural finding and is raised in Questions for ratification as a
kernel-wide invariant.

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
  recorded as Evidence.

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
- **Article III — Models and Reasoning** (Belief, Prediction, model-output
  Evidence): model conclusions recorded with full provenance; *replay reproduces
  history, not intelligence*.
- **Article XI — Reality and Confidence** (Prediction ↔ Observation): predictions
  are checked only when reality confirms; the learning loop closes on observation.

Not exercised here (belong to later domains): Art. IV (Distribution), V (Runtime),
VI (Three Planes — boundary itself), VII (Capabilities/Human Agency), VIII
(Ownership/Trust), IX (Engineering), X (already applied to versioning).

---

## Future Extension Points

All additive under Article X (v1 contracts remain valid forever):

- **New Evidence kinds** (corroboration, contradiction, model-output, citation,
  derivation, …) — added and versioned without touching existing kinds.
- **New Entity types, Fact categories, Belief categories, Prediction categories** —
  value/schema-level additions; existing meanings frozen.
- **New resolution / settlement / projection strategies** — implementation behind
  the contracts; interpretation may evolve and reach different conclusions over
  time, but never rewrites recorded history.
- **New confidence representations** — added and tagged; old records keep their
  original representation forever.

---

## Questions

1. **Dependency Direction as a kernel-wide invariant.** The two cycle fixes both
   reduce to one rule — *State depends only on State; a State never depends on a
   Service* — now documented in `KERNEL.md` §Dependency Direction. Recommend
   **ratifying it as a kernel invariant** (and applying it preemptively to the
   remaining domains, e.g. `Attachment → Storage, Encryption` in Reality, which the
   Infrastructure review must reconcile). Confirm?
2. **Belief vs. Fact — keep both?** They differ in *stance* (held-with-uncertainty
   vs. relied-upon-as-settled), not in kind. Recommend **keep**: "settled until
   contradicted" and "held with confidence" are distinct, load-bearing stances that
   planning and action consume differently, and promotion/demotion between them is
   explicit and recorded. Flagging as the domain's main near-overlap.
3. **Prediction vs. Belief — keep separate?** A Prediction is a forward-projected,
   *falsifiable* Belief. Recommend **keep**: falsifiability-against-a-future-
   Observation is the hinge of the learning loop and deserves a first-class,
   checkable record distinct from a present-tense Belief.
4. **Model-output Evidence — confirm the mechanism.** Recording a Service's
   derivation as immutable Evidence (rather than a live dependency) is what breaks
   Cycle 2 and upholds *replay reproduces history, not intelligence*. This presumes
   the Intelligence-domain `Reasoner` contract emits such Evidence by obligation;
   flagged so the Intelligence review closes this consistently.

---

## Recommendation

**Amend (applied) → Accept.**

The two structural defects (`Entity ↔ Belief` and the `Belief/Prediction ↔
Reasoner` cross-domain cycles) are resolved by a single principle — *State depends
only on State* — which also makes the domain smaller and more correct and records
model derivations as auditable history. With these amendments the Knowledge domain
is acyclic, minimal, fully grounded in Reality, and closed under the Constitution.
Recommend **acceptance** of the Knowledge domain as amended, pending your
confirmation of Questions 1–4.
