# Domain Integrity Report — 4. Intelligence

> Phase 3b architectural review. The Intelligence domain answers one question:
> **how does Orb transform knowledge into understanding, decisions, and plans?**
> **Status: Design proposal — held for acceptance.** This is a design-judgment
> review, not a spec-writing pass: its recommendations *remove* two already-drafted
> contracts (one of which ripples into the frozen Identity domain) and *add* one, so
> no spec is written and `KERNEL.md` is not mutated until you accept the shape below.
>
> Candidate contracts evaluated (per the directive, "do not assume all five belong"):
> **Retriever, Reasoner, Planner, InferenceRecord, Claim** — plus the two contracts
> the draft kernel currently parks in this domain, **Memory** and **Reflector**.

---

## 1. Intelligence domain philosophy

Reality **records** history. Knowledge **interprets** it. Identity **accumulates**
the continuity that interpretation is *about*. Intelligence is different in kind
from all three: it is **the transformation layer** — the active process that turns
standing knowledge into understanding, decisions, and plans. It is where the runtime
*thinks*.

The defining property follows from that, and it is the spine of the whole domain:

> **Intelligence owns no truth. It stores process, not products.**

Every *product* of thinking already has a home in an accepted domain:

- an **understanding** is a **Belief** or a **Fact** (Knowledge);
- an expectation is a **Prediction** (Knowledge);
- a revised self-model is an **IdentityEvolution** + Twin re-derivation (Identity);
- a **decision acted upon** becomes an **Action** and then an **Observation**
  (Execution → Reality).

So Intelligence does not get to keep the *answers*. What it must keep — what no other
domain can keep for it — is **the immutable record of how a model arrived at an
answer**: inputs, referenced evidence, model/provider, parameters, prompt-template
version, confidence, timestamp, output. That single State object is the **Inference
Record**, and it exists for one constitutional reason:

> **Replay reproduces history, not intelligence** (Const. Art. III §13).

Because a model run cannot be faithfully re-executed on replay (the model may be
gone, upgraded, or non-deterministic), the *fact that it ran and produced X* must be
recorded as history, exactly as Art. III §12 already requires. Everything else in the
domain is a **Service** — a running capability that reads durable state, invokes a
model through the `ModelRouter`, writes its products into other domains, and leaves
behind only Inference Records.

The pipeline the domain implements, end to end:

```
Situation        Relevance         Understanding/Decision      Plan
(LiveContext) → (Retriever)    →   (Reasoner)              →  (Planner)  →  [Execution]
 Identity        Intelligence       Intelligence               Intelligence
   "what          "given that,       "what does it mean,         "how, concretely,
   matters         what history       and what should            could that be
   now?"           is relevant?"      we conclude/decide?"        carried out?"
```

Each stage consumes the previous stage's output and the durable planes beneath it,
and each stage's *reasoning* is recorded as an Inference Record. The products flow
**outward** (Beliefs, Predictions, Decisions→Actions); the provenance stays here.

---

## 2. Domain boundaries

The directive drew these lines; the review confirms them and makes them load-bearing.

- **LiveContext** *(Identity, accepted)* answers **"what matters right now?"** It
  assembles the salient frame from the Twin. It **never performs semantic retrieval,
  never ranks memory, never reasons.** It produces *the current situation only*.
- **Retriever** *(Intelligence)* answers **"given the current situation, what
  historical information is relevant?"** It consumes a situation (the frame from
  LiveContext) and produces **ranked evidence/history**. It **never determines the
  situation** (that is LiveContext) and **never reasons** (that is the Reasoner).
- **Reasoner** *(Intelligence)* consumes Evidence, Beliefs, the DigitalTwin, and
  retrieved history; produces **inferences, belief revisions, and decisions**. It is
  the *only* contract permitted to invoke interpretive models, and it must remain
  **model-independent** (Art. III §11 — no provider hardcoded; always via
  `ModelRouter`).
- **Planner** *(Intelligence)* consumes **decisions**; produces **executable plans**.
  It **does not execute actions** and it **does not bind capabilities** — capability
  binding and permission gating belong to Execution (Agent + Capability + Policy),
  keeping the Knowledge/transformation side free of any "power to act" (Art. VI §25).
- **Inference Record** *(Intelligence, State)* is the **immutable provenance of
  reasoning**. It **never stores current truth** and **never becomes the source of
  any derived state** — derived state is always recomputed from Evidence/Beliefs, and
  the Inference Record merely *witnesses* that a particular model run produced a
  particular output.

The two boundaries flagged in the Identity review are resolved here:

- **Identity Q2 (LiveContext ↔ Retriever):** confirmed distinct, drawn exactly as
  above — *situation* vs. *relevance-within-situation*. They are not merged.
- **Identity Q3 (IdentityEvolution ↔ InferenceRecord):** confirmed — IdentityEvolution
  **references** an Inference Record (the reasoning that drove a self-model change);
  it never embeds or duplicates it. The forthcoming `InferenceRecord` contract is the
  referent that Identity already points to.

The clean statement of the domain's outer edges:

> Intelligence reads **everything below it** (Reality, Knowledge, Identity) and the
> `ModelRouter`; it writes its **products into Knowledge and Identity**, and exposes
> **decisions** to Execution. It keeps for itself only **Inference Records**.

---

## 3. Candidate contracts — verdicts with justification

Each candidate is held to the five tests from the directive: (1) Why permanent?
(2) What immutable responsibility? (3) What state does it own? (4) Could it be
composed from existing contracts? (5) Does it survive the 20-year kernel test?

### ACCEPT — `InferenceRecord` *(State)*

- **Why permanent.** It is the *only* way to honour Art. III §12–13 — model outputs
  recorded immutably with full provenance, because replay reproduces history not
  intelligence. Without it, the moment a model is upgraded the runtime loses the
  ability to explain any past conclusion. This is a decades-stable obligation.
- **Immutable responsibility.** Witness, immutably, that *a specific model run, over
  specific inputs and referenced evidence, under specific parameters and prompt
  version, produced a specific output at a specific time with a stated confidence.*
- **State owned.** Exactly that record — inputs, referenced evidence (by identity),
  model/provider, parameters, prompt-template version, confidence, timestamp, output.
  Nothing derived; nothing mutable.
- **Composable instead?** No. No existing contract records *process provenance*.
  Evidence is **external** grounding only (frozen in Knowledge); a model run is
  **internal** process. Conflating them would corrupt Evidence's accepted meaning.
- **20-year test.** Passes decisively. The *frame* (a recorded reasoning event) is
  permanent; only the contents — which models, which parameters — evolve.

### ACCEPT — `Retriever` *(Service)*

- **Why permanent.** "Given a situation, surface the relevant slice of history" is a
  permanent runtime capability independent of any retrieval technology (keyword →
  vector → whatever replaces it). The *contract* outlives every implementation.
- **Immutable responsibility.** Rank historical information (Evidence/Observations/
  prior Beliefs) by relevance to a supplied situation. Selection, not interpretation.
- **State owned.** **None durable.** Indices and scoring models are ephemeral Service
  state, rebuildable from the journal.
- **Composable instead?** No — it is itself the composition primitive that keeps the
  Reasoner from re-implementing retrieval. Folding it into the Reasoner would weld two
  replaceable concerns (what to look at vs. what to conclude) into one.
- **20-year test.** Passes. Retrieval-as-a-capability is stable; its internals churn.

### ACCEPT — `Reasoner` *(Service)*

- **Why permanent.** The model-independent interpretation seam mandated by Art. III
  §11. It is the contract that lets models be swapped without touching architecture —
  the literal embodiment of "the implementation is replaceable."
- **Immutable responsibility.** Consume Evidence + Beliefs + Twin + retrieved history;
  produce inferences, belief revisions, and decisions — **always through
  `ModelRouter`, never a hardcoded provider** — and **emit an Inference Record for
  every run.**
- **State owned.** **None durable.** Its products are Beliefs/Predictions (Knowledge),
  IdentityEvolution (Identity), and decisions (consumed by Planner/Execution); its
  only residue is Inference Records.
- **Composable instead?** No. It is the irreducible core of the domain; everything
  else exists to feed it (Retriever) or consume it (Planner).
- **20-year test.** Passes — the strongest pass in the domain.

### ACCEPT — `Planner` *(Service)*

- **Why permanent.** Turning a decision into an ordered, executable plan is a distinct
  permanent step from *making* the decision. It is the bridge from Knowledge-side
  reasoning to Execution.
- **Immutable responsibility.** Consume decisions (and Goals) and produce **executable
  plans** — *proposals*, never executions. It plans; it does not act, and it does not
  bind capabilities (deferred to Execution's Agent).
- **State owned.** **None durable.** Planning provenance is an Inference Record; the
  plan's *executable* residue becomes Actions in Execution. (See §8 / debt: no
  separate `Plan` State contract in v1.)
- **Composable instead?** Partly — but the *act of planning* is a permanent seam worth
  naming, and keeping it distinct from the Reasoner preserves "decide" vs. "sequence"
  as independently replaceable. Kept.
- **20-year test.** Passes — with one watch item (planning provenance richness, AD-2).

### REJECT / FOLD — `Memory` *(was Service)*

- **Verdict: remove from the kernel.** "Memory" is a **synonym for the Knowledge
  Plane**, not a contract. Its three classical senses already have homes:
  - **semantic memory** = the Evidence Graph + DigitalTwin (Knowledge/Identity);
  - **episodic memory** = the **Journal** (Reality/Infrastructure) — the literal,
    immutable record of what happened;
  - **working memory** = ephemeral runtime state inside LiveContext/Reasoner.
- A `Memory` contract would be a **second source of truth** over the journal and
  projections — a direct violation of Art. IX §33 ("never duplicate sources of
  truth"). The *capability* people mean by "remember relevant things" is precisely
  the **Retriever**, which we keep. So Memory is fully covered: storage by Journal/
  Storage, recall by Retriever, integration by DigitalTwin.
- **Ripple (must be approved — touches frozen Identity):** LiveContext's drafted
  dependency `LiveContext → Memory` becomes **`LiveContext → DigitalTwin`** (it
  assembles the frame from the Twin, which is what it always meant). Retriever's
  drafted `Retriever → Memory` becomes the explicit `Retriever → Evidence,
  DigitalTwin, Journal`.

### REJECT / FOLD — `Reflector` *(was Service)*

- **Verdict: remove from the kernel; reflection is composed behavior, not a
  contract.** Reflection = *"compare what we predicted to what we observed, and
  reason about the gap."* That is fully expressible as existing parts in sequence:
  the **Scheduler** triggers the **Reasoner** over a **Prediction**↔**Observation**
  gap, producing belief revisions + an Inference Record like any other reasoning.
- It owns no unique state and no unique responsibility — it is a *when-to-reason*
  policy, not a new kind of thinking. In the draft kernel it was a **leaf** (nothing
  depends on it), so removal ripples nowhere structurally.
- **Disposition:** document the reflection loop in `RUNTIME_LOOP.md` as a scheduled
  Reasoner invocation. Flag **possible re-promotion (AD-3)** only if reflection later
  needs first-class state (e.g. a durable "open question" backlog) that cannot be a
  Belief/Prediction.

### REJECT (defer to v2) — `Claim`

- **Verdict: do not add in v1.** The directive's gate was explicit: *adopt Claim only
  if it removes complexity elsewhere.* It does not — yet. Introducing a `Claim`
  semantic primitive between Observation, Evidence, and Belief would **reopen the
  frozen Knowledge grounding semantics** (Evidence = external grounding; Belief →
  Evidence/Entity/Fact) and add a layer before any consumer needs it. That is added
  complexity, not removed complexity.
- **When it earns its place:** when Orb must track a single *proposition* asserted by
  multiple conflicting sources with independent confidences over time (multi-source
  truth maintenance). Until that need is concrete, Claim stays as **AD-1** for v2.

### DO NOT ADD — `Plan` *(State)*

- A separate durable `Plan` contract is not added in v1. A plan's **provenance** is an
  Inference Record; a plan's **executable residue** is Actions (Execution). If those
  two prove insufficient to reconstruct/track plans, promote a `PlanRecord` later —
  recorded as **AD-2**.

---

## 4. Dependency DAG

Directed edges = "depends on". `*` = cross-domain edge into an **accepted** domain
(Knowledge/Reality/Identity) or Infrastructure. Every edge points **backward** into
accepted/lower layers or is Service→Service within the plane; **no forward edges**.

**State** (the domain's only durable contract):

```
InferenceRecord → Evidence*        (references inputs & outputs by identity; see note)
```

> *Note — why InferenceRecord depends only on Evidence:* it **references** its inputs,
> referenced evidence, and output **by identity** (the way Evidence "bears upon" a
> target), not by embedding them. Recording a model run requires the grounding it
> consumed (Evidence); its *outputs* (Beliefs/Predictions/decisions) point *to* the
> record, not the reverse. So the only hard State→State edge is to Evidence. This
> keeps the State sub-graph a trivial DAG and honours Art. X §40 (State never depends
> on a Service).

**Services** (depend on State + Services; **no State depends on any of them**):

```
Retriever (Service) → LiveContext*, Evidence*, DigitalTwin*, Journal*
Reasoner  (Service) → Retriever, DigitalTwin*, Belief*, Evidence*, ModelRouter*
                       ⇒ emits: InferenceRecord, Belief*, Prediction*, IdentityEvolution*
Planner   (Service) → Reasoner, Goal*
                       ⇒ emits: InferenceRecord ; exposes decisions ⇒ [Execution]
```

```
   accepted planes (State):   Evidence  Belief  Goal  DigitalTwin   Journal/ModelRouter
                                  ▲        ▲      ▲        ▲              ▲
                                  │        │      │        │              │
   ┌──────────────────────────────┼────────┼──────┼────────┼──────────────┤
   │                              │        │      │        │              │
   │   ┌──────────────┐    ┌──────┴────────┴──────┴───┐  ┌─┴──────────┐    │
   │   │InferenceRecord│   │        Reasoner          │  │ Retriever  │◀───┘
   │   │   (State)     │◀──┤  (Service, emits records)│◀─┤ (Service)  │
   │   └──────────────┘    └──────────┬───────────────┘  └─────┬──────┘
   │       ▲                          │                        │
   │       │ (referenced by)          │                        ▼
   │  IdentityEvolution*              ▼                   LiveContext* (Identity)
   │  (Identity, accepted)      ┌──────────┐
   │                            │ Planner  │── decisions ──▶ [Execution: Agent]
   │                            └──────────┘
```

The single State node (`InferenceRecord`) is a sink with one backward edge. The three
Services form a clean linear consumption chain `LiveContext → Retriever → Reasoner →
Planner`, each also reading durable planes directly. **Execution depends backward on
Intelligence** (Agent → Planner/Reasoner), never the reverse.

---

## 5. Cycle analysis

**No cycles.**

- **State sub-graph:** `InferenceRecord → Evidence` is a single edge into an accepted
  domain. Trivially acyclic. Nothing in Knowledge/Identity depends back on
  InferenceRecord *except* `IdentityEvolution`, which **references** it (a record
  pointing at a record) — and InferenceRecord has no edge to IdentityEvolution, so the
  reference closes no loop.
- **Service chain:** `Retriever → Reasoner → Planner` is strictly linear; no service
  depends on a service downstream of it. `Retriever → LiveContext` is Service→Service
  into Identity, and `LiveContext` does **not** depend on `Retriever` (confirmed in
  the Identity review) — so no loop.
- **No State→Service edge anywhere** (Art. X §40 holds): the only State contract
  depends solely on Evidence. The Services' *products* (Belief, Prediction,
  IdentityEvolution) are written into other domains, but those are **production
  edges, not dependencies** — a State contract is recomputed from Evidence, never
  declared to "depend on" the Reasoner that last wrote it.

The durability gradient holds end to end: durable (InferenceRecord, and the
Knowledge/Identity products) never depends on anything more ephemeral; the ephemeral
Services depend downward on durable state, never the reverse.

---

## 6. Replay analysis

> **What survives a complete replay? Everything except ephemeral runtime state.**

| Contract | Survives replay? | What is reconstructed / what is lost |
| --- | --- | --- |
| **InferenceRecord** (State) | **Yes — fully** | The entire immutable record (inputs, evidence refs, model/provider, params, prompt version, confidence, timestamp, output). Pure history. |
| **Retriever** (Service) | No durable state | Indices/scoring rebuilt from the journal; a ranking is recomputed, never stored. |
| **Reasoner** (Service) | No durable state | The Service is rebuilt; its **products** (Beliefs/Predictions/IdentityEvolution) replay via their own contracts; its **runs** replay as InferenceRecords. The model is **not re-executed.** |
| **Planner** (Service) | No durable state | Plans are recomputed; planning provenance replays as InferenceRecords; executable residue replays as Actions (Execution). |

The constitutional crux, satisfied: on replay Orb **restores the recorded outputs of
past reasoning (InferenceRecords) — it does not re-run the models** (Art. III §13,
Art. V §22). This is precisely why InferenceRecord must be State and the rest must be
Service: the *products and the proof* are history; the *thinking* is a replaceable
process. A model upgraded or deleted tomorrow leaves every past conclusion fully
explainable.

---

## 7. Long-term evolution analysis (the 20-year test)

- **InferenceRecord** — the frame "a recorded reasoning event with full provenance" is
  permanent; the *fields that matter* grow additively (new provider kinds, new
  parameter classes, new prompt-versioning schemes) under Art. X without changing
  meaning. Survives.
- **Retriever** — retrieval technology will turn over completely (keyword → embeddings
  → successors); the contract "rank history by relevance to a situation" does not.
  Survives.
- **Reasoner** — models will be replaced many times; the model-independent seam is the
  *reason* the architecture survives them. Survives — the domain's anchor.
- **Planner** — planning strategies (and whether plans need durable records, AD-2)
  will evolve; "decisions in, executable plans out, never executes" is stable.
  Survives, with the AD-2 watch.
- **Removed (Memory, Reflector)** — both were *names for compositions*, and naming a
  composition as a kernel contract is the classic 20-year mistake (it ossifies an
  implementation choice as a permanent type). Removing them makes the kernel smaller
  and *more* evolvable, not less.

Net: four permanent contracts, each replaceable in implementation, none in contract.

---

## 8. Kernel changes required

> **Headline: the kernel SHRINKS, 31 → 30.** This is the intended direction
> ("the architecture should become smaller and clearer as it matures").

| Change | Contract | Kind | Effect on counts |
| --- | --- | --- | --- |
| **Add** | `InferenceRecord` | State | State 16 → **17** |
| **Remove** | `Memory` | Service | Service 15 → 14 |
| **Remove** | `Reflector` | Service | Service 14 → **13** |
| **Keep** | `Retriever`, `Reasoner`, `Planner` | Service | (re-pointed deps) |

**Totals: 30 contracts — 17 State, 13 Service** (down from 31 = 16 State + 15 Service).

Dependency re-pointing required in `KERNEL.md` once accepted:

1. `Reasoner` deps → `Retriever, DigitalTwin, Belief, Evidence, ModelRouter`;
   **produces `InferenceRecord`** (replaces the prose "produces Inference Records"
   with a named State contract).
2. `Retriever` deps → `LiveContext, Evidence, DigitalTwin, Journal` (was `Memory,
   LiveContext`).
3. `Planner` deps → `Reasoner, Goal` (drop `Memory`; **drop `Capability`** — capability
   binding moves to Execution's Agent, per §2/Art. VI §25).
4. **Remove `Memory`** and re-point its former dependents:
   - `LiveContext` (Identity, **frozen**) dep `Memory → DigitalTwin`.
   - `Agent` (Execution) dep list drops `Memory` (Agent → `Scheduler, Reasoner,
     Planner, Capability`).
5. **Remove `Reflector`** (leaf — no dependents); document the reflection loop in
   `RUNTIME_LOOP.md` as a scheduled Reasoner invocation.
6. Add `InferenceRecord` to the Identity domain's forward references (`IdentityEvolution
   → … InferenceRecord`) — this *closes* the Identity follow-up Q3, turning a
   "(forthcoming)" reference into a real contract.

Downstream doc count updates (on acceptance): `README.md`, `ROADMAP.md`,
`SYSTEM_OVERVIEW.md` → "30 contracts (17 State, 13 Service)".

---

## 9. Constitution amendments

**None required.**

The domain is fully covered by existing law:

- **Art. III §11** (no provider hardcoded) — Reasoner via ModelRouter.
- **Art. III §12** (model outputs recorded immutably with full provenance) —
  *this is precisely the InferenceRecord obligation*; the contract is the **State
  realization of an existing law**, requiring no new article.
- **Art. III §13** (replay reproduces history, not intelligence) — the replay analysis.
- **Art. IX §33** (never duplicate sources of truth) — the basis for removing Memory.
- **Art. VI §25** (Knowledge plane holds no power to act) — keeps Planner from binding
  capabilities; defers acting to Execution.
- **Art. X §40** (State never depends on a running process) — the State/Service split.

That the largest "thinking" domain needs **zero** new constitutional law is itself a
signal the architecture is holding: Intelligence is the *application* of existing
principles, not a new source of them.

---

## 10. Architectural debt deferred to v2

- **AD-1 — `Claim` semantic primitive** *(carried forward).* A proposition asserted by
  multiple sources with independent, evolving confidences, sitting between Observation/
  Evidence/Belief. Adopt only when multi-source truth-maintenance is a concrete need;
  it must *remove* complexity from Knowledge, not add a layer. Currently does not.
- **AD-2 — `PlanRecord` (durable plan state).** If Inference Records (planning
  provenance) + Actions (executable residue) prove insufficient to reconstruct or
  track multi-step plans across time, promote a first-class `PlanRecord` State
  contract. Deferred until a concrete plan-tracking need appears.
- **AD-3 — `Reflector` re-promotion.** Reflection ships as composed behavior
  (Scheduler → Reasoner over Prediction↔Observation gaps). Re-promote to a contract
  only if reflection needs durable first-class state (e.g. a persistent "open
  questions / unresolved gaps" backlog) that cannot be modelled as a Belief/Prediction.

---

## Recommendation

**Design proposal — held for acceptance.** The Intelligence domain resolves to the
**smallest kernel that still implements the full transform** knowledge → understanding
→ decisions → plans:

- **ACCEPT** `InferenceRecord` *(State)*, `Retriever`, `Reasoner`, `Planner`
  *(Service)* — four contracts.
- **REMOVE** `Memory` (a synonym for the Knowledge Plane; recall = Retriever) and
  `Reflector` (composed behavior, not a contract).
- **REJECT for v1** `Claim` (AD-1) and a durable `Plan` contract (AD-2).
- **Kernel shrinks 31 → 30** (17 State, 13 Service). **No Constitution amendment.**
- **Resolves Identity follow-ups Q2** (LiveContext ↔ Retriever boundary drawn:
  *situation* vs. *relevance-within-situation*) **and Q3** (IdentityEvolution
  *references* InferenceRecord).

**Two cross-domain ripples require your approval because they touch the frozen Identity
domain and Execution:**
1. `LiveContext` (Identity) dependency `Memory → DigitalTwin`.
2. `Agent` (Execution) drops `Memory`; `Planner` drops `Capability` (binding deferred
   to Agent).

Per the standing cadence, **`KERNEL.md`, the contract specs (`InferenceRecord.md`,
`Retriever.md`, `Reasoner.md`, `Planner.md`), and the doc counts are NOT mutated until
you accept this shape.** On acceptance I will write the four specs, apply the kernel
changes and re-pointings in §8, update `RUNTIME_LOOP.md` for the reflection loop, and
refresh the counts — then hold before the Execution domain.
