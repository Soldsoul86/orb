# @orb/payment-policy

**Programmable spend authority.**

> A payment may be requested by anyone — a person, a schedule, an autonomous
> agent. **Spend authority belongs to the policy.**

This is the same rule the trade executor is built on (*entry may come from the
signal provider; exit authority belongs to the executor*), one layer down and
pointed at money instead of positions. Nothing a requester sends can raise a
limit, skip an approval, or widen a window.

## What it is

A pure, deterministic, explainable policy engine. Given a request, a policy and
a ledger of what has already moved, it returns a decision — and the complete
reasoning behind it.

```ts
import { evaluate, explain, ANY_REQUESTER } from "@orb/payment-policy";

const policy = {
  account: "acct:treasury",
  version: 3,
  rules: [
    { id: "assets", kind: "ASSET_ALLOWLIST", scope: ANY_REQUESTER, assets: ["USDC"] },
    {
      id: "agent-envelope",
      kind: "WINDOW_BUDGET",
      scope: { kind: "REQUESTERS", requesters: ["AGENT:researcher"] },
      asset: "USDC",
      windowMs: 86_400_000,
      maxTotal: 50_000_000n,          // 50 USDC a day, in base units
    },
    {
      id: "four-eyes",
      kind: "APPROVAL_THRESHOLD",
      scope: ANY_REQUESTER,
      asset: "USDC",
      atOrAboveAmount: 1_000_000_000n, // 1,000 USDC
      approvalsRequired: 2,
    },
  ],
};

const decision = evaluate(request, policy, ledger);
if (decision.outcome === "ALLOW") submit(request);
console.log(explain(decision));
```

## The guard — four lines around an operation

```ts
import { SpendGuard, MemoryLedgerStore, singlePolicy, explain } from "@orb/payment-policy";

const guard = new SpendGuard({ store: new MemoryLedgerStore(), policyFor: singlePolicy(policy) });

const result = await guard.run(
  { requestId: "call-10", account, requester: { kind: "AGENT", agentId: "researcher" },
    asset: "anthropic:tokens", amount: 5_000n, destination: "vendor:messages-api" },
  async (grant) => {
    const response = await callTheModel();
    grant.report(BigInt(response.usage.total_tokens));   // tell the truth about the cost
    return response;
  },
);

if (result.outcome === "REFUSED") console.log(explain(result.decision));
```

`node scripts/agent-budget.mjs` runs a looping agent against a 50,000-token
envelope and prints the refusal when it runs out.

Outcomes are `COMPLETED`, `REFUSED`, `DUPLICATE`, `FAILED` and
`INDETERMINATE` — the last meaning the operation threw without saying whether
it spent anything, so the reservation is deliberately left open for
reconciliation rather than guessed at.

## It remembers, and it recovers

`JournalLedgerStore` makes the ledger a projection of the Event Journal rather
than a `Map` — so a reservation survives a restart, two devices spending from
one envelope converge instead of double-counting, and the whole budget is
rebuildable by replay.

`guard.reconcile(observer, ageMs)` closes the loop on reservations left open
by an indeterminate failure. A `SpendObserver` is the sensor Art. XI §42
requires: it looks at the vendor, the chain, the statement, and reports
`SETTLED`, `NOT_SPENT` or `UNKNOWN`.

**`UNKNOWN` resolves nothing.** The reservation stays open, keeps consuming
budget, and comes back next sweep. A reconciler that resolved uncertainty by
assumption would be worse than none, because it would look authoritative
while guessing.

## Receipts you can check without trusting the issuer

Most audit trails are an assertion: *"our system authorised this, here is our
log."* The log and the claim have the same author, so a reader who does not
already trust the issuer learns nothing.

A receipt here carries the request, the policy and the ledger the decision was
made against — so a reader **re-runs the decision themselves**. That is only
possible because `evaluate` reads no clock and performs no I/O. Determinism is
usually defended as a testing convenience; this is what it is actually for.

```
node scripts/receipt.mjs

VERIFIED — every check passed
  ok    FACTS_INTACT          2 event(s) hash to their contents
  ok    POLICY_BINDING        policy matches digest b6cccd650e6c
  ok    DECISION_REPRODUCES   recomputed independently: ALLOW
  ok    OUTCOME_CONSISTENT    events and outcome agree on SETTLED
```

Edit one number and `DECISION_REPRODUCES` reports *"recomputing gives DENY,
receipt claims ALLOW"*.

Full recomputation needs the ledger as it stood, which contains your other
transactions — fine for an auditor, not always for a counterparty. So `policy`
and `ledgerContext` can be omitted, and verification then reports `PARTIAL`
with the skipped checks named. **Redaction costs you a check; it never
silently passes one.**

## Quotes — the seller's half

A quote is usually described as telling the buyer the price. That undersells
it. A quote is the seller **committing to a ceiling**, and that commitment
fixes a hole the buyer cannot close alone.

The guard authorises whatever the caller estimated and cannot interrupt a call
already in flight, so a call budgeted at 1,000 that really burns 40,000
completes. No cleverness on the buyer's side fixes that — the buyer does not
know the cost until the seller decides it.

A quote moves the unknown to the party that knows it. The seller states a
maximum, the buyer authorises **that maximum**, and a seller charging past it
is no longer an accident to absorb but a broken promise, named in the receipt.

```
node scripts/quoted-call.mjs

  ok    QUOTE_HONOURED   charged 3100 of a 4000 ceiling (900 unused)
  FAIL  QUOTE_HONOURED   charged 7400 against a 4000 ceiling — over by 3400
```

Quotes carry an expiry (a price with no expiry is not a price), a subject
digest (so a cheap quote cannot be presented for an expensive delivery), and
optional buyer and request bindings (so it cannot be replayed).

`quotedDraft(quote, …)` puts the seller's payee in the request's
`destination`, so an ordinary `DESTINATION_ALLOWLIST` refuses a quote from an
unapproved counterparty. No new rule kind was needed for "do I trust this
seller" — it falls out.

## What it is not

It does not move money. It holds no keys, signs nothing, talks to no chain and
knows nothing about custody or settlement. It decides; something else acts.
That separation is the point — the deciding half has to be replayable, and
anything that touches a network is not.

It also does not authenticate approvals. It *counts* them. Verifying that an
approver is who they claim to be happens in the shell, before `evaluate` is
called, because a pure function cannot check a signature against a key it has
no way to fetch.

## The three properties that matter

| Property | Why |
|---|---|
| **Deny by default** | No policy, no matching rule, wrong account — all deny. An authorization system whose failure mode is *allow* is not one. |
| **Pending money holds its budget** | Ten requests in the same millisecond must not each see an empty budget. This is the payments equivalent of a double spend. |
| **Every rule is recorded** | A decision that names one tripped limit while hiding the four it passed cannot be audited. |

Payments can also be gated on **attested facts** — *dispatched*, *customs
cleared*, *quality accepted* — each asserted by a named party. The engine
records the hash of the supporting document and never the document, and it
never decides who counts as a legitimate attester: that belongs to whoever
carries the compliance obligation.

Amounts are `bigint` in base units, always. Time is supplied on the request,
never read from a clock — so the same inputs produce the same decision forever,
which is what makes a decision replayable (Constitution Art. I §4).

## Documents

- [`DESIGN.md`](./DESIGN.md) — why it is shaped this way, and what was rejected
- [`API.md`](./API.md) — the exported surface
- [`TESTS.md`](./TESTS.md) — what is covered and what is not
