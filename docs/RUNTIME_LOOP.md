# Runtime Loop

> Status: Phase 1 architecture (amendment). Reviewed before implementation.
> Defines Orb's **dynamics** — the continuous execution model. Where the other
> documents define the *objects* of the system, this defines how they *move*.
> See `SYSTEM_OVERVIEW.md` for vocabulary and the three planes.

---

## 1. Purpose

Orb is **not a database**. It is a **continuously running runtime**. It is a
continuous-observation system, not a request-response system. Nothing in Orb is
"live" in the sense of being read on demand and forgotten — everything is
**eventually observed, eventually recorded, eventually understood, eventually
acted upon**.

This document defines the loop that makes that true, and the execution model that
runs it.

> Constitutional invariant (ratified Phase 2): *Nothing is "live." Everything is
> eventually observed; everything eventually becomes evidence; everything
> eventually becomes knowledge; everything eventually becomes action.*

---

## 2. The Runtime Loop

Every capability in Orb exists to serve one or more stages of a single loop:

```
Sense      gather raw signals from the external world
  ↓
Observe    turn signals into Observations
  ↓
Record     append immutable events to the Event Journal
  ↓
Extract    derive structured evidence from raw events
  ↓
Link       connect evidence to observations in the Evidence Graph
  ↓
Understand derive Facts / Beliefs / Entities in the Digital Twin
  ↓
Plan       produce explainable Decisions
  ↓
Act        execute Decisions through permissioned Capabilities
  ↓
Reflect    compare outcomes against expectations
  ↓
Learn      recompute understanding from new evidence
  ↓
 (back to Sense — the loop never ends)
```

The loop is **continuous and never terminates**. It is not triggered by a user
request; it runs because Orb is always observing. A user request is just another
signal that enters at **Sense**.

> **The loop closes only when reality confirms execution.** *Act* issues an
> effect, but issuing is runtime activity (an Event), not a change to reality.
> Orb never assumes an Action changed the world. Reality is updated only when a
> Sensor *observes* the effect — the new Observation re-enters at **Sense**, and
> only then is the loop closed for that intent. An issued Action that is never
> confirmed leaves reality un-updated; *Reflect* records the gap. (Constitution
> Article XI; `Observation.md`.)

---

## 2a. The Three Loops

The single loop above is the **outer skin** of three nested feedback loops that
together make Orb adaptive. Each runs at a different timescale and over a
different substrate, but all are expressed through the same stages and the same
immutable journal.

| Loop | Question it answers | Path | Substrate |
| --- | --- | --- | --- |
| **External (reality) loop** | Did the world change as intended? | Reality → Observation → Knowledge → Action → Reality | the world + observations |
| **Learning (belief) loop** | What should I now believe? | Events → Evidence → Beliefs → Predictions → new Beliefs | the Digital Twin |
| **Self-improvement (runtime) loop** | How should I run better? | Runtime → Reflection → Optimization → Runtime | the runtime itself |

- The **external loop** is the fastest-visible: sense, act, re-sense. It closes
  only on confirmation (above), never on issuance.
- The **learning loop** is slower and internal: accumulated Evidence revises
  Beliefs, which sharpen Predictions, which become Evidence to revise again. It
  rewrites understanding, never history (`DIGITAL_TWIN.md` §Belief Revision).
- The **self-improvement loop** is slowest: Reflection on the runtime's own
  behavior (latency, deferral, accuracy of expectation) feeds optimization of how
  the runtime schedules and acts — improving the machine that runs the other two.

These three are not separate machinery; they are three *readings* of the one
loop, each closing through history. This section names them; their full treatment
is deferred to a dedicated document.

---

## 3. The Three Planes

The loop continuously moves information between three planes. This separation
appears consistently throughout the architecture.

| Plane | Contains | Loop stages it owns |
| --- | --- | --- |
| **Reality Plane** | The external world: sensors, files, messages, calendar, location, audio, browser | Sense, Observe (in); Act (out) |
| **Knowledge Plane** | Event Journal, Evidence Graph, Digital Twin, Beliefs, Predictions | Record, Extract, Link, Understand, Learn |
| **Execution Plane** | Agents, Capabilities, Actions, Schedulers, Policies | Plan, Act, Reflect |

Flow of information:

```
Reality ──Sense/Observe──▶ Knowledge ──Plan──▶ Execution ──Act──▶ Reality
   ▲                                                                  │
   └──────────── recorded back as Observation (Reflect/Learn) ────────┘
```

- **Reality → Knowledge:** sensing and recording. The world becomes immutable
  history.
- **Knowledge → Execution:** understanding becomes intent. Beliefs become plans.
- **Execution → Reality:** acting. Intent becomes effect — which is then sensed
  again, closing the loop.

The Knowledge Plane never reaches into Reality directly; only the Execution Plane
acts, and only through permissioned Capabilities. The Execution Plane never holds
truth; it reads the Knowledge Plane and writes back only by producing new
observations.

---

## 4. Continuous Execution Model

- The runtime is a **long-lived process** on each device. Each device is a
  complete runtime and runs its own loop independently (`MASTER.md` Device
  Native).
- The loop is **driven by the runtime, not by agents**. The runtime decides what
  runs, when. *Agents do not wake randomly. The runtime schedules work. The
  runtime owns execution. Agents are workers.*
- Work is expressed as **tasks** the runtime schedules; a task advances one or
  more loop stages for some subject (an event, an entity, a goal).
- Stages are **decoupled**: Sense need not wait for Understand. Each stage
  consumes what is available and emits work for the next. This is a pipeline, not
  a synchronous call chain.

---

## 5. Scheduling

The runtime owns a **scheduler** that selects and dispatches tasks to worker
agents.

- **Event-driven by default.** A new event (local or replicated) propagates
  forward, scheduling the downstream stages that depend on it.
- **Periodic where needed.** Some stages run on a cadence (reflection, learning,
  maintenance) rather than per-event.
- **Backpressure-aware.** The scheduler bounds concurrency per stage so a burst
  of sensing cannot starve understanding or acting.
- **Deterministic dispatch order** within a device for a given input set, so
  behavior is reproducible and debuggable. (Interpretation results may still
  differ if models change — `SYSTEM_OVERVIEW.md` §Determinism Boundary.)

---

## 6. Priorities

Not all work is equally urgent. The scheduler ranks tasks by:

1. **Safety / human-facing latency** — anything awaiting human authorization or
   affecting an imminent action ranks highest.
2. **Freshness of history** — Record must keep up with Sense so history is never
   silently dropped; ingestion is protected.
3. **Understanding currency** — keeping the Digital Twin current with new
   evidence.
4. **Reflection / Learning** — important but tolerant of delay.
5. **Maintenance** — lowest priority; runs in spare capacity.

Priority never permits skipping a stage — only ordering it. *Everything is
eventually processed.*

---

## 7. Event Propagation

- When an event is recorded, the runtime **propagates** it forward: it schedules
  Extract → Link → Understand for the new event, then potentially Plan.
- Propagation is **incremental**: only the affected projections are recomputed,
  not the whole journal (full replay remains available as the recovery/rebuild
  path — `STORAGE.md`).
- Replicated events from a peer enter propagation **identically** to local
  events; there is no special path for "remote" history (`SYNC_PROTOCOL.md`).
- Propagation carries **causal context** (HLC, `causes`) so downstream stages can
  order and relate work correctly.

---

## 8. Background Execution

- Most of the loop runs in the **background**, continuously, without user
  prompting. Sensing, recording, extracting, linking, and understanding proceed
  whenever capacity and data exist.
- Background work is **interruptible and resumable**. The runtime may pause
  low-priority work for high-priority work and resume it later without loss.
- Background work respects device constraints (battery, thermal, network) —
  especially on Pixel — by deferring, not dropping. Deferred is not discarded.

---

## 9. Retries

- A stage that fails on a transient error is **retried** with backoff by the
  runtime, not by the agent.
- Retries are bounded; persistent failure produces a **recorded** failure
  observation (the failure itself becomes history) and surfaces for attention —
  it is never silently swallowed.
- Because actions touch the world, **Act retries require idempotency** (§10) or
  explicit re-authorization for irreversible effects (`CAPABILITY_MODEL.md`).

---

## 10. Idempotency

- Every stage must be **idempotent with respect to its input event(s)**: applying
  the same event twice yields the same projection state. This is what makes
  retries and replication safe.
- Recording is idempotent by event `id`: re-appending a known event is a no-op
  (this is also how replication dedupes — `SYNC_PROTOCOL.md`).
- Acting is made idempotent by binding an Action to its triggering Decision id, so
  a retry cannot double-send or double-charge; irreversible capabilities verify
  the action has not already occurred before repeating.

---

## 11. Reflection Cycles

- **Reflection** runs after actions (and on a cadence) to compare **expected vs.
  actual outcome**. A Decision recorded an expectation; the resulting Observation
  records what actually happened; Reflection records the delta.
- Reflection produces new observations/beliefs ("the follow-up I scheduled did
  not happen"), feeding Learn. It does **not** mutate the original Decision or its
  history — it appends.
- Reflection is how Orb stays honest: outcomes are observed, not assumed.

---

## 12. Learning Cycles

- **Learning** continuously recomputes understanding as new evidence (including
  reflection results) accumulates. It revises Beliefs and Entities in the Digital
  Twin (`DIGITAL_TWIN.md` §Belief Revision) without rewriting events.
- Learning may also incorporate **model upgrades**: when a Reasoner changes,
  future learning may reach different conclusions; prior conclusions remain in
  history with provenance. *Replay reproduces history, not intelligence.*
- Learning is a Knowledge-Plane activity; it never acts on Reality directly.

---

## 13. Maintenance Tasks

Lowest-priority background work that keeps the runtime healthy:

- **Projection rebuilds** when projection logic changes (`STORAGE.md`).
- **Integrity verification** of hash-chained lanes (`SECURITY.md`).
- **Compaction / archival** of cold projection or journal segments — never
  mutating history, always preserving replayability.
- **Anti-entropy sync** passes with peers (`SYNC_PROTOCOL.md`).
- **Index maintenance** for query performance.

Maintenance runs in spare capacity and never preempts safety- or
ingestion-critical work.

---

## 14. Invariants

1. Orb is a continuous-observation runtime, not request-response.
2. Nothing is "live"; everything is eventually observed, recorded, understood,
   and acted upon.
3. The runtime owns execution and scheduling; agents are workers that do not wake
   themselves.
4. The loop never terminates and never skips a stage; priority orders, never
   omits.
5. Information flows Reality → Knowledge → Execution → Reality; only the Execution
   Plane acts on Reality, only through permissioned Capabilities.
6. Every stage is idempotent w.r.t. its input events; retries and replication are
   therefore safe.
7. Failures, retries, and reflections are recorded as history, never swallowed.
8. Background work is deferred under device constraints, never dropped.

---

## 15. Out of Scope

- The objects each stage operates on → the per-object documents
  (`EVENT_MODEL`, `EVIDENCE_GRAPH`, `DIGITAL_TWIN`, `CAPABILITY_MODEL`, …).
- Agent/worker interfaces (`Agent`, `Reasoner`, `Planner`) → Phase 3 contracts.
- Concrete scheduler implementation → Phase 4+, constrained by these invariants.
