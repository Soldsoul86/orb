# Domain Integrity Report — 5. Execution

> Phase 3b architectural review. The Execution domain answers: **how does Orb
> affect the world, and who says it may?** **Status: Accepted 2026-09-28** — one
> operator ruling taken, one kernel correction applied, four amendments made.
> Specs: `../../contracts/{Capability,Action,Policy}.md` — 1 Service, 2 State.
> **Addendum 2026-09-29:** `Scheduler` and `Agent` reviewed and **Accepted** —
> the domain is now **5 of 5 Accepted**. Verdict at foot.

---

## Architectural principle adopted

**The boundary is permanent; everything that crosses it is replaceable.**

Three contracts, three separate powers, and the separation is the design:

- **`Capability` declares consequence.** What an effect does, what it costs, whether
  it can be undone. Frozen at registration.
- **`Policy` declares permission.** What may be done, by whom, under what
  authorization. Data, never a process.
- **`Action` records issuance.** That Orb *attempted*, under which authorization,
  at what causal time. Never that the world changed.

A Capability that consulted Policy would be subject and judge at once. An Action
that asserted effect would make Art. XI §42 unenforceable. The three are separate so
that no single component holds both a power and the rule governing it — Art. VI §25
made structural rather than aspirational.

---

## The ruling this domain waited on

`Policy.md` §1 could not be accepted while it rested on an unruled reading of
Art. VII §28, and the contract said so about itself: *"This is stated so that it can
be rejected rather than assumed."* `CLAIMS.md` §5 Ruling 1 had been open since the
claim was written.

**Ruled 2026-09-28 by the operator:**

> **Standing authorization is available only where waiting would defeat the action's
> purpose.**

So §28 constrains the **quality** of consent rather than its timing — and the
licence that gives is narrow. A standing authorization must carry the argument for
why a prompt could not be answered in time, and that argument is part of what is
authorized (`Policy.md` §4.10). One without it is **void**, the same treatment as a
rule purporting to lower a constitutional floor.

**The cost was raised before the ruling and accepted with it.** A daily payment
budget is not licensed by being scoped, bounded and revocable. It qualifies only
where the payment sits on a path that cannot stop for a human — an autonomous agent
paying per request — and not where asking would merely be tedious. `Policy.md` §8's
payment example was amended rather than left to imply the looser reading.

The 2026-09-26 erasure ruling is now a **consequence** of the general rule rather
than an exception to an open question: erasure has no urgency case, so it is
authorized contemporaneously or not at all.

---

## Findings and what was done

| # | Finding | Resolution |
| --- | --- | --- |
| 1 | `Policy.md` rested on an unruled reading of Art. VII §28 | Operator ruled; §1 and §4.10 amended |
| 2 | `KERNEL.md` carried two **State→Service** edges, closing a `Capability → Action → Capability` cycle against Art. X §40 | `KERNEL.md` corrected; **AD-5 closed** |
| 3 | `Action.md` silently resolved a conflict between Art. VII §29 and Art. XI §41 | Tension named in §1, reading stated with its reasons, offered for rejection |
| 4 | DR-5's gateway chain was Decided and absent from both contracts it named | `Action.md` §4a and `Capability.md` §4.10; **DR-5 discharged** |
| 5 | `Action.md` §4.3 referenced an authorization `Policy.md` never defined | Authorization record specified in `Policy.md` §1, with a derived identity |
| 6 | A Service obligation sat in a State contract's invariants | Moved from `Action.md` §4.4 to `Capability.md` §4.9 |
| 7 | `device-watch` reads 484 packages outside the Capability boundary | Example in `Capability.md` §8; **AD-7 opened** |

### On finding 3 — a conflict inside the Constitution

Art. VII §29: *"An action, once taken, is appended to history **as a new
observation**."* Art. XI §41: *"the issuance of an Action [is] runtime activity
recorded as Events — they are not, in themselves, Observations."* Both cannot be
literal.

`Action.md` had picked §41 and cited it without noting that §29 says otherwise. The
pick is right — §41 is more specific and later; §42's loop is vacuous if issuance
were itself an Observation, since an Action would then update reality by existing;
and §43 gives every Observation a Confidence of Reality, which an issuance has no
honest value for. But **a contract must not settle a constitutional conflict
quietly**, so the tension is now named and the reading offered for rejection.

**If review holds §29 is literal, the Constitution needs an amendment** — not this
contract a different reading.

### On finding 5 — an identity that must be derived

`Policy.md` §1 now requires an authorization's identity to be **derived from what it
authorizes, never minted at the moment of use**, so that replay yields the same
identity and every citation of it stays valid.

That requirement came from the device loop rather than from theory. `device-watch`
mints alert ids at raise time, and on 2026-09-28 a replay into a fresh journal
produced new ids twice, dangling every prior answer (`DEVICE_LOOP.md` §7b3). The
same defect in an authorization would strand the record of what a person had
permitted. Forbidding it in a specification costs a sentence; repairing it in a
journal costs the journal.

---

## What this domain still owes

- ~~**`Scheduler` and `Agent` have no specifications.**~~ **Written 2026-09-28,
  Draft.** The domain is complete in coverage and not in acceptance.
- **`Decision` is referenced as a non-contract** (`Policy.md` §1, a transition
  rather than State). That is consistent with `KERNEL.md`'s Contract Kinds, and it
  means the thing that *evaluates* policy is specified nowhere. Deliberate, and
  worth confirming at the `Agent` specification rather than before it.
- **AD-7 is open**: an existing read that belongs behind `Capability` and is not.
- **Ruling 2 remains open** — how narrowly C1 is stated. It does not bear on this
  domain; it was cited by DR-5 by mistake, and that citation is corrected.

---

## Phase position

Nine contracts were Accepted before this review; twelve are now. Fourteen remain
Draft and **seven have no specification at all** — `Journal`, `Storage`,
`Synchronization`, `ModelRouter`, `Encryption`, `Scheduler`, `Agent`.

The Phase 3b gate is *every* contract specification accepted, so accepting Execution
does not open Phase 3c. It does mean the three contracts that govern effect are no
longer the thing blocking the runtime from acting — which was their status for the
whole of the device loop, and is why they were reviewed first.


---

## Addendum — `Scheduler` and `Agent` drafted, 2026-09-28

Written after the three above were accepted, against `KERNEL.md`'s entries,
`RUNTIME_LOOP.md` §5–§10 and `AGENT_RUNTIME.md` §3, §7. **Both are Draft and neither
has been reviewed by anyone but their author**, which is the whole point of the
status: the three accepted above changed on review, and there is no reason to think
these two would not.

**The spine of `Scheduler`** is that its queue is a **projection, not a record**. It
owns no durable state; what is pending is derived from history. A queue that were
itself the source of truth would make losing the queue mean losing the work, and
Art. IX §33 forbids the second source needed to avoid that. Three distinctions carry
the rest: `saturated` is not failing, `constrained` is not `stopped`, and a retry
re-attempts transport and never re-authorizes.

**The spine of `Agent`** is four verbs with four owners — the `Planner` decides, the
**Agent binds**, `Policy` permits, the `Capability` acts. The Agent exists because
the Planner leaves the binding undone on purpose (Art. VI §25), and because putting
it anywhere else collapses the separation: in the Planner, interpretation acquires
power; in the Capability, the actor picks its own authorization.

Its sharpest invariant is §4.5 — **an Agent never routes around a denial.** Not by
retrying, not by finding a lower-tier path, not by decomposing an effect into parts
that each pass. `Capability.md` §4.3 forbids self-escalation by composition, and the
Agent is where that laundering would be easiest to do by accident.

### A contradiction found while writing them

`AGENT_RUNTIME.md` §7.4 read *"The Action's occurrence and outcome are appended to
the journal as new **Observation** events"*, and §8.7 *"Every Action is recorded back
as an Observation."* Both carry the Art. VII §29 reading that `Action.md` §1 examined
and rejected the same day in favour of Art. XI §41.

Corrected rather than left to diverge: the **issuance** is an Event; the **outcome**,
if the world ever reveals one, is a separate Observation from a `Sensor`. A
`SETTLED.md` row records the old wording so it cannot return later looking like a
fix.

### What a reviewer should challenge — adjudicated 2026-09-29

1. **`Scheduler` depends on `Agent` and `Policy`** per `KERNEL.md`, and the draft
   keeps both. But the contract states that the scheduler never consults permission
   — so what is the `Policy` edge *for*? Either it is scheduling-relevant policy
   (rate limits, quiet hours) and the contract should say so, or the edge is wrong
   and should go the way AD-5's two went. **The draft does not resolve this**, and
   should not have quietly dropped the edge either.
2. **Starvation legibility** (§7) is asserted as an obligation without a mechanism.
   *A reader must be able to tell deferred-for-an-hour from deferred-for-a-month* is
   right, and nothing in the contract says how that is derivable.
3. **`Agent` §7's unbindable intent** invents a record type the kernel does not
   name. It may belong in `InferenceRecord` or `Action`, or it may be its own thing.
4. **Whether `Scheduler` and `Agent` should be one contract.** They are drafted as
   two because §21 separates who wakes from who works, but a reviewer who thinks the
   kernel should get smaller rather than larger is entitled to ask.

### Review verdict — `Scheduler` and `Agent`, 2026-09-29: ACCEPTED

Both faithful to `KERNEL.md` and Articles V, VI §25–26, VII and IX §33, and both
backed by device evidence — `device-watch` is a stateless, history-derived,
Agent-shaped loop and pass-1/pass-2's cadence-from-`lastOfType` is a degenerate
scheduler with no durable queue. The four challenges:

1. **`Scheduler → Policy` — dropped (operator ruling, 2026-09-29).** `Policy` is State
   that *never schedules* and the `Scheduler` *never consults permission*, so the edge
   joined two contracts that each disclaim it — the AD-5 / DR-9 shape. `KERNEL.md` and
   `Scheduler.md` now read **`Depends on: Agent`**, with the correction noted in both.
   Policy is referenced by value where read at all, never as an edge.
2. **Starvation legibility — mechanism named.** `Scheduler.md` §7 now states it: because
   the queue is a projection, a pending task's age is `now` minus the triggering event's
   timestamp in history — read like the cadence reads `lastOfType`, no wait-counter. The
   obligation now carries its derivation.
3. **Unbindable record — resolved, and it exists.** `RECORDS.md` §3 places it as its own
   type `orb.intent.unbindable` (not `InferenceRecord` — the reasoning already happened;
   not `Action` — no Capability was invoked), implemented in `unbindable.ts`. `Agent.md`
   §7 already states it correctly. *Could not bind* is not *chose not to act*.
4. **One contract or two — two.** Art. V §21 (*no agent wakes or schedules itself*) **is**
   the who-wakes / who-works split; merging them would put scheduling inside the worker,
   which §21 forbids. The separation is the enforcement, not an accident — kept.

Reciprocal from the `Synchronization` review discharged: `Scheduler.md` §5/§8 now name
sync as maintenance work whose *when* the scheduler owns, carried through an `Agent` so
no dependency is added.

**With these, all five Execution contracts are Accepted — the domain is complete.**
Kernel-wide: 19 Accepted / 11 Draft.