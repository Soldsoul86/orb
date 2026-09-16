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
  attestations: readonly Attestation[];// matched, not authenticated
  memo: string | null;
}

interface Attestation {
  claimId: string;                     // e.g. "goods.dispatched"
  attester: string;                    // identifier, never personal details
  assertedAt: number;
  evidenceDigest: string;              // hash of the document; the document never travels
}
```

| Function | Returns |
|---|---|
| `requesterKey(r: Requester)` | `string` — canonical form, e.g. `"AGENT:researcher"` |
| `distinctApprovers(req)` | `readonly string[]` — sorted, deduplicated approver ids |
| `attestationIsCurrent(a, asOf, maxAgeMs)` | `boolean` — not future-dated, not stale |
| `satisfying(attestations, claimId, attesters, asOf, maxAgeMs)` | `readonly Attestation[]` |

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
| `ATTESTATION_REQUIRED` | `claimId`, `attesters`, `maxAgeMs` | no current attestation for `claimId` from a permitted attester (empty `attesters` = any; `maxAgeMs: null` = never stale; an attestation dated after `requestedAt` is never current) |
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
`TOO_MANY_TRANSACTIONS`, `OUTSIDE_TIME_WINDOW`, `ATTESTATION_MISSING`.

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

## The shell

```ts
interface Clock { now(): number }
const systemClock: Clock;
class ManualClock implements Clock { constructor(startAt: number); advance(ms); set(at) }
```

```ts
interface LedgerStore {                       // async; the guard holds the lock
  entries(account: string): Promise<readonly LedgerEntry[]>;
  find(requestId: string): Promise<LedgerEntry | undefined>;
  append(entry: LedgerEntry): Promise<void>;  // rejects on a duplicate request id
  settle(requestId: string, actualAmount: Amount): Promise<void>;
  reverse(requestId: string): Promise<void>;
  staleReservations(asOf: number, ageMs: number): Promise<readonly LedgerEntry[]>;
}

class MemoryLedgerStore implements LedgerStore {}        // in-process; forgets on exit
class LedgerProjection {}                                // the shared fold both stores use

class JournalLedgerStore implements LedgerStore {
  static open(options: { journal: Journal }): Promise<JournalLedgerStore>;
  close(): void;                                         // stops following the journal
  readonly size: number;
}

const LEDGER_SCHEMA: SchemaRef;                          // orb.payment.ledger v1
const RESERVED = "payment.reserved";
const SETTLED  = "payment.settled";
const REVERSED = "payment.reversed";
function applyLedgerEvent(projection: LedgerProjection, event: OrbEvent): boolean;
```

```ts
type PolicySource = (account: string) => SpendPolicy | undefined;   // undefined denies
function singlePolicy(policy: SpendPolicy): PolicySource;

class SpendGuard {
  constructor(options: {
    store: LedgerStore;
    policyFor: PolicySource;
    clock?: Clock;                            // defaults to systemClock
    onDecision?: (d: Decision, r: SpendRequest) => void;   // the journal seam
  });

  authorize(draft: SpendDraft): Promise<Authorization>;     // serialised + durable
  run<T>(draft: SpendDraft, operation: (grant: Grant) => Promise<T>): Promise<GuardOutcome<T>>;
  openReservations(ageMs: number): Promise<readonly LedgerEntry[]>;
  reconcile(observer: SpendObserver, ageMs: number): Promise<ReconciliationReport>;
}
```

## Reconciliation

```ts
type SpendObservation =
  | { state: "SETTLED"; actualAmount: Amount }   // it happened, this is the real cost
  | { state: "NOT_SPENT" }                       // it provably did not happen
  | { state: "UNKNOWN" };                        // say so; do not resolve it

interface SpendObserver { observe(entry: LedgerEntry): Promise<SpendObservation> }

interface ReconciliationReport {
  examined: number;
  settled:  readonly { requestId: string; amount: Amount }[];
  reversed: readonly string[];
  unresolved: readonly LedgerEntry[];                        // still open, on purpose
  failed: readonly { requestId: string; error: unknown }[];  // also still open
}

function reconcile(options: {
  store: LedgerStore; observer: SpendObserver;
  asOf: number; ageMs: number;
  serialize?: <T>(work: () => Promise<T>) => Promise<T>;
}): Promise<ReconciliationReport>;
```

`SpendDraft` is a `SpendRequest` with `requestedAt`, `approvals`,
`attestations` and `memo` optional — the shell stamps the clock and defaults
the rest.

`Grant` carries `request`, `decision`, and `report(actualAmount)`: call it with
what was really consumed. Reporting before throwing is how a failing operation
declares what it cost (or, with `0n`, that it cost nothing).

| `GuardOutcome` | Meaning | Ledger state |
|---|---|---|
| `COMPLETED` | ran; carries `reserved`, `actual`, `overage` | `SETTLED` at `actual` |
| `REFUSED` | policy said no; carries the `decision` | nothing written |
| `DUPLICATE` | request id already seen; **the operation never runs** | unchanged |
| `FAILED` | threw, but declared its cost | `SETTLED` at that cost |
| `INDETERMINATE` | threw without declaring; we do not guess | stays `PENDING` |

`Authorization` is a three-way union — `{granted: true, …}`,
`{granted: false, refusal: "DENIED", decision}`, or
`{granted: false, refusal: "DUPLICATE", existing}`. Granted authorizations
carry `settle(actual)` and `reverse()`.

## Receipts

```ts
interface SpendReceipt {
  version: number; issuedAt: number;
  request: SpendRequest;
  decision: Decision;
  policy: SpendPolicy | null;                    // null = redacted
  ledgerContext: readonly LedgerEntry[] | null;  // null = redacted
  facts: readonly OrbEvent[];                    // journal events, self-verifying
  outcome: { state: LedgerState; amount: Amount };
}

function buildReceipt(input: BuildReceiptInput): SpendReceipt;
function encodeReceipt(receipt: SpendReceipt): string;   // canonical; amounts as strings
function receiptDigest(receipt: SpendReceipt): string;   // sha256 hex
function verifyReceipt(receipt: SpendReceipt): VerificationResult;
function explainVerification(result: VerificationResult): string;
```

`verifyReceipt` consults no network and no issuer storage — everything is
recomputed from the receipt's own contents.

| Check | Proves | Skipped when |
|---|---|---|
| `VERSION` | the shape is understood | — |
| `FACTS_INTACT` | each journal event hashes to its own contents | no events attached |
| `FACTS_MATCH_REQUEST` | the events concern this request | no events attached |
| `POLICY_BINDING` | the decision was made under the attached policy | policy redacted |
| `DECISION_REPRODUCES` | **the decision was correct**, by recomputation | policy or ledger redacted |
| `OUTCOME_CONSISTENT` | the stated outcome matches the events | no events attached |

`verified` is true only when every check ran and passed. `partial` is true when
everything checkable passed but something was redacted.

```ts
class JournalLedgerStore {
  factsFor(requestId: string): readonly OrbEvent[];   // the evidence a receipt carries
}
function requestIdOf(event: OrbEvent): string | null;
```
