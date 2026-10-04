# The morning brief — Orb comes to you (B6; proposed)

> Status: **approved 2026-10-04 ("Yes, go ahead with A, the morning brief", then "Yes, go ahead with the build") and built; verified on the device 2026-10-04 (v56)** (`DEVICE_LOOP.md` §7b91–§7b93, `orb-app-v56-brief-once.apk`; `DECISIONS.md` DR-40). As-built notes in §10.
> Builds on `COMMITMENTS_PHONE.md` (what you owe and are waiting for), `COMING_UP_PHONE.md` (dates ahead), `GATE_PHONE.md` (the gate, the alarm and the notification a reminder passes through). Contracts: `Capability.md`, `Policy.md`, `Action.md`; `CLAIMS.md` §5 Ruling 1 (standing authorization).

## 1. Why, in plain words

Everything Orb holds waits for you to open it. A reminder is the one thing that comes to you, and only for something you set by hand. **The brief is Orb telling you, once each morning, what is on your plate** — what is overdue, what is due today, what you are waiting on, which written dates fall this week — from what it already holds. It adds no new data and reads nothing new; it turns the Today screen into something you do not have to remember to open.

## 2. What you would see

1. **Off until you turn it on**, in a small **Morning brief** card on the Today screen: *"Orb will show one notification each morning at 08:00 saying how many things are overdue, due today and ahead. It shows counts only; tap it to see the details. Nothing leaves the phone."* — **Cancel** is the default; **Turn on** is a recorded decision; the time can be changed; **What Orb may do** switches it off.
2. **The notification** (once a day, at the time you chose): **"3 overdue · 1 due today · 2 dates this week"**, and nothing else. **No name, no word, no number** — a notification is shown on the lock screen, stored in Android's notification history and readable by any app you gave notification access and by a paired watch. **Tapping it opens Today** (secure, as it is now), where the words are.
3. **A quiet day is a quiet phone:** if there is nothing overdue, due today or ahead, **no notification is shown** and the day is recorded as `nothing`.
4. **A preview:** on the Today screen, **Show me today's brief** shows exactly what the notification would say right now — so you can judge it before turning it on.
5. **Optional, off by default:** *Show the first words in the notification.* The card says why it is off: the words then sit in the lock screen and the notification history.

## 3. What goes in it (computed when it is shown; nothing stored)

| Line | From |
| --- | --- |
| **N overdue** | open commitments whose date has passed (as Today says: *still open*, never *not done*) |
| **N due today** | open commitments dated today |
| **N waiting for them** | open *waiting for* commitments, older than **7 days** with no date or past it |
| **N dates this week** | written dates in the next 7 days from Coming up (deadlines first), that are not already a commitment |

Not in it, by design: **people to get back in touch with** (that needs contacts, and the contacts are read only on the People screen), anything about calls or messages, and anything inferred from words.

## 4. The capability, and why a standing authorization is honest here

One capability, declared once and frozen: **`orb.brief.daily` v1**, tier **Act (reversible)** — it affects your attention, not the outside world; it can be dismissed, silenced in Android's own settings (it has its own notification channel), or switched off. Says: *"Shows one notification each morning, at a time you chose, with counts of what is overdue and ahead. Counts only; nothing leaves the phone."* Records `orb.brief.shown` / `orb.brief.skipped`.

**Standing authorization (Ruling 1).** It is given once, in advance, and fires every day. That is allowed only where *waiting would defeat the action's purpose*. It does here, exactly as for a reminder: a morning brief exists to appear **when you are not looking**; asking you again each morning would be the thing it replaces. The argument is written into the grant, and **the gate still decides at the moment of release**: it must be on, Android's notification permission must be there, the day must not already have had its brief, it must not be too late, and there must be something to say.

## 5. How it fires, and what is recorded

- **The alarm.** The same kind as a reminder's: `setAndAllowWhileIdle` (no exact-alarm permission, so up to a few minutes late while the phone dozes). Each firing sets **tomorrow's**; at every Orb start (and after a reboot, via the boot receiver Orb already has) the next one is set again from the journal. Time-zone and clock changes are handled by recomputing from the zone each time.
- **If the phone was off at the time:** the brief is shown at the first start **within 3 hours** of the time; later than that it is **skipped and recorded** (`late`) — a brief at 2 pm is not a morning brief.
- **Records (counts only, never words):** `orb.brief.shown` {overdue, today, waiting, dates, late?}; `orb.brief.skipped` {reason: `off`, `noPermission`, `nothing`, `late`, `already`} — **the refusals are written, as the gate's are**, so a brief that did not come is explained. The grant and revoke are `grants.capability.granted/revoked` for `orb.brief.daily`; the **time and the words option are an event** (`orb.brief.configured` {minuteOfDay, words}) — the last one wins, so a replay agrees.

## 6. What it changes in the architecture

- **A second capability that Acts** (the first is the reminder), with its own words pinned in `Capabilities`; a new notification channel; a receiver for its alarm. **One new manifest component (the receiver, not exported); no new permission** (the notification permission is already asked for reminders; if it is missing, the brief asks at the first Turn on, with a sentence saying why).
- New pure code: `BriefRules` (what the lines are, the gate's decision, the next time, the late rule), `BriefFacts` (the only builder of the records), `BriefConfig` (reading the grant and the last configuration); thin Android glue: `BriefAlarms`, `BriefReceiver`, `BriefNotifier`. `TodayActivity` gains the card and the preview. Tests and mutation checks as for every slice.
- **Nothing is stored** beyond the grant, the configuration and the records. The brief is **computed from the journal at the moment** it is shown.

## 7. Risks, said plainly

| Risk | Handling |
| --- | --- |
| **Leaking through the notification** (lock screen, history, watch, notification-access apps). | Counts only by default; the lock screen shows *"Orb: your morning brief"* with the counts hidden until unlock; the words option is off and says what it exposes. |
| **Notification fatigue.** | One a day; nothing on a quiet day; its own channel you can silence; off in one tap. |
| **A late or missed brief.** | `setAndAllowWhileIdle` can be minutes late; a reboot or update loses the alarm until Orb starts, then it is set again; more than 3 hours late is skipped and recorded, not shown. |
| **A wrong count** (a commitment you already did). | Orb never marks anything done; *overdue* says *still open*. The details are one tap away, and **Done** is there. |
| **The phone's own battery rules** kill the app and the alarm. | Said on the card; the journal shows `skipped` or no record, and the next export tells us. |
| **Time zone / daylight saving.** | The next time is computed from the zone at each firing; tests cover a change of zone and the day a clock changes. |

## 8. For the operator to approve

1. **Counts only** in the notification, words off by default.
2. **08:00 by default**, changeable on the card.
3. **Nothing on a quiet day.**
4. **The four lines** in §3, and not people/calls/messages.
5. **Skip if more than 3 hours late.**
6. **A standing authorization** under Ruling 1, with the gate re-deciding at each release and every refusal written.

## 9. Not in this slice

An evening review, a weekly summary, per-day settings, several briefs, anything read from a model, anything about people (waiting on contacts-in-the-background, which the architecture does not allow), sounds beyond the channel's defaults.

## 10. As built (v54)

All six approvals in §8 were taken as written: counts only (words off by default), 08:00 by default, nothing on a quiet day, the four lines, skipped when more than three hours late, and a standing authorization with the gate deciding at each release.

- **Where it lives.** `BriefRules` (the counts, the line, the time, the gate), `BriefConfig` (reading the grant, the time, the words option, what has been done today — all from the journal), `BriefFacts` (the only builder of the records), `Brief` (the gate's wiring: `release`, the one entry point `rearm`, turning on and off), and Android glue: `BriefAlarms`, `BriefNotifier`, `BriefReceiver` (not exported). The capability `orb.brief.daily` v1 (*Act (reversible)*) is declared in `Capabilities` with its words pinned. **One new manifest component, no new permission.**
- **One entry point.** The alarm, every Orb start and every change of time call `Brief.rearm`: if the brief is on, due today and not done, the gate decides (and writes any refusal); then tomorrow's alarm is set. If it is off, the alarm is cleared and nothing is written.
- **The gate, in order:** off → no permission (Android's, or you silenced the brief's channel) → already shown today → more than three hours late → nothing to say. Every refusal is written as `orb.brief.skipped` with the day and the reason; the same refusal twice in a row is written once. *Nothing* and *late* finish the day; *no permission* does not (you may allow it later).
- **Recorded before shown.** `orb.brief.shown` (the day, the four counts, minutes late, whether words were asked for) is written first; then the notification is posted.
- **What the notification says.** Private version: **"3 overdue · 1 due today · 3 waiting for · 2 dates this week"**, only the parts that are not zero. Lock screen: **"Your morning brief is ready"**, no counts. If you ticked *also show the first words*: a second line with the first overdue (else first due today) commitment's words, cut at 60 characters, and *(+N more)* — in the notification only, never in the journal.
- **The card (Today).** Off: a sentence and **Turn on the morning brief…**. The form has a time picker (08:00), the words box (unticked, saying what it exposes) and **Cancel** focused. Android's notification permission is asked only at **Turn on**, if it is missing. On: *On — each morning at 08:00 · counts only*, **Show me today's brief** (what the notification would say right now; writes nothing), **Change…**, **Turn off**. What Orb may do shows the status and **Switch off the morning brief**.
- **Turning on late.** If it is already past the time today when you turn it on, the brief is shown at once if that is within three hours; otherwise it is skipped (`late`) and recorded. The form says so.
- **Not built, as designed:** people to get back in touch with (the contacts are read only on the People screen), anything about calls or messages, anything inferred from words, an evening review.
- **A question the design left open, for the device:** your own commitments due **later this week** are not counted (they appear on the day they are due); only *written dates* in kept items are counted for the week. If that feels wrong, adding *N due this week* is one line.

