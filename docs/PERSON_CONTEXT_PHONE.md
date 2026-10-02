# A person's context, and reaching them from it (B3/B4, People slices 3 and 4; proposed)

> Status: **proposed 2026-10-02, awaiting the operator's go-ahead.** Direction chosen by the operator ("orb building a context of them and to invoke a communication from there"; "Yes, go ahead with slice 1 and 2"); the details in §6 are what is left to approve. Nothing here is built.
> Builds on `PEOPLE_PHONE.md` (DR-24), `PEOPLE_SEARCH_PHONE.md` (DR-27), `PERSON_ACTION_PHONE.md` (DR-26) and `GATE_PHONE.md` (DR-20). The *intelligent chat* that comes after (drafting, a model) is **not** in this document; §7 says what it will need.

## 1. Why, in plain words

You find a person by search and can set a reminder about them. Two things are missing: **what Orb knows about them at a glance**, and **a way to reach them from there**. Slice 1 is the first; slice 2 the second. Neither needs a model.

## 2. Slice 1 — the person's context (computed, never stored)

At the top of a person's window, from the kept items that mention them (the same items as today, found by number, email or name), computed when the window opens and let go when it closes (DR-19):

- **Last mentioned** and **first mentioned** (dates), and **how many items**.
- **Where from**: how many came from each app or from shares (*com.whatsapp ×9, com.android.chrome ×3, shared ×2*).
- **Often with**: what appears most with them (numbers, sites, amounts) — as now.
- **Dates ahead in these items**: the dates they mention that are still ahead, and relative days (*Friday*, *tomorrow*) as **marked guesses** from when the item was kept — **the same reader as Coming up, restricted to this person's items**. Each has *Remind me on…* (the existing flow, citing that item), so you act on a date from the person's page.
- Not shown, on purpose: **reminders about the person** (a reminder cites no item and never records the person, DR-26, so there is nothing to list them by), and **anything Orb has not been given** — it does not read the chats; it knows only what you shared or let it remember.

## 3. Slice 2 — reach them from there (a hand-off, new declared capability)

Three buttons in the person's window: **WhatsApp**, **Message** (SMS) and **Call**. Each is a **hand-off to the other app**: Orb opens it with their number filled in and **you press send or call**. **Orb sends nothing and calls no one.**

1. **The flow:** (if they have several numbers, you pick which) → a **review card**: *"Open WhatsApp with +91 98765 43210? Orb sends nothing — you press send there."* **Cancel is the default** → *Open*.
2. **A new declared capability**, in the registry beside the others, words pinned: **`orb.handoff.communicate` v1**, tier **Act (reversible)** — *Opens WhatsApp, your messaging app or your dialer with one person's number filled in, when you tap and confirm. Orb sends nothing, calls no one and reads nothing; you finish it there.* **Switchable and revocable** on *What Orb may do*; **no standing authorization** (every tap is confirmed).
3. **No new Android permission.** `tel:`, `smsto:` and `whatsapp://send?phone=` are ordinary intents. **WhatsApp is reached by its own scheme, never by a web link**, so if it is not installed **nothing opens** (and the refusal is recorded) — Orb never falls back to a browser, which would send the number to a website.
4. **Recorded** as its own small chain — `orb.handoff.intent` → `confirmed | cancelled` → `released | refused` — **channel only** (`whatsapp`, `sms`, `dial`) and the build. **Never the number, the name or any text.** Recorded **before** the other app is opened (record-before-show); `refused` says why (*appMissing*, *switchedOff*). It is its own family of events, **not** `orb.action.*`, so it cannot be mistaken for a reminder by the code that turns reminders off or lists them.
5. **No text is pre-filled in this slice.** Drafting a message is the next step (§7); here the other app opens empty.

## 4. What it changes in the architecture

- `Capabilities`: one more declaration; the declared-reads guard is unaffected (this is an *effect*, not a read); the manifest still adds **no** permission and **no** `<queries>` entry.
- New: `Handoff` (builds the intent and records the chain — the only file that starts another app), `HandoffFacts` (the only builder of its records), a source guard that **only `Handoff` starts another app** from a person, that **no number or text is recorded**, and that the WhatsApp intent has **no web fallback**.
- `People`/`PeopleActivity`: the context block and the three buttons. `ComingUp` gains a restriction to a set of items.
- **Nothing new is stored.** No person is recorded; the number is read from the contact you have already allowed Orb to read.

## 5. Risks

| Risk | Handling |
| --- | --- |
| Handing a number to another app is a disclosure | You see exactly what will open, with which number, before it does; Cancel is the default; it is declared, pinned, switchable, and recorded (channel only) |
| A web fallback would leak the number to a site | WhatsApp by its own scheme only; no browser path; the guard fails the build if a web link appears |
| A wrong contact (a group, a shop) gets a hand-off | You chose it and the card names the number; Orb asserts nothing about who it is |
| A mis-tap | Confirmation card, Cancel default; nothing is sent until you press send in the other app |
| WhatsApp Business or a second install | The scheme goes to whichever app handles it; Android's own chooser appears if both do |
| Context is misread as complete | The window says it knows only what you shared or let Orb remember; guesses are marked |
| *Dates ahead* guesses an old *Friday* | Same marking and same reader as Coming up; a guess never lights the dot and never sets anything by itself |

## 6. For the operator to approve

1. **The context block** in §2 (and that reminders about the person are not listed).
2. **The three hand-off buttons** and **no pre-filled text** in this slice.
3. **The new capability** `orb.handoff.communicate` v1 (Act, reversible; switchable; every tap confirmed), **no new Android permission**.
4. **WhatsApp by its own scheme only** — if it is not installed, nothing happens and the refusal is recorded.

## 7. What comes next, and what it will need (not in this document)

**Drafts from rules** (a message started from the context, you edit it) need nothing new beyond this. **A model that writes or answers** needs its own decision: a remote model is an outbound disclosure of your history (DR-9) — a declared, revocable capability that shows you exactly what leaves the phone before it does, with the provider never hard-coded — or a model on the phone, which this hardware and build do not have.
