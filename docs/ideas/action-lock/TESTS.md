# Action Lock — Tests

Run with `npm test` (Node's built-in `node:test`, no framework). 37 tests.

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

## UPI and the Pixel app — `test/upi.test.ts`

| Area | What is proven |
|---|---|
| UPI links | Merchant and personal links parse · non-UPI links, missing/invalid payee and bad amounts rejected · rebuilt links keep every original parameter and encode spaces as %20 |
| UPI responses | SUCCESS / FAILURE / SUBMITTED read case-insensitively · empty or garbage → UNKNOWN |
| Known payees | A payee becomes known only after a completed payment; a stopped one doesn't |
| Restarts | State rebuilt from the stored journal equals the live state · a payment interrupted after release is marked "outcome unknown" and **never re-run** · a corrupt journal is rejected |

The app page (`public/app.html`) was also run in a 412 px browser with the
stand-in bridge: typed payment to a new payee → 10 s countdown → paid; repeat
payment → no wait; scanned QR → stopped; ₹25,000 new payee → fingerprint; a
shorter buffer shows the 24 h delay. No script errors.

## Checked that the tests can fail

Three deliberate bugs were introduced and each was caught:

1. Taking the delay from the proposed policy instead of the active one →
   "a proposal cannot shorten its own waiting time" fails.
2. Applying a pending policy immediately → "loosening waits until effectiveAt"
   fails.
3. Re-running interrupted payments after a restart → "never re-runs a payment
   interrupted after release" fails.

## Not tested yet

- The Kotlin shell: not compiled yet (Android SDK host blocked in the build
  environment); needs a device test with Google Pay and PhonePe.
- Real executors for Gmail and Slack, and the credential vault.
- Concurrency across processes; the prototype is single-process and in memory.
- The phone page (checked manually with a 390 px browser screenshot).
