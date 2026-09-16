# API — @orb/payment-policy

Everything is exported from the package root. No deep imports.

## Vocabulary

```ts
type AssetId = string;                 // opaque; never converted, never priced
type Amount  = bigint;                 // base units, always an integer

type Requester =
  | { kind: "OWNER" }
  | { kind: "AGENT";    agentId: string }
  | { kind: "SCHEDULE"; scheduleId: string }
  | { kind: "DELEGATE"; delegateId: string };

interface Approval { approver: string; at: number }

interface SpendRequest {
  requestId: string;
  account: string;
  requester: Requester;
  asset: AssetId;
  amount: Amount;
  destination: string;
  requestedAt: number;                 // the instant the policy is evaluated at
  approvals: readonly Approval[];      // counted, not authenticated
  memo: string | null;
}
```

| Function | Returns |
|---|---|
| `requesterKey(r: Requester)` | `string` — canonical form, e.g. `"AGENT:researcher"` |
| `distinctApprovers(req)` | `readonly string[]` — sorted, deduplicated approver ids |

## Policy

```ts
interface SpendPolicy { account: string; version: number; rules: readonly Rule[] }

type RuleScope =
  | { kind: "ANY" }
  | { kind: "REQUESTERS"; requesters: readonly string[] };   // requesterKey values

const ANY_REQUESTER: RuleScope;
```

Every rule has `{ id: string; scope: RuleScope }` plus:

| `kind` | Fields | Denies when |
|---|---|---|
| `REQUESTER_ALLOWLIST` | `requesters` | requester key is absent |
| `DESTINATION_ALLOWLIST` | `destinations` | destination is absent (empty list freezes the account) |
| `DESTINATION_DENYLIST` | `destinations` | destination is present |
| `ASSET_ALLOWLIST` | `assets` | asset is absent |
| `PER_TRANSACTION_LIMIT` | `asset`, `maxAmount` | `amount > maxAmount` (equal is allowed) |
| `WINDOW_BUDGET` | `asset`, `windowMs`, `maxTotal` | `committed + amount > maxTotal` |
| `WINDOW_VELOCITY` | `windowMs`, `maxCount` | this would be transaction `maxCount + 1` |
| `APPROVAL_THRESHOLD` | `asset`, `atOrAboveAmount`, `approvalsRequired` | *holds* (does not deny) when `amount >= atOrAboveAmount` and approvers are short |
| `TIME_WINDOW` | `fromMinuteUtc`, `toMinuteUtc` | outside `[from, to)`; `from > to` wraps midnight |

A rule whose `asset` differs from the request's is `NOT_APPLICABLE`, not a pass.

| Function | Notes |
|---|---|
| `validatePolicy(policy)` | Throws `PolicyConfigError`. Run at load time, not evaluation time. |
| `policyDigest(policy)` | `string` — 64-char SHA-256 hex over a canonical encoding. |
| `scopeCovers(scope, key)` | `boolean` |
| `minuteOfDayUtc(epochMs)` | `number` in `[0, 1440)` |
| `withinDailyWindow(minute, from, to)` | `boolean`, half-open, wrap-aware |

## Ledger

```ts
type LedgerState = "PENDING" | "SETTLED" | "REVERSED";

interface LedgerEntry {
  requestId: string; account: string; asset: AssetId; amount: Amount;
  destination: string; requester: Requester;
  at: number;                          // when authorized, not when settled
  state: LedgerState;
}

interface WindowQuery {
  from: number; to: number;            // both inclusive
  requesters: readonly string[] | null;
  excludeRequestId: string;
}
```

| Function | Notes |
|---|---|
| `consumesBudget(entry)` | `state !== "REVERSED"` — **pending money holds its budget** |
| `spentWithin(entries, asset, query)` | `Amount` |
| `countWithin(entries, query)` | `number`, across all assets |

## The engine

```ts
function evaluate(
  request: SpendRequest,
  policy: SpendPolicy,
  ledger?: readonly LedgerEntry[],     // defaults to []
): Decision;
```

Pure and total. Entries for another account are ignored. The request is
excluded from its own ledger, so re-evaluation is idempotent.

```ts
type Decision = DecisionBase & (
  | { outcome: "ALLOW" }
  | { outcome: "DENY"; reason: DenialReason; ruleId: string | null; detail: string }
  | { outcome: "REQUIRES_APPROVAL"; ruleId: string;
      approvalsRequired: number; approvalsHeld: number; detail: string }
);

interface DecisionBase {
  requestId: string; account: string;
  policyVersion: number; policyDigest: string;
  evaluatedAt: number;
  evaluations: readonly RuleEvaluation[];   // every rule, not just the deciding one
}

interface RuleEvaluation {
  ruleId: string; kind: RuleKind;
  verdict: "ALLOW" | "DENY" | "REQUIRES_APPROVAL" | "NOT_APPLICABLE";
  observed: string | null;             // decimal strings — bigints must survive JSON
  limit: string | null;
  detail: string;
}
```

`DenialReason` is one of `NO_POLICY`, `WRONG_ACCOUNT`, `INVALID_AMOUNT`,
`REQUESTER_NOT_PERMITTED`, `DESTINATION_NOT_ALLOWED`, `DESTINATION_DENIED`,
`ASSET_NOT_ALLOWED`, `TRANSACTION_TOO_LARGE`, `BUDGET_EXHAUSTED`,
`TOO_MANY_TRANSACTIONS`, `OUTSIDE_TIME_WINDOW`.

Precedence: **DENY** > **REQUIRES_APPROVAL** > **ALLOW**; within a tier, the
first rule in policy order.

| Function | Notes |
|---|---|
| `authorizedEntry(request, decision)` | Builds the `PENDING` ledger entry. Throws unless the decision is `ALLOW`. |

## Presentation

| Function | Returns |
|---|---|
| `explain(decision)` | Multi-line audit text — header, provenance, every rule evaluated |
| `summarize(decision)` | One line, for a log |

Rendering cannot change what was decided; it reads a finished `Decision`.
