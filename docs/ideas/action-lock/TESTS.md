# Action Lock — Tests

Run with `npm test` (Node's built-in `node:test`, no framework). 28 tests.

## Unit — `test/core.test.ts` (pure core)

| Area | What is proven |
|---|---|
| Severity | Known small payment → 0, no feedback · new payee → 2 with feedback · large + new + late night → 4 · OTP, API key, payment during unknown call → 4 · new message recipient → 1, no feedback · deterministic |
| Gate | `stricter` takes the higher mode and the longer hold |
| Policy | Defaults follow severity · first matching rule wins · hours wrap midnight · critical floor overrides a `pass` rule · loosening waits until `effectiveAt` · tightening is immediate |

## Behaviour — `test/lock.test.ts` (lock with injected clock)

| Invariant | Test |
|---|---|
| `pass` executes on the first tick | pass |
| Countdown releases exactly when the hold ends | countdown |
| Stop during the buffer means never executed | stop during the buffer |
| Stop after release is refused | stop after release is too late |
| `unlock` needs both the fingerprint and the hold | two tests |
| The user cannot be their own second person | second person |
| `block` never releases | block |
| A proposal cannot shorten its own waiting time | proposal delay |
| Executor failures are recorded as events | failures |
| Replaying the journal reproduces state exactly | replay |
| Stored events cannot be mutated | immutability |
| Duplicate action ids are rejected | duplicates |

## Checked that the tests can fail

Two deliberate bugs were introduced and each was caught:

1. Taking the delay from the proposed policy instead of the active one →
   "a proposal cannot shorten its own waiting time" fails.
2. Applying a pending policy immediately → "loosening waits until effectiveAt"
   fails.

## Not tested yet

- Real executors (Gmail, Slack) and the credential vault.
- Concurrency across processes; the prototype is single-process and in memory.
- The phone page (checked manually with a 390 px browser screenshot).
