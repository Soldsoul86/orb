# Orb app — plan (approved: option A)

Status: approved 2026-09-23. **First build done 2026-09-24**: the Android app
(`action-lock/android`, package `app.orb`) reads the phone itself and shows the
Orb screens (Today, Ask, People, Money, Phone, Lock); core in
`action-lock/src/orb/twin.ts` (tests: `test/twin.test.ts`). Not yet run on the
Pixel. Prototype under
`docs/ideas/`, like `action-lock/`; not part of the Orb runtime (Phase 3 gates
implementation in `packages/`). Replaceable; the architecture is not changed.

## Decision

Orb is the product. The phone app is its CRM-like view: the user's people,
organisations and commitments, what Orb believes about each, and questions that
turn beliefs into knowledge. Action Lock becomes one capability inside it.

Option A (chosen): prototype now, using the Kernel contract names exactly as
specified in `contracts/` (Observation, Event, Evidence, Entity, Belief, Fact,
Relationship, DigitalTwin). Real data from the prototype feeds back into the
contract specs. Option B (finish Phase 3 first) was declined for now.

## Mapping

| Prototype | Orb contract |
|---|---|
| Phone readers: SMS, calls, contacts, apps and permissions, screen time, Gmail Takeout (`action-lock/src/import/`) | Sensor → Observation (with confidence) |
| One bank alert, one call | Observation, recorded as an Event |
| Giottus, a person, account …2041, Netflix | Entity (identity resolution across observations) |
| "Giottus is your employer (0.9, 14 NEFT credits)" | Belief, supported by Evidence |
| "Tukuholi is family" | Relationship (a Belief) |
| The user's answer to a question | an Event (Constitution §45: a correction enters history, never edits) |
| The profile | DigitalTwin: recomputed from the journal, never the source of truth |
| Action Lock | a Capability + Policy reading the twin |

## Build order

1. Build and install the Android app (needs `dl.google.com` allowed in the
   environment's network access). Rename to Orb; CRM as the home screen.
2. Move the readers into the app: SMS, call log, contacts, installed apps and
   permissions, usage stats. Data stays in app-private storage; no Mac needed.
3. Event journal on the phone; entities, beliefs with evidence links; the
   question inbox (one at a time, few per day, highest value first).
4. Views from confirmed beliefs: people and organisations with timelines,
   money by relationship and category, commitments (subscriptions, autopays),
   security, trips (from mail).
5. Everyday value: morning brief, nudges; the lock loosens only on confirmed
   beliefs (e.g. family), never on guesses.

## First questions (from the user's real data)

1. Is the ~₹3.1L monthly NEFT from GIOTTUS TECHNOLOGIES your salary?
2. Who is TUKUHOLI YEPTHOMI to you (family, friend, landlord, work)?
3. The ₹57,000 IMPS to account …2041 on 2 Aug: one-off or recurring?
4. What is 8Club; still using it?
5. Each of the 9 active autopays: still wanted?
6. Unknown number calling repeatedly: spam? (then block and flag)
7. Blinkit Lite (installed from an .apk) and Food Scan.apk: did you install them?
8. Off the phone ~01:00–07:00: is that sleep? (after 3 days of screen time)

## Rules

- Never ask what the data already answers; ask only when a belief matters and
  is uncertain. Every answer must visibly change something.
- Every belief shows why ("because of …") and links to its evidence.
- Local-first: app-private storage; the Mac sync is a stopgap.
- Questions come from rules first. A model may phrase them later, through a
  pluggable router (no hardcoded provider), and never receives raw data.
- Anything that loosens protection uses confirmed beliefs only.

## Risks

- Feeling watched: daily question limit; guesses shown with their evidence.
- Acting on a wrong guess: guesses inform, only confirmations act.
- Sensitive answers about people: stay on the phone.

## Where things stand

- `action-lock/`: lock core, readers, profile, Mac sync (`npm run sync`,
  `schedule`, `pair`, `mail`), 141 tests. Raw SMS/contacts/calls are not kept
  on the Mac.
- The user's Mac syncs every 6 h over Wi-Fi (`adb tcpip 5555`; redo after a
  phone restart) and pulls this branch first.
- Gmail Takeout export requested 2026-09-23; `npm run mail` reads it.
