# Prediction — Contract Specification

```
Contract:   Prediction
Domain:     Knowledge
Kind:       State
Version:    v1
Status:     Accepted
Depends on: Belief, Evidence
```

> A Prediction is a belief about the future — an interpretation projected forward
> and made checkable against what later actually happens. See
> `../docs/DIGITAL_TWIN.md` and `RUNTIME_LOOP.md` (Reflection / Learning).

**Why a permanent kernel contract?** Because a system that learns must commit to
**falsifiable expectations** and then confront them with reality. A Prediction is
that commitment: an interpretation about the future, grounded and confidence-
bearing, *recorded so it can later be compared against an Observation*. This is the
hinge of the learning loop — without a first-class, recorded Prediction, Reflection
would have nothing to check and Orb could not measure whether its understanding is
any good. Prediction makes "expectation, recorded and falsifiable" a permanent part
of the epistemic stack, distinct from a present-tense Belief.

---

## 1. Semantics

A **Prediction** is a **Belief about the future**: an interpretation projected
forward in time, asserting an expected state with a confidence in `[0, 1]`, and
**falsifiable** — it must be comparable against a later Observation. "The user will
likely reply to John by Friday (0.6)," "the meeting will probably be rescheduled
(0.4)."

A Prediction rests on **Beliefs** and the **Evidence** grounding them. Where the
forward projection is model-backed, the model's reasoning is recorded separately as
an **Inference Record** (specified with the `Reasoner` in the Intelligence domain),
not as Evidence. Like all interpretation a Prediction is **never truth**: it is an
expectation Orb is willing to be wrong about, on the record, so that being wrong can
teach it.

A Prediction's defining property is **checkability**: at some horizon, reality is
observed and the Prediction is compared against it. That comparison (by Reflection)
produces new Evidence and revises Beliefs — closing the learning loop.

---

## 2. Lifecycle

1. **Projection.** During Understand/Plan, a forward-looking derivation projects
   current Beliefs into an expected future state; the model's reasoning is recorded
   as an Inference Record and a Prediction is formed, grounded in those Beliefs and
   their Evidence.
2. **Recording.** The Prediction is recorded as an Event, fixing the expectation
   and its horizon in history.
3. **Pending.** It awaits the horizon at which it becomes checkable.
4. **Resolution (by Reflection).** At/after the horizon, the relevant Observation
   is compared against the Prediction; the outcome (confirmed / refuted / partial)
   is recorded as new Evidence, feeding Learn. The Prediction itself is not
   rewritten — the comparison is appended.

---

## 3. State transitions

A Prediction is recomputable interpretation; its resolution is appended, never
destructive:

```
(projected, confidence c) ──recorded──▶ (pending until horizon)
        │
        └──reality observed──▶ Reflection compares ──▶ (confirmed | refuted | partial)
                                                            │
                                                            └──▶ new Evidence ──▶ Beliefs revised
```

The Prediction's recorded expectation never changes; its resolution is new history
layered on top.

---

## 4. Invariants

1. **Interpretation, never truth.** A Prediction is an expectation with confidence,
   never an assertion of fact.
2. **Falsifiable.** Every Prediction is comparable against a later Observation; a
   Prediction that can never be checked is invalid.
3. **Grounded.** Every Prediction references the Beliefs it rests on and the
   Evidence beneath them; a model-backed projection is additionally explained by an
   Inference Record.
4. **Depends only on State.** A Prediction references Beliefs and Evidence, never a
   live Service (Constitution Art. X §40); the projecting model's role survives as
   a recorded Inference Record.
5. **Resolution is append-only.** Confirmation or refutation is recorded as new
   Evidence; the original Prediction is never rewritten.
6. **Knowledge plane only.** A Prediction holds no power to act and no
   source-of-truth state.

Upholds Constitution Articles II (Truth and Interpretation), III (Models and
Reasoning), and I (History).

---

## 5. Versioning rules

- New **Prediction categories** and **horizon representations** are added and
  versioned; existing ones never change meaning.
- The core obligation — *falsifiable, grounded in Beliefs/Evidence,
  confidence-bearing, never-truth, resolved by appended comparison* — is frozen at
  v1.
- Projection methods are implementation; they may evolve and predict differently
  over time, but never rewrite recorded Predictions or their resolutions.

---

## 6. Compatibility guarantees

Consumers may permanently rely on:

- Every Prediction is falsifiable and traceable, through Beliefs and Evidence, to
  history.
- A Prediction's outcome, once a horizon is reached, is recorded as new Evidence —
  never by editing the Prediction.
- A model-backed Prediction is accompanied by provenance sufficient to explain it.

Not guaranteed:

- That a Prediction comes true — being wrong is expected and is how Orb learns.
- That a Prediction is resolved promptly — resolution waits on the confirming
  Observation, which is eventually-complete, not instantaneous.

---

## 7. Failure modes

- **Refuted prediction.** Reality contradicts the expectation; Reflection records
  the refutation as Evidence and revises the underlying Beliefs. The Prediction
  stands in history as a recorded, wrong expectation — never deleted.
- **Unresolvable prediction.** If no Observation can ever check it, it violated
  falsifiability and should not have been recorded as a Prediction; such a claim is
  a Belief, not a Prediction.
- **Late confirmation.** The confirming Observation arrives long after the horizon;
  the resolution is recorded whenever it arrives (nothing is "live").
- **Model replacement.** If the projecting Reasoner is replaced, old Predictions
  stand with original provenance; new projections are new Predictions. Replay never
  re-runs the model.

Never permitted: asserting a Prediction as truth; an unfalsifiable Prediction;
rewriting a Prediction or its outcome; depending on a live Reasoner instead of
recorded Evidence.

---

## 8. Examples

- **Reply expectation.** From Beliefs about the user's habits, Orb predicts "the
  user will reply to John by Friday (0.6)." On Friday, an Observation of the sent
  reply confirms it; Reflection records the confirmation as Evidence.
- **Refutation teaches.** Orb predicts "the 3 PM meeting will happen as scheduled
  (0.8)." A reschedule Observation refutes it; the refutation Evidence lowers the
  confidence of the Belief that meetings rarely move.
- **Partial.** "The user will finish the report this week (0.5)" is partially met —
  a draft but not a final — and the partial outcome is recorded as Evidence.
- **Auditability.** Each Prediction links to the Beliefs and Evidence it rested on
  and the Inference Record that produced it, so a wrong prediction can be traced to
  the reasoning — and the model — behind it.
