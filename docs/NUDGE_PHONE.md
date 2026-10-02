# Nudge — a draft from a commitment, handed to WhatsApp or Messages (B4; proposed)

> Status: **proposed 2026-10-02, awaiting the operator's go-ahead.** Direction chosen by the operator ("Yes, go ahead with the design" on the *nudge from a commitment, drafted from rules* proposal). The five details in §7 are what is left to approve. Nothing here is built.
> Builds on `COMMITMENTS_PHONE.md` (DR-30: the commitment, its state, its person) and `PERSON_CONTEXT_PHONE.md` (DR-28: the hand-off, **which deliberately opened the other app empty**). **This changes that one decision**, so it is a new capability version (§4).

## 1. Why, in plain words

You are waiting for the invoice from Arun and it is two days late. Orb knows: the commitment, who it is with, the date it was due. Today you would have to open WhatsApp and write the message yourself. The smallest useful step is for Orb to **write the first draft for you** — from fixed templates, no model — so
that what you owe the situation is one tap, an edit, and *send*.

## 2. What you would do and see

1. On an **open commitment that is with someone whose number Orb has** (Today → **More…**, or **Open with them** on their page), a new action: **Nudge…**
2. **Pick WhatsApp or Message.** (If they have several numbers, pick one — as for any hand-off.)
3. A **card with the draft, editable**, and who it goes to:
   *To: Arun · +91 98765 43210* — *"Hi Arun, a quick reminder about “Invoice from Arun” (due Fri 3 Oct). Could you let me know where it stands?"*
   **Cancel is the default.** You change the words as you like.
4. **Open** → the other app opens with **their number and your text filled in. You press send.** Orb sends nothing.

## 3. The drafts (fixed templates; no model, English only)

The first name is the first word of the contact's name; the words are the commitment's, in quotes; dates read *Fri 3 Oct*. Four cases, chosen by the direction and the date:

| You are… | Draft |
| --- | --- |
| **waiting for them**, date passed | *Hi Arun, a quick reminder about “Invoice” (it was due Fri 3 Oct). Could you let me know where it stands?* |
| **waiting for them**, otherwise | *Hi Arun, just checking in about “Invoice”. Could you let me know where it stands?* |
| **you owe it**, date passed | *Hi Arun, sorry for the delay on “Invoice” (it was due Fri 3 Oct). I'm on it and will send it as soon as I can.* |
| **you owe it**, otherwise | *Hi Arun, about “Invoice” — I'll have it to you by Fri 3 Oct.* (no date: *… — I'll be in touch about it.*) |

They are a **starting point you edit**, never sent as they are: the card is the review, and nothing opens until you press **Open**.

## 4. The one decision this changes — a new capability version

The hand-off (DR-28) was declared as *opening an app with a number filled in*, and the words were pinned: **a change to what a capability may do is a new capability, not an edit.** Handing **your own words** — the commitment's, which are sealed today — to another app's message box **is** a change. So:

- **`orb.handoff.communicate` becomes v2**, with new pinned words: *Opens WhatsApp, your messaging app or your dialer with one person's number filled in — and, when you ask for a draft, a message you have seen and may have changed — when you tap and confirm. Orb sends nothing, calls no one and reads nothing; you press send or call there. Only which kind of app was opened, and whether a draft was used, is kept — never the number or the words.*
- **Still: Act (reversible), switchable, every tap confirmed, no new Android permission, no web link** (WhatsApp by its own scheme).
- **v1's history stays as it is** (its events carry `version: 1`); the switch on *What Orb may do* is the same switch; **your approval of this design is the decision**, and every draft is shown on a card before anything opens.
- **The dial hand-off has no draft** (a call has no text). *Call* is unchanged.

## 5. What is recorded, and what is not

- The same chain `orb.handoff.intent → confirmed → released | refused`, **channel only**, now with **`version: 2`** and **`drafted: true`** when a draft was used. **Never the number, the name or the words** — neither your edit nor the template.
- The commitment is **not changed** by a nudge (no `done`, no date moved) and **the record does not cite it**: nothing in the journal says *which* commitment you nudged. (A *last nudged* mark would need that; it is a later step.)
- The text lives only on the card, in the intent that starts the other app, and in the other app's own message box — **where it is theirs, by design**, like the number.

## 6. Risks

| Risk | Handling |
| --- | --- |
| Your sealed words go into another app | Only after you have seen and edited them on a card; nothing else leaves; the record carries no words; declared, pinned, switchable |
| A draft sounds wrong or promises something | Four plain templates; the card is the review and **Cancel is the default**; *I'm on it* / *I'll have it by* are the user's to change |
| WhatsApp or the messaging app ignores the text | SMS apps differ: some ignore the pre-filled text and open an empty chat — the number still arrives; nothing is sent either way |
| A wrong person (a shop, a group) gets the nudge | The card names the person and the number; Orb asserts nothing about who they are |
| A very long commitment | The words are capped at 200 characters already; the draft is cut at 500 |
| Non-English | The templates are English only; a Hindi or Tamil commitment is quoted as written inside an English sentence — edit it on the card |

## 7. For the operator to approve

1. **Nudge…** on an open commitment with a person whose number Orb has: WhatsApp or Message, a **draft from the four fixed templates**, **editable on a card with Cancel the default**, then the other app opens with the text filled in and **you** press send.
2. **A new capability version**, `orb.handoff.communicate` v2, with the new pinned words above; v1's history untouched; the same switch; **no new permission**.
3. **The record** carries `version: 2` and `drafted: true` — never the text — and **does not cite the commitment**.
4. **English templates only**, as in §3; the first name from the contact; dates as *Fri 3 Oct*.
5. **No draft for Call**, and **no Nudge** for a commitment with no person or no number.

## 8. Not in this slice

A model writing or answering messages (its own decision about what leaves the phone); other languages; a *last nudged* mark or a nudge counter; scheduling a nudge; nudging from a person's page without a commitment; any automatic send.
