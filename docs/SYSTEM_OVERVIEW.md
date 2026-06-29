# System Overview

> Status: Phase 1 architecture. Reviewed before implementation.
> This document defines the shared vocabulary and the layered shape of Orb.
> Every other document in `/docs` builds on the terms established here.

---

## 1. What Orb Is

Orb is a long-lived, local-first personal runtime. It turns what a person
observes into knowledge, knowledge into understanding, understanding into
decisions, and decisions into action — while preserving the complete, replayable
history of how every conclusion was reached.

Its intelligence comes from **continuity**, not from any single model.

---

## 2. The Core Insight: History vs. Interpretation

Orb never stores "truth." It stores **observations, evidence, and
interpretations**, on two distinct planes:

| Plane | Contents | Mutability | Determinism |
| --- | --- | --- | --- |
| **History** | Observations, Evidence, recorded Model Outputs | Immutable, append-only | Deterministic |
| **Interpretation** | Facts, Beliefs, Entities, Twin state, Decisions | Continuously recomputed | Non-deterministic |

History is what happened. Interpretation is what Orb currently makes of it.
The system improves indefinitely by re-interpreting an unchanging past — never by
rewriting it.

> Constitutional law: **Separate history from interpretation.** History is
> immutable; interpretation is continuously evolving. The value of Orb comes from
> preserving both.

---

## 3. The Epistemic Stack

Every piece of knowledge in Orb is one of four kinds. The progression is the
spine of the whole system.

```
Observation  →  Evidence  →  Interpretation  →  Decision  →  (Action)
```

- **Observation** — a recorded statement that something occurred.
  _"Met John at 3:02 PM."_ Immutable. History.
- **Evidence** — the corroborating signals an observation rests on.
  _GPS fix, calendar entry, Bluetooth proximity, a photo._ Immutable. History.
- **Interpretation** — a Fact or Belief derived by reasoning over evidence.
  _"John is an important contact."_ Recomputable. May change. Interpretation.
- **Decision** — a chosen course of action produced by reasoning over
  interpretations. _"Schedule a follow-up this week."_ Recomputable. Interpretation.
- **Action** — the execution of a decision through a permissioned capability.
  An action, once taken, is itself recorded back as a new **Observation**.

The first two are historical records. The latter are products of reasoning and
may change as more evidence accumulates. This separation is what allows Orb to
get smarter without rewriting its past.

---

## 4. Architecture Pipeline

The canonical pipeline from `MASTER.md`, annotated with the plane each stage
operates on:

```
Sensors              produce → Observations + Evidence        [History]
   ↓
Event Journal        immutable append-only log of events      [History]
   ↓
Evidence Graph       links observations to their evidence     [History]
   ↓
Knowledge Engine     derives Facts and Beliefs                [Interpretation]
   ↓
Digital Twin         the current best model of the user/world [Interpretation]
   ↓
Reasoning Pipeline   produces Decisions with explanations     [Interpretation]
   ↓
Agent Runtime        orchestrates reasoners, planners, agents [Interpretation]
   ↓
Capabilities         permissioned ways to act                 [Boundary]
   ↓
Actions              execute, then record back as Observations [History]
   ↓
Reflection           re-examines outcomes vs. expectations    [Interpretation]
   ↓
Continuous Learning  recomputes understanding from new evidence
```

The **Event Journal is the single source of truth.** Everything above it in the
interpretation plane is a derived projection that can be discarded and rebuilt by
replaying the journal.

---

## 5. The Three Planes

Orthogonal to the History/Interpretation split, Orb is organized into three
**planes**. This separation appears consistently throughout the architecture.

| Plane | Contains |
| --- | --- |
| **Reality Plane** | The external world: sensors, files, messages, calendar, location, audio, browser. |
| **Knowledge Plane** | Event Journal, Evidence Graph, Digital Twin, Beliefs, Predictions. |
| **Execution Plane** | Agents, Capabilities, Actions, Schedulers, Policies. |

Information flows continuously between the planes:

```
Reality ──Sense/Observe──▶ Knowledge ──Plan──▶ Execution ──Act──▶ Reality
   ▲                                                                  │
   └──────────── recorded back as Observation (Reflect/Learn) ────────┘
```

Only the **Execution Plane** acts on Reality, and only through permissioned
Capabilities. The **Knowledge Plane** holds no power to act and never reaches
into Reality directly. The **Execution Plane** holds no truth; it reads Knowledge
and writes back only by producing new observations.

The History plane (§2) lives entirely within the Knowledge Plane; the
Interpretation plane spans Knowledge (beliefs) and Execution (decisions).

---

## 6. Dynamics: The Runtime Loop

Orb is **not a database**. It is a continuously running runtime — a
**continuous-observation system, not a request-response system**. Everything in
Orb exists to serve one or more stages of a single, never-ending loop that moves
information between the three planes:

```
Sense → Observe → Record → Extract → Link → Understand → Plan → Act → Reflect → Learn → (Sense …)
```

The runtime — not agents — owns execution and scheduling. *Agents do not wake
randomly; the runtime schedules work and agents are workers.* A user request is
not a special path; it is simply another signal that enters at **Sense**.

> Constitutional invariant: *Nothing is "live." Everything is eventually observed;
> everything eventually becomes evidence, knowledge, and action.*

The full execution model — scheduling, priorities, event propagation, background
execution, retries, idempotency, reflection, learning, and maintenance — is
defined in `RUNTIME_LOOP.md`.

---

## 7. Determinism Boundary

There is exactly one boundary in Orb where determinism ends:

- **Below the boundary (History):** the Event Journal and Evidence Graph. Fully
  deterministic. Replay reproduces them exactly, bit-for-bit.
- **Above the boundary (Interpretation):** the Knowledge Engine and everything
  downstream. Non-deterministic, because reasoning may involve replaceable,
  evolving models.

> Replay guarantees reconstruction of **history and provenance**. It does not
> guarantee identical **reasoning**. Orb reproduces history; it does not freeze
> intelligence.

Model outputs are pulled below the boundary by being **recorded as observations**
with full provenance (see `EVENT_MODEL.md` §Model Outputs). The act of running a
model is non-deterministic; the *record that it ran and produced X* is permanent.

---

## 8. Distribution Model (summary)

Orb is fundamentally a distributed system of **equal peers** (e.g. a Mac and a
Pixel). No device is authoritative.

- Every device owns its own append-only **event lane**.
- Every event has a globally unique id, an originating device, and a **Hybrid
  Logical Clock (HLC)** timestamp.
- Replication preserves causality. **Global ordering is derived, never stored.**
- Merge never rewrites history.

Full treatment in `EVENT_MODEL.md` and `SYNC_PROTOCOL.md`.

---

## 9. Model Independence (summary)

Reasoning engines are interchangeable. A model is invoked through a `Reasoner`
interface and contributes intelligence, but never defines the architecture.
Switching or upgrading a model changes future interpretations while leaving all
history — including the outputs of prior models — intact. See `AGENT_RUNTIME.md`.

---

## 10. Document Map

| Document | Defines |
| --- | --- |
| `RUNTIME_LOOP.md` | The continuous execution model, scheduling, and the three planes in motion. |
| `EVENT_MODEL.md` | The event, lanes, HLC ordering, model-output provenance. |
| `EVIDENCE_GRAPH.md` | How observations link to evidence and provenance. |
| `DIGITAL_TWIN.md` | The recomputable interpretation layer (facts, beliefs, entities). |
| `AGENT_RUNTIME.md` | Reasoners, planners, agents; model independence. |
| `CAPABILITY_MODEL.md` | Permissioned action surface. |
| `STORAGE.md` | On-device persistence of journal and projections. |
| `SYNC_PROTOCOL.md` | Peer replication, causality, conflict handling. |
| `SECURITY.md` | Trust model, encryption, permissions, privacy. |
| `KERNEL.md` | The permanent public contract surface (six domains, 30 contracts). |
| `ROADMAP.md` | Phased delivery plan. |

---

## 11. Invariants Asserted Here

1. The Event Journal is the only source of truth.
2. History is immutable and append-only.
3. Interpretation is always recomputable from history.
4. No device is authoritative.
5. Model outputs are observations, not truth.
6. Every interpretation traces to evidence; every decision is explainable.
7. Orb is a continuous-observation runtime, not request-response; nothing is
   "live" — everything is eventually observed, recorded, understood, and acted on.
8. Information flows Reality → Knowledge → Execution → Reality; only the Execution
   Plane acts on Reality, and only through permissioned Capabilities.
