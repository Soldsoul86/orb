# Domain Integrity Report — 3. Identity

> Phase 3b architectural review. The Identity domain answers: **given everything
> Orb has learned, what context should influence future decisions?** **Status:
> Accepted (review round 2) — reviewer decisions applied; held for confirmation of
> three follow-ups.** Specs: `../../contracts/{DigitalTwin,Relationship,Project,Goal,
> ContextSnapshot,LiveContext,IdentityEvolution}.md`. Now **7 contracts** (5 State,
> 1 Service, plus DigitalTwin) — the domain grew by two on purpose (see *Decisions*).

---

## Architectural principle adopted

**Identity is not a profile. Identity is an evolving model.** Orb never stores "who
the user is"; it stores the continuously evolving *understanding* of the user. Every
Identity contract therefore answers **"what can change?"**, never "what is true."

Where the prior two domains play different roles:

- **Reality records history** — immutable observations and events.
- **Knowledge interprets history** — recomputable evidence, entities, facts, beliefs.
- **Identity accumulates continuity** — the durable, evolving frame that gives that
  interpretation a *self to be about*, persisting across years.

The reviewer sharpened the definition, now canonical: **Identity is the runtime's
current best explanation of a person, derived from history and continuously revised by
new evidence.** A profile stores attributes; Orb stores understanding. Identity is not
edited — it *emerges*: observations accumulate → evidence accrues → beliefs change →
the Twin evolves → identity changes.

This principle is ratified into the Constitution as **Article XII — Identity and
Continuity** (laws 44–47):

44. **Identity is an evolving model, not a profile** — the runtime's current best
    explanation of a person. Answers "what can change?", never "what is true?".
45. **Identity is never edited directly.** It emerges from observations, evidence, and
    user intent; a manual correction enters history as an Event. Nothing bypasses
    history.
46. **A complete replay reconstructs everything except ephemeral runtime state.** This
    is the test for every Identity contract.
47. **Identity does not only evolve — it explains why it evolved.** Every revision is a
    first-class, immutable, evidence-grounded, explainable transition; the explanation
    is preserved as history, never recomputed (replay reproduces history, not
    intelligence). *Added this round to anchor the `IdentityEvolution` contract.*

---

## Decisions applied (review round 2)

The reviewer accepted the domain and directed five changes; all are applied. They make
the domain sharper, and they grow it by two contracts (5 → 7) — a deliberate, justified
exception to "the kernel should shrink," because each addition removes a conflation
rather than adding scope.

1. **Sharper definition adopted** — "the runtime's current best explanation of a
   person…" — woven into Constitution §44, the kernel intro, and `DigitalTwin`.

2. **Context split into process + history.** The old `Context` State contract conflated
   a *running process* with a *historical record*. Now:
   - **`LiveContext`** *(Service)* — the ephemeral assembler of the salient frame; never
     persisted; recomputed on demand; emits snapshots.
   - **`ContextSnapshot`** *(State)* — the immutable frame retained for explainability.
   *Rule honoured:* a process and a record must never share a contract. This also
   cleanly resolves the Twin↔Context dependency (the Twin now depends on the immutable
   `ContextSnapshot`, never on the `LiveContext` Service — Art. X §40).

3. **DigitalTwin stays singular; personas are facets.** One Twin per user, never split.
   Multiple identities (professional self, parent, investor, writer, researcher) are
   **facets** — recomputed role-scoped *views* of the one model. *Engineering call:* a
   facet is modelled as a **derived projection within `DigitalTwin`, not a new
   contract** — promote it only if facets later need their own creation events/evolution
   (flagged as follow-up Q1). Modelling personas as separate twins is forbidden: it
   makes replay intractable.

4. **Project ↔ Goal is many-to-many, not hierarchical.** A **Goal** is an *outcome*
   ("what?"); a **Project** is the *work* ("how?"). One Goal may be advanced by many
   Projects; one Project may advance many Goals. The dependency stays `Project → Goal`
   (direction-only — a Goal never depends on a Project), so many-to-many introduces no
   cycle and needs no join contract. "A Project is not a big Goal" is frozen as an
   invariant. Removed the old nesting/containment language from `Goal` and `Project`.

5. **`IdentityEvolution` added (State) — identity explains its own change.** A
   first-class, immutable record of *why* the model changed: subject, before/after,
   confidence, timestamp, the **Evidence** that drove it, and the **Inference Record**
   that interpreted it. Two boundaries were enforced during authoring, because the naive
   version would have violated the Constitution:
   - **It references the Inference Record's reasoning; it never duplicates it** — else a
     second source of truth (Art. IX §33).
   - **Its before/after is an audit of a transition, never the source of the current
     value** — the current derived value stays recomputable; this record is the *reason*,
     not the *value* (Art. II §9).
   The constitutional justification for first-classing it: the *explanation* is a model
   output, and **replay reproduces history, not intelligence** (Art. III §13) — so the
   reason cannot be faithfully recomputed and must be recorded. Hence law §47.

---

## The new invariant, applied to all contracts

> **Identity is never edited directly.** Identity emerges from observations, evidence,
> and user intent. Manual edits become Events. Nothing bypasses history.

Each contract carries this as invariant 3 ("Never edited directly"), with the
mechanism stated explicitly: definitions/assertions/intent enter as Events; the state
is *derived*; a UI "edit" is recorded as a revision Event and re-derived, with the
prior value retained. This holds the entire domain to Constitution Art. XII §45 and
reinforces Art. I (append-only history).

---

## The replay test, applied to all contracts

> **What survives a complete replay? Everything except ephemeral runtime state.**

Every contract states a one-line *replay test* and an Immutable/Derived/Ephemeral
decomposition. The pattern is uniform: **Immutable** (creation/anchor event +
original assertion) and **Derived** (status, progress, confidence, membership,
health, the salient slice, the whole model) both survive replay; **Ephemeral**
(current focus, suggested next step, salience, attention, in-memory materialization)
does not, and nothing of value depends on it. This satisfies Constitution Art. XII
§46 for each contract.

### Immutable / Derived / Ephemeral decomposition

| Contract | Immutable | Derived | Ephemeral |
| --- | --- | --- | --- |
| **Goal** | creation event; original intent | progress; priority; confidence | current focus; suggested next action; temporary reminders |
| **Relationship** | creation event; originally asserted connection (endpoints + type) | confidence; strength; active/dormant status | current salience |
| **Project** | creation event; original definition/intent | status; progress; associated goals/entities; health | current focus item; suggested next step |
| **ContextSnapshot** | the entire record (creation event + captured slice) | none | none |
| **LiveContext** *(Service)* | none (its snapshots belong to `ContextSnapshot`) | none stored | the live frame, attention, assembly buffers |
| **IdentityEvolution** | the entire record (subject, before/after, evidence, inference, confidence, timestamp) | none | none |
| **DigitalTwin** | genesis / anchor event | the entire current model + facets | in-memory materialization |

Note the two ends of the spectrum the split produced: **`ContextSnapshot`** and
**`IdentityEvolution`** are *all-immutable* (pure history, nothing recomputed),
while **`LiveContext`** is *all-ephemeral* (a process that stores nothing). That is the
point of separating process from history — each contract now sits cleanly at one end
rather than straddling both, as the old `Context` did.

The decomposition reads cleanly **outward**: durability decreases left to right, and
the ephemeral column is exactly what may be lost on replay without loss of value.

---

## Contracts

| Contract | Kind | Why it deserves to be a permanent kernel contract (summary) |
| --- | --- | --- |
| **DigitalTwin** | State | The integrated, recomputable model of the user's world — the single point where all Identity strands compose. Holds no truth of its own; one per user. The most durable contract in the kernel. |
| **Relationship** | State | A typed, evidence-grounded, confidence-bearing connection between Entities that forms, strengthens, decays, and ends over years — first-class continuity, not a foreign key. |
| **Project** | State | The *work* ("how?") that advances Goals over time, associating the entities and observations involved — many-to-many with Goal, never a hierarchy. |
| **Goal** | State | The *outcome* ("what?") planning reasons toward: durable, evidence-grounded, immutable in its original intent, never itself an authority to act. |
| **ContextSnapshot** | State | The situational frame *retained as history* — the immutable, replayable slice that keeps a decision explainable for years. |
| **LiveContext** | Service | The *process* that assembles the salient frame now, from the Twin; stateless, recomputed, emits snapshots. The live counterpart of `ContextSnapshot`. |
| **IdentityEvolution** | State | The immutable record of *why* the model changed — subject, before/after, evidence, inference, confidence — so replay rebuilds not just the Twin but the reasons it evolved. |

All seven answer the justification question convincingly, and each passes the **20-year
test**: the *frame* each defines (an endeavor, a tie, an outcome, a retained or live
slice, a recorded reason, the whole model) is stable for decades while its *content*
evolves. None is a candidate for demotion to implementation. Two near-overlaps were
resolved this round: **Project vs. Goal** (work vs. outcome, many-to-many — kept
distinct) and **LiveContext vs. ContextSnapshot** (process vs. history — split into two
contracts). A third overlap, **LiveContext vs. Retriever**, is flagged for the
Intelligence review (follow-up Q below).

---

## Dependency Graph

Directed edges = "depends on". `*` marks a cross-domain edge (into Knowledge/Reality,
both already accepted). All edges point **backward** into accepted domains or *down*
the Identity stack — never forward.

State contracts (the spine that the Twin aggregates):

```
Relationship      → Entity*, Belief*                          (Knowledge)
Goal              → Belief*                                   (Knowledge)
Project           → Goal, Entity*, Belief*                    (many-to-many w/ Goal)
ContextSnapshot   → Entity*, Goal
IdentityEvolution → Evidence*, InferenceRecord* (forthcoming) (Knowledge/Intelligence)
DigitalTwin       → Entity*, Fact*, Belief*, Relationship, Project, Goal,
                    ContextSnapshot, IdentityEvolution
```

The one Service in the domain (depends on State + Service; nothing State depends on it):

```
LiveContext (Service) → DigitalTwin, Memory ;  emits ⇒ ContextSnapshot (State)
Retriever   (Service) → Memory, LiveContext   (Intelligence; boundary flagged below)
```

```
   Knowledge plane:  Entity, Fact, Belief        Evidence, InferenceRecord(fwd)
                         ▲   ▲   ▲                     ▲
   ┌──────────┬─────────┘   │   └──────┬─────────┐     │
   │          │             │          │         │     │
┌──┴───┐ ┌────┴───────┐ ┌───┴──────┐ ┌─┴─────┐ ┌─┴──────────────┐
│ Goal │ │Relationship│ │ContextSnap│ │Project│ │IdentityEvolution│
└──┬───┘ └────┬───────┘ └───┬──────┘ └──┬────┘ └─────┬──────────┘
   │ (Project→Goal)         │           │            │
   └─────────┬──────────────┴───────────┴────────────┘
             ▼
        ┌──────────────────────────────────────┐
        │             DigitalTwin              │  ← top aggregate / pivot
        └──────────────────────────────────────┘
                 ▲  (reads, never depended-on)
                 │
        ┌────────┴────────┐
        │   LiveContext   │  (Service) ── emits ──▶ ContextSnapshot
        └─────────────────┘
```

**DigitalTwin is the top aggregate and the architecture's pivot**: it depends on every
Identity State contract (and on Knowledge State directly), and **no State depends on
it**. The one Service, `LiveContext`, *reads* the Twin and *emits* `ContextSnapshot`s
but is depended on by no State — so the State graph remains a DAG with a single
integration point, and Art. X §40 (State never depends on a running process) holds.

---

## Cycles

Three cyclic/inverted edges existed in the kernel draft before this review; all are
now resolved in `KERNEL.md`.

**Cycle 1 — `DigitalTwin ↔ Context`.**
- *Before:* `DigitalTwin → Context` (the Twin includes the salient context) **and**
  `Context → DigitalTwin` (the context is a slice *of* the Twin). A direct 2-cycle.
- *Resolution:* **`Context → Entity, Goal`** (Context depends on the durable members
  it selects, not on the aggregate). The Twin still includes Context; the back-edge is
  removed. Direction is now strictly `Context → … → DigitalTwin`.

**Cycle 2 — `DigitalTwin → Goal → Context → DigitalTwin` (transitive).**
- *Before:* with `Goal → Context` and `Context → DigitalTwin`, the Twin reached
  itself through Goal and Context.
- *Resolution:* breaking Cycle 1 (Context no longer depends on the Twin) also breaks
  this transitive loop.

**Inversion 3 — `Goal → Context` (durable depending on ephemeral).**
- *Before:* a durable Goal depended on the most ephemeral contract, Context —
  inverting the durability gradient (a 20-year intent depending on a momentary frame).
- *Resolution:* **`Goal → Belief`** only. Intent is grounded in the Beliefs (and
  Evidence) that express it, never in a transient context. Context depends on Goal,
  not the reverse.

*(In round 2, `Context` became `ContextSnapshot`; the resolutions above carry over —
`ContextSnapshot → Entity, Goal`, `Goal → Belief` — unchanged.)*

**Round-2 additions introduce no new cycles.**
- **`LiveContext` (Service) → DigitalTwin, Memory.** A Service depending on State is
  legal; the Twin depends on `ContextSnapshot` (State), never on `LiveContext`, so no
  State→Service edge exists (Art. X §40 holds). `LiveContext` *emits* `ContextSnapshot`
  — a production edge, not a dependency.
- **`IdentityEvolution` → Evidence, InferenceRecord.** It references its *subject* by
  identity (like Evidence "bears upon" a target), so it does **not** depend on Goal/
  Relationship/Twin. The Twin aggregates it (`DigitalTwin → IdentityEvolution`); since
  IdentityEvolution has no edge back to the Twin, the aggregation is acyclic.
- **`Retriever → LiveContext`** (Intelligence) is Service→Service and does not close a
  loop, since `LiveContext` does not depend on `Retriever`.

**After both rounds:** **No cycles exist.** The Identity domain is a DAG; every edge
points backward into accepted Knowledge/Reality State or downward to the DigitalTwin
sink. The durability gradient is respected end-to-end: **nothing durable depends on
anything more ephemeral than itself**, and **no State depends on a running process.**

### The rule that prevents recurrence

The same ratified principle that fixed the Knowledge cycles governs here —
Constitution **Art. X §40**, *persistent state shall never depend on a running
process* — extended in spirit by an Identity-specific reading surfaced by this review:

> **Durable identity never depends on ephemeral identity.** A longer-lived frame
> (Goal, Project, the Twin) is grounded in evidence and durable members, never in a
> shorter-lived one. Aggregates depend on their parts; parts never depend on the
> aggregate. And the sharpest form, vindicated by the round-2 split: **a process and a
> record are never the same contract** — the live frame is `LiveContext` (Service), the
> kept frame is `ContextSnapshot` (State).

This is the structural finding of the domain: it keeps the dependency graph aligned
with the durability gradient, which is what guarantees the replay test holds for every
contract.

---

## Hidden State

State that lives outside the State contracts, and why it is permissible:

- **DigitalTwin in-memory materialization** (assembled, indexed, query-ready model) —
  ephemeral by declaration; rebuilt from the journal on demand. Not source-of-truth.
- **LiveContext frame, attention, assembly buffers** — now an explicit Service whose
  entire footprint is ephemeral runtime working state; recomputed from the durable Twin.
  Anything worth keeping is emitted as an immutable `ContextSnapshot`. Not
  source-of-truth.
- **Relationship salience / Project focus item / Goal suggested next action** — the
  ephemeral edges of those contracts; lost on replay by design, recomputed from
  derived state.
- **Health / strength / progress / relevance scoring model state** — operational
  Service state (Intelligence domain) that *recomputes* the derived columns; owns no
  durable truth and is replaceable without rewriting history.

**Conclusion:** No *source-of-truth* state exists outside the State contracts. Every
durable element of identity (immutable + derived) is recomputable from recorded Events,
consistent with Art. I §3 and Art. XII §46. The ephemeral column is exactly — and only
— what a replay is permitted to lose.

---

## Constitution Coverage

Articles exercised by the Identity domain:

- **Article XII — Identity and Continuity** (all): evolving model not a profile (§44);
  never edited directly (§45); replay reconstructs everything but ephemeral state (§46);
  **and identity explains why it evolved (§47, added this round)**. This domain is the
  primary exercise of Article XII.
- **Article III — Models and Reasoning** (IdentityEvolution): the explanation of a
  change is a recorded model output; replay reproduces history, not intelligence
  (§12–13). Newly exercised this round via `IdentityEvolution`.
- **Article II — Truth and Interpretation** (all): identity is recomputable, revisable
  interpretation grounded in evidence; never asserted as truth. `IdentityEvolution` is
  audit, not a second source of truth (§9).
- **Article I — History** (all): immutable creation/anchor events; revision is
  append-only; `ContextSnapshot` and `IdentityEvolution` are pure history.
- **Article V — The Runtime** (LiveContext): a Service that owns no durable state and is
  lost-then-rebuilt on restart (§22).
- **Article VII — Capabilities and Human Agency** (Goal): a Goal is the source of intent
  but **never an authority to act** — planning proposes, permission gates.
- **Article X §40** (LiveContext / the whole domain): no State depends on a running
  process — the Twin depends on `ContextSnapshot`, never on `LiveContext`.

Not exercised here (belong to later domains): Art. IV (Distribution), VI (Three Planes),
VIII (Ownership/Trust), IX (Engineering).

---

## Future Extension Points

All additive under Article X (v1 contracts remain valid forever):

- **New Relationship types** (knows, works-with, located-at, owns, reports-to, …),
  **Goal categories** (objective, habit, constraint, aspiration), **Project categories**
  (work, personal, health, financial), and **Context dimensions** (temporal, spatial,
  social, task, device) — value/schema-level additions; existing meanings frozen.
- **New constituent kinds composed into the DigitalTwin** as the Identity domain grows
  — added and versioned; the Twin stays a recomputable projection that holds no truth.
- **New strength/health/progress/relevance scoring strategies** — implementation behind
  the contracts; derived values may change over time, but the immutable cores never move.
- **ContextSnapshot retention policy** — implementation may evolve *when* `LiveContext`
  retains a frame as an immutable snapshot, without changing either contract.
- **New IdentityEvolution subject kinds** (goal-confidence, relationship-strength,
  belief-revision, facet-metric, …) — added and versioned; the audit-not-truth
  obligation is frozen.
- **Facets** — currently a derived projection within the Twin; may be **promoted to a
  first-class contract** later if they need their own creation events and evolution
  (additive under Art. X; would not change the existing Twin contract).

---

## Questions — round 1 resolved; three follow-ups open

The three questions raised in round 1 were all answered by the reviewer and applied:

1. **Context dual nature → split.** `LiveContext` (process/Service) + `ContextSnapshot`
   (history/State). Applied.
2. **DigitalTwin singleton → confirmed, with facets.** One Twin; personas are facets.
   Applied (facets as a derived view).
3. **Project vs. Goal → confirmed distinct, sharpened to many-to-many** (work vs.
   outcome). Applied.

Three new follow-ups, surfaced by the round-2 changes — design confirmations, **not
blockers**:

1. **Facet — derived view or first-class contract?** I modelled facets as a *derived
   projection within `DigitalTwin`* to avoid kernel growth. If you want facets to carry
   their own creation events, lifecycle, and `IdentityEvolution` (e.g. "the day the
   *investor* facet began"), they should be promoted to a contract. Recommend: keep
   derived for v1; promote only when a concrete need appears.

2. **LiveContext vs. Retriever — draw the boundary now.** Both Services sit between
   Memory and reasoning. My working split: **LiveContext assembles the *frame* (what is
   salient now); Retriever ranks *memory within* that frame.** This must be confirmed or
   merged in the **Intelligence review**, or the kernel risks two services doing one job.
   Flagged so the Intelligence domain resolves it explicitly rather than inheriting an
   overlap.

3. **IdentityEvolution ↔ InferenceRecord — confirm the reference boundary.** I made
   `IdentityEvolution` *reference* the `InferenceRecord` (the reasoning) rather than
   embed it, and made before/after an *audit* that never supplies the current value.
   This keeps it from becoming a second source of truth. Confirm this is the intended
   relationship before `InferenceRecord` is finalized in Intelligence.

---

## Recommendation

**Accepted (round 2) — reviewer decisions applied.**

*Round 1* fixed three structural defects (`DigitalTwin ↔ Context`, the transitive
`DigitalTwin → Goal → Context → DigitalTwin`, and the inverted `Goal → Context`) via one
reading of the dependency-direction law: *durable identity never depends on ephemeral
identity; aggregates depend on their parts.*

*Round 2* applied the reviewer's five decisions, which sharpen the domain by removing two
conflations: **process vs. history** (Context → `LiveContext` Service + `ContextSnapshot`
State) and **value vs. reason** (the new `IdentityEvolution` records *why* the model
changed). It also confirmed **one faceted Twin** and a **many-to-many Project↔Goal**
relation (work vs. outcome). Constitution Art. XII gained **§47** to anchor explainable
evolution.

The domain is now **7 contracts** (DigitalTwin, Relationship, Project, Goal,
ContextSnapshot, IdentityEvolution — State; LiveContext — Service), **acyclic** in its
State graph, with **DigitalTwin as the single top aggregate and architectural pivot**,
**no State depending on any running process** (Art. X §40), every contract carrying the
Immutable/Derived/Ephemeral decomposition and an explicit replay test, and every contract
passing the 20-year test. Kernel totals updated to **31 contracts (16 State, 15
Service)**.

**Held for confirmation of the three follow-ups above** (facet promotion; LiveContext↔
Retriever boundary; IdentityEvolution↔InferenceRecord reference) — none blocks
acceptance. The LiveContext↔Retriever boundary and the `InferenceRecord` contract carry
forward into the **Intelligence** domain review.

---

# Identity Evolution Report

> Identity understood as a **living system**, not a database schema. For each contract:
> how it **begins, evolves, decays, merges, splits, and ends**. The shape is uniform by
> design — every Identity contract is born from an event, evolves by derivation, can go
> dormant without deletion, can be re-resolved by recorded merge/split, and ends into
> history that is never erased.

## Goal

- **Begins** when intent is observed — the user states an objective, or Orb infers one
  from evidence — anchored to a creation event and an original intent that never change.
- **Evolves** as evidence accumulates: progress, priority, and confidence are
  recomputed; it may be advanced by one or more Projects (many-to-many — outcome vs.
  work).
- **Decays** when intent fades: confidence falls and the Goal goes dormant — retained,
  recoverable if intent returns.
- **Merges** when two Goals are found to express one intent (recorded re-resolution;
  both histories kept).
- **Splits** when one Goal conflates two intents (recorded split into distinct Goals).
- **Ends** by being **achieved** (an Observation confirms the target), **abandoned**
  (intent withdrawn), or **superseded** — recorded; the Goal and its outcome remain
  forever.

## Relationship

- **Begins** when evidence first connects two Entities (a shared meeting, a thread, a
  stated fact), deriving a tie anchored to that event and the originally asserted
  connection.
- **Evolves** as evidence accumulates: confidence and strength rise; the type may be
  refined (acquaintance → colleague → reports-to).
- **Decays** as contact lapses: strength and confidence fall; the tie goes dormant —
  retained, revived on new evidence rather than recreated.
- **Merges** when duplicate connections (via Entity merge, or two records of one tie)
  are unified by recorded re-resolution.
- **Splits** when one record conflated two ties, or an underlying Entity splits — a
  recorded split follows.
- **Ends** when the tie dissolves (a recorded "no longer works-with"); the Relationship
  is closed but its full history persists and stays queryable.

## Project

- **Begins** when an endeavor is defined — stated by the user, or inferred from a
  cluster of related goals/observations — anchored to a creation event and an original
  definition that never change.
- **Evolves** as goals are added, entities associated, and progress/health recomputed
  from its constituents.
- **Decays** when the endeavor stalls: progress flatlines, health degrades; the Project
  goes dormant — retained, revived if work resumes.
- **Merges** when two Projects are found to be one endeavor (recorded unification).
- **Splits** when one Project is found to span two endeavors (recorded split, re-homing
  goals and entities; histories preserved).
- **Ends** by **completion**, **abandonment**, or **supersession** — recorded; the
  Project and its trajectory remain history.

## LiveContext *(process — lives in the present only)*

- **Begins** when a situation calls for a frame — a task starts, an observation arrives,
  the user asks something — and the Service assembles a salient slice over relevant
  Entities and Goals from the Twin.
- **Evolves** as the situation shifts: members added/dropped, relevance re-weighted, the
  frame tightened as evidence narrows what matters.
- **Decays** the instant the moment passes: the frame simply dissolves — it held nothing
  of value to lose.
- **Merges / Splits** — not applicable to the live process; concurrent or conflated
  frames are just reassembled. (Any merge/split that matters is recorded on the
  *snapshots* it emitted.)
- **Ends** by dissolution. Anything worth keeping was already emitted as a
  `ContextSnapshot`; the process itself leaves no residue.

## ContextSnapshot *(history — frozen at capture)*

- **Begins** when `LiveContext` retains a frame — typically as a decision is framed —
  capturing the salient slice as an immutable record.
- **Evolves / Decays** — it does neither. A snapshot is frozen at capture; change means a
  *new* snapshot, and history never decays.
- **Merges / Splits** — never in place; if two snapshots are later read as one (or one as
  two), that is a new recorded interpretation, leaving the originals intact.
- **Ends** — never erased. It persists as long as the journal, keeping its decision
  explainable.

## IdentityEvolution *(history — the reason a value changed)*

- **Begins** when a revision to the model is committed — a Reasoner concludes a value
  should change — recording subject, before/after, evidence, inference, confidence, time.
- **Evolves / Decays** — it does neither; each record is frozen. A further change is a
  *new* record, forming an append-only **chain of reasons** per subject.
- **Merges / Splits** — only by recorded re-interpretation; originals stand.
- **Ends** — never erased. The chain is the model's permanent explanation of itself; a
  contradicted reason stays in history beside its correction.

## DigitalTwin

- **Begins** at genesis — the first observations about the user establish an anchor
  event, from which the Twin starts projecting a model.
- **Evolves** continuously as constituents change (entities resolve, facts accumulate,
  beliefs shift, ties strengthen, projects/goals progress); the Twin re-derives.
- **Decays** only in the sense that constituents go dormant; the Twin reflects reduced
  confidence and grows sparser — never deletes. A sparse Twin is still a valid Twin.
- **Merges** in the rare reconciliation of two early independent models of one user
  (e.g. two devices offline) — a recorded re-resolution of constituents, never a rewrite.
- **Splits** — not a normal operation; one user has one Twin. Apparent splits are
  constituent re-resolutions (an Entity or Project splitting), not a division of the
  Twin.
- **Ends** only with the model's retirement (the user leaves Orb); the Twin's full
  trajectory — every constituent and its history — remains in the journal.

---

> **The shared shape — and the two clean ends.** The *evolving* contracts (Goal,
> Relationship, Project, DigitalTwin) are each *born from an event*, *evolve by
> recomputation*, *decay into dormancy rather than deletion*, *re-resolve by recorded
> merge/split*, and *end into preserved history*. The round-2 split added the two pure
> ends of the spectrum: the **pure-history** contracts (`ContextSnapshot`,
> `IdentityEvolution`) do not evolve at all — they are frozen at capture and accrete as
> append-only chains; the **pure-process** contract (`LiveContext`) evolves only in the
> present and leaves no residue but the snapshots it emits. That separation is the proof
> the domain is now a clean living system: each contract sits at exactly one place on the
> process↔history axis, continuity accumulates, nothing of value is ever lost, and a
> complete replay reconstructs the whole model **and the reasons it changed** — losing
> only the live frame, which is exactly what a process is allowed to lose.
