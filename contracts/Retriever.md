# Retriever — Contract Specification

```
Contract:   Retriever
Domain:     Intelligence
Kind:       Service
Version:    v1
Status:     Draft
Depends on: LiveContext, Evidence, DigitalTwin, Journal
```

> A Retriever answers one question: **given the current situation, what historical
> information is relevant?** It consumes the situational frame and produces a ranked,
> grounded slice of history for reasoning to draw upon. See `../docs/KERNEL.md` §4 and
> `../docs/EVIDENCE_GRAPH.md`.

**Why a permanent kernel contract?** Because "given a situation, surface the relevant
slice of history" is a permanent runtime capability that is **independent of any
retrieval technology**. The implementation will turn over completely — keyword search,
then embeddings, then whatever replaces them — but the *contract* (relevance selection
over grounded history, scoped by the present situation) does not. Naming it as its own
contract keeps the `Reasoner` from re-implementing retrieval, and keeps "what to look
at" cleanly separable from "what to conclude" — two concerns that must be replaceable
independently. *Can it exist for twenty years?* Retrieval-as-a-capability is permanent;
its internals churn constantly. The contract is the durable promise; it owns no state,
so every index behind it can be rebuilt or replaced freely.

---

## 1. Semantics

A **Retriever** is a read-only Service that, given the salient frame assembled by
`LiveContext`, ranks historical information — Evidence, Observations, prior
interpretation held in the Twin — by relevance, recency, and causality, and returns
grounded, provenance-bearing references. It answers *"given what matters now, what
history is relevant to it?"*

Its boundaries are sharp and define the domain's pipeline:

- It **does not determine the situation.** That is `LiveContext` ("what matters now").
  The Retriever *consumes* the frame; it never assembles it.
- It **does not reason.** That is the `Reasoner` ("what does it mean?"). The Retriever
  *selects*; it draws no conclusions and introduces no truth.

It owns **no durable state.** Indices, embeddings, and scoring models are ephemeral
working state, fully rebuildable from the journal; losing them loses nothing of value.

---

## 2. Lifecycle (operational)

1. **Idle** — no request; the Service holds nothing of value (indices are warm caches).
2. **Scoping** — a reasoning task arrives with a frame from `LiveContext`; the Retriever
   takes that frame as its scope.
3. **Ranking** — it queries grounded history (Evidence, Twin, Journal) and ranks by
   relevance, recency, and causality within the frame.
4. **Returning** — it returns ranked, provenance-bearing references to the Reasoner.
5. **Degraded** — if an index is cold or a store is unavailable, it returns a reduced
   result (e.g. recency-only) rather than fabricating relevance; it never invents
   references.

---

## 3. State transitions

```
(idle) ──▶ (scoping) ──▶ (ranking) ──▶ (returning) ──▶ (idle)
                            │
        degraded ◀── index cold / store unavailable ──▶ reduced result, never fabricated
```

Operational moves only — the Retriever stores no record that transitions over time. Its
indices are rebuilt from the journal, not transitioned as truth.

---

## 4. Invariants

1. **Read-only and side-effect free.** It reads grounded history; it writes nothing and
   introduces no truth.
2. **Returns only grounded references.** Every result is provenance-bearing and
   traceable to events; the Retriever never returns ungrounded or invented content.
3. **Selects, never reasons.** It ranks relevance; it draws no conclusions
   (that is the Reasoner).
4. **Never determines the situation.** It consumes the frame from `LiveContext`; it
   never assembles context itself.
5. **Owns no durable state.** Indices and scoring models are ephemeral and rebuildable
   from the journal (Art. V §22); the Service is restartable without loss.
6. **Never depended upon by State.** No State contract depends on the Retriever
   (Art. X §40).

Upholds Constitution Articles V (The Runtime), II (Truth and Interpretation), and
X §40 (persistent state never depends on a running process).

---

## 5. Versioning rules

- New **retrieval strategies** (keyword, vector, graph-walk, hybrid, successors) are
  implementation behind the contract; they may change *which* results rank highest, but
  never grant the Retriever truth or durable state (Art. X — addition, never mutation).
- New **ranking signals** (relevance, recency, causality, salience, …) are added and
  versioned; existing signals never change meaning.
- The core obligation — *a read-only, stateless, situation-scoped ranker of grounded
  history* — is frozen at v1.

---

## 6. Compatibility guarantees

Consumers may permanently rely on:

- A Retriever returns only grounded, provenance-bearing references, never invented
  content.
- It is read-only and side-effect free; calling it never changes history.
- It is scoped by the supplied situation; it never decides the situation itself.
- Losing or restarting it loses nothing of value; its indices rebuild from the journal.

Not guaranteed:

- That the ranking is *complete* or *optimal* — it is the best current selection,
  revisable as indices, signals, and the frame change.
- That two implementations rank identically — the contract fixes the obligation, not the
  algorithm.

---

## 7. Failure modes

- **Cold or missing index.** The Retriever degrades to a reduced result (e.g.
  recency-only) rather than fabricating relevance; indices rebuild from the journal.
- **Store unavailable.** It returns what grounded history it can reach, flagged as
  partial, never inventing references to fill the gap.
- **Scope creep into reasoning.** If a Retriever begins drawing conclusions rather than
  ranking, it has overstepped its contract; conclusions belong to the Reasoner.
- **Scope creep into context.** If it begins assembling the situational frame itself, it
  has absorbed `LiveContext`'s job; the boundary (frame vs. relevance-within-frame) is
  enforced.

Never permitted: returning ungrounded or invented references; mutating history;
reasoning or concluding; persisting an index as a source of truth; a State contract
depending on the Retriever.

---

## 8. Examples

- **Meeting prep.** `LiveContext` frames "the 3pm with John"; the Retriever ranks the
  prior threads, shared documents, and past commitments most relevant to John and that
  meeting, and hands them to the Reasoner.
- **Disengagement check.** Framed on "this customer," the Retriever surfaces the recent
  messages, response-time evidence, and prior beliefs about the account — grounded
  references only — for the Reasoner to interpret.
- **Cold start.** Right after a restart, before vector indices are warm, the Retriever
  returns a recency-ranked slice rather than guessing relevance, filling in as indices
  rebuild.
- **Technology swap.** The embedding model behind retrieval is replaced; the contract is
  unchanged, prior conclusions remain explainable via their InferenceRecords, and only
  *future* rankings differ.
