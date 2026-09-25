# Capability — Contract Specification

```
Contract:   Capability
Domain:     Execution
Kind:       Service
Version:    v1
Status:     Draft
Depends on: Action, Policy
```

> A Capability is the boundary through which Orb reaches the world. It is the
> mirror of `Sensor`: where a Sensor is the only ingress from Reality, a
> Capability is the only egress to it. See `../docs/CAPABILITY_MODEL.md` and
> `../docs/AGENT_RUNTIME.md`.

**Why a permanent kernel contract?** Because it is the *only* path by which Orb
affects anything outside its own derivation, and a boundary that narrow must be
declared, permissioned and recorded **by contract** rather than by convention.
Fixing "how Orb touches the world" as a permanent obligation — declare your
effects honestly, never exceed them, never authorize yourself, record every
invocation — is what stops power from accumulating quietly in implementation.
The *implementations* (message, payment, calendar, alarm) are replaceable; the
boundary is not. It is also the enforcement point for Art. VII: human agency is
not a feeling about the system, it is a property of this contract.

---

## 1. Semantics

A **Capability** is a Service that exposes a permissioned ability to affect the
Reality Plane. It declares what it does, what that costs, and whether it can be
undone; it performs that and nothing else; and every invocation becomes history.

A Capability is reasoned about **by its declaration, not by its
implementation**. The runtime and the human decide whether to allow an effect by
reading what the Capability says it will do. A declaration that understates its
effects is therefore not a documentation defect — it is a breach of the contract,
because it invalidates every authorization ever granted against it.

**A Capability never authorizes itself.** It declares *consequence*; `Policy`
declares *permission*; the `Agent` binds intent to a Capability and gates it. A
Capability that consulted Policy would be both subject and judge, and Art. VI §25
would collapse into a single component holding power and the rule governing it.

A Capability owns no truth (Art. VI §26). It reads the Knowledge Plane and
writes back only by producing new observations.

---

## 2. Lifecycle

1. **Declaration.** A Capability is registered with the runtime, declaring its
   stable identity, its effects, its permission tier, its reversibility, and what
   it records. **The declaration is frozen at registration.**
2. **Availability.** It is available when its preconditions hold — a local
   implementation present, a device reachable, a remote service responding.
   Availability is a fact about the world; it is never a permission decision.
3. **Invocation.** Bound by an `Agent` and gated by `Policy`, it is invoked with
   inputs traceable to history. It performs the declared effect and produces an
   `Action`.
4. **Retirement.** A Capability may be retired. Past Actions it produced remain
   permanent history, and remain explainable against the declaration in force
   when they were authorized.

---

## 3. State transitions

As a Service, a Capability has operational states owned by the runtime:

```
registered ──▶ available ──invoke──▶ invoking ──▶ available
                   │                     │
                   │                     └──(effect issued, outcome unknown)──▶ available
                   │
                   ├──(precondition lost: offline, device absent)──▶ unavailable ──▶ available
                   └──retire──▶ retired   (past Actions persist; no new invocations)
```

- `unavailable` is **not** `denied`. Unavailability is a fact about the world;
  denial is a decision by `Policy`. Conflating them would let a network outage
  read as a permission change, or worse, the reverse.
- No state exists in which a Capability performs an undeclared effect. There is
  no "degraded" mode that does something adjacent to what was authorized.

---

## 4. Invariants

1. **Only path to Reality.** The runtime affects the world only through a
   Capability. Anything else is a defect, not an optimisation.
2. **Declares honestly and completely.** An effect not declared is a breach. A
   Capability does only what it declared and never more.
3. **Never self-escalates.** Capabilities compose, but composition confers no
   permission: a composite is authorized at the highest tier it reaches, never at
   the lowest it passes through.
4. **Never authorizes itself.** Permission is decided outside it, always.
5. **Local-first.** Every *core* capability has a local implementation; remote
   ones are optional extensions and never a hard dependency of the core loop
   (Art. VIII §31).
6. **Never silent.** Every invocation produces an `Action`, including one that
   failed or was refused by the world.
7. **Issuance is not effect.** A Capability never reports that reality changed.
   It reports that it issued something. Reality is updated only when a `Sensor`
   observes the result (Art. XI §42).
8. **Owns no truth.** It holds no source-of-truth state.

Upholds Constitution Articles VI (The Three Planes), VII (Capabilities and Human
Agency), VIII §31 (local-first), and XI §42 (reality only through observation).

---

## 5. Versioning rules

- **New Capabilities** are added freely; each is a new Service, never a change to
  an existing one.
- **A declaration is frozen once registered.** Narrowing effects, lowering a
  tier, or widening what a Capability may do all require a **new Capability**,
  not a revision of the old.

  This is the sharpest versioning rule in the kernel and it exists for one
  reason: authorization is granted *against a declaration*. If a declaration
  could widen, every authorization ever given would silently come to cover more
  than the human agreed to. A permission system whose subject can change shape is
  not a permission system.
- The Capability obligation — *declared, permissioned, non-self-authorizing,
  recorded* — is frozen at v1. Anything weaker is a different, versioned
  contract, not a mutation of this one.
- An implementation may be rewritten or replaced at any time without affecting
  the contract or the Actions it has already produced.

---

## 6. Compatibility guarantees

Consumers may permanently rely on:

- A Capability does only what its declaration says, and the declaration it was
  authorized under is permanently recoverable.
- Every invocation is recorded as an `Action`, attributable and explainable.
- Retiring or replacing a Capability never alters or invalidates its past
  Actions.
- No Capability acquires permission by composition, by upgrade, or by its own
  decision.

Not guaranteed:

- **Success.** The world may refuse. That is recorded, not hidden.
- **Availability.** A Capability may be unavailable indefinitely.
- **Timeliness.** Nothing is live (Art. V §20); an effect may be issued long
  after it was authorized, subject to the authorization still being valid.
- **Knowledge of outcome.** See §7.

---

## 7. Failure modes

- **Unavailable.** The Capability is not invoked; the attempt is recorded and
  retried later under the runtime's schedule. It never fabricates success.
- **Refused by the world.** The effect did not happen and the world said so. This
  is a *known* negative and is recorded as such; it is safe to retry.
- **Issued, outcome unknown.** The effect may or may not have happened. **This is
  categorically different from failure and must never be recorded as one.**
  Treating an unknown as a failure and retrying is how a system sends a message
  twice or pays twice. It is resolved only by a `Sensor` confirming, or by an
  idempotency guarantee the Capability declared (`Action` §4).
- **Partial effect.** A Capability that can partially succeed must declare that
  it can, and record what was and was not done. A Capability that cannot express
  partial success must be atomic; silently completing half of a declared effect
  is a breach.
- **Authorization revoked mid-flight.** An effect not yet issued is abandoned and
  recorded as abandoned. One already issued stands: it is history, and history is
  not undone by a later decision. A reversal, if the Capability is reversible, is
  a **new** Action.
- **Permission withdrawn by the user.** The Capability stops. Past Actions are
  untouched; the withdrawal itself is recorded.

Never permitted: an undeclared effect; a silent invocation; self-escalation;
reporting that reality changed; recording an unknown outcome as a known one.

---

## 8. Examples

- **Send a message.** Declares: an external message, irreversible, tier *Act
  (irreversible)*, records a send Action. It is authorized per scope. Delivery is
  confirmed later by a Sensor; the Action alone never means "John received it."
- **Create a draft event.** Declares a reversible calendar effect at tier *Act
  (reversible)*, and declares how to undo it. A lower tier because the
  consequence is lower — the tier follows the consequence, not the convenience.
- **Read location.** A Capability at tier *Observe*. Reads are capabilities too:
  they leave the device's boundary and carry real privacy cost, and pretending
  otherwise is how read access becomes invisible.
- **Place an order.** Irreversible and financial, so human confirmation by
  default. Art. XI §42 applies literally: the order is never assumed filled; the
  position changes only when the exchange confirms.
- **Raise a fall alarm.** Irreversible — it calls a person. It may be invoked
  without a prompt answered *in the moment* only under a standing authorization
  the user gave in advance (`Policy` §1), because the person it protects may be
  unable to answer. The Capability does not decide this; Policy does.
- **A composite that escalates.** "Summarise my week and send it" reaches a
  send. It is authorized as a send — irreversible — not as a summary. Composition
  never launders a tier.
