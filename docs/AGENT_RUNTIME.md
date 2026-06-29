# Agent Runtime

> Status: Phase 1 architecture. Reviewed before implementation.
> Defines reasoning, planning, and agency — and the model-independence contract.
> See `SYSTEM_OVERVIEW.md`, `DIGITAL_TWIN.md`, `CAPABILITY_MODEL.md`.

---

## 1. Purpose

The Agent Runtime is where Orb reasons and decides. It reads the Digital Twin,
produces explainable Decisions, and — only through permissioned Capabilities —
turns Decisions into Actions. It is the orchestration layer that keeps models at
arm's length from the architecture.

> Constitutional laws: *Agents never own state. Models are replaceable. Every
> decision is explainable.*

---

## 2. Position in the Stack

```
Digital Twin  →  Reasoning Pipeline  →  Agent Runtime  →  Capabilities  →  Actions
                                                                              │
                                                                              ▼
                                                              recorded back as Observations
```

Everything the runtime does that matters is recorded as events: the decision it
reached, the reasoning provenance, and the action it took. The loop closes —
actions become new observations, feeding future understanding.

---

## 3. Core Roles

### Reasoner

A `Reasoner` consumes interpretation (Twin state, evidence) and produces new
interpretation (Beliefs) or candidate conclusions. A Reasoner may be backed by a
model, a rule set, or a heuristic. **The model lives behind the Reasoner
interface and never leaks upward.**

### Planner

A `Planner` consumes a recorded decision (an `InferenceRecord`) plus a goal and
produces an ordered, explainable plan of **intended actions** — *intent*, not
execution. The Planner does **not** name or bind the Capability each action requires:
it expresses *what* to do; the `Agent` binds *how* (which capability/provider) and
gates it through Policy (`KERNEL.md` §4–5). Planning is interpretation — recomputable
and non-authoritative until executed.

### Agent

An `Agent` orchestrates Reasoners and Planners toward an objective over time. An
agent is **stateless with respect to truth**: it owns no durable state of its
own. Anything an agent "remembers" lives in the journal as events (its inputs)
and in projections (the Twin). Restarting an agent loses nothing.

### Reading history (not a "Memory" contract)

An agent's access to history and interpretation — the journal, Evidence Graph, and
Twin — is **read access to the Knowledge Plane**, plus the `Retriever` for relevance
ranking. It is **not** a dedicated `Memory` contract: *memory is an emergent property
of the Knowledge Plane, not a kernel type* (the Intelligence domain review removed the
`Memory` contract — `KERNEL.md` §4). Agents read; they never own a private store.

---

## 4. Model Independence

> Constitutional law: *Models are replaceable.* Reasoning engines are
> interchangeable; models contribute intelligence but never define architecture.

Rules:

- **No provider is hardcoded.** A `Reasoner` is selected via dependency
  injection/configuration, not compiled-in.
- A Reasoner exposes a stable interface (inputs → outputs + provenance). The
  runtime depends on the interface, never on a specific model.
- Local and remote models are equal citizens behind the interface; local-first
  means a local Reasoner must always be a viable option.
- Swapping or upgrading a model changes **future** interpretations only. All
  prior model outputs remain in history with their provenance (see
  `EVENT_MODEL.md` §Model Outputs).

This is what lets Orb "evolve as the model ecosystem evolves" without
architectural change.

---

## 5. Decisions Are Explainable

Every Decision the runtime emits records:

- the **goal** it served,
- the **interpretations** it relied on (Twin/belief references),
- the **evidence** beneath those interpretations (Evidence Graph links),
- the **reasoning provenance** — which Reasoner/Planner, and for model-backed
  ones, the full `model_output` provenance (provider, version, prompt template,
  parameters, environment),
- the **alternatives considered**, where applicable.

A Decision is therefore replayable as *lineage*: you can always reconstruct
*why* Orb decided what it did, even if a newer model would now decide
differently. Explanation is a first-class output, not an afterthought.

---

## 6. Human Agency

> Constitutional law: *Capabilities are permissioned.*

The runtime extends human judgment; it does not replace it.

- Decisions with material consequences require the appropriate **permission tier**
  before execution (see `CAPABILITY_MODEL.md`).
- A Decision can be produced and explained **without** being executed — proposal
  and action are separate steps.
- The human can inspect the full explanation before authorizing an Action.

---

## 7. The Action Loop

1. Planner emits a plan as **intent** (interpretation); the `Agent` binds it to a
   concrete **Capability** and gates it through Policy.
2. Human/policy authorizes it per the required permission tier.
3. The runtime invokes the bound **Capability** to perform the **Action**.
4. The Action's occurrence and outcome are appended to the journal as new
   **Observation** events.
5. **Reflection** compares outcome to expectation; **Continuous Learning** folds
   the result back into the Twin.

The agent never persists the loop's state itself — every step is in the journal.

---

## 8. Invariants

1. Agents own no durable state; all state is events + projections.
2. No model provider is hardcoded; Reasoners are injected behind an interface.
3. A local Reasoner is always a viable option (local-first).
4. Every Decision records goal, interpretations, evidence, and reasoning
   provenance — and is explainable.
5. Model swaps affect only future interpretation; history is untouched.
6. Actions execute only through permissioned Capabilities.
7. Every Action is recorded back as an Observation.

---

## 9. Out of Scope

- The permission tiers and capability surface → `CAPABILITY_MODEL.md`.
- The frozen contracts (`Reasoner`, `Planner`, `Agent`, `Action`, and the
  `InferenceRecord` that records reasoning provenance) → Phase 3 contracts. *(There is
  no `Memory` contract — see §3.)*
- Security of remote model calls → `SECURITY.md`.
