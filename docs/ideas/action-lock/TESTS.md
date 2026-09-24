# Action Lock — Tests

Run with `npm test` (Node's built-in `node:test`, no framework). 147 tests.

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
| From the first real import — `test/realformats.test.ts` | AU Bank IMPS, UPI and interest credits · Canara "shall be debited" is a notice · promotional (-P) senders ignored · promo phrases not taken as autopay merchants · hashed autopay IDs shown as unnamed · autopays silent 60+ days are dormant · empty export reported · all unread alerts listed, redacted · second run: merchant refunds named from the sender · bank charges and "CODE -NAME" lines · marketing and failed payments skipped · one merchant under two long names merged, short different names not · hidden-merchant autopays named from the matching charge · third run: likely scam SMS (personal number + money bait + link) flagged and kept out of bank alerts, friends and banks not flagged · ICICI transfers to another account and "Acc" wording · payments with no payee kept for totals only · names starting with a digit · renamed merchant shown once without mixing histories · fourth run: one transfer with two bank alerts counted once · initiated refunds and app-wallet rewards not counted · biggest payments each way shown for checking totals · fifth run: HDFC NEFT salary credits named by payer, own-bank (TPT) and IMPS transfers named, IMPS to an account keyed by the account, names starting with a digit ("8Club"), biller notices ("credited to your Airtel Wi-Fi Id") not taken as bank alerts |
| Profile in the lock — `test/judge.test.ts` | Payees found by UPI ID, exact name, or a long name that begins the other, never short fragments · usual payment to a known payee passes · large new payee needs the fingerprint with your numbers · generic rules without a profile · new autopay held · "ready to be credited" lures flagged from registered senders too, real bank credits not |

The app screen was also run in a 412 px browser: the profile loads through the file picker and its summary shows; a known payee's usual amount goes straight through; a new payee is held for the fingerprint with "₹5,000 is 13× your usual payment".
| Found by running the report | "Lapsed" judged against the latest data, not today · no quiet hours when payment times are not spread enough |

## Phone sync — `test/apps.test.ts`

Package lists recognised · known apps sorted into payment, bank, crypto and
screen-sharing · apps added to the profile, with a warning for screen-sharing
apps in the report and the sync summary. `npm run sync` was also run against a
stand-in `adb`: with no phone it prints the pairing steps; with one it pulls SMS
and apps, writes the profile and report, and prints the summary.

## Phone check, people, screen time — `test/phone.test.ts`, `test/people.test.ts`

| Area | What is proven |
|---|---|
| Phone check | The script run on the phone only reads (no install, grant, settings put) · installers, watched permissions, Accessibility, notification access, device admins, draw-over and install rights, `.apk` files read · system apps (TalkBack) not judged · an app not from the Play Store that reads SMS or controls the screen is serious, each app named once · a clean phone has no findings · SMS readers listed in one line · websites installed from Chrome not counted as "not from the Play Store" · default SMS app read from the Android role when the setting is empty |
| Contacts and calls | Numbers compared by their last 10 digits · names with commas · share of calls from contacts · unknown numbers calling 3+ times, masked, never printed in full · a payee named like a contact is pointed out but still new; short names (<8 letters) never match |
| Screen time | Off-phone hours from foreground events · needs 3 full days (first and last are partial) · repeated dumps counted once · off-phone hours flag a payment even with little payment history |

## Gmail — `test/mail.test.ts`

| Area | What is proven |
|---|---|
| Reading | mbox split, `>From` unescaped · encoded headers · quoted-printable with soft breaks · base64 in multipart · HTML to text |
| Receipts | Merchant from the sender, amount and currency, subscription wording · promotions skipped |
| Bookings | Flight from an airline with route, travel date and masked PNR · hotel from Booking.com · itinerary and check-in reminder counted once |
| Summary | No mail text saved · passwords reported with sender and date, masked · rupee subscriptions join the profile, dollar ones are listed only · a subscription already found in SMS is not added twice |

`npm run sync` was run against a stand-in `adb` that answers every command, and
`npm run mail` on a 776 MB generated mailbox (40,000 mails, 4 s).

## Feedback file — `test/feedback.test.ts`

`private/feedback.txt` lists what could not be read, one line per format (two
alerts that differ only in numbers show once): unread bank alerts, contacts or
calls read short of their rows (layout only, values replaced by their length),
screen-time lines when the format isn't recognised, mails that looked like
receipts or bookings but weren't read. Proven safe to paste: no passwords, no
contact names, no full phone numbers.

## Orb — `test/twin.test.ts`

| Area | What is proven |
|---|---|
| Entities | People, organisations and accounts resolved from bank alerts; a person linked to a matching contact; a timeline per entity |
| Beliefs | Regular monthly credits become an income belief with a confidence below 1 and a reason ("5 credits in 5 months"); no belief is ever 0 or 1 |
| Questions | Most valuable first (the salary question before the rest); who-is-this for people you move money with; what-was-it for a large one-off |
| Answers | An answer is an event: the belief is then held from you at 0.99, its question goes, the entity gets a relation; a later answer replaces an earlier one without erasing it; unknown answers are ignored |
| Replay | Same observations and answers → the same twin |
| Value | Money by relation for the last 30 days; a brief with income, the week's spending and questions waiting |

The Orb page was run in a 412 px browser with invented data (`npm run
build:orb-preview`): every tab, answering a question, a person's page. No
script errors. The APK builds; its merged manifest has no internet permission.

## Checked that the tests can fail

Three deliberate bugs were introduced and each was caught:

1. Taking the delay from the proposed policy instead of the active one →
   "a proposal cannot shorten its own waiting time" fails.
2. Applying a pending policy immediately → "loosening waits until effectiveAt"
   fails.
3. Re-running interrupted payments after a restart → "never re-runs a payment
   interrupted after release" fails.

## Not tested yet

- The Kotlin shell (now also the file picker and profile storage): not compiled yet (Android SDK host blocked in the build
  environment); needs a device test with Google Pay and PhonePe.
- Real executors for Gmail and Slack, and the credential vault.
- Concurrency across processes; the prototype is single-process and in memory.
- The phone page (checked manually with a 390 px browser screenshot).
