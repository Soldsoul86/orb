# Domain Integrity Report — 5. Execution

> Phase 3b architectural review. The Execution domain answers: **how does Orb
> affect the world, and who says it may?** **Status: Accepted 2026-09-28** — one
> operator ruling taken, one kernel correction applied, four amendments made.
> Specs: `../../contracts/{Capability,Action,Policy}.md` — 1 Service, 2 State.
> `Scheduler` and `Agent` are in this domain and have **no specification yet**.

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

- **`Scheduler` and `Agent` have no specifications.** Both are Execution contracts
  in `KERNEL.md`; neither has a document. The domain is accepted for the three that
  exist, not as complete.
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
