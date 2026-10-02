# Tell Orb who an item is about — a link you make (B3, People slice 5; proposed)

> Status: **approved 2026-10-02 ("Yes, go ahead with the design") and built** (`DEVICE_LOOP.md` §7b74, `orb-app-v37-link.apk`; `DECISIONS.md` DR-29). As-built notes in §8. The problem, found on the device: *a chat saved from Sasi does not mention Sasi, so it is not in her context*.
> Builds on `PEOPLE_PHONE.md` (DR-24), `PERSON_CONTEXT_PHONE.md` (DR-28), `GATE_PHONE.md` (the sealed-note pattern) and `Entity.md` §2 (*a recorded resolution when a **person** decides*).

## 1. Why, in plain words

Orb ties an item to a person only by **what the item's text contains**: their number, their email, their name. A chat you save from someone almost never contains the other person's name — the messages do not repeat it. So Sasi's chat (257 bytes, no *Sasi*, no number) is invisible to Sasi's page, and no
tuning of the matching can fix that. **You know whose chat it is. Tell Orb once.**

## 2. What you would do and see

1. **From a kept item (Recall):** the item's window gets a button **This is about a person…**. It opens People in a *choose* mode — the same search over your contacts — you tap Sasi, a card says **"Link this to Sasi? Orb will list it on her page."** *Cancel* is the default; *Link* does it.
2. **From a person's page:** a new button **Add something I kept…** lists your newest kept items (a line of each); tap one; the same card; *Link*.
3. **On her page**, a linked item appears with **you linked it** (instead of *has their number*), counts as **sure** (your decision beats a guess), contributes to the context line, the *From* line and the dates ahead — and has **Unlink**.
4. **Unlink** removes only the link. The item stays kept, as it was.

## 3. What is recorded, and what is not

- **The journal holds only that you linked an item** — one event, `orb.person.linked`, that **cites the item** (its `causes`) and **carries the identity of a sealed note**. **No name, number or email is in the journal.**
- **The sealed note** (its own header, never listed in Recall, never searchable) holds **who** — the contact's name and the numbers and emails they have *as of that moment* — encrypted with its own key like a reminder's note. People reads it when it opens, to find which person on the screen it means: **by a shared number or email, else by the same name**.
- **Unlink** declares the link erased (the existing erasure), which destroys the note's key: the link is gone for good and the destruction is on record.
- **Erasing the item destroys the links to it** (erasure is a graph operation, `ERASURE.md`), as it already does for reminders about it; on start-up Orb finishes any destruction a crash left owed, as it does for other erasures.
- **A backup carries the note** as words, like a reminder's note (so a restored phone keeps its links). A restore on a phone with other contacts finds the person by number or email; if the contact is gone, the link is **dormant** (nothing shown, nothing lost).

## 4. What it changes in the architecture

- **No new capability and no new permission.** The contacts are still read **only by `PeopleActivity`**, only while it is open: the *choose* mode is a mode of that screen, not a read in Recall. Linking has no effect outside Orb.
- New: `PersonLink` (the pure part: the sealed note's document, the event, reading the links from the journal, the cascade on erase), `PersonLinkFacts` (the only builder of the record); `People.compute` gains the links as a fourth, strongest kind of evidence (`link`, *by you*); `RecallActivity` and `PeopleActivity` gain the buttons; `Backup` carries the note; `Erase`'s callers cascade.
- AD-17 point 2 (*no recorded resolution when a person decides*) is **partly closed**: an item↔person decision is now recorded. **Merging two persons into one, and splitting one, are still not built.**

## 5. Risks

| Risk | Handling |
| --- | --- |
| The link note holds a person's name and numbers | Sealed with its own key; never in the clear journal or search; erased with the item or the link; carried in a backup only as the existing sealed notes are |
| A wrong link | A confirmation card names the person; Unlink removes it; it changes only what is shown on one page |
| The contact later changes name and number | The note matches by number *or* email *or* name as it was; if all changed, the link is dormant, not wrong |
| Two people with the same name | The link records the numbers and emails too, and matches those first |
| Linking from Recall needs the contacts | Opened as a mode of People (where they are already read, only while it is open), never read in Recall |
| Linking many items by hand is tedious | Honest cost of not guessing; *Add something I kept…* lists the newest so it takes a tap each; a later step could offer it from the screen capture itself |

## 6. For the operator to approve

1. **Linking from the item's window** (*This is about a person…* → People in choose mode → confirm card).
2. **Linking from the person's page** (*Add something I kept…* → the newest items → confirm card).
3. **The link is a sealed note** holding who (name, numbers, emails); **the journal holds only the item it cites and the note's identity**; erasing the item or unlinking destroys it.
4. **Linked items are labelled *you linked it*, count as sure, and are dormant (not wrong) if the contact is gone.**

## 7. Not in this slice

Merging or splitting persons; linking from the screen capture or the share sheet at the moment of keeping; guessing a chat's person from its app or title; any group chat; unlinking in bulk.

## 8. As built

- **As designed:** *This is about a person…* on a kept item's window (Recall) opens People in **choose mode** (the search only; tap a contact → a card, Cancel the default → *Link*); *Add something I kept…* on a person's page lists the newest 30 kept items not already linked to them; a linked item is labelled **you linked it**, counts as **sure**, and has **Unlink**; **one `orb.person.linked` event cites the item and carries the identity of a sealed note** holding names, numbers and emails; no name is in the journal or on disk in the clear; the contacts are read only by People.
- **Details the design left open:** (a) the sealed note carries a **random nonce**, so no two links share bytes — a link erased once can be made again (a reminder note erased once cannot, by design; a link is not a thing to be kept out); (b) a person is found again by **a number or an address in common, else the same name** (case aside), so a contact whose number or name changed is still found; (c) Recall starts People through `PeopleActivity.chooseFor`, so **Recall still never starts an activity** (its guard is unchanged) and only the item's event id travels, to Orb's own screen; (d) after a link or an unlink the screen is recomputed and **the same person's page opens again**; (e) the cards that name a person are **secure**, the unlink card too; (f) the items list (*Everything Orb keeps*) names a link note **person link**.
- **Undone by erasure:** *Unlink* = the existing erasure of the link event (its note's key is destroyed); erasing an item in Recall erases its links; at start-up `PersonLink.reconcile` erases links whose item was erased by any other path (the *Everything Orb keeps* screen).
- **Held by tests:** the note's reading and what it is not (never listed in Recall); the link and its record (fields, causes, no name in the journal or on disk); duplicates; the same item to two people; by-number outranking nothing but yours; found again after a number or name change; dormant when the contact is gone and not wrongly shown to anyone else; unlink destroys the note and touches nothing else; relinking after an unlink; the cascade and the start-up pass; a backup carries the note; source guards (one builder of the record, Recall never reads contacts, the flows are behind cards with Cancel the default, secure windows).
- **Not built:** §7, unchanged.
