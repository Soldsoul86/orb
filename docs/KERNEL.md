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

Every contract below defines exactly four sections: **Purpose**,
**Responsibilities**, **Invariants**, **Dependencies**.

---

# 1. Reality

How information enters Orb.

## Event

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

**Purpose** — A recorded statement that something occurred in reality. The entry
point of all knowledge.

**Responsibilities**
- Assert that something happened, without asserting it is true.
- Attribute itself to the source/sensor that produced it.
- Reference any raw Attachments it concerns.
- Become part of history by being recorded as an Event.

**Invariants**
- Immutable; belongs to the History plane.
- Records occurrence, never resolved truth.
- Always traceable to its source and its causal/temporal placement.

**Dependencies** — Event, Attachment, Sensor.

## Sensor

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

**Dependencies** — Evidence, Belief.

## Fact

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

**Purpose** — An interpretation held with uncertainty.

**Responsibilities**
- Carry a claim together with a confidence.
- Reference its supporting evidence and the derivation that produced it,
  including model provenance where model-backed.
- Retain prior values across revision.

**Invariants**
- Always references evidence; always carries confidence.
- Recomputable; revision preserves history.
- Never asserted as truth.

**Dependencies** — Evidence, Entity, Reasoner.

## Prediction

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

**Dependencies** — Belief, Reasoner.

---

# 3. Identity

How Orb models the user.

## DigitalTwin

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

**Dependencies** — Entity, Fact, Belief, Relationship, Project, Goal, Context.

## Relationship

**Purpose** — A modeled connection between entities (knows, works-with,
located-at, and so on).

**Responsibilities**
- Connect entities with a typed association.
- Carry a confidence and ground the connection in evidence.

**Invariants**
- A belief about a connection: references evidence, carries confidence.
- Recomputable; revisable without rewriting history.

**Dependencies** — Entity, Belief.

## Project

**Purpose** — A coherent body of the user's ongoing work or intent that spans
time.

**Responsibilities**
- Group goals, entities, and observations under a sustained endeavor.
- Track the endeavor's state over time as interpretation.

**Invariants**
- Interpretation; recomputable; references evidence.
- Revision is appended, never rewritten.

**Dependencies** — Goal, Entity, Belief.

## Goal

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

**Dependencies** — Belief, Context.

## Context

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

**Dependencies** — DigitalTwin, Entity.

---

# 4. Intelligence

How Orb reasons.

## Memory

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

**Purpose** — Derives new interpretation from evidence. The seat of model-backed
intelligence.

**Responsibilities**
- Consume interpretation and evidence and produce interpretation.
- Record full model provenance when model-backed.
- Remain interchangeable.

**Invariants**
- Model-independent: no provider is hardcoded; a local implementation is always
  viable.
- Outputs are recorded as observations with provenance.
- Produces interpretation, never truth.

**Dependencies** — Memory, ModelRouter, Belief, Evidence.

## Planner

**Purpose** — Produces explainable decisions: ordered intended actions toward a
goal.

**Responsibilities**
- Consume interpretation plus a goal and emit a plan of intended actions.
- Name the capabilities each action requires.
- Record reasoning provenance and consider alternatives.

**Invariants**
- Produces interpretation (a decision), not execution.
- Every plan is explainable and grounded.
- Planning never acts; execution requires permission.

**Dependencies** — Goal, Memory, Reasoner, Capability.

## Reflector

**Purpose** — Compares expected outcomes against actual observations and feeds
learning.

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

**Purpose** — The execution of a decision through a capability. The unit of
effect on Reality.

**Responsibilities**
- Bind to the decision that triggered it.
- Invoke a capability to produce an effect.
- Produce a recorded outcome observation.

**Invariants**
- Idempotent with respect to its triggering decision.
- Recorded back as an observation; never silent.
- Irreversible effects require explicit, scoped authorization.

**Dependencies** — Capability, Planner, Policy.

## Policy

**Purpose** — The rules that govern what may be done, by whom, and under what
authorization.

**Responsibilities**
- Define permission tiers and authorization requirements.
- Gate capabilities and actions.
- Encode the constraints that preserve human agency.

**Invariants**
- Irreversible and financial actions require explicit, scoped authorization by
  default.
- Authorization is scoped, never blanket.
- Policy is declarative and auditable.

**Dependencies** — Capability.

## Scheduler

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

The services every runtime depends upon.

## Journal

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

- **Truth flows one way.** Reality → Knowledge → Identity inform Intelligence,
  which drives Execution, which acts on Reality and is observed anew. No contract
  short-circuits the loop.
- **History is sacred.** Every contract that touches history may only append.
  Interpretation contracts are always recomputable.
- **Nothing hardcodes a model or a provider.** Intelligence and Infrastructure
  are model-independent by contract.
- **Everything is grounded.** Every Knowledge and Identity contract references
  evidence; every Execution contract records its effect.
- **The kernel is closed under the constitution.** No contract may be specified or
  implemented in a way that violates `CONSTITUTION.md`.

## Next Step (gated)

After this kernel is **accepted**, each contract receives its own specification
under `contracts/` (`Event.md`, `Observation.md`, …), defining Semantics,
Lifecycle, State transitions, Invariants, Versioning rules, Compatibility
guarantees, Failure modes, and Examples. Only after every contract specification
is accepted are implementation interfaces written in TypeScript or Kotlin.
