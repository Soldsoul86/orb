# Belief — Contract Specification

```
Contract:   Belief
Domain:     Knowledge
Kind:       State
Version:    v1
Status:     Accepted
Depends on: Evidence, Entity, Fact
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

A **Belief** is a **contextual** interpretation Orb holds with **confidence**,
about one or more **Entities**, resting on **Facts** and **Evidence**: "this
customer is becoming disengaged (0.6)," "the user likely prefers async
communication (0.6)." It carries a claim *and* a confidence in `[0, 1]`, and it
never asserts truth.

A Belief is a **different epistemic object** from a Fact, not a higher- or
lower-confidence version of one:

- A **Fact** is the runtime's best-supported *objective* statement, grounded
  directly in evidence — "the meeting lasted 43 minutes." It persists until
  contradicted by better evidence.
- A **Belief** is *contextual* interpretation built on facts and evidence — "this
  customer is becoming disengaged." It may disappear tomorrow as context shifts.

Neither converts into the other: a Belief does not "graduate" into a Fact, and a
Fact does not "decay" into a Belief. They are distinct layers of the epistemic
stack (`Observation → Evidence → Fact → Belief`); corrections to either arrive as
new records, never as reclassification.

Where a Belief is **model-backed**, the model's reading of the facts and evidence
is recorded separately as an **Inference Record** (provider, model version, prompt
template version, input references, parameters, timestamp, environment). The Belief
is grounded in Facts and Evidence; the Inference Record links to it and explains
*how* it was derived. The Belief therefore depends only on State — never on the
live Reasoner — which is what lets *replay reproduce history, not intelligence*.

---

## 2. Lifecycle

1. **Formation.** During Understand, a derivation (often model-backed) concludes a
   contextual claim with some confidence over existing Facts and Evidence; the
   model's reading is recorded as an Inference Record and a Belief is formed,
   grounded in those Facts and Evidence.
2. **Recording.** The Belief is recorded as an Event and joins the recomputable
   Digital Twin.
3. **Use.** Planning and prediction read Beliefs as uncertain working ground,
   weighting by confidence.
4. **Revision.** New Evidence (including Reflection results) revises the Belief's
   confidence or claim; prior values are retained. A Belief may strengthen, weaken,
   or be abandoned — always by append. It never reclassifies into a Fact.

---

## 3. State transitions

A Belief is recomputable interpretation; revisions are appended:

```
(formed, confidence c) ──used──▶ (referenced)
    │
    ├──supporting evidence──▶ (confidence ↑, prior retained)
    └──contradicting evidence──▶ (confidence ↓, prior retained) ──▶ (may be abandoned)
```

No transition rewrites history; each prior value persists with the Evidence that
justified it.

---

## 4. Invariants

1. **Carries confidence, never truth.** Every Belief has a confidence in `[0, 1]`
   and is never asserted as settled truth.
2. **Grounded in Facts and Evidence.** Every Belief references the Facts and
   Evidence it rests on; an ungrounded Belief is invalid. A model-backed Belief is
   additionally explained by an Inference Record that records the derivation with
   full provenance.
3. **About Entities.** A Belief concerns resolved Entities.
4. **A distinct object from a Fact.** A Belief is contextual interpretation; it
   never reclassifies into a Fact, nor a Fact into it. Corrections arrive as new
   records.
5. **Recomputable; revision is append-only.** A Belief is rebuildable from history;
   revision retains prior values.
6. **Depends only on State.** A Belief references Facts, Evidence, and Entities,
   never a live Service (Constitution Art. X §40). A model's role survives as a
   recorded Inference Record, not as a dependency.
7. **Knowledge plane only.** A Belief holds no power to act and no source-of-truth
   state.

Upholds Constitution Articles II (Truth and Interpretation), III (Models and
Reasoning), and I (History).

---

## 5. Versioning rules

- New **Belief categories** and **confidence representations** are added and
  versioned; existing ones never change meaning.
- The core obligation — *fact-and-evidence-grounded, entity-scoped,
  confidence-bearing, never-truth, revised by append, model role recorded as an
  Inference Record, never reclassified into a Fact* — is frozen at v1.
- The derivation methods that form Beliefs are implementation; they may evolve and
  reach different conclusions over time, but never rewrite recorded Beliefs.

---

## 6. Compatibility guarantees

Consumers may permanently rely on:

- Every Belief carries a confidence and is traceable, through Facts and Evidence,
  to history.
- A model-backed Belief is always accompanied by provenance sufficient to explain
  it, recorded as an Inference Record.
- A Belief may be revised or abandoned, but its prior values are retained; it is
  never silently reclassified as a Fact.

Not guaranteed:

- That a Belief is *correct* — confidence is not proof.
- That confidence is *stable* — it moves as Evidence accumulates.

---

## 7. Failure modes

- **Contradicted Belief.** New Evidence lowers confidence or reverses the claim;
  the revision is recorded, prior value retained.
- **Overconfident model output.** A high-confidence model conclusion is still a
  contextual Belief, not a Fact; it is grounded in Facts/Evidence, explained by an
  Inference Record, and revisable — never silently upgraded to truth.
- **Model replacement.** If the Reasoner that formed a Belief is replaced, the old
  Belief stands as history with its original Inference Record; new derivations form
  new Beliefs. Replay never re-runs the model.
- **Entity re-resolution.** On merge/split of the Entity a Belief concerns, the
  Belief is re-attached by recorded re-resolution; its history is preserved.

Never permitted: asserting a Belief as truth; a Belief without confidence; a Belief
without grounding; depending on a live Reasoner instead of a recorded Inference
Record; reclassifying a Belief as a Fact; rewriting a prior Belief value.

---

## 8. Examples

- **Model-backed Belief.** A Reasoner concludes "the user is planning a trip to
  Delhi (0.55)" from recent emails and the Facts extracted from them. The model's
  reading is recorded as an Inference Record with full provenance; the Belief is
  grounded in those Facts and the email Evidence.
- **Contextual, not factual.** "This customer is becoming disengaged (0.6)" rests
  on Facts like "replies now average 3 days (was same-day)" and "last two meetings
  ran 43 and 38 minutes (was 60)." The Facts persist; the Belief may evaporate if
  context changes — and it never becomes a Fact itself.
- **Weakening.** "The user prefers calls over chat (0.7)" accumulates
  contradicting Evidence and falls to 0.3, eventually abandoned — all recorded.
- **Auditability.** Asked "why do you believe this?", Orb walks from the Belief to
  its Inference Record, the Facts it rests on, and the Observations beneath them —
  showing the full chain and which model produced the reading.
