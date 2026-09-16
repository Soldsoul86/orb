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
