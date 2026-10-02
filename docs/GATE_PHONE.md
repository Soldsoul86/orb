# The phone's first action, and the gate it passes through — B5 + B4, first slice (proposed)

> Status: **approved 2026-10-02 ("Yes, go ahead with the design") and built** (`DEVICE_LOOP.md` §7b64, `orb-app-v28-gate.apk`; `DECISIONS.md` DR-20). As-built notes and deviations in §11.
> Implements `ROADMAP.md` B5 (the Capability → Policy → permission gate) with the smallest honest B4 (a first thing Orb does for you) on top.
> Contracts: `Capability.md`, `Policy.md`, `Action.md`; decisions DR-5 (the chain), DR-9, and the narrow ruling on standing authorization (`CLAIMS.md` §5 Ruling 1).
> **No contract text changes.** This is the first *use* of contracts that have been Accepted and never exercised on the phone.

## 1. Why, in plain words

Until now Orb has only **received**: it keeps what you hand it and tells you where it came from. Everything it ever does *to the world* — even a reminder — must pass one gate, because the way
read access became invisible (AD-7: the package scan was decided in a manifest) is the way action would become invisible too. This slice builds the gate and puts the **smallest possible action** through it:
**a reminder you set, which Orb shows on this phone at the time you chose.** Nothing leaves the phone; nothing is sent to anyone; you set it and you can cancel it.

It is deliberately *not* "Orb notices a promise and reminds you" — that is the **next** slice, and it can only be trusted once the gate it will use exists and has been seen to refuse.

## 2. The capability

One capability, declared once and then frozen (`Capability.md` §5):

| | |
| --- | --- |
| `id` | `orb.remind.local`, version 1 |
| Says | *Shows one notification on this phone, at a time you chose, that you asked for.* |
| Effects (all of them) | One notification, using the phone's own notification settings (sound, vibration, do-not-disturb as you set them). **Nothing is sent off the phone. Nothing is read.** On the lock screen it shows only *"Orb: a reminder you set"* — the words are shown only once the phone is unlocked. |
| Tier | **Act (reversible)** — it affects your attention, not the outside world, and can be dismissed or cancelled |
| Undo | Cancel it in *What Orb may do*, or dismiss the notification |
| Records | a chain of events (§4); the words are sealed, never in the journal |

## 3. The gate on the phone, smallest first

`Capability` declares consequence; `Policy` declares permission; **nothing authorizes itself**. On the phone that becomes three small, separate parts:

1. **The registry** — the declaration above, as data, frozen. (Slice 3 declares the package scan and the assistant's reads here too, which is what finally closes AD-7.)
2. **The authorization** — *you* are the policy for now. A reminder is authorized by **your confirmation of exactly this: these words, this time, this capability version**. The authorization record is
   **derived from what it authorizes** (capability, version, time, the sealed words' identity), never minted at the moment of use, so a replay gives the same identity (`Policy.md` §1).
3. **The release** — at the time, Orb checks that the authorization is still in force (not cancelled, not revoked, the item it is about not erased) and only then shows the notification, **once**
   (`Capability.md` inv. 9: verify before repeating; a second fire for the same intent is refused and recorded).

**Why this is a standing authorization and not a convenience.** `Policy.md` allows authorization given in advance only *"where waiting would defeat the action's purpose"*. Here it does, exactly:
a reminder exists to appear **when you are not looking**; asking you again at the moment it fires would be the reminder itself. That argument is written into the authorization (§4), as the ruling requires.
It is also narrow: one reminder, one time, one capability, revocable at any moment.

## 4. What is recorded (DR-5: the whole chain, including what was stopped)

`intent → review → confirm | cancel → release → result`, each a journal event that names **ids, times and identities — never words**:

| Event | When | Carries |
| --- | --- | --- |
| `orb.action.intent` | you tap *Remind me…* on a kept item | capability id + version, the item it is about (by `causes`), the chosen time (UTC and the zone it was chosen in) |
| `orb.action.confirmed` / `orb.action.cancelled` | you confirm the card (*the exact words and time*) or back out | the authorization identity (derived), the argument for urgency, the sealed note's identity; **a cancel is recorded exactly as a confirm is** |
| `orb.action.released` | the time comes and the checks pass | cites the confirmation; says it was *issued*, not that you saw it |
| `orb.action.refused` | the time comes and a check fails (cancelled, revoked, item erased, permission withdrawn) | **the reason** — the refusals are the evidence the gate works |
| `orb.action.revoked` | you withdraw *Orb may remind me* or cancel one reminder | which, and when |

**The result** (that you saw it) is **not recorded** in this slice: `Capability.md` inv. 7 — issuance is not effect, and a sensor would have to observe it. Said plainly on the screen and in the docs, not hidden.
**Pending reminders are a projection over these events**, never stored separately: after a reboot Orb replays the journal to find what is confirmed and not yet released, and sets its alarms again.

## 5. How you set one, and see what Orb may do

- **Set:** in Recall's item dialog, **Remind me…** → a date and time (pre-filled from a date the words name, e.g. *12 Oct 2026* — the handles from B3), an optional note you type (sealed) → a **review card** that shows the exact
  time and note and says *Orb will show a notification on this phone then. Nothing is sent anywhere.* → **Confirm** / **Cancel**. Cancel is the default.
- **See and withdraw:** a new screen **What Orb may do** lists the capability as declared (in plain words), the reminders pending (cancel any), and a switch **Orb may remind me** (off cancels every pending one, each recorded).
- **Android's own permission:** notifications need `POST_NOTIFICATIONS` on current Android. It is asked **when you first confirm**, with a sentence saying why. If you say no, the confirm is **refused and recorded** — nothing is scheduled and the card says so.
  **No exact-alarm permission** is requested: the reminder may be minutes late when the phone is dozing, and says so on the card.

## 6. Erasure and the item it is about

A reminder **cites** the kept item (`causes`). Erase the item and: pending reminders about it are **refused at release with the reason** (so the gate shows what the erase stopped), and the sealed note is
destroyed with its last reference. Reminders already fired stay as history, like any event. (`ERASURE.md` §3: erasure is a graph operation.)

## 7. Risks

| Risk | Handling |
| --- | --- |
| Words on a lock screen | The lock-screen text is generic; the words only after unlock; tapping opens the item behind Recall's secure window |
| The phone dozes, or a battery saver kills the alarm | Stated on the card; Orb re-sets alarms at every start and at boot from the journal; a missed one is **released late and recorded as late**, never silently dropped |
| A reminder fires twice | Release is idempotent per intent: a second attempt is `refused: alreadyReleased` |
| A reminder fires for an erased or revoked item | Refused with the reason, recorded |
| Time zones and daylight saving | Stored as UTC plus the zone chosen; shown in your zone |
| The gate is bypassed by a later feature | A source guard like `AssistGuardTest`: the notification API appears in **one** file, reachable only from release |
| New event types on the desk | They are phone device events (like `orb.erasure`); the importer ignores types it does not translate; vocabulary noted in `EVENT_MODEL.md` |

## 8. What it will be tested on (off the phone first)

A pure core (Kotlin, in the brain, no Android): the **pending projection** from journal lines; authorization identity is derived and stable under replay; each refusal reason (cancelled, revoked, erased, already released, permission
withdrawn); cancel is recorded as confirm is; a cancelled-then-replayed history never releases; the declaration is frozen (a changed declaration is a different capability). The Java shell: the card, the alarm and the
notification, behind a source guard (one file may post; only release reaches it); a check that **no word of a note is in the journal or on disk in the clear**. Mutation-checked, as before.

## 9. Not in this slice

Orb **proposing** a reminder from what it read (the next slice — it will use this gate); any message, calendar entry or payment; any network use; reminders for items not kept; recurring reminders; the result (seeing it was seen);
the package scan and assistant reads as declared capabilities (slice 3, closes AD-7).

## 10. For the operator to approve

1. **The scope:** the gate plus manual reminders now; Orb-proposed commitments next; AD-7's retrofit after.
2. **The declaration** in §2 (tier *Act (reversible)*; lock-screen text generic; nothing leaves the phone).
3. **The authorization reading** in §3: your confirmation of this exact reminder is the standing authorization, justified by *"a reminder must fire when you are not looking"*.
4. **The Android permission:** `POST_NOTIFICATIONS` only, asked at first confirm; no exact alarms (so a reminder can be minutes late).

## 11. As built

- **Files.** `ActionFacts` (the only builder of these records), `Reminders` (the gate: pending, enabled, derived authorization, `decide`), `Remind` (doing what the gate allows; the alarm and the notification are reached only through two
  small interfaces, so it runs off the phone), `ReminderNote`, `ReminderAlarms`, `ReminderNotifier` (the only file that shows a notification), `ReminderReceiver`, `MayDoActivity`; *Remind me…* in Recall's item dialog.
- **Deviations** are recorded in `DECISIONS.md` DR-20: the core is Java, not Kotlin; the capability is on until turned off; reminders about an erased item are stopped at the erase *and* checked at release.
- **Held by tests (790 phone-side checks, mutation-checked):** the declaration is pinned; the authorization is derived and stable; each refusal (permission withdrawn, turned off, item erased, reminder erased, already released, note unreadable) is
  recorded with its reason and shows nothing; the release is on record **before** the notification is posted; not confirming is recorded as confirming is; withdrawing one and turning everything off; erasing the item stops its reminders and destroys their notes;
  after a reboot alarms are set again and an overdue reminder is released late and recorded as late; a note erased before cannot be quietly kept again; a backup carries a note as words; **no word of a note is in the journal or on disk**; and source guards:
  only `ReminderNotifier` touches the notification system, only `Remind` calls it, only `ReminderAlarms` touches the alarm clock, the manifest asks for `POST_NOTIFICATIONS` and no exact-alarm and no network.
- **Not testable off the phone:** the pickers and cards, Android's permission question, the alarm actually waking, the notification on the lock screen.

