# Tests — @orb/payment-policy

`npm test -w @orb/payment-policy` — **57 tests, all passing.**

Unit tests only. The package has no I/O to integrate with, which is the point.

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

## What is *not* covered, and why

- **Approval authenticity.** The engine counts approvals; it does not verify
  them. That belongs to the shell and will be tested where the signature check
  lives.
- **Settlement, confirmation, reversal detection.** Not in this package. The
  ledger is an input; producing it is the settlement layer's job.
- **Rail behaviour, custody, key handling.** None of it is here.
- **Performance under a large ledger.** `spentWithin` is linear by design
  (`DESIGN.md` → Known limits). No benchmark is asserted because no threshold
  has been agreed; asserting an arbitrary one would be theatre.
