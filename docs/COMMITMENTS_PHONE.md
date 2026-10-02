# Commitments and Today — the first life state (B4; proposed)

> Status: **approved 2026-10-02 ("Yes, go ahead with the design") and built** (`DEVICE_LOOP.md` §7b75, `orb-app-v38-today.apk`; `DECISIONS.md` DR-30). As-built notes in §9. Direction chosen by the operator after the *Personal Life OS* framing (World, State, Intent).
> Builds on `COMING_UP_PHONE.md` (dates ahead), `GATE_PHONE.md` (reminders), `PERSON_LINK_PHONE.md` (the sealed-note pattern and matching a person), `PEOPLE_PHONE.md`. Contracts: `Fact.md`, `Belief.md`, `Project.md`, `Goal.md` (this is the first, smallest exercise of them on the phone).

## 1. Why, in plain words

Orb can now tell you what a person's page holds and act on it. It cannot yet tell you **what you owe, what you are waiting for, and what is overdue** — the thing a life actually needs organised. That is a **commitment with a state**: *send Ravi the GST certificate by Friday* is **open**, becomes **due**, becomes **overdue** if nothing happens, and is **done** when *you* say so.
Orb cannot see that you sent it (it does not read your chats or your outbox), so the rule is plain: **Orb never marks something done. You do. Orb only shows what is still open and when it should have been closed.**

## 2. What a commitment is

A commitment is something **you confirm** — never something Orb files silently:

- **Words** — what it is, in your words (*Send the GST certificate*). Sealed.
- **Direction** — **I owe** it, or I am **waiting for** them.
- **A person** (optional) — who it is with. Sealed with the words.
- **A date** (optional) — when it should be closed.
- **Where it came from** (optional) — the kept item it was made from; the commitment *cites* it, so you can see why.

You make one from three places: **a person's page** (*Add a commitment…*, the person already chosen), **a kept item** in Recall (*Track this…*, the words started from the item), and **a date in Coming up** (*Track this…*, the date and the item already chosen). Each opens one small form — words, *I owe / Waiting for them*, a date or *no date* — then a **card** that says what will be kept; **Cancel is the default**.

## 3. The states (computed, never stored)

`open` → `due today` → `overdue` → **`done`** or **`dropped`**; and *reopened*. The state is **read from the events and today's date** every time:

| State | Meaning |
| --- | --- |
| open | no date, or the date is ahead |
| due today | the date is today |
| overdue | the date has passed and you have not marked it done or dropped it |
| done | you marked it done |
| dropped | you decided not to |

*Overdue* is Orb's whole reconciliation in this slice: **what was supposed to happen (a date) against what you have told it happened (nothing)** — said as *"still open, 2 days past Friday"*, never as a claim that it was not done.

## 4. Today

A new **Today** screen (a new button on the main screen) — the answer to *what matters now*:

- **Overdue** — most overdue first.
- **Today.**
- **This week** — the next seven days: your commitments with dates, and the dates ahead from Coming up (written dates; guesses marked).
- **Waiting for** — what you are waiting on, with whom and since when.
- **No date** — open, undated.

Each commitment shows its words, its person (if any), its date, and **Done · Move date · Drop · Remind me · Delete**. *Remind me* is the existing reminder flow, started at the commitment's date with the words as its note; the reminder **cites the commitment**, so deleting the commitment stops it. **A person's page** gains **Open with them** — their open commitments, with the same actions — and the context line counts them.

## 5. What is recorded, and what is not

- `orb.commitment.opened` — cites the source item if there is one; carries the identity of a **sealed note** (the words, and who, if anyone), the **direction** and the **date**. **No words and no name in the journal.**
- `orb.commitment.moved` (a new date, or none), `orb.commitment.done`, `orb.commitment.dropped`, `orb.commitment.reopened` — each cites the opening; **the state is the last of them** (so a restore and a replay agree).
- **Delete** is the existing erasure of the opening: the note's key is destroyed and its reminders are stopped.
- **Erasing the source item does not touch a commitment** — it is *yours*; the lineage to the item is simply gone. (A reminder tied to an item is cancelled with it; a commitment is not a reminder.)
- **No new capability and no new Android permission.** Nothing leaves the phone. The notification, if you ask for one, goes through the existing reminder gate.

## 6. Risks

| Risk | Handling |
| --- | --- |
| Orb looks like it knows what is done | It does not: *done* is only ever your tap; *overdue* says *still open*, not *not done* |
| Words and names sealed, but shown on screen | Every window is secure (no screenshots); nothing is logged or kept in the clear |
| A commitment lingers for something long over | *Drop* and *Delete*; *Overdue* is ordered, not nagging — no notification unless you ask for one |
| Duplicates (the same thing tracked twice) | Not detected in this slice; *Drop* or *Delete* the second |
| It becomes a task manager | It is deliberately thin: words, direction, a date, a person, a state. Projects, goals and trips come later as **groupings of these** |

## 7. For the operator to approve

1. **A commitment is something you confirm**: words (sealed), *I owe / Waiting for them*, an optional person and date, an optional source item — made from a person's page, a kept item, or a date in Coming up, behind a card with Cancel the default.
2. **The states are computed** (open, due today, overdue, done, dropped) and **Orb never marks anything done**.
3. **A Today screen** (Overdue, Today, This week, Waiting for, No date) with Done / Move / Drop / Remind me / Delete, and **Open with them** on a person's page.
4. **Erasing the source item does not touch the commitment**; *Delete* erases it and stops its reminders.
5. **No new capability or permission**; nothing proposed by Orb in this slice.

## 8. Not in this slice

**Orb proposing commitments** from your messages (that needs understanding the language — rules cannot do it, a model can, and a model reading your history is its own decision about what leaves the phone; when it comes it will only **propose**, labelled *believed*, with the evidence shown, and a tap makes it yours); projects, goals and trips as groupings; money; a notification that nags; recurring commitments; reconciling against evidence Orb does not have (sent mail, bank notifications); the quiet dot counting commitments.

## 9. As built

- **As designed:** a commitment is something you confirm (words sealed, *I owe it* / *I'm waiting for them*, an optional person, an optional date, an optional source item) from **a person's page** (*Add a commitment…*), **a kept item** (*Track this…* in Recall) or **a date in Coming up** (*Track this…*), through one small form and a card with **Cancel the default**; states **computed** from the events and today's date (open, due today, overdue, done, dropped) — **Orb never marks anything done**, and *overdue* says *still open, N days past (date)*; a **Today** screen (Overdue, Today, This week, Waiting for, No date) with **Done · Move date · Drop · Remind me · Delete** (and **Reopen** on a closed one); **Open with them** on a person's page; erasing the source item does not touch a commitment; **Delete** erases it and stops its reminders; no new capability or permission.
- **Details the design left open:** (a) **Add a commitment…** is also on Today itself, for one with no person or item; (b) a person is attached only when it is made from their page — a commitment made from an item has none (it can be added later only by deleting and making it again; see AD-25); (c) *This week* is the next seven days, today excluded, the seventh day included; commitments dated beyond it are **counted, not listed**; (d) a **waiting-for** commitment is listed under *Waiting for* whatever its date (so a late one is not hidden under *Overdue*, which is for what you owe); (e) a **written date in what you kept** this week that you have not tracked is offered under *Dates in what you kept, this week*, each with *Track this…*, and drops out of the list once a commitment cites that item on that date; (f) the words are limited to **200 characters**, one line; (g) **Remind me** passes the commitment as the reminder's item, so the existing erase-an-item rule stops the reminder when it is deleted; (h) every window here is **secure** and the words are typed in a watcher, never read through a text accessor.
- **Records:** `orb.commitment.opened` (cites the source item if there is one; the sealed note's identity, `direction`, `dueDate`), and `moved`, `done`, `dropped`, `reopened`, each citing the opening. **No words and no name in the journal.**
- **Held by tests:** the sealed note and what it is not; the record's fields; opening (sealed first, cited, no words in the journal or on disk, a failed write puts the note back, the same words twice are two commitments); reading (direction, date, who, last action); the state, `daysBetween` across month, year and leap day, and the wording; Today's order and every boundary; what is open with a person; delete stops the reminder and destroys the note; erasing the item leaves the commitment; source guards (one builder of the records; only `CommitmentFlow` changes a commitment; every window secure; Cancel first on the two deciding cards; the screens that offer it; Today declared and not exported).
- **Not built:** §8, unchanged.
