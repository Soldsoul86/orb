# Architectural Debt Register

> Deliberately deferred architectural questions — decisions we have *chosen not to
> make yet*, recorded so they are not forgotten. Debt here is not a bug or a TODO;
> it is a known design tension whose resolution is scheduled for a later, explicit
> decision (typically a kernel version boundary). Nothing in this register blocks
> the current phase.
>
> Each item states the question, why it was deferred, the leading option, and the
> milestone at which it must be revisited. Items are resolved by an explicit
> decision recorded in version control — never silently.

---

## AD-1 — A `Claim` layer between Evidence and Fact

- **Status:** Open · **Raised:** Phase 3b, Knowledge domain review · **Revisit at:**
  before Orb **v2** (not v1)
- **Domain:** Knowledge · **Kind (if adopted):** State

**Question.** Should the epistemic stack gain a `Claim` object between Evidence and
Fact?

```
Observation → Evidence → Claim → Fact → Belief
```

**Why it might be needed.** *Claims* are what people (and external sources) actually
assert — statements that are neither runtime Facts nor runtime Beliefs:

- "John likes Rust."
- "BTC will reach $250k."
- "The meeting was successful."

These are not Facts (the runtime has not settled them on evidence) and not Beliefs
(they are not the runtime's own contextual interpretation). They are **asserted by
someone**, and over time become **supported**, **contradicted**, or **unresolved**.
A `Claim` would let Orb *ingest the world's statements* without prematurely
classifying them as Fact or Belief — a cleaner intake path for second-hand or
disputed assertions.

**Why deferred.** v1 can represent an external assertion as an Observation (someone
said X) plus Evidence, and let interpretation form Facts/Beliefs from there. The
`Claim` abstraction is a clarity and ergonomics gain, not a correctness gap, so it
does not justify expanding the v1 kernel. Adding it later is purely additive under
Constitution Article X (v1 contracts remain valid forever).

**Leading option.** Introduce `Claim` as a Knowledge-domain State contract in v2,
depending on `Evidence` (and naming the asserting source identity, as Observation
does). It would carry a resolution status (`supported | contradicted | unresolved`)
and be referenced by Facts/Beliefs that adopt or reject it. To be evaluated against
the simpler "external assertion = Observation + Evidence" baseline before adoption.

**Decision owner:** reviewer (architecture). **Resolution:** record an explicit
accept/reject with rationale at the v2 kernel boundary.

---

## AD-2 — A durable `PlanRecord` State contract

- **Status:** Open · **Raised:** Phase 3b, Intelligence domain review · **Revisit at:**
  when multi-step plan tracking becomes concrete (no earlier than **v2**)
- **Domain:** Intelligence · **Kind (if adopted):** State

**Question.** Should a plan be a first-class durable State contract, or is it
sufficiently captured by composition?

**Why it might be needed.** A plan that spans many steps, days, or revisions may need a
durable identity to be tracked, resumed, and compared against outcomes — something a
single inference record does not obviously provide.

**Why deferred.** In v1 a plan is fully composed from existing contracts: its
**provenance** is an `InferenceRecord` (the recorded planning run) and its **executable
residue**, once acted, is `Action`s in Execution. The `Planner` produces *intent*; the
`Agent` binds and records it. No durable `Plan`/`PlanRecord` object is needed until
plan-tracking across time proves that composition insufficient. Adding it later is purely
additive under Article X.

**Leading option.** Introduce `PlanRecord` as an Intelligence-domain State contract in a
later version, referencing the `InferenceRecord`(s) that produced it and the `Goal`(s) it
serves, and linked to the `Action`s that execute it — *only if* `InferenceRecord` +
`Action` prove unable to reconstruct or track plans.

**Decision owner:** reviewer (architecture). **Resolution:** explicit accept/reject when
a concrete plan-tracking need appears.

---

## AD-3 — Re-promotion of `Reflector` to a contract

- **Status:** Open · **Raised:** Phase 3b, Intelligence domain review · **Revisit at:**
  if reflection ever needs durable first-class state (no earlier than **v2**)
- **Domain:** Intelligence · **Kind (if adopted):** Service (and possibly a companion State)

**Question.** Should reflection be a kernel contract (`Reflector`), or remain composed
behavior?

**Why it might be needed.** If reflection grows to need durable, first-class state — for
example a persistent backlog of "open questions" or "unresolved expectation gaps" that is
neither a Belief nor a Prediction — a dedicated contract may earn its place.

**Why deferred / current decision.** The Intelligence review **removed** `Reflector`:
reflection is composed behavior, not a new kind of thinking. The `Scheduler` triggers the
`Reasoner` over a `Prediction`↔`Observation` gap, producing belief revisions and an
`InferenceRecord` like any other reasoning (`RUNTIME_LOOP.md` §11). It owned no unique
state and was a leaf in the dependency graph, so removal cost nothing structurally.

**Leading option.** Keep reflection as composed behavior. Re-promote `Reflector` (and any
companion State) only when a concrete durable-reflection-state need appears that cannot be
modelled as a Belief/Prediction.

**Decision owner:** reviewer (architecture). **Resolution:** explicit accept/reject if a
durable reflection-state need materializes.
