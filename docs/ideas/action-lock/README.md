# Action Lock

A lock for irreversible actions, the way a screen lock guards a phone.

Every payment, message or post — from you or from an agent acting for you —
waits for a buffer **you** choose. During the buffer the system checks how
serious the action is and tells you only when it matters. You can stop it at any
moment; serious actions need your fingerprint or a second person.

Status: working prototype. Not part of the Orb runtime (see `DESIGN.md` §12).

![Phone view](demo-phone.png)

## Run

Needs Node 22.18 or newer (runs TypeScript directly).

```bash
npm install
npm test          # 95 tests
npm run typecheck # strict TypeScript
npm start         # demo on http://localhost:8787 — open it at phone width
```

### On a phone, with no server

```bash
npm run build:phone   # writes dist/action-lock.html (lock bundled into the page)
```

The same TypeScript core the tests cover is bundled into one page
(`src/browser.ts` entry), so the phone runs the tested code, not a copy.
It is published as a private claude.ai page for opening on a Pixel.

In the demo, tap a scenario under **Simulate an agent**:

| Scenario | Level | What the lock does |
|---|---|---|
| Food order ₹200, paid before | 0 | Sends at once |
| Message to a new contact | 1 | 2 s countdown |
| ₹5,000 to a new UPI ID | 2 | 10 s countdown, "never paid this person" |
| ₹25,000 to a new UPI ID | 3 | Fingerprint + 30 s |
| Agent emails an OTP | 4 | Second person, 300 s, "can't be taken back" |
| ₹50,000 during a call from an unknown number | 4 | Second person, 300 s, scam warning |

Under **Your policy**, "Make new payees instant" shows loosening waiting (60 s
in the demo, 24 h by default) while "New payees: 30 s" applies immediately.

## Your normal: import your history

The lock judges actions against **your** habits (usual amounts, payees, quiet
hours) once it has at least 30 of your payments. Import runs on your machine;
nothing is uploaded. Anything confidential it meets (OTPs, card or account
numbers, PAN, Aadhaar, recovery phrases, private keys, passwords, API keys) is
**reported to you and masked** in everything saved.

```bash
npm run import -- sms.txt MyActivity.json   # writes private/profile.json + a report
```

Get the files:

| Source | How |
|---|---|
| SMS bank alerts (fastest) | Phone: Settings → Developer options → USB debugging. Laptop: `adb shell content query --uri content://sms/inbox --projection address:date:body > sms.txt` |
| SMS, no laptop | The "SMS Backup & Restore" app → back up messages → copy the `.xml` |
| Google Pay | takeout.google.com → deselect all → **My Activity** → formats: **JSON** → include **Google Pay** → `My Activity/Google Pay/MyActivity.json` |

The report also lists **subscriptions and autopays**: recurring charges with
their cycle, usual amount and next due date; price changes; charges that
restart after a long gap; and autopays or e-mandates set up in the last month
("Recognise it?"). In the lock, a subscription charging an unusual amount is
flagged, and setting up a **new autopay** is held for the fingerprint, because
it lets someone take money later without asking.

`private/` is git-ignored. Bank alerts the parser can't read yet are listed
(redacted) at the end of the report, and all of them go to
`private/unread-alerts.txt`, so their formats can be added.

## On the Pixel

`android/` is a native app that makes the lock a delayed press for UPI: it
holds every UPI payment for your buffer, then opens your UPI app pre-filled.
See [`android/README.md`](android/README.md).

## Files

| File | What it is |
|---|---|
| `DESIGN.md` | Design: modes, flow, severity, policy, events, risks |
| `API.md` | The library and HTTP interfaces |
| `TESTS.md` | What the tests prove |
| `src/` | Functional core (`gate`, `severity`, `policy`, `state`) and shell (`journal`, `lock`, `server`) |
| `test/` | `node:test` suites |
| `public/index.html` | The phone page (talks to the server, or to the bundled lock) |
| `src/demo.ts`, `src/browser.ts` | Demo backend shared by the server and the phone build |
| `scripts/build-phone.mjs` | Builds the self-contained phone page |
| `src/upi.ts` | UPI link and response parsing (NPCI linking spec) |
| `src/android.ts`, `public/app.html` | The Pixel app's lock and screen |
| `scripts/build-android.mjs` | Bundles them into the Android app's assets |
| `android/` | Kotlin shell for the Pixel |
| `src/import/` | SMS and Google Pay importers, confidential-data scanner, import run and report |
| `src/subscriptions.ts` | Recurring charges, price changes, restarts; autopay events |
| `src/profile.ts` | Your normal (payees, amounts, quiet hours) and personal severity thresholds |
| `scripts/import.ts` | `npm run import` |
