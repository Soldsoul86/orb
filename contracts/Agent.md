# Agent — Contract Specification

```
Contract:   Agent
Domain:     Execution
Kind:       Service
Version:    v1
Status:     Draft
Depends on: Scheduler, Reasoner, Planner, Capability
```

> An Agent is the worker that carries an intent to the gate. It binds what the
> `Planner` deliberately left unbound, and it owns nothing. See
> `../docs/AGENT_RUNTIME.md` §3, §7 and `../docs/RUNTIME_LOOP.md`.

**Why a permanent kernel contract?** Because one step in the loop has nowhere else
to live. A `Planner` produces **intent** — interpretation, explainable, and with no
power. A `Capability` holds power and may not authorize itself. `Policy` permits but
does not act. The step between them — *bind this intent to that concrete Capability
and carry it through the gate* — is left undone by the Planner on purpose (Art. VI
§25), and putting it anywhere else collapses the separation the Execution domain
exists to keep. In the Planner, interpretation acquires the power to act. In the
Capability, the actor chooses its own authorization. The Agent is that seam, held by
a component that owns no state, so the seam can be restarted, replayed, and audited
by anyone reading history.

---

## 1. Semantics

An **Agent** is a Service that advances loop stages under the `Scheduler`'s
direction.

It is **stateless with respect to truth**. Anything an Agent "remembers" lives in the
journal as events and in projections; an Agent restarted loses nothing (Art. V §22).
There is no private store, no cache of conclusions, and no `Memory` contract — memory
is an emergent property of the Knowledge Plane, not a kernel type.

**An Agent binds. It does not decide, and it does not act.** Four verbs, four owners,
and the contract exists to keep them apart:

| | owns |
| --- | --- |
| **decide** | `Planner` — produces an explainable intent |
| **bind** | **`Agent`** — intent → a concrete Capability |
| **permit** | `Policy` — evaluated against the bound effect |
| **act** | `Capability` — the only path to Reality |

An Agent reads the Knowledge Plane — journal, Evidence Graph, Twin — plus the
`Retriever` for relevance. It produces Events. It never asserts that reality changed;
that is `Action.md` §1 and Art. XI §42, and an Agent is the component most tempted to
forget it, because it is the one that watched the effect leave.

---

## 2. Lifecycle

1. **Registration.** An Agent is registered with the runtime, declaring the stages it
   can advance.
2. **Dispatch.** The `Scheduler` — never the Agent — decides when it runs. *Agents do
   not wake randomly* (Art. V §21).
3. **Reading.** It reads what it needs from history and projections. It holds
   nothing across dispatches.
4. **Binding and gating.** Where the work reaches an effect, it binds the intent to a
   concrete `Capability` and submits the bound effect to `Policy`. It does not
   evaluate Policy itself.
5. **Production.** It appends Events — including the record that it was denied, or
   could not bind, or found nothing to do.
6. **Return.** It holds nothing. A subsequent dispatch begins from history again.

---

## 3. State transitions

```
registered ──dispatch──▶ working ──▶ registered
                            │
                            ├──restart mid-work──▶ registered   (loses nothing)
                            │
                            └──retire──▶ retired  (past Events persist)
```

There is no `remembering` state, no `resuming from memory`, and no partial state
carried between dispatches. **A restart mid-work is not a recovery path; it is the
ordinary path taken at an unusual moment.** The Agent re-reads history and repeats,
which is safe because every stage is idempotent with respect to its input events
(`RUNTIME_LOOP.md` §10) and because an `Action` binds to its triggering decision
(`Action.md` §4.4).

---

## 4. Invariants

1. **Owns no durable state.** All memory is events and projections. An Agent
   restarted loses nothing (Art. V §22).
2. **Never wakes itself.** Dispatch belongs to the `Scheduler` (Art. V §21).
3. **Restartable without loss**, at any point, including mid-effect.
4. **Binds, and never skips the gate.** Every effect it reaches is submitted to
   `Policy` before invocation. There is no path from intent to Capability that does
   not pass through permission.
5. **Never authorizes.** It does not evaluate Policy, does not interpret a denial,
   and does not construct an alternative route to a denied effect. **A denial that an
   Agent works around is self-escalation with extra steps** — the invariant
   `Capability.md` §4.3 forbids, arriving through the component that composes rather
   than the one that acts.
6. **Reads through the Knowledge Plane and the `Retriever`.** Never a private store.
7. **Produces Events, never asserts effect.** An issued Action means Orb attempted.
   Reality is updated only when a `Sensor` observes (Art. XI §42).
8. **Model-independent.** No provider is hardcoded; `Reasoner`s are injected, and a
   local Reasoner is always viable (Art. III, Art. VIII §31).
9. **Never silent.** A dispatch that bound nothing, was denied, or found nothing to
   do produces a record saying so (Art. VII §29).

Upholds Constitution Articles III (Models), V §21–§22 (runtime owns execution;
agents own no state), VI §25–§26 (only the Execution Plane acts; it holds no truth),
VII (human agency), and XI §42.

---

## 5. Versioning rules

- **New Agents** are added freely; each is a new Service, never a revision of an
  existing one.
- **New stages an Agent may advance** are added freely.
- The core obligation — *stateless, runtime-scheduled, binds-and-gates,
  never-authorizes, never-silent* — is frozen at v1. Weakening any of it requires
  `Agent v2` alongside v1.
- An implementation may be replaced at any time. The Events it produced remain
  permanent history and stay explainable against the `Capability` declaration and
  `Policy` version they name.

---

## 6. Compatibility guarantees

Consumers may permanently rely on:

- An Agent restarted loses nothing, and repeating its work does not double an
  effect.
- Every effect an Agent reached passed through `Policy`, and the authorization is
  recoverable.
- Every dispatch produced a record, including the ones that did nothing.
- No Agent acquired permission by composing, retrying, or deciding.

Not guaranteed:

- **Completion.** An Agent may be interrupted at any point; that is normal.
- **That two Agents see the same history.** Replication is partial and eventual
  (`PARTIAL_REPLICATION.md`); two Agents on two devices may legitimately bind
  different work at the same moment.
- **That an intent can be bound at all.** See §7.
- **Interpretation stability.** A different `Reasoner` may interpret differently;
  history is untouched by the swap (Art. III).

---

## 7. Failure modes

- **Restart mid-work.** Repeats from history. Safe by idempotency; the partial work
  is either already recorded or was never recorded, and there is no third case
  because the Agent held nothing.
- **Intent cannot be bound.** No Capability matches what the Planner asked for. This
  is **recorded as unbindable, with the intent**, on its own Event type —
  `orb.intent.unbindable`, which is neither an `InferenceRecord` (no reasoning
  happened here) nor an `Action` (no Capability was invoked), but a record that a
  *binding did not exist* (`../docs/reviews/RECORDS.md` §3). It is a finding rather
  than an error: the runtime was asked for something Orb cannot do, and that is worth knowing
  about the plan, the capability set, or both. Silently dropping it would delete the
  only evidence that the gap exists.
- **Policy denies.** Recorded with the reason (`Policy.md` §4.8). **The Agent stops.**
  It does not retry, does not seek a lower-tier route to the same effect, and does not
  decompose the effect into parts that each pass. Composition never launders a tier
  (`Capability.md` §4.3), and an Agent is where that laundering would be easiest.
- **Capability unavailable.** Not a denial (`Capability.md` §3). The attempt is
  recorded and the `Scheduler` retries later. An Agent that treated unavailability as
  refusal would let a network outage read as a permission change.
- **Issued, outcome unknown.** The Agent does not resolve it. It records the issuance
  and stops; resolution belongs to a `Sensor` observing, or to the idempotency
  guarantee the Capability declared (`Action.md` §7). **An Agent that retried here
  would be the component that pays twice.**
- **Reasoner unavailable.** A local Reasoner is always a viable option, so this
  degrades interpretation quality rather than stopping the loop. A remote-only
  dependency in the core loop is a defect (Art. VIII §31).
- **Authorization revoked mid-flight.** An effect not yet issued is abandoned and
  recorded as abandoned. One already issued stands — history is not undone by a later
  decision (`Capability.md` §7).

Never permitted: waking itself; holding state across dispatches; reaching a
Capability without passing `Policy`; routing around a denial; retrying an unknown
outcome; asserting that reality changed.

---

## 8. Examples

- **The fall alarm, bound and gated.** A Planner's intent — *the person may need
  help* — is bound by the Agent to the call Capability and submitted to Policy, which
  holds a standing authorization with a silence window. If the window has not elapsed,
  the Agent does not act; it records that it did not. The authorization was given
  earlier because waiting would defeat the purpose (`Policy.md` §1, ruled
  2026-09-28).
- **A denial that is not routed around.** "Send this summary" is denied because the
  recipient is outside the authorized scope. The Agent records the denial and stops.
  It does not send to a household member, does not split the message, and does not
  ask a different Capability. Every one of those is the same violation
  (`Capability.md` §4.3).
- **A loop that notices and never acts — what exists today.** `packages/device-watch`
  reads the journal, projects it, raises an alert, and records the person's answer.
  It binds no Capability and gates nothing, because the Execution contracts were
  Draft while it was written. It is an **Agent-shaped loop with the acting half
  absent**, which is exactly what §1's four-verb table predicts a system looks like
  before this contract is implemented (`../docs/DEVICE_LOOP.md` §7b2, DR-8).
- **Recorded as unbindable.** A plan proposes "put this on my work calendar" on a
  device with no calendar Capability registered. The intent is recorded as
  unbindable. Months later that record is the evidence for whether the capability was
  ever worth building.
- **A restart at the worst moment.** The process dies between `Policy` authorizing
  and the `Capability` issuing. Nothing was issued, the authorization is in history,
  and the next dispatch re-derives the same work. If the authorization has since
  expired, it is denied and the lapse recorded — **time passing is not consent**
  (`Policy.md` §7).
