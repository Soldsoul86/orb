# Reasoner — Contract Specification

```
Contract:   Reasoner
Domain:     Intelligence
Kind:       Service
Version:    v1
Status:     Draft
Depends on: Retriever, DigitalTwin, Belief, Evidence, ModelRouter
```

> A Reasoner answers: **what does this mean, and what should we conclude or decide?**
> It consumes evidence, beliefs, the Twin, and retrieved history; it produces
> inferences, belief revisions, and decisions — and records the provenance of every
> run as an `InferenceRecord`. It must remain model-independent. See `../docs/KERNEL.md`
> §4, `../docs/AGENT_RUNTIME.md`, and `InferenceRecord.md`.

**Why a permanent kernel contract?** Because it is the **model-independent
interpretation seam** mandated by the Constitution (Art. III §11): the contract that
lets the model behind Orb's intelligence be swapped, upgraded, or run locally without
touching the architecture. It is the literal embodiment of "the implementation is
replaceable." Everything else in the domain exists to feed it (`Retriever`) or to
consume what it records (`Planner`). *Can it exist for twenty years?* This is the
strongest pass in the domain: models will be replaced many times over decades, and the
Reasoner is precisely the boundary that survives every replacement. The contract is the
permanent promise *"interpretation happens here, through a replaceable model, and is
always recorded"*; the model itself is never part of the contract.

---

## 1. Semantics

A **Reasoner** is a Service that derives new interpretation from grounded inputs. It
consumes **Evidence**, **Beliefs**, the **DigitalTwin**, and the history surfaced by the
**Retriever**, and produces **inferences**, **belief revisions**, and **decisions**. It
performs the *Reasoning* transition — the transition itself is not a kernel contract; its
**outputs are** (`Belief`, `Prediction`, `IdentityEvolution`, and the decision a
`Planner` later sequences).

Two obligations define it:

- **Model independence.** It invokes models only through the `ModelRouter`; no provider
  is hardcoded, and a local implementation is always viable (Art. III §11). Swapping the
  model changes *future* interpretation only; all history — including prior models'
  outputs — is untouched.
- **Recorded provenance.** Every run emits an `InferenceRecord` — the immutable account
  of how the inputs were interpreted, with full model provenance. The Reasoner's
  conclusions therefore enter history as State (Beliefs, Predictions, InferenceRecords),
  never as a live dependency that a stored record points back to.

It owns **no durable state.** Its products live in other domains; its only residue is
the `InferenceRecord`s it writes.

---

## 2. Lifecycle (operational)

1. **Idle** — no reasoning task scheduled.
2. **Gathering** — a task arrives; the Reasoner takes the relevant history from the
   `Retriever` and the grounding (Evidence, Beliefs, Twin) it needs.
3. **Routing** — it resolves a concrete model through the `ModelRouter` (local or
   remote, per policy).
4. **Inferring** — the model interprets the inputs; the Reasoner shapes the output into
   interpretation, belief revisions, or a decision.
5. **Recording** — it writes an `InferenceRecord` with full provenance, and emits its
   products (`Belief`/`Prediction`/`IdentityEvolution`/decision) into their domains.
6. **Degraded** — if no remote model is available, it falls back to a local route rather
   than failing; if grounding is missing, it declines to conclude rather than inventing.

---

## 3. State transitions

```
(idle) ──▶ (gathering) ──▶ (routing) ──▶ (inferring) ──▶ (recording) ──▶ (idle)
                              │                              │
        degraded ◀── no remote model ──▶ local route        └── emits InferenceRecord
                              │                                  + Belief/Prediction/
        declines ◀── grounding missing ──▶ no conclusion        IdentityEvolution/decision
```

Operational moves only — the Reasoner stores no record that transitions over time; its
durable footprint is the immutable records and products it writes.

---

## 4. Invariants

1. **Model-independent.** No provider is hardcoded; models are invoked only through the
   `ModelRouter`; a local implementation is always viable (Constitution Art. III §11).
2. **Every run is recorded.** Each derivation produces an `InferenceRecord` with full
   provenance; conclusions enter history as State, never as a live dependency
   (Art. III §12, Art. X §40).
3. **Produces interpretation, never truth.** Its outputs are recomputable, revisable
   interpretation grounded in evidence — never asserted as truth (Art. II).
4. **Replay reproduces history, not intelligence.** Replay restores the recorded outputs
   and InferenceRecords; it never re-runs the model (Art. III §13).
5. **Owns no durable state.** The Service is restartable without loss; all its memory
   lives in events and projections (Art. V §22).
6. **Never depended upon by State.** No State contract depends on the Reasoner; products
   reference the `InferenceRecord` it wrote, not the Service (Art. X §40).

Upholds Constitution Articles III (Models and Reasoning), II (Truth and Interpretation),
V (The Runtime), and X §40.

---

## 5. Versioning rules

- New **reasoning strategies and model backends** are implementation behind the
  contract and behind the `ModelRouter`; they change future interpretation, never
  history (Art. X — addition, never mutation).
- New **output kinds** the Reasoner may produce are added as their own State contracts
  (e.g. a future `Claim`); the Reasoner references them additively without changing its
  core obligation.
- The core obligation — *a model-independent derivation of interpretation that records
  full provenance for every run* — is frozen at v1.

---

## 6. Compatibility guarantees

Consumers may permanently rely on:

- The Reasoner is model-independent: no conclusion depends on a specific provider, and a
  local route always exists.
- Every conclusion it produces is backed by an `InferenceRecord` that explains how it was
  reached.
- Its outputs are grounded interpretation, never truth, and are always recomputable.
- Restarting or replacing the Reasoner loses nothing of value and never rewrites history.

Not guaranteed:

- That a conclusion is *correct* — it is the best current interpretation, revisable as
  evidence accumulates.
- That re-reasoning the same inputs yields the same conclusion — models evolve; only the
  recorded provenance is stable (Art. III §13).

---

## 7. Failure modes

- **No remote model.** The Reasoner falls back to a local route rather than failing; the
  fallback is itself recorded in the InferenceRecord's provenance.
- **Missing grounding.** With insufficient Evidence/Beliefs it declines to conclude
  rather than fabricating interpretation; no ungrounded conclusion enters history.
- **Unrecorded run.** A conclusion produced without an InferenceRecord is a defect —
  provenance is mandatory; the conclusion would be unexplainable (Art. III §12).
- **Hardcoded provider.** Binding to a specific model provider violates Art. III §11 and
  is forbidden; routing is always through the `ModelRouter`.
- **Acting.** A Reasoner that performs effects has overstepped — reasoning produces
  interpretation and decisions; acting is the Execution Plane's, through permission.

Never permitted: hardcoding a provider; producing a conclusion without an
InferenceRecord; asserting interpretation as truth; mutating prior history; replaying by
re-running a model instead of restoring records; a State contract depending on the
Reasoner.

---

## 8. Examples

- **Belief revision.** Given retrieved messages and response-time evidence, the Reasoner
  concludes a customer is disengaging (confidence 0.62), revises the relevant Belief, and
  records an InferenceRecord with the model, prompt version, inputs, and confidence.
- **Prediction.** From beliefs about a project's pace it projects a likely slip,
  recording the forward-projection as an InferenceRecord and emitting a `Prediction`
  checkable against later observation.
- **Identity change.** Interpreting weeks of aerospace-related observations, it concludes
  an emerging interest and emits an `IdentityEvolution` that *references* the
  InferenceRecord — the reasoning recorded once, linked, never duplicated.
- **Model swap, history intact.** The remote model is upgraded; future conclusions may
  differ, but every prior Belief remains explainable via its InferenceRecord — *replay
  reproduces history, not intelligence*.
- **Local-only device.** With no network, the Reasoner routes to a local model and
  continues to reason and record, unbroken — model independence in practice.
