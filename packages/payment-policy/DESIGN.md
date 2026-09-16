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

## Attestations: why the evidence never travels

An approval says *"I permit this."* An attestation says *"I observed this."*
One exercises authority, the other reports a fact — and Art. XI §43 is explicit
that an observation owns confidence, not truth.

`ATTESTATION_REQUIRED` is what turns a payment engine into a settlement engine:
release on *dispatched*, on *customs cleared*, on *quality accepted*. Two
constraints make it safe to build a business on:

**The engine records a digest, never a document.** A bill of lading, a customs
declaration, a verification result: the hash is stored, the original stays with
whoever holds it. A system that never holds the evidence cannot leak it, and
cannot quietly become the place everyone's documents live.

**The engine does not decide who is a legitimate attester.** A policy names
attesters; establishing that an attester is who they claim, and is entitled to
the claim, happens in the shell under whoever's compliance obligation it
actually is. This is not squeamishness — deciding who may participate is
precisely what makes someone an operator rather than a tool, and the whole
point of this shape is that each licensed participant carries its own
obligation rather than inheriting one from us.

A future-dated attestation is never current. A clock problem and a forgery look
identical from here, and neither should release money.

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

## The critical section, and a correction

An earlier version of this package made `authorize` and the whole
`LedgerStore` synchronous, and argued that synchrony was what kept the
critical section safe. That was half right, and the missing half mattered.

Synchrony is *sufficient* for atomicity on a single-threaded runtime. It is
not *necessary* — and it buys atomicity at the cost of durability, because a
durable append cannot be synchronous. The invariant was never "the critical
section is synchronous". It is:

> **Read, decide and reserve must not interleave with another caller doing the
> same, and the reservation must be durable before the operation runs.**

A lock delivers both. Synchrony delivers only the first. So `SpendGuard`
serialises every ledger mutation through a promise chain — the same mechanism
the Journal uses to keep its own hash chain intact — and awaits the append
before returning.

Settlements go through the same lock, not just reservations: a settle landing
between another caller's read and its reservation would let that caller decide
against a ledger that no longer exists.

Note that losing a reservation is *not* like losing an audit line. The
executor's audit sink deliberately does not await the journal, because a
dropped record is recovered by reconciling against the exchange. A dropped
reservation silently returns budget that may already have been spent, and
nothing outside the ledger knows it existed.

## The guard: why a failed operation is not reversed

Art. XI §42 again: Orb never assumes an Action changed reality. A thrown error
does not tell you whether the money moved. A connection reset before the
request left and a response lost after the vendor already charged are
indistinguishable from inside the `catch`.

So the default is to **hold**. The reservation stays open, the outcome is
`INDETERMINATE`, and `openReservations` surfaces it for reconciliation against
the vendor. Reversing would release budget for money that may well have been
spent — the expensive direction to be wrong in. An operation that *knows* it
spent nothing says so with `grant.report(0n)`, and one that knows it was
charged reports the figure before throwing.

Note that a zero-cost settled attempt still counts against a velocity limit.
It cost nothing, but it happened.

## The guard: the ledger records truth, not intent

`grant.report(actual)` exists because an estimate is not an outcome. A call
budgeted at 4,000 tokens that really consumed 4,231 must land in the ledger as
4,231, or every later budget decision inherits the error. Overages are
**recorded, not prevented** — the spend has already happened — and the next
decision sees the true, higher figure, so the budget self-corrects.

## The ledger is a projection, not a source of truth

Art. I §3: the journal is the single source of truth, everything else is a
derived projection that may be discarded and rebuilt. Holding the ledger in a
`Map` and calling it authoritative was a violation of this package's own
constitution, and the reason a reservation could not survive a restart.

`JournalLedgerStore` makes the ledger a fold over three immutable facts —
`payment.reserved`, `payment.settled`, `payment.reversed` — and three things
follow for free:

- **A restart resumes**, because the fold is deterministic (Art. II §9).
- **Devices share an envelope.** Replicated lanes carry the same facts and
  `orderEvents` puts them in HLC order, so two devices spending from one
  budget converge rather than double-count (Art. IV §18).
- **Reconciliation is a fold**, not a special case: an open reservation is a
  `reserved` with no matching `settled` or `reversed`.

Reads are served from an in-memory projection so deciding costs no I/O; the
projection is only ever advanced by the journal's own listener, so local
appends and replicated events take the identical path and cannot diverge.

Amounts are written as decimal strings. `canonicalJson` refuses `bigint` —
correctly, since JSON has no unambiguous encoding for one — and a lossy
`Number` in a money ledger is the exact bug this package exists to prevent.

A partially replicated lane can legitimately contain a `settled` whose
`reserved` has not arrived yet. That is a gap in replication, not corruption,
so an orphan is skipped rather than thrown: refusing to open would make a
partially synced device unusable.

## Reconciliation: why UNKNOWN resolves nothing

The guard refusing to guess is correct but incomplete — a system that only
accumulates unresolvable reservations is honestly stuck rather than safe.
Art. XI §42 says how it ends: the loop closes only when a Sensor confirms.
`SpendObserver` is that sensor, and it is the one component here that looks at
the outside world.

The rule that makes it trustworthy is what happens on `UNKNOWN`: **nothing.**
The reservation stays open, keeps consuming budget, and is offered again next
sweep. A reconciler that resolved uncertainty by assumption would be worse
than no reconciler, because it would look authoritative while guessing.

Observation happens outside the lock — a vendor call is slow and must not
block every decision in the process — and only the resulting write is
serialised. One unreachable vendor is recorded and skipped rather than
abandoning the sweep.

## Receipts: why determinism was worth the constraints

Every restriction in the engine — no clock, no I/O, no oracle, time supplied on
the request — was paid for somewhere. This is where it is collected.

Because `evaluate` is a pure function of `(request, policy, ledger)`, a receipt
that carries all three lets a reader **recompute the decision and compare**.
That converts an audit trail from an assertion by the issuer into something a
stranger can check. A conventional log cannot do this at any level of detail,
because the log and the claim have the same author.

The trade-off is disclosure: full recomputation needs the ledger as it stood,
and that ledger holds your other transactions. So `policy` and `ledgerContext`
are optional, and `verifyReceipt` reports each check separately with
`SKIPPED` distinct from `PASS`. A verifier that silently downgraded a skipped
check to a pass would be worse than no verifier, so `verified` requires that
*nothing* was skipped, and a weaker result is labelled `PARTIAL` rather than
quietly counted as success.

## Quotes: moving the unknown to the party that knows it

`scripts/agent-budget.mjs` iteration 9 is the honest failure in this package:
a call authorised at an estimate of 5,000 that really consumed 40,000
completes, and the guard can only record the damage. It is listed under Known
limits below as something nothing outside the call can prevent.

That is true of the *buyer*. It is not true of the exchange. The buyer cannot
know the cost in advance because the seller decides it — so a quote asks the
seller to state a ceiling, and the buyer authorises that ceiling rather than a
guess. The authorisation becomes exact not because the estimate improved but
because the counterparty is bound.

The consequences are worth naming:

- **A refusal now happens before the spend, not after.** A ceiling above
  policy is rejected while nothing has been consumed.
- **An overcharge changes category.** An estimate that ran long is nobody's
  fault. Charging past a ceiling you published is a broken promise, and
  `QUOTE_HONOURED` names it with the amount.
- **Counterparty trust needed no new rule.** `quotedDraft` puts the seller's
  payee in `destination`, so `DESTINATION_ALLOWLIST` already answers "do I
  deal with this seller".

Expiry is exclusive, for the same reason the sentinel's breach is `>=`: a
deadline you can sit exactly on is not a deadline.

Like a receipt, a quote is verifiable but not attributable — it proves *what*
was promised, not *who* promised it. Signing belongs in the layer that holds
keys, and this package deliberately holds none.

## Signing: the check almost everyone forgets

A valid signature proves a key signed these bytes. It does **not** prove the
signer was entitled to the identity the payload claims. If a quote says
`issuer: "vendor:messages-api"`, a correct signature from *some* key proves
nothing about that vendor.

So `PublicKeyRecord.speaksFor` names the identities a key may sign for, and
`verifySignatures` refuses a technically perfect signature from a key outside
its remit. `KEY_NOT_AUTHORIZED` is a separate outcome from `BAD_SIGNATURE`
because they are different events: one is a forgery, the other a real party
signing outside what it was entitled to. A verifier that returned "invalid" for
both would hide which of those had happened.

An empty `speaksFor` attributes nothing. That is the right default for a key
whose remit was never stated.

**Time belongs to the signature, not the verifier.** Key validity is checked
against `signedAt`, so rotating a key does not invalidate everything it ever
signed — otherwise every historical receipt breaks on the day you rotate.
Compromise is a separate switch: `revoked` fails regardless of when the key
signed, and reports itself distinctly, because a reader needs to tell "forged"
from "genuine, by a key we no longer trust".

Malformed input never throws out of verification. A bad key or a truncated
signature reads as *not verified*, never as a crash in the middle of deciding
whether to trust a payment.

**This package holds no keys.** `Signer` is a port; the reference Ed25519
implementation captures a caller-supplied private key in a closure so it is not
reachable from the object, cannot be serialised by accident, and is not printed
by a debugger walking the signer. Generating, storing and destroying key
material belongs to whoever owns the identity, not to a library that also
decides whether payments are allowed.

## Transport: a different standard

Everything else in this package is fed by its own caller. `transport.ts` is the
first thing that reads bytes a stranger wrote, so it holds two rules the rest
does not need: **nothing throws, and nothing is believed.**

### Strict parsing is a correctness requirement

Amounts cross the wire as decimal strings, and a relaxed reader is a bug rather
than a style complaint. `BigInt("0x10")` is `16n`. `BigInt("1e999")` throws,
from inside whatever was holding the decision. And `"007"` parses to `7n`,
re-encodes as `"7"`, and **the signature made over the original bytes no longer
verifies** — a valid payment refused for reasons nobody can see.

That last one is why normalising is worse than rejecting: signatures are made
over canonical bytes, so a decoder that helpfully tidies its input has broken
the signature scheme underneath it. Amounts must arrive canonical or not at
all.

The base64 check round-trips rather than trusting `Buffer.from`, which is
lenient and silently drops junk — so "it decoded" does not mean "it was
base64".

### The seller compares against its own quote

`admitPayment` checks the presented authorisation against the quote the
**seller** holds, never the copy the buyer sends back. A protocol that compares
a payload to a copy of itself proves only that the peer can echo. The test for
this presents a perfectly coherent, correctly signed authorisation for a
cheaper quote the buyer invented; it is refused as `WRONG_QUOTE`.

The buyer must also authorise the **full ceiling**, not less — otherwise the
seller does the work and then discovers it may not charge for it.

### One validator, not two

`decodeSettlement` deliberately does not re-derive the receipt's interior.
`verifyReceipt` already recomputes the entire decision and is the real gate; a
second, weaker validator at the boundary would become a second opinion people
trusted by mistake. The decode establishes that the envelope is well-formed and
says so plainly, and the docs push the caller to the verifier.

## Known limits

- **Window queries are linear in ledger size.** `spentWithin` scans every
  entry. At realistic volumes this is irrelevant, and Art. IX §36 says build
  the simplest correct thing. A caller with a large history may pre-filter to
  the longest window; correctness does not depend on it.
- **Approvals are counted, not verified.** Stated in the README and the code.
  The shell must authenticate them first.
- **No settlement.** This package decides; it does not act, watch, or confirm.
  That is the next package.
- **The guard is an authorization boundary, not a kill switch.** It cannot
  interrupt an operation already in flight. A call authorized at an estimate
  of 5,000 that really consumes 40,000 completes, and the overage is recorded
  rather than prevented — `scripts/agent-budget.mjs` shows exactly this on
  iteration 9. The protection is that the *next* call sees the true figure and
  is refused. If you need a per-call ceiling enforced against the actual
  spend, the operation itself has to enforce it; nothing outside the call can.
- **`MemoryLedgerStore` is in-process.** A reservation does not survive a
  restart and two processes do not share a budget. Use `JournalLedgerStore`
  for anything that must remember.
- **One journal, one writer.** `JournalLedgerStore` serialises through the
  guard's lock within a process. Two processes over the *same* journal file
  need the journal's own store to be safe for concurrent writers; two devices
  with their own lanes are fine, and that is the supported shape.
- **Reconciliation is only as good as its sensor.** An observer that returns a
  confident wrong number writes it into an immutable ledger. `UNKNOWN` is
  always the safer answer.
- **Key distribution is out of scope.** `KeyDirectory` resolves an id to a
  record; how you learn that record — a registry, a DNS record, a certificate
  chain, a file someone handed you — is the hard part of any PKI and is not
  solved here. The directory is synchronous so verification stays replayable,
  which means a remote directory must be snapshotted before use.
- **x402 wire compatibility is not implemented.** The header names match, the
  payload schemas do not. Mapping onto x402's `PaymentRequirement` is a
  separate adapter, and the honest status is "has somewhere obvious to map
  onto", not "compatible".
- **No HTTP.** This module encodes and decodes header values. Binding them to a
  server or client belongs in an app, not in a package that must compile
  without a network.
- **One algorithm.** Ed25519 only. `SignatureAlgorithm` is a union so adding
  another is an addition the compiler then enforces everywhere, but nothing
  else is implemented today.
