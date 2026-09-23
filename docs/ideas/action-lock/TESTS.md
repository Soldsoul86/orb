# Action Lock — Tests

Run with `npm test` (Node's built-in `node:test`, no framework). 100 tests.

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

## Your data — `test/sensitive.test.ts`, `test/import.test.ts`, `test/profile.test.ts`, `test/run.test.ts`

| Area | What is proven |
|---|---|
| Confidential data | OTPs in four wordings · card numbers only with a valid checksum · PAN · Aadhaar only in context or printed form · full account numbers but not masked ones · recovery phrases · private keys with a key word, **not transaction hashes** · API keys · passwords · redaction keeps the last four digits only |
| False positives avoided | Amounts in "never share your OTP" alerts · a UPI reference that passes the Aadhaar checksum · ordinary sentences as phrases |
| Bank alerts | UPI debits from HDFC, SBI, ICICI, Axis, Kotak · credits · card spends · names trimmed · OTPs and offers ignored · unreadable alerts reported |
| Exports | ADB with body last or in the middle · SMS Backup XML with entities and newlines · Google Pay Takeout JSON with unknown wordings counted |
| Your normal | Payees, amount percentiles, hours · quiet hours across midnight · the same payment in SMS and Google Pay merged once, keeping the UPI ID · two real payments not merged |
| Personal severity | ₹5,000 to a new payee is level 3 for someone who usually pays ₹450, level 2 under generic rules · quiet hours replace midnight–6 am · generic rules until 30 payments |
| Report | Formats detected · nothing confidential printed or saved in the profile |
| Subscriptions — `test/subscriptions.test.ts` | Monthly, quarterly and yearly charges with usual amount and next due date · daily groceries and irregular payments excluded · price change · lapsed · restarted after a gap · ordered by monthly cost |
| Autopays | Set-up, upcoming (with due date) and cancelled alerts read · a "will be debited" notice is **not** a payment · merchant names matched loosely · latest state per autopay |
| Lock checks | Subscription charging ₹799 instead of ₹649 flagged · usual renewal passes at level 0 · a new autopay needs the fingerprint (level 3) |
| From the first real import — `test/realformats.test.ts` | AU Bank IMPS, UPI and interest credits · Canara "shall be debited" is a notice · promotional (-P) senders ignored · promo phrases not taken as autopay merchants · hashed autopay IDs shown as unnamed · autopays silent 60+ days are dormant · empty export reported · all unread alerts listed, redacted · second run: merchant refunds named from the sender · bank charges and "CODE -NAME" lines · marketing and failed payments skipped · one merchant under two long names merged, short different names not · hidden-merchant autopays named from the matching charge |
| Found by running the report | "Lapsed" judged against the latest data, not today · no quiet hours when payment times are not spread enough |

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
