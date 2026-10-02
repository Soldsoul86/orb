# Remind me about a person — the first action on someone (B4, People's next step; proposed)

> Status: **approved 2026-10-02 ("Yes, go ahead with the design") and built** (`DEVICE_LOOP.md` §7b71, `orb-app-v34-person.apk`; `DECISIONS.md` DR-26). As-built notes in §8.
> Builds on `PEOPLE_PHONE.md` (DR-24, DR-25: who a person is, computed, never recorded) and `GATE_PHONE.md` (DR-20: the reminder and the gate). **No new capability, no new Android permission, no new journal event type.**

## 1. Why, in plain words

People can now say *who your words are about*. It cannot yet *do* anything about them. The smallest honest action on a person is the one Orb already knows how to do safely: **a reminder you set**, shown on this phone at a time you chose. *"Call Ravi Kumar"* at 6 pm tomorrow — started from Ravi's own screen.

## 2. What you would see

1. **People → tap a person → a new button, *Remind me about this person…*** in the person's window (beside *Close*).
2. The **same flow as every other reminder** (`RemindFlow`): pick a date, pick a time, write a note — **the note starts as *Call Ravi Kumar*** (their name in the contact's own spelling), which you can change or clear — then the **review card** says exactly what will happen, **Cancel is the default**, and *Confirm* sets it.
3. At the time, the notification appears. On the lock screen it says only *"Orb: a reminder you set"*; the note (with the name) shows once the phone is unlocked — exactly as today.
4. It is listed on **What Orb may do**, and can be cancelled there, like any reminder.

## 3. What is recorded, and what is not

- The reminder's chain is the existing one: intent → confirmation → release (or a recorded refusal), each cited, the authorization derived from what it authorizes.
- **The person is never recorded.** The name exists only in the note, which is **sealed** like every reminder note (an attachment with its own key); the journal holds the note's hash and length, never the words. No contact id, number or address is written anywhere by this.
- Nothing leaves the phone. Nothing is sent to anyone. No new read: the person's name is already on the screen from the read you allowed.

## 4. The one real design question: what does the reminder *cite*?

A reminder today cites **the kept item it is about**, and erasing that item cancels the reminder (`GATE_PHONE.md` §6). A person is not an item. Options:

| | Effect |
| --- | --- |
| **A. Cites nothing (recommended)** | The reminder is *your* request, not derived from a kept item. Erasing some old note cannot cancel it by surprise. The intent's `causes` is empty — allowed: you asked directly |
| B. Cites the person's newest item | Lineage to something kept, but erasing that one item silently cancels *"Call Ravi"* — a surprise |
| C. Cites every item mentioning them | Cancels only when the last is erased; heavy, and a person with 40 items makes a 40-way citation for one phone call |

## 5. Risks

| Risk | Handling |
| --- | --- |
| The note holds a real person's name | Sealed, like any note; shown on the lock screen only as *a reminder you set*; erased with the reminder; *What Orb may do* lists it |
| A possible match (a word that is not a person) gets a reminder | The button is offered on **possible** people too, but the card says *Call Ravi* is **your** words — you edit it; nothing is asserted about who the person is |
| Two contacts grouped as one person | The note starts with the first contact's name; you can change it |
| Confusing the person's screen with an action on the person | The button says *Remind me about this person…* and the card says the time, the words and that nothing is sent |

## 6. For the operator to approve

1. **The button on the person's window**, opening the existing reminder flow — and **nothing else** (no calling, no messaging; those are separate, later).
2. **The note starts as *Call (name)*** and is editable.
3. **Option A: the reminder cites no kept item.**

## 7. Not in this slice

Opening the dialer or a messaging app; reminders that Orb proposes on its own ("you mentioned Ravi on Friday"); recurring reminders; birthdays; a reminder about a person who is not in your contacts.

## 8. As built

- **As designed:** the neutral button *Remind me about this person…* on a person's window (sure or possible); the existing reminder flow; the note starts as *Call (first contact's name)* and is editable or clearable; **the reminder cites no kept item** (option A) — the intent's `causes` is empty and the confirmation cites only the intent; no new capability, permission or event type.
- **Added:** the note window is now **secure** (no screenshots) for every reminder, since a note may start as a person's name — it was only the review card before; Android's notification-permission answer is forwarded from People to the flow.
- **Held by tests:** a reminder with no item stays pending when another note is erased and is shown at its time with the note; the name is nowhere in the journal; People reaches nothing of the gate itself (only `RemindFlow`); the note starts as the preset; the note window is secure.
- **Not built:** §7, unchanged.
