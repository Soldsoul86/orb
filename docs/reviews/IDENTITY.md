# Domain Integrity Report — 3. Identity

> Phase 3b architectural review. The Identity domain answers: **given everything
> Orb has learned, what context should influence future decisions?** **Status:
> Submitted for acceptance.** Specs:
> `../../contracts/{DigitalTwin,Relationship,Project,Goal,Context}.md`.

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

This principle is ratified into the Constitution as **Article XII — Identity and
Continuity** (laws 44–46):

44. **Identity is an evolving model, not a profile.** Every Identity contract answers
    "what can change?", never "what is true?".
45. **Identity is never edited directly.** It emerges from observations, evidence, and
    user intent; a manual correction enters history as an Event. Nothing bypasses
    history.
46. **A complete replay reconstructs everything except ephemeral runtime state.** This
    is the test for every Identity contract.

---

## The new invariant, applied to all five contracts

> **Identity is never edited directly.** Identity emerges from observations, evidence,
> and user intent. Manual edits become Events. Nothing bypasses history.

Each contract carries this as invariant 3 ("Never edited directly"), with the
mechanism stated explicitly: definitions/assertions/intent enter as Events; the state
is *derived*; a UI "edit" is recorded as a revision Event and re-derived, with the
prior value retained. This holds the entire domain to Constitution Art. XII §45 and
reinforces Art. I (append-only history).

---

## The replay test, applied to all five contracts

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
| **Project** | creation event; original definition/intent | status; progress; member goals/entities; health | current focus item; suggested next step |
| **Context** | creation event of a retained *snapshot* (if any) | the salient slice (selected members + weighting) | current attention/focus; assembly buffers |
| **DigitalTwin** | genesis / anchor event | the entire current model | in-memory materialization |

The decomposition reads cleanly **outward**: durability decreases left to right, and
the ephemeral column is exactly what may be lost on replay without loss of value.

---

## Contracts

| Contract | Kind | Why it deserves to be a permanent kernel contract (summary) |
| --- | --- | --- |
| **DigitalTwin** | State | The integrated, recomputable model of the user's world — the single point where all Identity strands compose. Holds no truth of its own; one per user. The most durable contract in the kernel. |
| **Relationship** | State | A typed, evidence-grounded, confidence-bearing connection between Entities that forms, strengthens, decays, and ends over years — first-class continuity, not a foreign key. |
| **Project** | State | A sustained endeavor that outlasts any single goal — the durable frame under which goals, entities, and observations cohere for months or decades. |
| **Goal** | State | The source of intent planning reasons toward: durable, evidence-grounded, immutable in its original intent, never itself an authority to act. |
| **Context** | State | The recomputable salient slice that focuses reasoning on what matters now — the contract for *relevance*, derivable from history rather than held in a process. |

All five answer the justification question convincingly, and each passes the **20-year
test**: the *frame* each defines (an endeavor, a tie, an intent, a relevant slice, the
whole model) is stable for decades while its *content* evolves continuously. None is a
candidate for demotion to implementation. The nearest-overlap pair — **Project vs.
Goal** — is kept distinct: a Goal is a single intent; a Project is a sustained frame
that *gathers* goals, entities, and observations. (Project depends on Goal, not the
reverse.)

---

## Dependency Graph

Directed edges = "depends on". `*` marks a cross-domain edge (into Knowledge/Reality,
both already accepted). All edges point **backward** into accepted domains or *down*
the Identity stack — never forward.

```
Relationship → Entity*, Belief*                              (Knowledge)
Goal         → Belief*                                       (Knowledge)
Project      → Goal, Entity*, Belief*
Context      → Entity*, Goal
DigitalTwin  → Entity*, Fact*, Belief*, Relationship, Project, Goal, Context
```

```
        Knowledge plane:  Entity, Fact, Belief
                              ▲   ▲   ▲
        ┌─────────────┬───────┘   │   └────────┬──────────────┐
        │             │           │            │              │
   ┌────┴─────┐  ┌────┴─────┐ ┌───┴────┐  ┌────┴────┐         │
   │   Goal   │  │Relationship│ │ Context│  │ Project │        │
   └────┬─────┘  └────┬─────┘ └───┬────┘  └────┬────┘         │
        │  (Project→Goal)         │ (Context→Goal)            │
        └──────────┬──────────────┴───────────┬──────────────┘
                   ▼                           ▼
              ┌────────────────────────────────────┐
              │            DigitalTwin              │  ← top aggregate
              └────────────────────────────────────┘
                 (nothing depends on the Twin)
```

**DigitalTwin is the top aggregate**: it depends on every other Identity contract (and
on Knowledge State directly), and **nothing depends on it** — a pure sink. This makes
the Identity domain a DAG with a single integration point.

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

**After amendment:** **No cycles exist.** The Identity domain is a DAG; every edge
points backward into accepted Knowledge/Reality State or downward to the DigitalTwin
sink. The durability gradient is respected end-to-end: **nothing durable depends on
anything more ephemeral than itself.**

### The rule that prevents recurrence

The same ratified principle that fixed the Knowledge cycles governs here —
Constitution **Art. X §40**, *persistent state shall never depend on a running
process* — extended in spirit by an Identity-specific reading surfaced by this review:

> **Durable identity never depends on ephemeral identity.** A longer-lived frame
> (Goal, Project, the Twin) is grounded in evidence and durable members, never in a
> shorter-lived one (Context). Aggregates depend on their parts; parts never depend on
> the aggregate.

This is the structural finding of the domain: it keeps the dependency graph aligned
with the durability gradient, which is what guarantees the replay test holds for every
contract.

---

## Hidden State

State that lives outside the five State contracts, and why it is permissible:

- **DigitalTwin in-memory materialization** (assembled, indexed, query-ready model) —
  ephemeral by declaration; rebuilt from the journal on demand. Not source-of-truth.
- **Context attention/focus and assembly buffers** — ephemeral runtime working state;
  recomputed from the durable Twin and the situation. Not source-of-truth.
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

- **Article XII — Identity and Continuity** (all five): evolving model not a profile
  (§44); never edited directly (§45); replay reconstructs everything but ephemeral
  state (§46). This domain is the primary exercise of Article XII.
- **Article II — Truth and Interpretation** (all five): identity is recomputable,
  revisable interpretation grounded in evidence; never asserted as truth.
- **Article I — History** (all five): immutable creation/anchor events; revision is
  append-only; manual edits enter as Events.
- **Article VII — Capabilities and Human Agency** (Goal): a Goal is the source of
  intent but **never an authority to act** — planning proposes, permission gates.

Not exercised here (belong to later domains): Art. III (Models/Reasoning — the scoring
services live in Intelligence), IV (Distribution), V (Runtime), VI (Three Planes), VIII
(Ownership/Trust), IX (Engineering), X/XI (already applied — versioning and the
dependency-direction law).

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
- **Context snapshot retention policy** — implementation may evolve *when* a live
  context is retained as an immutable snapshot for explainability, without changing the
  contract.

---

## Questions for the reviewer

1. **Context's dual nature (live vs. snapshot).** Context is the only contract whose
   *default* instance is almost entirely ephemeral, becoming immutable only when a
   snapshot is deliberately retained for explainability. Is this dual treatment correct,
   or should decision-framing snapshots be a *separate* contract (e.g. `ContextSnapshot`)
   so that "live Context" carries no immutable core at all? The current spec keeps them
   one contract to avoid kernel growth; flagging in case you prefer the split.

2. **DigitalTwin "one per user / does not split."** The Twin is specified as singular
   and non-splitting; apparent splits are constituent re-resolutions. Do you accept the
   Twin as a strict singleton, or should multi-twin scenarios (e.g. a sharply separated
   work persona vs. personal persona) be modeled as first-class rather than as Context
   dimensions over one Twin?

3. **Project vs. Goal boundary.** Kept distinct (Project = sustained frame that gathers
   Goals; Goal = single intent). Confirm this is the intended cut, and that "a Project
   is not just a big Goal" is the right invariant to freeze at v1.

These are design confirmations, not blockers; the domain is internally consistent under
either resolution.

---

## Recommendation

**Amend (applied) → submit for acceptance.**

Three structural defects in the draft (`DigitalTwin ↔ Context`, the transitive
`DigitalTwin → Goal → Context → DigitalTwin`, and the inverted `Goal → Context`) are
resolved by one Identity-specific reading of the ratified dependency-direction law:
*durable identity never depends on ephemeral identity; aggregates depend on their
parts, never the reverse.* With the fixes applied (`Context → Entity, Goal`;
`Goal → Belief`), the Identity domain is **acyclic**, with **DigitalTwin as the single
top aggregate**, every edge pointing backward into accepted Knowledge/Reality or down to
the Twin sink. Every contract carries the Immutable/Derived/Ephemeral decomposition, the
never-edited-directly invariant, and an explicit replay test, and every contract passes
the 20-year test. The domain is minimal, fully grounded, and closed under the
Constitution (now extended by Article XII). **Held for the reviewer's acceptance**
before the Intelligence domain; the three Questions above are design confirmations that
do not block acceptance.

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
  recomputed; it may nest under a Project.
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

## Context

- **Begins** when a situation calls for a frame — a task starts, an observation arrives,
  the user asks something — and Orb assembles a salient slice over relevant Entities and
  Goals.
- **Evolves** as the situation shifts: members added/dropped, relevance re-weighted, the
  frame tightened as evidence narrows what matters.
- **Decays** as the moment passes: relevance fades; a live context simply dissolves
  (it held nothing of value to lose).
- **Merges** when two concurrent frames are recognized as one situation (recorded only
  for retained snapshots).
- **Splits** when one frame conflated two situations and is re-assembled as two
  (recorded only for retained snapshots).
- **Ends** by dissolution (live context) or by being closed and kept as an immutable
  **snapshot** when explainability requires it.

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

> **The shared shape.** Every Identity contract is *born from an event*, *evolves by
> recomputation*, *decays into dormancy rather than deletion*, *re-resolves by recorded
> merge/split*, and *ends into preserved history*. That uniformity is the proof that
> Identity is a living, replayable system: continuity accumulates, nothing of value is
> ever lost, and a complete replay reconstructs everything except the ephemeral edge.
