# Planner — Contract Specification

```
Contract:   Planner
Domain:     Intelligence
Kind:       Service
Version:    v1
Status:     Draft
Depends on: InferenceRecord, Goal
```

> A Planner answers: **how, concretely, could this decision be carried out?** It
> consumes a *recorded* decision and a goal, and produces an executable plan — ordered
> *intent*, never execution. It never binds capabilities and never acts. See
> `../docs/KERNEL.md` §4, `../docs/CAPABILITY_MODEL.md`, and `InferenceRecord.md`.

**Why a permanent kernel contract?** Because turning a decision into an ordered,
executable plan is a **distinct, permanent step** from *making* the decision — and it is
the bridge from Knowledge-side reasoning to the Execution Plane. Keeping it separate from
the `Reasoner` preserves "decide" and "sequence" as independently replaceable concerns: a
planning strategy can change completely without touching how conclusions are drawn.
*Can it exist for twenty years?* The frame — *decision in, executable intent out, never
executes* — is stable for decades; only planning strategies churn. (Whether plans
eventually need their own durable record is an open question, deferred as **AD-2
`PlanRecord`**; v1 composes plan provenance from `InferenceRecord` and executable residue
from `Action`, so no durable `Plan` contract is added yet.) The contract is the permanent
promise of explainable sequencing that stops cleanly at the edge of action.

---

## 1. Semantics

A **Planner** is a Service that consumes a **recorded decision** — an `InferenceRecord`
produced by the `Reasoner` — together with a target **Goal**, and produces an
**executable plan**: an ordered set of intended actions that, if executed, would advance
the goal. It performs the *Planning* transition; the resulting *Decision* is itself a
transition, captured as provenance (a new `InferenceRecord`) and, once carried out, as
`Action`s — never as a stored kernel "Decision" object.

Three boundaries define it, and they are the point of the contract:

- **It produces intent, never execution.** A plan is *what* to do, expressed as
  goal-directed steps; it is not the doing.
- **It consumes recorded reasoning, not transient reasoning.** The Planner depends on the
  `InferenceRecord` — the *recorded* decision — not on the live `Reasoner`. This
  preserves replayability and auditability: a plan can always be traced to the recorded
  reasoning it sequenced.
- **It never binds capabilities or actions.** The Planner expresses *intent* — "send a
  follow-up," "schedule a review" — not *how* it is carried out. Which capability sends
  the email (Gmail, Outlook, another provider), and whether policy permits it, is
  Execution's `Agent`'s job (Art. VI §25). This keeps Intelligence independent of the
  Execution Plane and free of any power to act.

It owns **no durable state.** A plan's *provenance* is an `InferenceRecord`; a plan's
*executable residue*, once acted, is `Action`s in Execution.

---

## 2. Lifecycle (operational)

1. **Idle** — no planning task scheduled.
2. **Reading** — a recorded decision (`InferenceRecord`) and a `Goal` arrive; the Planner
   takes them as input.
3. **Sequencing** — it composes an ordered plan of intended actions toward the goal,
   considering alternatives.
4. **Recording** — it records the planning provenance as an `InferenceRecord` and emits
   the plan (intent) for Execution to bind and gate.
5. **Handing off** — the plan crosses to the Execution Plane (`Agent`), which binds
   capabilities and applies Policy. The Planner's involvement ends at the boundary.
6. **Degraded** — if the goal is missing or the decision ungrounded, it declines to plan
   rather than emitting unfounded intent.

---

## 3. State transitions

```
(idle) ──▶ (reading) ──▶ (sequencing) ──▶ (recording) ──▶ (handing off) ──▶ (idle)
                             │                  │                 │
        declines ◀── goal missing /             │                 └── intent ⇒ [Execution: Agent]
                     decision ungrounded        └── emits InferenceRecord (plan provenance)
```

Operational moves only — the Planner stores no record that transitions over time; its
durable footprint is the `InferenceRecord` it writes and the `Action`s that Execution
later records.

---

## 4. Invariants

1. **Produces intent, never execution.** A plan is interpretation (goal-directed
   intent); planning never acts (Constitution Art. VII).
2. **Consumes recorded reasoning.** It depends on the `InferenceRecord`, not the live
   `Reasoner` — plans are always traceable to recorded reasoning (Art. X §40,
   Art. III §13).
3. **Never binds capabilities or actions.** It expresses *what*, not *how*; capability
   binding and permission gating belong to Execution's `Agent` (Art. VI §25). The Planner
   is independent of the Execution Plane and of any specific provider.
4. **Explainable and grounded.** Every plan is grounded in a recorded decision and a
   goal, and its planning provenance is itself recorded as an `InferenceRecord`.
5. **Owns no durable state.** The Service is restartable without loss; plan provenance is
   an `InferenceRecord`, executable residue is `Action`s (Art. V §22).
6. **Never depended upon by State.** No State contract depends on the Planner
   (Art. X §40).

Upholds Constitution Articles VII (Capabilities and Human Agency), VI (The Three Planes),
III (Models and Reasoning), V (The Runtime), and X §40.

---

## 5. Versioning rules

- New **planning strategies** (sequential, hierarchical, constraint-based, successors)
  are implementation behind the contract; they change *how* plans are composed, never the
  obligation to stop at intent (Art. X — addition, never mutation).
- A durable **`PlanRecord`** may be added in a later version *if* `InferenceRecord` +
  `Action` prove insufficient to reconstruct or track multi-step plans (AD-2); adding it
  would be purely additive and would not change this contract.
- The core obligation — *decision in, explainable executable intent out, never executes,
  never binds capabilities* — is frozen at v1.

---

## 6. Compatibility guarantees

Consumers may permanently rely on:

- A Planner produces intent only; it never performs effects and never binds a specific
  capability or provider.
- Every plan is traceable to the recorded decision (`InferenceRecord`) and `Goal` it was
  built from, and its own planning provenance is recorded.
- Restarting or replacing the Planner loses nothing of value and never rewrites history.

Not guaranteed:

- That a plan is *optimal* or that it will *succeed* — it is the best current sequencing;
  outcomes are observed and reflected upon, not assumed.
- That two implementations produce the same plan — the contract fixes the obligation
  (intent, recorded, non-acting), not the algorithm.
- That a durable plan object exists — in v1 a plan is provenance (`InferenceRecord`) plus
  executable residue (`Action`s), not a stored `Plan` contract.

---

## 7. Failure modes

- **Missing goal or ungrounded decision.** The Planner declines to plan rather than
  emitting unfounded intent; no plan without a grounded decision and a goal.
- **Binding a capability.** A Planner that selects Gmail-vs-Outlook, or executes, has
  overstepped its contract; capability binding and acting are Execution's, through
  permission (Art. VI §25, Art. VII).
- **Planning on transient reasoning.** Building a plan from a live Reasoner result that
  was never recorded breaks auditability; the Planner consumes the `InferenceRecord`.
- **Acting.** Any direct effect on Reality from the Planner violates the
  Knowledge/Execution separation and is forbidden.

Never permitted: executing or performing effects; binding to a specific capability or
provider; planning from unrecorded reasoning; emitting intent with no grounding;
a State contract depending on the Planner.

---

## 8. Examples

- **Follow-up.** From a recorded decision "re-engage this customer" and the goal "retain
  the account," the Planner emits intent: *draft a check-in, propose a call, share the new
  pricing* — ordered, explainable — and records the planning provenance. Which mail
  capability sends it is decided later by the `Agent`.
- **Provider-blind intent.** The plan says "send a follow-up email," never "send via
  Gmail." Whether Gmail, Outlook, or another provider carries it is bound by Execution —
  keeping Intelligence independent of execution details.
- **Auditable years later.** A user asks why Orb proposed a review in 2026; the plan
  traces to its `InferenceRecord` (the recorded decision) and `Goal`, fully explaining the
  intent even though the model is long replaced.
- **Declines cleanly.** Asked to plan toward a goal with no grounded decision behind it,
  the Planner declines rather than inventing steps — intent must rest on recorded
  reasoning.
