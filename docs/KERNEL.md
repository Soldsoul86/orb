# The Orb Kernel

> Status: Phase 3 architecture. Reviewed before any contract specification or
> implementation. This document defines the **permanent public interfaces** of
> Orb. Everything else is an implementation detail.

---

## What the Kernel Is

The kernel is the **smallest set of contracts that every future implementation
must preserve**. Implementations may be rewritten freely — in any language, on
any device, with any engine. The kernel may not.

The kernel is to Orb what a system-call interface is to an operating system: a
stable boundary that outlives every implementation behind it. It is expected to
remain stable for years.

This document defines **what** each contract is and **why** it exists. It defines
no methods, no fields, no data shapes, and no programming language. Those belong
to the per-contract specifications (next step) and, later, to implementation
interfaces. This is architecture.

### Versioning Discipline

> Constitutional law (Article X): *The kernel evolves through addition, never
> through mutation. Breaking changes require a new version. Orb v1 contracts
> remain valid forever.*

The architecture is versioned with the discipline of an operating-system kernel.
A contract, once accepted at v1, is permanent. New capability arrives as **new**
contracts or **new versions** alongside the old — never by changing the meaning
of an existing one.

### The Six Domains

| # | Domain | Question it answers | Contracts |
| --- | --- | --- | --- |
| 1 | **Reality** | How information enters Orb | Sensor, Observation, Attachment, Event |
| 2 | **Knowledge** | How Orb understands reality | Evidence, Entity, Fact, Belief, Prediction |
| 3 | **Identity** | How Orb models the user | DigitalTwin, Relationship, Project, Goal, Context |
| 4 | **Intelligence** | How Orb reasons | Memory, Retriever, Reasoner, Planner, Reflector |
| 5 | **Execution** | How Orb affects the world | Capability, Action, Policy, Scheduler, Agent |
| 6 | **Infrastructure** | The services every runtime depends upon | Journal, Storage, Synchronization, ModelRouter, Encryption |

The domains map onto the three planes: **Reality** is the boundary into the
Reality Plane; **Knowledge** and **Identity** are the Knowledge Plane;
**Intelligence** and **Execution** are the Execution Plane; **Infrastructure**
underlies them all. (`SYSTEM_OVERVIEW.md`, `RUNTIME_LOOP.md`.)

---

## Contract Kinds

Every kernel contract declares exactly one **kind**. The kind tells you how the
contract relates to time and persistence.

- **State** — persistent information; the durable record of what *is*. Stored,
  referenced, and recomputable or immutable. *(e.g. Observation, Evidence,
  Belief, Entity, Goal, Project, Action.)*
- **Transition** — a pure transformation; a *verb*: reasoning, planning,
  decision, reflection, learning. A transition is **not stored**; only its
  **outputs**, which are State, are stored.
- **Service** — runtime infrastructure that provides a capability. Neither state
  nor transition. *(e.g. Journal, Storage, Synchronization, ModelRouter,
  Encryption, Scheduler.)*

> **The kernel contains only State and Service contracts. No Transition is a
> kernel contract.** Transitions belong to the Runtime Loop (`RUNTIME_LOOP.md`),
> not to the permanent contract surface. This reinforces the separation between
> architecture (stable) and execution (continuous).

### Why Decision is not a kernel contract

`Decision` is intentionally absent. The kernel contains stable entities; a
Decision is not an entity — it is a **transition** between two stable entities:

```
Plan  →  Decision  →  Action
```

A Decision is the execution of Policy over a plan. It is never stored as a kernel
object; its result is captured as State and provenance:

- an **Event** in the Event Journal,
- **provenance** in the Evidence Graph,
- an **Action** in the Execution Plane.

The runtime may represent a Decision object internally. The kernel does not. The
same reasoning applies to Reasoning, Planning, Reflection, and Learning: the
*services* that perform them (`Reasoner`, `Planner`, `Reflector`, and the loop's
learning cycle) are kernel contracts; the *transitions* themselves are not; their
*outputs* (`Belief`, `Prediction`, `Action`, …) are State.

### Classification

| Kind | Count | Contracts |
| --- | --- | --- |
| **State** | 15 | Event, Observation, Attachment, Evidence, Entity, Fact, Belief, Prediction, DigitalTwin, Relationship, Project, Goal, Context, Action, Policy |
| **Service** | 14 | Sensor, Memory, Retriever, Reasoner, Planner, Reflector, Capability, Scheduler, Agent, Journal, Storage, Synchronization, ModelRouter, Encryption |

Every contract below declares its kind, then defines exactly four sections:
**Purpose**, **Responsibilities**, **Invariants**, **Dependencies**.

### Dependency Direction

A single rule governs what a contract may depend on, and it keeps the kernel a
directed acyclic graph. It is **ratified as a kernel-wide law** (Constitution
Article X §40):

> **Persistent state shall never depend on a running process.** A State contract
> depends only on other State (or on nothing); it never depends on a Service.
> Services depend on State and on other Services.

The justification is the History/Interpretation separation itself. State is a
durable record; a Service is a live process that *produces* records. If a State
depended on a Service, the record would point at the machine that made it rather
than at the immutable output the machine produced — and since Services produce
State, the edge would close a cycle, and the record could no longer be replayed
once the process was gone. Whenever a derivation by a Service (a Reasoner, a
Planner) needs to be referenced, it is referenced through the **immutable record
that Service produced** — an **Inference Record** with full provenance — never
through the Service itself. This is what lets *replay reproduce history, not
intelligence*: the record survives even when the Service is replaced.

---

# 1. Reality

How information enters Orb.

## Event
*Kind — State.*

**Purpose** — The immutable atomic unit of history. Everything that ever happens
in Orb is ultimately an Event.

**Responsibilities**
- Carry a globally unique identity.
- Record its originating device and append-only lane.
- Carry a Hybrid Logical Clock timestamp for causal placement.
- Commit cryptographically to its predecessor in the lane.
- Carry an opaque, versioned payload and references to causal parents.

**Invariants**
- Immutable and append-only; never edited, reordered, or deleted.
- Globally unique identity, never reused.
- Public ordering is derived `(HLC, lane)` on read, never stored.
- Integrity is verifiable; tampering is detectable.

**Dependencies** — None. The Event is the kernel's atom.

## Observation
*Kind — State.*

**Purpose** — A recorded statement that something occurred in reality. The entry
point of all knowledge.

**Responsibilities**
- Assert that something happened, without asserting it is true.
- Attribute itself to the source/sensor that produced it.
- Reference any raw Attachments it concerns.
- Carry a **Confidence of Reality** (`[0, 1]`) describing the reliability of the
  perception (e.g. GPS ~0.97, OCR ~0.74, LLM-extracted ~0.41, manual 1.00).
- Become part of history by being recorded as an Event.

**Invariants**
- Immutable; belongs to the History plane.
- Records occurrence, never resolved truth.
- Always traceable to its source and its causal/temporal placement.
- **Originates from reality.** Observations originate from reality; Events
  originate from runtime activity. Many Observations produce Events; not every
  Event produces an Observation. Reality is updated only through observation.
- **Owns confidence, not truth.** Carries a Confidence of Reality; truth never
  exists inside Orb. (Constitution Article XI.)

**Dependencies** — Event, Attachment. (Attributed to a *source identity* — a
value, not the `Sensor` contract — which may be a Sensor, an Action, or an import.
This breaks the Observation↔Sensor cycle and admits non-sensor sources.)

## Sensor
*Kind — Service.*

**Purpose** — The boundary through which information from the Reality Plane enters
Orb.

**Responsibilities**
- Observe a defined class of external signals (files, messages, calendar,
  location, audio, browser, and so on).
- Emit Observations and Attachments.
- Declare a stable source identity for attribution.
- Operate continuously under runtime scheduling, not on demand.

**Invariants**
- Produces only Observations and Attachments — never interpretation.
- Every emission is attributable to the sensor.
- Sensing is eventually-complete: nothing is "live"; everything is eventually
  observed.

**Dependencies** — Observation, Attachment.

## Attachment
*Kind — State.*

**Purpose** — Immutable raw content (a photo, audio clip, file, message body)
that an Observation or Evidence refers to.

**Responsibilities**
- Hold opaque raw content by reference.
- Be content-addressed so its identity is its content.
- Be retrievable on demand by the layers that reference it.

**Invariants**
- Immutable; identity equals content hash.
- Referenced, never inlined mutably into history.
- Encrypted at rest.

**Dependencies** — Storage, Encryption.

---

# 2. Knowledge

How Orb understands reality.

## Evidence
*Kind — State.*

**Purpose** — A signal that supports or contradicts an Observation. The grounding
of all interpretation.

**Responsibilities**
- Link corroborating or conflicting signals to observations.
- Record support and contradiction as structure.
- Preserve full provenance back to its originating Event.

**Invariants**
- Immutable; belongs to the History plane.
- Records corroboration and contradiction but never resolves them.
- Always traceable to its source.

**Dependencies** — Observation, Event, Attachment.

## Entity
*Kind — State.*

**Purpose** — A resolved subject of interpretation: a person, place,
organization, device, or thing.

**Responsibilities**
- Aggregate the observations and evidence that concern one subject.
- Carry an identity inferred by resolution across signals.
- Support merge and split as new interpretation.

**Invariants**
- Interpretation, not truth; recomputable.
- References the evidence that justifies its identity.
- Resolution changes never rewrite the underlying events.

**Dependencies** — Evidence. (Depends only on Evidence, not on Belief: an
Entity's identity is justified by the evidence that resolves it; Beliefs reference
Entities, never the reverse. This breaks the Entity↔Belief cycle.)

## Fact
*Kind — State.*

**Purpose** — An interpretation currently treated as settled given the evidence —
settled until contradicted, not eternal truth.

**Responsibilities**
- Assert a claim that the system currently relies upon.
- Reference the evidence that grounds it.
- Remain revisable as evidence accumulates.

**Invariants**
- Interpretation, never eternal truth.
- References evidence; recomputable.
- Revision is appended; prior values are retained, never rewritten.

**Dependencies** — Evidence, Entity.

## Belief
*Kind — State.*

**Purpose** — A **contextual** interpretation held with uncertainty. Distinct from
a Fact: a Fact is the runtime's best-supported objective statement and persists
until contradicted by better evidence; a Belief is contextual and may disappear
tomorrow. ("The meeting lasted 43 minutes" is a Fact; "this customer is becoming
disengaged" is a Belief.)

**Responsibilities**
- Carry a claim together with a confidence.
- Reference the Facts and Evidence it rests on, and the **Inference Record** that
  recorded how a model interpreted them (where the belief is model-backed).
- Retain prior values across revision.

**Invariants**
- Always references evidence; always carries confidence.
- Recomputable; revision preserves history.
- Never asserted as truth.

**Dependencies** — Evidence, Entity, Fact. (Not Reasoner: a Belief is State and
depends only on State — Constitution Art. X §40. A model's interpretation is
recorded as an immutable **Inference Record** with full provenance; the Belief is
grounded in Facts/Evidence and the Inference Record links to it, so no live Service
is depended upon. This breaks the Belief→Reasoner cycle.)

## Prediction
*Kind — State.*

**Purpose** — A belief about the future: an interpretation projected forward in
time.

**Responsibilities**
- Assert an expected future state with confidence.
- Reference the beliefs and evidence it rests on.
- Remain checkable against later observations.

**Invariants**
- Interpretation; references its grounding; recomputable.
- Falsifiable: it must be comparable against a later Observation.
- Never truth.

**Dependencies** — Belief, Evidence. (Not Reasoner: like Belief, a Prediction is
State grounded in State — Constitution Art. X §40. The forward-projection is
recorded as an immutable **Inference Record**; the Prediction is grounded in the
Beliefs and Evidence it rests on, not the live Reasoner. This breaks the
Prediction→Reasoner cycle.)

---

# 3. Identity

How Orb models the user. **Identity is not a profile; it is an evolving model.**
Orb never stores "who the user is" — it stores the *continuously evolving
understanding* of the user. Where Reality records history and Knowledge interprets
it, **Identity accumulates continuity**: it answers "given everything Orb has
learned, what context should influence future decisions?" Every contract here
answers *"what can change?"* rather than *"what is true?"*.

Each Identity contract decomposes into **immutable** (its creation event and
original intent — append-only history), **derived** (recomputable from the journal:
progress, confidence, status), and **ephemeral** (runtime-only: current focus,
suggested next action) components. The decomposition and lifecycle (begin → evolve →
decay → merge → split → end) are given in the contract specs and the *Identity
Evolution Report*. The test for every contract: **a complete replay reconstructs
everything except ephemeral runtime state.** Identity is never edited directly — it
emerges from observations, evidence, and user intent; manual edits enter as Events
(Constitution Art. XII).

## DigitalTwin
*Kind — State.*

**Purpose** — Orb's current best model of the user and their world.

**Responsibilities**
- Hold the live set of entities, facts, beliefs, relationships, projects, goals,
  and context.
- Be continuously recomputed as evidence arrives.
- Be fully rebuildable from history.

**Invariants**
- Interpretation, never truth; holds no source-of-truth state.
- Fully recomputable from the journal.
- Everything it holds references evidence.
- Immutable: its genesis/anchor event. Derived: the entire current model. Ephemeral:
  the in-memory materialization/cache. The top aggregate — nothing depends on it.

**Dependencies** — Entity, Fact, Belief, Relationship, Project, Goal, Context.

## Relationship
*Kind — State.*

**Purpose** — A modeled connection between entities (knows, works-with,
located-at, and so on).

**Responsibilities**
- Connect entities with a typed association.
- Carry a confidence and ground the connection in evidence.

**Invariants**
- A belief about a connection: references evidence, carries confidence.
- Recomputable; revisable without rewriting history.
- Immutable: creation event, originally asserted entities + relation type. Derived:
  current confidence, strength, active/dormant status. Ephemeral: current salience.

**Dependencies** — Entity, Belief.

## Project
*Kind — State.*

**Purpose** — A coherent body of the user's ongoing work or intent that spans
time.

**Responsibilities**
- Group goals, entities, and observations under a sustained endeavor.
- Track the endeavor's state over time as interpretation.

**Invariants**
- Interpretation; recomputable; references evidence.
- Revision is appended, never rewritten.
- Immutable: creation event, original definition/intent. Derived: status, progress,
  member goals/entities, health. Ephemeral: current focus item, suggested next step.

**Dependencies** — Goal, Entity, Belief.

## Goal
*Kind — State.*

**Purpose** — A desired future state the user, or Orb on their behalf, intends to
bring about.

**Responsibilities**
- Express an objective.
- Provide the target that planning reasons toward.
- Remain evaluable against actual outcomes.

**Invariants**
- Interpretation; references its grounding; recomputable.
- The source of intent for planning — never an authority to act without
  permission.
- Immutable: creation event, original intent. Derived: progress, priority,
  confidence. Ephemeral: current focus, suggested next action, reminders.

**Dependencies** — Belief. (Not Context: a durable Goal must not depend on the
ephemeral situational frame — that edge created a `DigitalTwin → Goal → Context →
DigitalTwin` cycle and inverted the durability direction. A Goal's intent is
grounded in Belief; Context references active Goals, never the reverse.)

## Context
*Kind — State.*

**Purpose** — The current situational frame: what is salient now — time, place,
activity, attention.

**Responsibilities**
- Summarize the presently relevant slice of the twin.
- Inform retrieval and planning.
- Be continuously recomputed.

**Invariants**
- Interpretation; derived; recomputable.
- Never persisted as truth; references the observations and evidence that define
  it.
- The most ephemeral Identity contract. Immutable: the recorded event of a context
  snapshot (if retained). Derived: the salient slice (relevant entities, active
  goals). Ephemeral: current attention/focus — does not survive replay.

**Dependencies** — Entity, Goal. (Not DigitalTwin: Context summarizes the salient
*elements* it points at — Entities and active Goals — not the aggregate twin.
Depending on the twin created a `DigitalTwin ↔ Context` cycle; referencing the
underlying State instead keeps Identity a DAG with the twin as the top aggregate.)

---

# 4. Intelligence

How Orb reasons. Every contract in this domain is a **Service**: it *performs* a
transition (reasoning, retrieval, planning, reflection) but is not itself the
transition. The transitions are not kernel contracts; their outputs are State.

## Memory
*Kind — Service.*

**Purpose** — The unified read interface over history and interpretation that
intelligence draws upon.

**Responsibilities**
- Provide read access to the journal, the evidence graph, and the digital twin.
- Serve retrieval and reasoning.

**Invariants**
- Read-only over truth; owns no state; is not a private store.
- Everything it returns is traceable to events.

**Dependencies** — Journal, Evidence, DigitalTwin.

## Retriever
*Kind — Service.*

**Purpose** — Selects the relevant subset of memory for a reasoning task.

**Responsibilities**
- Query memory by relevance, recency, and causality.
- Return grounded, provenance-bearing results.

**Invariants**
- Read-only and side-effect free.
- Deterministic given the same inputs and index.
- Returns only grounded references; introduces no truth.

**Dependencies** — Memory, Context.

## Reasoner
*Kind — Service.*

**Purpose** — Derives new interpretation from evidence. The seat of model-backed
intelligence. (Performs the *Reasoning* transition; the transition is not a
kernel contract — its outputs, Beliefs, are.)

**Responsibilities**
- Consume interpretation and evidence and produce interpretation.
- Record every derivation as an **Inference Record** — the immutable account of
  *how* evidence was interpreted, carrying full model provenance (provider, model
  version, prompt template version, input references, parameters, timestamp,
  environment). The Inference Record is distinct from Evidence: Evidence is
  external grounding (observation, attachment, external source); an Inference
  Record is the machine's interpretation of it.
- Remain interchangeable.

**Invariants**
- Model-independent: no provider is hardcoded; a local implementation is always
  viable.
- Every derivation is recorded as an Inference Record with provenance; conclusions
  enter history as State, never as a live dependency.
- Produces interpretation, never truth.

**Dependencies** — Memory, ModelRouter, Belief, Evidence.

> **Inference Record (forthcoming State contract).** The renaming of "model-output
> evidence" to a distinct *Inference Record* (Knowledge decision 4) means the
> Reasoner's recorded derivations are their own kind of State, not Evidence. The
> formal `InferenceRecord` contract is specified together with the Reasoner in the
> **Intelligence** domain review (it is the Reasoner's durable output), at which
> point the kernel's State count grows by one under Article X (addition, never
> mutation). Knowledge-domain contracts already reference it by name.

## Planner
*Kind — Service.*

**Purpose** — Produces explainable plans: ordered intended actions toward a goal.
(Performs the *Planning* transition; the resulting *Decision* is a transition,
captured only as Event, provenance, and Action.)

**Responsibilities**
- Consume interpretation plus a goal and emit a plan of intended actions.
- Name the capabilities each action requires.
- Record reasoning provenance and consider alternatives.

**Invariants**
- Produces a plan (interpretation), not execution.
- Every plan is explainable and grounded.
- Planning never acts; execution requires permission.

**Dependencies** — Goal, Memory, Reasoner, Capability.

## Reflector
*Kind — Service.*

**Purpose** — Compares expected outcomes against actual observations and feeds
learning. (Performs the *Reflection* and *Learning* transitions; their outputs
are revised Beliefs and new Observations.)

**Responsibilities**
- Evaluate predictions and decisions against later observations.
- Record the delta between expected and actual.
- Trigger belief revision.

**Invariants**
- Produces new observations and interpretation; never mutates prior history.
- Runs continuously and periodically.
- Keeps Orb honest: outcomes are observed, not assumed.

**Dependencies** — Prediction, Action, Observation, Belief.

---

# 5. Execution

How Orb affects the world.

## Capability
*Kind — Service.*

**Purpose** — A permissioned ability to affect the world. The only path from Orb
to Reality.

**Responsibilities**
- Declare its effects, permission tier, and reversibility.
- Execute actions within its declaration.
- Record outcomes as observations.

**Invariants**
- Does only what it declares; no self-escalation.
- Permissioned; every core capability has a local implementation.
- Every action it performs is recorded.

**Dependencies** — Action, Policy.

## Action
*Kind — State.*

**Purpose** — The recorded execution of a decision through a capability. The
unit of effect on Reality, captured as history.

**Responsibilities**
- Bind to the decision that triggered it.
- Record the capability invoked and the effect produced.
- Produce a recorded outcome observation.

**Invariants**
- Idempotent with respect to its triggering decision.
- Recorded back as an observation; never silent.
- Irreversible effects require explicit, scoped authorization.

**Dependencies** — Capability, Policy.

## Policy
*Kind — State.*

**Purpose** — The declarative rules that govern what may be done, by whom, and
under what authorization.

**Responsibilities**
- Define permission tiers and authorization requirements.
- Provide the rules that gate capabilities and actions.
- Encode the constraints that preserve human agency.

**Invariants**
- Irreversible and financial actions require explicit, scoped authorization by
  default.
- Authorization is scoped, never blanket.
- Policy is declarative and auditable.

**Dependencies** — Capability.

## Scheduler
*Kind — Service.*

**Purpose** — Owns execution: selects and dispatches runtime work across the
loop.

**Responsibilities**
- Schedule loop stages as tasks.
- Prioritize by safety and by freshness of history.
- Manage retries, backpressure, and background and maintenance work.

**Invariants**
- The runtime, not agents, owns scheduling.
- No stage is skipped — priority orders, never omits.
- Work is deferred under device constraints, never dropped.

**Dependencies** — Agent, Policy.

## Agent
*Kind — Service.*

**Purpose** — A worker that advances loop stages under the scheduler's direction.

**Responsibilities**
- Execute scheduled work using reasoners, planners, and capabilities.
- Read the world through memory.
- Produce events.

**Invariants**
- Owns no durable state; does not wake itself; restartable without loss.
- All of its memory lives in events and projections.

**Dependencies** — Memory, Scheduler, Reasoner, Planner, Capability.

---

# 6. Infrastructure

The services every runtime depends upon. Every contract in this domain is a
**Service**.

## Journal
*Kind — Service.*

**Purpose** — The append-only log of events. The single source of truth.

**Responsibilities**
- Accept appends to the device's own lane.
- Preserve per-lane hash chains.
- Expose replayable, HLC-ordered reads.

**Invariants**
- Append-only and single-writer-per-lane.
- Never mutates, reorders, or deletes.
- The only source of truth; everything else derives from it.

**Dependencies** — Event, Storage, Encryption.

## Storage
*Kind — Service.*

**Purpose** — Durable on-device persistence for the journal and its derived
projections.

**Responsibilities**
- Persist immutable journal segments and disposable projections.
- Provide crash-consistent, ordered access.
- Remain engine-independent behind the contract.

**Invariants**
- The journal store is append-only; projections are rebuildable and disposable.
- Encrypted at rest.
- The storage engine is interchangeable.

**Dependencies** — Encryption.

## Synchronization
*Kind — Service.*

**Purpose** — Replicates immutable lanes between equal-peer devices without
authority.

**Responsibilities**
- Exchange missing lane tails between peers.
- Verify hash chains before accepting events.
- Advance the Hybrid Logical Clock on receive.

**Invariants**
- Devices are equal peers; replicates, never rewrites.
- No journal-level conflicts: merge is the union of immutable lanes.
- Relays are zero-knowledge; causality is preserved; sync is idempotent and
  resumable.

**Dependencies** — Journal, Event, Encryption.

## ModelRouter
*Kind — Service.*

**Purpose** — Selects and routes reasoning to interchangeable model backends.

**Responsibilities**
- Resolve a reasoner's request to a concrete model, local or remote.
- Enforce minimization and policy on any disclosure.
- Record routing and disclosure provenance.

**Invariants**
- No provider is hardcoded; a local route is always available.
- Model swaps affect only future interpretation.
- Every routing and disclosure is recorded.

**Dependencies** — Policy, Encryption.

## Encryption
*Kind — Service.*

**Purpose** — Protects data at rest and in transit. The cryptographic substrate
of trust.

**Responsibilities**
- Encrypt the journal, projections, and attachments at rest.
- Secure transport between peers and to remote services.
- Manage device identity keys and the user-scoped data key.

**Invariants**
- The user and their devices are the root of trust.
- Relays and providers never hold keys or plaintext.
- History is tamper-evident; keys remain under user control.

**Dependencies** — None. The cryptographic substrate.

---

## Kernel-Wide Properties

- **Two kinds only.** Every kernel contract is **State** (persistent information)
  or **Service** (runtime infrastructure). Transitions are not kernel contracts;
  they live in the Runtime Loop, and only their outputs — State — are stored.
- **Truth flows one way.** Reality → Knowledge → Identity inform Intelligence,
  which drives Execution, which acts on Reality and is observed anew. No contract
  short-circuits the loop.
- **History is sacred.** Every State contract that touches history may only
  append; interpretation State is always recomputable.
- **Nothing hardcodes a model or a provider.** Intelligence and Infrastructure
  services are model-independent by contract.
- **Everything is grounded.** Every Knowledge and Identity State contract
  references evidence; every Execution effect is recorded.
- **The kernel is closed under the constitution.** No contract may be specified or
  implemented in a way that violates `CONSTITUTION.md`.

## Next Step (gated)

After this kernel is **accepted**, each contract receives its own specification
under `contracts/` (`Event.md`, `Observation.md`, …), defining Semantics,
Lifecycle, State transitions, Invariants, Versioning rules, Compatibility
guarantees, Failure modes, and Examples. Only after every contract specification
is accepted are implementation interfaces written in TypeScript or Kotlin.
