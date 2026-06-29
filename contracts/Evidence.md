# Evidence — Contract Specification

```
Contract:   Evidence
Domain:     Knowledge
Kind:       State
Version:    v1
Status:     Draft
Depends on: Observation, Event, Attachment
```

> Evidence is the grounding of all interpretation: the immutable link between what
> was observed and what it bears upon. See `../docs/EVIDENCE_GRAPH.md` and
> `SYSTEM_OVERVIEW.md` (the epistemic stack).

**Why a permanent kernel contract?** Because *grounding* — the recorded fact that
one signal supports or contradicts another — is the load-bearing joint between
History and Interpretation. Every Fact, Belief, Entity, and Prediction must be
able to answer "on what basis?" and the answer is always Evidence. If grounding
were not a contract, interpretation could float free of history, and Orb's core
promise (*nothing becomes knowledge except through evidence*) would live in
implementation, where the Constitution forbids it. Evidence is also where a
model's *derivation* is recorded as history (model-output Evidence), which is what
lets replay reproduce history without re-running intelligence.

---

## 1. Semantics

**Evidence** is an immutable record that a signal **supports** or **contradicts**
something — typically an Observation, but also a Fact, a Belief, or another piece
of Evidence. It is the edge in the **Evidence Graph**: it names what is being
grounded, what grounds it, and the *polarity* of that relation (corroboration or
contradiction).

Evidence records grounding; it does **not resolve** it. Two pieces of Evidence may
point in opposite directions about the same claim, and both are kept. Whether the
claim is then believed is interpretation, decided later in the Knowledge Plane —
never by the Evidence itself.

A distinguished kind is **model-output Evidence**: when a Service (a Reasoner,
Planner, or other model-backed derivation) produces a conclusion, the derivation
is recorded as Evidence carrying full provenance (provider, model version, prompt
template version, input references, parameters, timestamp, environment). This is
how a derivation enters history as an immutable artifact rather than a live
dependency on the Service that produced it.

---

## 2. Lifecycle

1. **Derivation.** During Extract/Link (and Understand), the runtime derives a
   grounding relation from one or more recorded Events — corroboration between two
   Observations, a contradiction, or a model-output conclusion.
2. **Recording.** The Evidence is appended to the journal as an Event, fixing its
   identity, provenance, and causal placement. From this moment it is permanent
   history.
3. **Existence.** It is read and traversed as an edge of the Evidence Graph by the
   Digital Twin and by interpretation. It is never edited.
4. **Supersession (never deletion).** If later signals change the picture, *new*
   Evidence is recorded. Old Evidence remains; the graph accumulates, and
   interpretation weighs the whole.

---

## 3. State transitions

Evidence is immutable State. Its only transition is into existence:

```
(derived) ──record──▶ (recorded as Event) ──▶ (traversed in the Evidence Graph, forever)
```

It never transitions to "edited," "retracted," or "deleted." A retraction is a
**new** piece of Evidence contradicting the earlier one; the earlier Evidence's
state never changes.

---

## 4. Invariants

1. **Immutable and append-only**, as an Event (inherits all Event invariants).
2. **Grounds, never resolves.** Evidence records support or contradiction; it
   never decides which side wins. Resolution is interpretation.
3. **Always traceable.** Every piece of Evidence references its originating
   Event(s) and the subject(s) it grounds; ungrounded Evidence is invalid.
4. **Polarity is explicit.** Each Evidence states whether it supports or
   contradicts, so conflict is structural and inspectable.
5. **Model derivations are recorded with provenance.** Model-output Evidence
   carries the full provenance needed to explain — and audit — how a conclusion
   was reached, without depending on the live Service.
6. **History plane only.** Evidence contains no resolved belief or confidence
   verdict of its own; it carries only the grounding relation and its provenance.

Upholds Constitution Articles I (History), II (Truth and Interpretation), and III
(Models and Reasoning).

---

## 5. Versioning rules

- New **Evidence kinds** (corroboration, contradiction, model-output, derivation,
  citation, …) are added freely and versioned; existing kinds never change meaning.
- The core obligation — *grounds an interpretation, records polarity, is recorded
  as an immutable Event with provenance* — is frozen at v1. Strengthening it is
  addition; weakening it requires `Evidence v2` alongside v1.
- Provenance fields may be **added**; none is ever removed or redefined, so old
  Evidence remains fully explainable forever.

---

## 6. Compatibility guarantees

Consumers may permanently rely on:

- Every interpretation can be traced, through Evidence, back to recorded history.
- Evidence never changes; revised grounding arrives as new Evidence.
- Model-backed conclusions are always accompanied by provenance sufficient to
  explain them.

Not guaranteed:

- That Evidence is *correct* — it may corroborate a wrong Observation; the graph
  records the dispute, interpretation resolves it.
- That all relevant Evidence exists yet — grounding is eventually-complete, like
  sensing.

---

## 7. Failure modes

- **Conflicting evidence.** Support and contradiction about the same claim are
  both kept; the conflict is structure in the graph, resolved (if at all) in
  interpretation — never by deleting either edge.
- **Evidence for a missing attachment.** If raw content a piece of Evidence cites
  is temporarily unresolvable, the Evidence remains valid history; only the raw
  bytes are pending (recoverable by replication).
- **Stale model derivation.** If the model that produced a model-output Evidence
  is later replaced, the old Evidence stands as history with its original
  provenance; new conclusions are *new* Evidence. Replay never re-runs the model.
- **Partial recording.** If recording fails mid-way, no Evidence exists (Event
  append is all-or-nothing); the derivation is re-emitted idempotently.

Never permitted: mutating or deleting recorded Evidence; ungrounded Evidence;
recording a model-output conclusion without its provenance; resolving a conflict
by editing the graph.

---

## 8. Examples

- **Corroboration.** A calendar Observation ("meeting with John, 3 PM") and a
  Bluetooth-proximity Observation ("John's phone nearby, 3:02 PM") are linked by
  Evidence of support for the interpreted "Met John."
- **Contradiction.** A calendar Observation ("Lunch with John, 1 PM") is
  contradicted by a GPS Observation placing the user elsewhere at 1 PM. Evidence
  records the contradiction; both Observations are untouched.
- **Model-output Evidence.** A Reasoner extracts "this email implies a deadline of
  Friday" from a message. The conclusion is recorded as model-output Evidence
  citing the message Attachment and carrying provider/model/prompt provenance. The
  Belief that later forms references *this Evidence*, not the Reasoner.
- **Chained grounding.** Evidence may ground other Evidence: a contradiction
  between two model-output conclusions is itself recorded as Evidence, making the
  disagreement inspectable.
