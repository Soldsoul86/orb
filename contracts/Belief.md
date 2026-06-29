# Belief — Contract Specification

```
Contract:   Belief
Domain:     Knowledge
Kind:       State
Version:    v1
Status:     Draft
Depends on: Evidence, Entity
```

> A Belief is an interpretation held with explicit uncertainty — the working
> material of the Digital Twin. See `../docs/DIGITAL_TWIN.md` (Belief Revision) and
> `SYSTEM_OVERVIEW.md`.

**Why a permanent kernel contract?** Because Orb reasons under uncertainty as its
normal condition, and it must represent *what it thinks, and how strongly* as a
first-class, grounded, recomputable record — never as truth. Belief is the contract
that carries confidence with provenance: it is where a model-backed conclusion
lives as knowledge while remaining auditable and revisable. Without it, uncertainty
would either be discarded (collapsing into false certainty) or hidden in
implementation, both of which the Constitution forbids. Belief is the stable
embodiment of "interpretation, held with confidence, grounded in evidence,
revisable forever."

---

## 1. Semantics

A **Belief** is an interpretation Orb holds with **confidence**, about one or more
**Entities**, grounded in **Evidence**: "John probably lives near the office
(0.7)," "the user likely prefers async communication (0.6)." It carries a claim
*and* a confidence in `[0, 1]`, and it never asserts truth.

A Belief differs from a Fact in **stance**: a Belief is held with explicit
uncertainty, a Fact is relied upon as settled. A Belief may strengthen into a Fact
or weaken toward abandonment as Evidence accumulates; both directions are recorded.

Where a Belief is **model-backed**, the derivation that produced it is recorded as
**model-output Evidence** (provider, model version, prompt template version, input
references, parameters, timestamp, environment). The Belief references that
Evidence — not the live Reasoner. This is what keeps Belief a piece of State that
depends only on State, and what lets *replay reproduce history, not intelligence*.

---

## 2. Lifecycle

1. **Formation.** During Understand, a derivation (often model-backed) concludes a
   claim with some confidence; the derivation is recorded as Evidence and a Belief
   is formed referencing it.
2. **Recording.** The Belief is recorded as an Event and joins the recomputable
   Digital Twin.
3. **Use.** Planning and prediction read Beliefs as uncertain working ground,
   weighting by confidence.
4. **Revision.** New Evidence (including Reflection results) revises the Belief's
   confidence or claim; prior values are retained. A Belief may strengthen into a
   Fact, weaken, or be abandoned — always by append.

---

## 3. State transitions

A Belief is recomputable interpretation; revisions are appended:

```
(formed, confidence c) ──used──▶ (referenced)
    │
    ├──supporting evidence──▶ (confidence ↑, prior retained) ──▶ (may promote to Fact)
    └──contradicting evidence──▶ (confidence ↓, prior retained) ──▶ (may be abandoned)
```

No transition rewrites history; each prior value persists with the Evidence that
justified it.

---

## 4. Invariants

1. **Carries confidence, never truth.** Every Belief has a confidence in `[0, 1]`
   and is never asserted as settled truth.
2. **Grounded in Evidence.** Every Belief references its supporting Evidence —
   including the model-output Evidence that records any model-backed derivation
   with full provenance. An ungrounded Belief is invalid.
3. **About Entities.** A Belief concerns resolved Entities.
4. **Recomputable; revision is append-only.** A Belief is rebuildable from history;
   revision retains prior values.
5. **Depends only on State.** A Belief references Evidence and Entities, never a
   live Service. A model's role survives as recorded Evidence, not as a dependency.
6. **Knowledge plane only.** A Belief holds no power to act and no source-of-truth
   state.

Upholds Constitution Articles II (Truth and Interpretation), III (Models and
Reasoning), and I (History).

---

## 5. Versioning rules

- New **Belief categories** and **confidence representations** are added and
  versioned; existing ones never change meaning.
- The core obligation — *evidence-grounded, entity-scoped, confidence-bearing,
  never-truth, revised by append, model role recorded as Evidence* — is frozen at
  v1.
- The derivation methods that form Beliefs are implementation; they may evolve and
  reach different conclusions over time, but never rewrite recorded Beliefs.

---

## 6. Compatibility guarantees

Consumers may permanently rely on:

- Every Belief carries a confidence and is traceable, through Evidence, to history.
- A model-backed Belief is always accompanied by provenance sufficient to explain
  it, recorded as Evidence.
- A Belief may be revised, promoted, or abandoned, but its prior values are
  retained.

Not guaranteed:

- That a Belief is *correct* — confidence is not proof.
- That confidence is *stable* — it moves as Evidence accumulates.

---

## 7. Failure modes

- **Contradicted Belief.** New Evidence lowers confidence or reverses the claim;
  the revision is recorded, prior value retained.
- **Overconfident model output.** A high-confidence model conclusion is still a
  Belief, not a Fact; it is grounded in model-output Evidence and revisable, never
  silently upgraded to truth.
- **Model replacement.** If the Reasoner that formed a Belief is replaced, the old
  Belief stands as history with its original provenance; new derivations form new
  Beliefs. Replay never re-runs the model.
- **Entity re-resolution.** On merge/split of the Entity a Belief concerns, the
  Belief is re-attached by recorded re-resolution; its history is preserved.

Never permitted: asserting a Belief as truth; a Belief without confidence; a Belief
without Evidence; depending on a live Reasoner instead of recorded Evidence;
rewriting a prior Belief value.

---

## 8. Examples

- **Model-backed Belief.** A Reasoner concludes "the user is planning a trip to
  Delhi (0.55)" from recent emails. The derivation is recorded as model-output
  Evidence with full provenance; the Belief references it.
- **Strengthening to Fact.** "John works at Acme (0.6)" gains corroborating
  Evidence over weeks, rises in confidence, and is promoted to a Fact.
- **Weakening.** "The user prefers calls over chat (0.7)" accumulates
  contradicting Evidence and falls to 0.3, eventually abandoned — all recorded.
- **Auditability.** Asked "why do you believe this?", Orb walks from the Belief to
  its model-output Evidence and the Observations beneath, showing the full chain.
