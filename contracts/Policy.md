# Policy — Contract Specification

```
Contract:   Policy
Domain:     Execution
Kind:       State
Version:    v1
Status:     Draft
Depends on: Event
```

> A Policy is human agency written down as data, so that it survives every
> change of model, capability and implementation beneath it. See
> `../docs/CAPABILITY_MODEL.md` §5 and `../docs/SECURITY.md` §6.

**Why a permanent kernel contract?** Because if the rules governing irreversible
effect lived in implementation, then every model swap, capability rewrite or
refactor could silently change what Orb is permitted to do to the world — and
nobody would be able to tell, afterwards, what the rule had been at the moment it
mattered. Freezing "the rules are declarative, scoped, auditable, and evaluated
deterministically" is precisely what keeps Art. VII §28 enforceable across
decades of churn in everything below it. Policy is the contract that makes human
control a property of the architecture rather than a promise about the code.

> **Attribution note (v1 design).** Policy rules name Capabilities by **identity
> and tier — values, not a kernel dependency**. As with `Action`, this keeps the
> kernel a DAG under Art. X §40 (*a State contract never depends on a Service*).
> `KERNEL.md` currently lists `Capability` as this contract's dependency; that
> edge is State→Service and cannot stand — see
> `../docs/ARCHITECTURAL_DEBT.md` AD-5.

---

## 1. Semantics

A **Policy** is a declarative, immutable record of the rules governing what may
be done, by whom, and under what authorization.

Policy is **data, not a process**. It does not act, does not decide when to run,
and holds no power of its own. *Evaluating* policy against a proposed effect is a
transition — and, like `Decision`, a transition is not a kernel contract
(`KERNEL.md` §Contract Kinds). What is kept is the policy itself and the
**authorization** its evaluation produced, both as State.

Two boundaries define what Policy is *not*:

- **Policy narrows; it never grants.** It cannot authorize an effect a Capability
  did not declare. Permission is always a subset of declared consequence.
- **Policy cannot lower a constitutional floor.** No rule can make an
  irreversible action ambient, make an authorization blanket, or remove the
  recording of an Action. A policy that appears to do so is void, not
  overriding.

### Standing authorization

Authorization given **in advance** — naming the capability, the scope, the
triggering condition, and the window in which it applies — and revocable at any
time.

This exists because the alternative makes an entire class of protection
impossible. A person who has fallen cannot confirm a prompt. The pattern that
works, and the one Orb must be able to express, is *ask, then act on silence*.
That requires consent to have been given **earlier**, not waived in the moment.

Art. VII §28 requires irreversible actions to have "explicit, scoped
authorization by default". A standing authorization is explicit and it is scoped;
what differs is only *when* the human decided. The reading this contract rests
on is therefore that §28 constrains the **quality** of consent, not its timing.
**This is stated so that it can be rejected rather than assumed** — if review
holds that §28 requires contemporaneous consent, then safety actions of this kind
are outside Orb's reach and should be said to be, rather than smuggled in under a
looser reading later.

A standing authorization is not a weaker authorization. It carries *more*
obligations than a prompt: its condition and window are fixed in advance, it is
revocable at any moment, its every use is recorded, and it expires.

---

## 2. Lifecycle

1. **Proposal.** A rule is expressed. Nothing is in force yet.
2. **In force.** The Policy is appended to the journal and governs from that
   point. It is never edited.
3. **Supersession.** A later version is appended. The earlier Policy remains
   permanently readable, because Actions authorized under it must stay
   explainable forever (`Action` §6).
4. **Revocation.** A Policy or a standing authorization is withdrawn. Revocation
   takes effect immediately and is itself recorded. It **never** invalidates past
   Actions: those were authorized when they were issued, and history does not
   change retroactively.

---

## 3. State transitions

A Policy is immutable State. Its only transition is into force:

```
(proposed) ──append──▶ (in force, immutable, forever)
                            │
                            ├──superseded by a later version──▶ still readable, no longer governing
                            └──revoked────────────────────────▶ still readable, no longer governing
```

"Superseded" and "revoked" describe the *governing set*, not the record. The
record never changes. Asking "what governed this Action?" must be answerable from
history alone, at any distance in time.

---

## 4. Invariants

1. **Declarative.** Policy is data; it never acts and never schedules.
2. **Immutable and append-only.** A change is a new version. Editing a rule
   would rewrite what the user had agreed to (Art. I).
3. **Narrows, never grants.** It cannot authorize an undeclared effect.
4. **Never lowers a constitutional floor.** A rule that purports to is void.
5. **Scoped, never blanket.** Authorization for one scope is never authorization
   for another. A budget for one purpose is not a budget for a different one.
6. **Irreversible and financial default to explicit human authorization**
   (Art. VII §28), whether contemporaneous or standing.
7. **Evaluation is pure and total.** The same request, the same policy and the
   same recorded context yield the same decision **and the same explanation**,
   forever. This is what makes an authorization replayable (Art. II §9–10) rather
   than merely logged.
8. **Explained, always.** Every authorization and every denial records its
   reason. A denial without a reason is indistinguishable from a bug.
9. **Revocation is immediate, recorded, and not retroactive.**

Upholds Constitution Articles I (History), II §9–10 (recomputable,
explainable), VII (Capabilities and Human Agency), and VIII §30 (the user is the
root of trust).

---

## 5. Versioning rules

- **New rule kinds** are added freely; each is versioned, and existing kinds
  never change meaning. A rule that meant one thing when consent was given must
  mean that same thing when the consent is later read.
- The core obligations — *declarative, scoped, narrowing, deterministic,
  explained* — are frozen at v1. Weakening any of them requires `Policy v2`
  alongside v1.
- Older policies remain valid and readable forever, whether or not they still
  govern.

---

## 6. Compatibility guarantees

Consumers may permanently rely on:

- The rule that governed any past Action is recoverable, and evaluating it again
  over the same recorded context yields the same decision and explanation.
- Authorization is always scoped and always explained.
- Revocation is immediate and never rewrites the past.

Not guaranteed:

- **That a policy in force today governs tomorrow.** The user may change it at
  any time; that is the point.
- **That evaluation is fast**, only that it is deterministic and terminates.
- **That a policy is satisfiable.** A set of rules may deny everything. That is a
  legitimate configuration, not a fault.

---

## 7. Failure modes

- **Policy absent, unreadable, or corrupt → deny.** **Fail closed, always.** This
  is the most important rule in this contract. A system that acts when it cannot
  read its own constraints has no constraints, and the failure would appear
  exactly when something was already wrong.
- **Conflicting rules.** The most restrictive wins, and the conflict is recorded
  so it can be resolved deliberately rather than by evaluation order.
- **Ambiguous scope.** Treated as out of scope, therefore denied. A scope that
  must be guessed was never explicit, and §4.5 requires explicit.
- **Standing authorization expired.** Denied, and the user is asked. Elapsed time
  is not consent.
- **Revoked between authorizing and issuing.** The Action is not issued and the
  lapse is recorded (`Action` §7). An already-issued Action stands.
- **Evaluation itself fails.** Deny, and record the failure as the reason. An
  evaluator that cannot decide has decided no.

Never permitted: failing open; blanket authorization; authorizing an undeclared
effect; silently widening a scope; an unexplained decision; retroactive
revocation.

---

## 8. Examples

- **Contemporaneous consent.** "Sending a message requires my confirmation."
  Every send prompts. Confirming one send authorizes that send and no other.
- **Standing, scoped, bounded.** "Up to ₹500 per day to payees I have already
  paid, without asking." Explicit, scoped by amount, window and counterparty,
  revocable, and every use recorded. A reference implementation of exactly this
  shape exists outside the repository as `@allowance/policy`'s `WINDOW_BUDGET`
  and `APPROVAL_THRESHOLD` (`CAPABILITY_MODEL.md` §5).
- **Ask, then act on silence.** "If a high-impact event is followed by five
  minutes without motion, ask me. If I do not answer within sixty seconds, call
  my emergency contact." The silence window is part of what was authorized, and
  the authorization was given while the user could give it. This is the case that
  makes §1's standing authorization necessary rather than convenient.
- **A scope is not a neighbouring scope.** A standing authorization to message
  one person is not authorization to message their household, however reasonable
  the inference. Evaluation does not generalise.
- **A void rule.** "Treat sending money as ambient." Financial effects are
  irreversible-tier by constitutional floor; the rule does not lower it, it is
  simply void, and recorded as void rather than silently ignored.
- **Revocation.** The standing payment authorization is withdrawn at noon. A
  payment issued at 11:59 stands and remains explainable against the policy that
  governed it. One not yet issued at 12:00 is denied.
