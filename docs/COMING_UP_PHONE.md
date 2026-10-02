# Coming up — Orb proposes, you decide (B4, second slice; proposed)

> Status: **approved 2026-10-02 ("Yes, go ahead with Coming up") and built** (`DEVICE_LOOP.md` §7b65, `orb-app-v29-comingup.apk`; `DECISIONS.md` DR-21). As-built notes in §9.
> Builds on `GATE_PHONE.md` (DR-20, verified) and `ENTITIES_PHONE.md` (DR-19, verified). Contracts: `Capability.md`, `Policy.md`, `Entity.md`. **No contract text changes.**

## 1. Why, in plain words

You can now set a reminder by hand. The next step is the one that makes Orb feel like a memory: **it notices a date in something you kept and offers to remind you** — you never have to remember to ask.
It must do this **without** doing anything to you uninvited. So the whole design is one rule: **Orb may *propose*; only you *confirm*, and confirming goes through the gate that already exists.**

## 2. What it is

A screen, **Coming up**, listing what your kept words say is still ahead:

- **Dates that name themselves** (`12 Oct 2026`, `12/10/2026`) that are **in the future**, found in kept screens and shared text by the handles from B3 — each with the item's app and a few words of context, and **Remind me on 12 Oct** (nine in the morning of that day) as one tap that opens the same review card as *Remind me…* (Cancel the default).
- Optionally (§4, your choice): **weekday words resolved from when you kept it** — *"I'll send it Friday"* kept on a Tuesday means the coming Friday. Shown as a guess, because it is one.
- A dot on the main screen's button when something new is ahead. **No notification, no sound, no interruption** — Orb does not reach out; you look when you look.

## 3. Why this needs no new capability and no new record

A proposal is **a view, computed when the screen opens, from words held in memory, and never stored** — the exact road of Mentions (DR-19). Nothing is written, so it cannot outlive an erase, cannot leak, and cannot "act".
It reads (it is `Observe`, local, on words you already kept) and **shows**; it does not post, schedule or send anything. The only action — the reminder — is the one you confirm, through the capability, the authorization and the
refusals already built. *Proposing is not acting*, and the architecture keeps them apart: this slice adds **no** path to the notification system (the source guard that says only `Remind` calls it stays true).

What you *decline* is not recorded either: there is nothing to record. (A "don't show this again" would be a decision about you and is deliberately not built; see §6.)

## 4. The one choice that is yours: relative days

*"Friday"* has no date until you say *which* Friday. Reading it relative to **when you kept the item** is right most of the time (the next Friday after you wrote it) and wrong sometimes (*"last Friday"*, *"every Friday"*).

| | |
| --- | --- |
| **A. Dates that name themselves only (recommended first)** | Reliable; misses *"Friday"* |
| **B. Also weekday names (and *tomorrow*), resolved from when it was kept, shown as a guess** | Catches the commitment you actually wrote; wrong sometimes, and says so; needs rules for *last / every / next*, which I would exclude rather than guess |

Recommendation: **A now, B as its own step** once you have seen how A reads on your real words — the same discipline that put OCR off.

## 5. Risks

| Risk | Handling |
| --- | --- |
| It lists a date that is not a commitment (a past booking, a historical date) | Only dates **in the future**, and the card is a proposal you must confirm; nothing happens otherwise |
| A date that looks like a date and is a version or an id | The B3 rules already exclude those (`1.2.2026` is not a date); the same cases are re-tested here |
| The list is a sensitive index of what is coming in your life | Secure window like Recall; never exported or logged; a source guard like Mentions' |
| It nags | It cannot: no notification, no badge sound; the dot appears only when the screen would show something new, and not at all if you ignore it |
| Cost at thousands of items | Bounded like Recall (the newest 500, says what it did not look at, AD-13) |
| It proposes something about an item that is later erased | A projection over live items only: gone by construction |

## 6. Not in this slice

Notifications that *suggest*; a "never suggest this" memory (it would be recorded behaviour about you — a separate decision); relative days (§4 B); times of day (*"3 pm"*) — the card lets you set the time; recurring reminders;
people (*"remind me to call Ravi"*) — needs a name, so it waits for the contacts gate or a model; anything that sends or books on your behalf (that is a new capability with its own gate).

## 7. What it will be tested on

Future-only (a date before *now* is not shown; today is); the same date in two items groups under one line; erased items vanish; look-alikes (version numbers, ids, past dates) produce nothing; the proposal list is
byte-identical for the same words and clock; **nothing written** (journal and disk byte-for-byte unchanged); the tap opens the existing review card and nothing else; a source guard that the screen reaches no notification, alarm or journal-append API.
Mutation-checked, as before.

## 8. For the operator to approve

1. **Approach:** Orb proposes as a **computed view** on a **Coming up** screen with a quiet dot — no notification, nothing recorded for declining.
2. **Dates that name themselves only for now** (§4 A); relative days as a later step.
3. **Reminder time:** nine in the morning of the date, editable on the card (as *Remind me…* already is).

## 9. As built

- **`ComingUp`** (the view: dates today or later, grouped soonest first, newest kept first within a date, a date named twice in one item once, reminders already set marked *for that date only*), **`ComingUpActivity`** (the screen, secure like Recall),
  **`RemindFlow`** (the *Remind me…* flow, moved out of Recall's activity so both screens offer the same one: pickers → optional note → review card, Cancel the default and a decline recorded → confirmation → Android's permission if missing).
- **The dot** is computed on a background thread when the main screen opens and writes only a button's text: `Coming up ●` when an un-reminded date is within seven days.
- **Approval items taken as proposed:** a computed view with a quiet dot (no notification); dates that name themselves only; nine in the morning (the picker starts at nine; the person sets the time).
- **Held by tests (854 phone-side checks, mutation-checked):** zone-correct "today" (20:00 UTC is still the 2nd in UTC and already the 3rd in Kolkata); only today-or-later (no past, no version-number or order-id look-alike); grouping and order; an erased item vanishes; the reminder mark is per item and per date;
  the dot counts only what is near and un-reminded; the same answer for the same words and clock; **nothing written** (journal and every file byte-for-byte unchanged); bounded like Recall; and source guards — the model and the screen reach no notification, alarm,
  record or sealed store, the screen's only way to act is the shared flow, whose card defaults to Cancel and records a decline.
- **Not testable off the phone:** the screen's rows, the dot on the main screen, the pickers and card.

