# Design — @orb/payment-policy

## The rule the package exists to enforce

The trade executor is governed by one sentence: *entry may come from the signal
provider, exit authority belongs to the executor*. Once a position is open, no
external party can talk the executor out of its stop.

Rewrite that for money and you get this package:

> A payment may be requested by anyone. **Spend authority belongs to the policy.**

The structural expression of that rule is what `SpendRequest` *does not* carry.
There is no limit field, no threshold, no override flag, no priority, no
"urgent". A request carries facts about itself — who, how much, which asset,
where to, when — and nothing the engine will read as permission. An attacker
who fully controls the request cannot widen their own authority, because there
is no field through which to do it.

## Functional core, imperative shell

`evaluate` is pure and total. No I/O, no clock, no randomness, no mutation of
inputs. Everything that touches the world — fetching the policy, verifying
approval signatures, submitting to a rail, watching for confirmations — lives
outside this package.

This is not stylistic. Constitution Art. I §4 requires that every feature be
replayable from events, and Art. II §9 that interpretation be recomputable. A
decision that consulted a clock or a network could not be re-derived a year
later from the journal; it would have to be *trusted*, which is exactly what
the journal exists to avoid.

Concretely: the instant of evaluation arrives on the request as `requestedAt`,
and every window is measured relative to it. Replaying a decision replays its
time.

## Why amounts are `bigint`

Money is never a `number`. `2000 * 1.005` is `2009.9999999999998`, and a budget
that drifts by a unit per transaction is a budget that leaks. Every amount is
an integer in the asset's base unit — wei, satoshi, paise, cents — and the
engine never converts between assets, because conversion needs a rate, a rate
needs an oracle, and an oracle is a dependency that can be wrong at the worst
possible moment. A budget denominated in one asset constrains that asset alone.

## Why pending money holds its budget

This is the single most important correctness property here, and it is the
direct analogue of the executor's `claimExit`.

If only *settled* spend counted against a limit, ten requests issued in the
same millisecond would each observe an empty budget, each pass, and a daily cap
of $100 would release $1,000. The decision would have been made against state
that another in-flight decision had already changed.

So a `PENDING` entry — signed, broadcast, in a mempool, awaiting confirmations
— consumes exactly as much budget as a `SETTLED` one. Only `REVERSED`, a
payment that provably did not happen, gives its budget back.

`PENDING` exists as a state at all because of Constitution Art. XI §42: an
issued action never updates reality until a sensor confirms it. In a personal
runtime that is an epistemic stance. In payments it is settlement finality, and
getting it wrong is how money gets spent twice.

## Why every rule is evaluated

`evaluate` runs all rules and records all results, then applies precedence —
rather than returning at the first failure. Art. II §10 requires that a decision
be explainable, and a record naming one tripped limit while hiding the four
that passed cannot be audited. It also cannot answer the question an operator
asks immediately after a refusal: *how close were the others?*

Precedence is DENY, then REQUIRES_APPROVAL, then ALLOW; within a tier the first
rule in policy order wins. Rule order is therefore an authoring decision, not
an accident of iteration.

## Why evaluation is idempotent

A request is excluded from its own ledger by `requestId`. Re-evaluating an
in-flight request — after a crash, during reconciliation, on replay — returns
the same answer instead of counting the request against itself. This mirrors
the executor's deterministic client order IDs: the same intent, submitted
twice, must not become two effects.

## Why the policy is hashed

Every decision carries `policyDigest`, a SHA-256 over a canonical serialization
of the policy. A decision that names only a version number is unfalsifiable,
because versions get edited in place. A digest cannot be.

The canonical encoder is `canonicalJson` from `@orb/journal` — reused, not
reimplemented (Art. IX §33). It refuses `bigint`, which is the correct refusal,
so amounts are rendered as decimal strings before hashing.

## Rules are data, not code

`Rule` is a discriminated union rather than an interface with implementations.
A policy is therefore serializable, hashable, journallable and replayable, and
adding a rule kind is an addition to a type — after which the compiler names
every place that must handle it. Art. X §37: the kernel evolves through
addition, never mutation.

The vocabulary is deliberately small. Each rule answers one question; one rule
with eight optional fields would be one rule nobody could reason about.

## Scope defaults to everyone

A rule with `ANY_REQUESTER` constrains all requesters. This is the only sane
default for a limit: forgetting to scope a rule must mean *applies to all*,
never *applies to none*. A scope naming zero requesters is rejected at
configuration time, because an unreachable rule is always a mistake.

Note that a scoped `WINDOW_BUDGET` measures only the scoped requesters' spend —
so an agent's daily envelope is not consumed by the owner's transfers. That is
what makes per-agent envelopes meaningful.

## What was considered and rejected

**Cross-asset limits.** Requires a price oracle. Rejected: it introduces a
dependency that can be stale or manipulated, and it makes the engine impure.
Denominate budgets per asset and let a higher layer reason about totals.

**Rules as plugins/classes.** Rejected: unhashable, unserializable, and it lets
arbitrary code into the authorization path. Composition over inheritance, and
data over code, are both project rules and both point the same way here.

**Returning at the first failure.** Rejected on explainability grounds, above.

**Reading the clock inside `evaluate`.** Rejected: breaks replay.

**A `force` or `override` field on the request.** Rejected: it is precisely the
field that destroys the property the package exists to provide. An override, if
ever wanted, is a *policy amendment* — a new version, a new digest, a new
journal entry — not a flag on a request.

**Local timezones in `TIME_WINDOW`.** Rejected: a decision must not depend on
where it was evaluated. UTC minutes only.

## Known limits

- **Window queries are linear in ledger size.** `spentWithin` scans every
  entry. At realistic volumes this is irrelevant, and Art. IX §36 says build
  the simplest correct thing. A caller with a large history may pre-filter to
  the longest window; correctness does not depend on it.
- **Approvals are counted, not verified.** Stated in the README and the code.
  The shell must authenticate them first.
- **No settlement.** This package decides; it does not act, watch, or confirm.
  That is the next package.
