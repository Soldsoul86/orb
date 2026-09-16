# Tests — @orb/payment-policy

`npm test -w @orb/payment-policy` — **145 tests, all passing.** (539 across the repo.)

Unit tests only. The package has no I/O to integrate with, which is the point
— the guard's clock and store are both injected.

## What is covered

### Structural refusals (`evaluate.test.ts`)
Deny-by-default on an empty policy; a request aimed at another account; zero
and negative amounts. These run before any rule, so a malformed request is
never measured against limits written for a different subject.

### Every rule kind
Allowlists and denylists for destination, asset and requester — including that
an **empty allowlist freezes the account**, which is a feature rather than a
bug. Per-transaction limits are tested at the boundary: exactly the limit
passes, one base unit above denies.

### Window budgets — the concurrency property
Five tests around the single most important behaviour:

- settled spend inside the window counts;
- **`PENDING` spend counts exactly as much as `SETTLED`** (without this, N
  simultaneous requests each see an empty budget and all pass);
- `REVERSED` spend returns its budget;
- spend outside the window does not count;
- another account's ledger does not count.

Plus **idempotency**: re-evaluating a request that is already `PENDING` in the
ledger returns the same answer, because the request is excluded from its own
ledger.

### Approvals
Below-threshold passes through. **At** the threshold holds — the boundary is
`>=`, matching the hard-exit sentinel, because a threshold you can sit
precisely on without consequence is not a threshold. Three signatures from one
approver count as one.

### Attestation-gated settlement (`attestation.test.ts`)
Written around a real shape — an India/Europe chemical shipment — because an
abstract claim id hides the questions that matter. Payment is held until the
claim is attested; released when a named attester asserts it; refused for the
wrong attester, the wrong claim, or a stale certificate. Any of several
permitted attesters satisfies a claim, and an empty attester list accepts
whoever the shell vouched for.

Two edges are tested deliberately: an attestation **exactly** at the age limit
is accepted, and one **dated after the request** is refused — a document from
the future is a clock problem or a forgery, and either way must not release
money. Multi-condition policies require every condition, and the decision
records the **evidence digest, never the document**.

Composition is tested too: attested but over the per-transaction cap still
denies, with the limit named as the reason.

### Time windows
Inside, outside, and the wrap-around case (22:00→06:00) which is where an
off-by-one would hide.

### Scope
A rule scoped to `AGENT:researcher` constrains that agent and leaves the owner
alone. A scoped budget is measured over the scoped requesters only, so the
owner's spend does not consume the agent's envelope.

### Precedence and explainability
A denial outranks a pending approval. **All three rules appear in
`evaluations`** with their individual verdicts, not just the deciding one.
Decisions carry the policy version and a 64-character digest.

### Determinism
The same inputs produce a deep-equal decision across repeated calls, and
`evaluate` does not mutate the request or the ledger (verified by
`structuredClone` comparison).

### Policy validation (`policy.test.ts`)
Duplicate rule ids, a scope naming nobody, negative limits, non-positive
windows, zero required approvals, a minute outside `[0, 1440)`, an empty time
window, a non-positive version.

### Digest stability
Key ordering does not change the digest; changing a limit does; changing the
version does; a `bigint` too large for JSON still hashes.

### Ledger arithmetic (`ledger.test.ts`)
Asset filtering, request exclusion, inclusive window bounds at both edges,
requester filtering, the empty ledger, and state handling in `countWithin`.

### The guard (`guard.test.ts`)

Two tests carry this file.

**Ten racing callers against a budget that fits three.** Every call suspends
inside its operation; exactly three complete and seven are refused. It only
passes because `authorize` never suspends between reading the ledger and
writing the reservation. If that ever regresses, this test goes to ten
completions.

**What happens when the operation throws.** A failure with no declared cost
leaves the reservation `PENDING` and returns `INDETERMINATE` — the guard
refuses to guess whether money moved — and `openReservations` surfaces it once
it is stale. A failure that reports `0n` settles at zero, and one that reports
a real figure settles at that figure. A zero-cost attempt still counts against
a velocity limit, because it cost nothing but it happened.

Also covered: settling at the reported figure rather than the estimate;
overages recorded rather than prevented; the budget self-correcting because
the next decision sees the true figure; retries with a repeated request id
returning `DUPLICATE` **without running the operation**; an unknown account
denying with `NO_POLICY`; `onDecision` firing for allowed and refused alike
(and not for duplicates); and budget windows moving with an injected clock.

### The journal-backed ledger (`journal-store.test.ts`)

The tests the in-memory store could not pass. **A reservation survives a
restart**, and — the one that matters — a restarted process enforces the
budget it left behind: 9,000 of a 10,000 envelope spent before the restart,
and the 2,000 request after it is refused. With `MemoryLedgerStore` that
request is allowed.

Also: settlements and reversals replay; the fold is deterministic across
repeated replays; a `2^80` amount round-trips through an encoding that refuses
`bigint`; history cannot be corrected (duplicate reservation, double settle,
settling something never reserved all reject); a **replicated** reservation
from another device's lane consumes the shared envelope; and the hash chain
still verifies after a full lifecycle.

### Reconciliation (`reconcile.test.ts`)

An observed `SETTLED` records the sensor's figure, not the reserved estimate.
`NOT_SPENT` reverses and the envelope is whole again — proven by the next call
fitting.

The refusals are tested harder than the resolutions, because they are what
makes it trustworthy: **`UNKNOWN` leaves the entry `PENDING`**, still
consuming budget, and offers it again on the next sweep. An observer that
throws is recorded in `failed` and its entry is left untouched rather than
guessed at — and the sweep continues to the next one. Reservations that are
not yet stale are never examined; settled entries are never touched.

The last test walks the full cycle: decide, act, fail indeterminately, hold
the budget, observe, close.

### Receipts (`receipt.test.ts`)

Six tampering tests carry this file, because a receipt that can be quietly
altered is a log with extra steps. An edited amount fails
`DECISION_REPRODUCES` — *"recomputing gives DENY, receipt claims ALLOW"*. A
swapped policy fails `POLICY_BINDING`. An altered journal event fails
`FACTS_INTACT`. An outcome the events do not support, events belonging to a
different request, and an unknown receipt version all fail their own check.

Redaction is tested as carefully as verification: a receipt without the ledger
reports `PARTIAL` with `DECISION_REPRODUCES` **skipped, not passed**, while
`FACTS_INTACT` and `POLICY_BINDING` still pass. A redacted receipt whose
outcome has been forged still fails outright — redaction weakens the proof, it
does not disable it.

The wire form is checked for lossless `bigint` encoding (decimal strings,
never `Number`) and stable hashing.

### Quotes (`quote.test.ts`)

The test that matters proves a quote closes the hole the buyer cannot: the
same guard, the same 5,000 per-call limit. **Unquoted**, a caller guessing
1,000 that really burns 40,000 completes and the ledger records 40,000 after
the fact. **Quoted**, a ceiling of 40,000 is refused outright and nothing is
reserved.

Also: expiry is exclusive — sitting exactly on the deadline is too late, one
millisecond earlier is fine; quotes from the future, for another buyer, or for
another request are refused; charging exactly the ceiling is honoured and one
unit over is a broken promise with `exceededBy`; and an unapproved seller is
refused by an ordinary `DESTINATION_ALLOWLIST`, with no rule kind added for it.

In a receipt, `QUOTE_HONOURED` catches an overcharge (*"over by 2100"*), an
expired quote, a quote addressed to a different buyer, and a payee that is not
where the money went.

**`NOT_APPLICABLE` is tested against `SKIPPED` deliberately.** An unquoted
payment verifies *fully* — nothing to check is not a gap — while a withheld
ledger still downgrades to `PARTIAL`. Collapsing the two would mean a perfectly
good receipt could never read as verified, which is how a verifier teaches
people to ignore it. A v1 receipt is also tested to still verify, because a
contract accepted at v1 is permanent.

## What is *not* covered, and why

- **Approval authenticity.** The engine counts approvals; it does not verify
  them. That belongs to the shell and will be tested where the signature check
  lives.
- **Settlement, confirmation, reversal detection.** Not in this package. The
  ledger is an input; producing it is the settlement layer's job.
- **Rail behaviour, custody, key handling.** None of it is here.
- **Two processes over one journal file.** Covered for two devices with their
  own lanes, which is the supported shape. A single journal file with
  concurrent writers needs the journal store itself to be safe for that, and
  would need its own tests there.
- **Real observers.** `ScriptedObserver` drives the reconciler; a vendor
  adapter is tested where the adapter lives.
- **Receipt and quote signatures.** Both are *verifiable* — their contents
  recompute and tampering is caught — but neither is *attributable*: nothing
  proves which issuer produced them. That needs a key, and keys belong to the
  layer above this one.
- **Transport.** `PaymentRequired` is the 402 payload as data; carrying it over
  HTTP, and the rails in `accepts`, belong to an adapter.
- **Performance under a large ledger.** `spentWithin` is linear by design
  (`DESIGN.md` → Known limits). No benchmark is asserted because no threshold
  has been agreed; asserting an arbitrary one would be theatre.
