# InferenceRecord — Contract Specification

```
Contract:   InferenceRecord
Domain:     Intelligence
Kind:       State
Version:    v1
Status:     Draft
Depends on: Evidence
```

> An InferenceRecord is the immutable provenance of a single act of reasoning — the
> permanent record that a specific model run, over specific inputs and referenced
> evidence, produced a specific output, at a time, with a confidence. It is the one
> durable contract of the Intelligence domain. See `../docs/KERNEL.md` §4 and
> `../docs/SYSTEM_OVERVIEW.md` §7 (Determinism Boundary).

**Why a permanent kernel contract?** Because of one constitutional fact: **replay
reproduces history, not intelligence** (Art. III §13). A model run cannot be
re-executed faithfully on replay — the model may be upgraded, withdrawn, or
non-deterministic — so the *fact that it ran and produced X* must be recorded as
history when it happens, exactly as Art. III §12 already requires. Notice what
survives twenty years: not GPT, not Claude, not any prompt or algorithm, but the
sentence *"on this date, using this evidence, this reasoning produced this
conclusion."* That is history, and history belongs in State. Without this contract,
the moment a model is replaced Orb loses the ability to explain any past conclusion,
and the entire Intelligence domain — otherwise pure Service — would have no durable
footing. It is the smallest possible permanent core for a domain that must otherwise
own no truth.

---

## 1. Semantics

An **InferenceRecord** records **reasoning provenance**: the immutable witness of one
inference. It captures the **inputs** consumed, the **Evidence referenced** (by
identity), the **model/provider**, the **parameters**, the **prompt-template
version**, the **output** produced, the **confidence**, and the **timestamp**. It
answers *"how did the runtime arrive at this conclusion, on what grounds, and with
what machine?"*

It is **provenance, not product, and not process.** The *product* of the inference
(a Belief, a Prediction, an IdentityEvolution, a plan's intent) lives in its own
contract; the *process* is gone the instant the run completes. What remains forever is
the provenance — evidence → reasoning → output → confidence → model metadata →
timestamp.

It is **distinct from Evidence.** Evidence is *external* grounding (an observation, an
attachment, an external source). An InferenceRecord is the machine's *internal*
interpretation of that grounding. Conflating the two would corrupt the accepted
meaning of Evidence; they are deliberately separate kinds of State.

It is **never a source of truth.** It does not hold the *current* value of anything;
it witnesses that a particular run produced a particular output at a particular time.
The current value of any derived state (a Belief's confidence, a Twin facet's metric)
is always recomputed from Evidence — the InferenceRecord merely explains a step in how
it got there.

---

## 2. Lifecycle

1. **Recording.** Whenever a `Reasoner` (or `Planner`) completes a run, an
   InferenceRecord is written, capturing inputs, referenced evidence, model metadata,
   parameters, prompt-template version, output, confidence, and timestamp. It enters
   history as an Event.
2. **Existence.** It is referenced by the products it justified — a `Belief` or
   `Prediction` it backs, an `IdentityEvolution` whose change it explains, a plan whose
   reasoning it records. Those products point *at* it; it points only at the Evidence
   it consumed.
3. **Permanence.** It is never edited, superseded in place, or deleted. A later
   inference — even one that contradicts it — is a *new* InferenceRecord; the chain of
   records is the runtime's permanent account of its own reasoning.

---

## 3. State transitions

An InferenceRecord is immutable from the moment it is written. Its only legal moves
are *recorded* and *referenced* — never revised in place.

```
(reasoning run completes) ──▶ (InferenceRecord recorded, immutable)
                                     │
                                     └── referenced by Belief / Prediction /
                                         IdentityEvolution / plan; never edited,
                                         superseded-in-place, or deleted
```

A contradicting or improved inference produces a **new** record; both stand, in order.
Replay reconstructs every record exactly; it never re-runs the model that produced one.

---

## 4. Invariants

1. **Immutable history.** Written once at the moment of the run; never edited, never
   deleted (Constitution Art. I, Art. III §12).
2. **Provenance, not truth.** It stores reasoning provenance — it never holds the
   current value of any derived state, which stays recomputable from Evidence
   (Art. II §9, Art. IX §33 — never duplicate sources of truth).
3. **Distinct from Evidence.** External grounding is Evidence; the machine's
   interpretation of it is an InferenceRecord. The two are never conflated.
4. **Full model provenance.** Every record carries enough to explain the run —
   model/provider, parameters, prompt-template version, input and evidence references,
   output, confidence, timestamp (Art. III §11–12).
5. **Preserved, not recomputed.** Because the output is a model output, replay restores
   the recorded output; it never re-executes the model (Art. III §13).
6. **Referenced, never depended-upon-backward.** Products reference it; it references
   only the Evidence it consumed. It never depends on a Service or on its own products,
   keeping the kernel a DAG (Art. X §40).

Upholds Constitution Articles III (Models and Reasoning), I (History), II (Truth and
Interpretation), and IX (Engineering — no duplicate sources of truth).

---

## 5. Versioning rules

- New **provenance fields** (new provider kinds, new parameter classes, new
  prompt-versioning or environment metadata) are added and versioned; existing fields
  never change meaning (Art. X — addition, never mutation).
- New **inference kinds** (interpretation, prediction, planning, reflection) are
  recorded under the same contract; the obligation to record provenance is uniform.
- The core obligation — *an immutable, evidence-grounded witness of one model run, that
  is provenance not truth* — is frozen at v1.

---

## 6. Compatibility guarantees

Consumers may permanently rely on:

- Every model-backed conclusion in Orb is traceable to an InferenceRecord that explains
  how it was reached and with what machine.
- The record, once written, never changes and is never deleted.
- Replay reconstructs every InferenceRecord exactly, even after the model that produced
  it is gone — history is preserved though intelligence is not.

Not guaranteed:

- That the inference was *correct* — it is faithfully preserved as it was, including if
  later contradicted (the contradiction is a new record).
- That re-running the same inputs today yields the same output — models evolve; only the
  *record* is stable, not the *reasoning* (Art. III §13).
- That the record holds the *current* value of anything — it is a point in history; the
  current value is recomputed elsewhere.

---

## 7. Failure modes

- **Unrecorded inference.** A model-backed conclusion enters the system with no
  InferenceRecord; this is a defect — provenance is broken and the conclusion is
  unexplainable (Art. III §12, Art. II §10).
- **Provenance treated as truth.** Reading a record's output as the *current* value is a
  defect; the current value is recomputed from Evidence and may have since changed.
- **Conflation with Evidence.** Recording a model's interpretation as Evidence (external
  grounding) corrupts the grounding semantics; forbidden — internal interpretation is an
  InferenceRecord.
- **Replay re-execution.** Attempting to "replay" by re-running the model rather than
  restoring the recorded output violates Art. III §13; replay restores records.
- **Lost model metadata.** A record without enough provenance to identify the run that
  produced it fails its purpose; the metadata is mandatory, not optional.

Never permitted: editing an InferenceRecord in place; deleting reasoning history;
treating it as a source of current truth; recording it as Evidence; reconstructing it by
re-running a model instead of restoring the record.

---

## 8. Examples

- **Belief, explained.** The Reasoner concludes "this customer is becoming disengaged"
  (confidence 0.62). An InferenceRecord captures the retrieved messages it read, the
  model and prompt version, the parameters, the output, the confidence, and the time.
  The `Belief` references the record; the record references the Evidence.
- **Model upgraded.** A year later the model is replaced and re-reasons the same
  customer to a different conclusion. The new conclusion gets a new InferenceRecord; the
  old one remains, fully explaining the older Belief — *replay reproduces history, not
  intelligence*.
- **Identity change, grounded.** "Execution consistency 71 → 78" is recorded as an
  `IdentityEvolution` that *references* the InferenceRecord which interpreted the
  evidence — the reasoning is recorded once, here, and linked, never duplicated.
- **Plan provenance.** The Planner sequences a follow-up from a recorded decision; the
  planning run is itself written as an InferenceRecord, so the *why* of the plan is
  auditable years later even though no durable `Plan` object exists in v1.
