# Relative days — "I'll send it Friday" (B4, third step; proposed)

> Status: **proposed 2026-10-02, awaiting the operator's go-ahead.** Nothing here is built.
> Extends `COMING_UP_PHONE.md` (DR-21, verified) and `ENTITIES_PHONE.md` (DR-19). Contracts unchanged. **Nothing new acts**: proposals stay a computed view and confirming goes through the gate that exists (DR-20).

## 1. Why, in plain words

Coming up reads dates that **name themselves** (*12 Oct 2026*). A promise is usually written the other way: *"I'll send it Friday"*, *"call tomorrow"*, *"in two weeks"*. Those have no date until you say **relative to what** — and the honest anchor is
**when you kept the item**. This step teaches Coming up to read those, **shows each as a guess, and says what it guessed from**, so you can see and fix it on the review card. It is still only a proposal.

## 2. What it reads — conservative on purpose

| Reads (day-first, India-first, English) | Resolves to | Does **not** read |
| --- | --- | --- |
| **tomorrow** | the day after the item was kept | *today*, *tonight* (you can set a time today by hand) |
| **day after tomorrow** | two days after | **yesterday**, *ago*, *last…*, *previous…* (the past) |
| **in N days / weeks** (N a number or *one … ten*) | N days / 7N days after | *in a few days*, *soon*, *next week* (no day) |
| **a weekday, spelled out** — *Friday* (also *on / by / this Friday*) | the **first such weekday after** the day it was kept | **next Friday**, **every / each Friday**, *Fri / Sat / Sun / Wed* (too many other meanings) |

*Why next/every are excluded, not guessed:* people mean opposite things by *"next Friday"*, and *"every Friday"* is a recurring promise a one-off reminder would get wrong. **Not reading is better than reading wrong.**
A weekday written **on that same weekday** resolves to **the following week's** (a message sent on a Friday that says *Friday* nearly always means the next one) — and it is labelled a guess like the rest.

## 3. How it shows

On **Coming up**, a guess is **its own line, marked and explained**:

> **Fri 9 Oct 2026** — *a guess*: "Friday", from when you kept it (Tue 6 Oct)  ·  **Remind me on 9 Oct**

The tap is the same flow as every other reminder: the date is pre-filled, the time starts at nine, the **review card shows the exact date** (so a wrong guess is corrected in front of you), Cancel is the default.

**Guesses never light the dot.** The quiet mark means *a date you wrote down is near*; a guess is a suggestion, and a suggestion should not tug at you.

## 4. The design, in the same shape as Handles

1. **A pure function**: `relativeDays(text, anchorDate) → [{date, phrase}]` — no clock of its own (the anchor is **passed**, so it is deterministic and replayable), no Android, nothing stored. A TypeScript reference (`runtime/entities`) and the phone's Kotlin (`runtime/brain`),
   **both held to hand-written cases** serialised as shared vectors — the discipline that found two real bugs in the first handles.
2. **`ComingUp`** asks it for each kept item with the item's **kept date in your time zone** as the anchor, keeps results that are today or later, and groups them with the dates that name themselves, flagged `guess`.
3. **Nothing is written.** The same source guards as Coming up: the model and screen reach no notification, alarm, record or sealed store.

## 5. Risks

| Risk | Handling |
| --- | --- |
| A wrong guess becomes a wrong reminder | It is a proposal only; the card shows the exact date; Cancel is the default; the line says what it guessed from |
| The anchor is wrong (a message written Tuesday, kept Thursday) | Stated on the line (*"from when you kept it"*); the card lets you move the date |
| Noise — *"Friday"* in a headline, *"Sunday Times"* | Only a weekday **spelled out** after a plain context, never *next/every*; guesses are marked and do not light the dot; a past guess is not shown |
| Other languages (Hindi, Hinglish: *kal*, *parso*) | **Not read**, stated; the English rules do not guess at them |
| The two implementations disagree | Shared hand-written vectors (weekday arithmetic across month and year ends, the same-weekday case, every exclusion), mutation-checked |

## 6. Not in this step

Times of day (*"3 pm"*, *"morning"*); *next/last/every*; Hindi and Hinglish; recurring reminders; names (*"call Ravi"* — AD-17); a remembered *"don't suggest this"*; any reminder created without your confirmation.

## 7. For the operator to approve

1. **The expressions** in §2: *tomorrow*, *day after tomorrow*, *in N days/weeks*, and a spelled-out weekday — and **not** *next / every / abbreviations / Hindi*.
2. **Guesses are marked, explained on the line, never light the dot.**
3. **The anchor is when you kept the item**, in your time zone; a weekday written on that same weekday means the next week's.
