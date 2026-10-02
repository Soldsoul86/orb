# People — "everything about Ravi" (B3, second slice; proposed)

> Status: **approved 2026-10-02 ("Yes, go ahead with option A") and built** (`DEVICE_LOOP.md` §7b69, `orb-app-v32-people.apk`; `DECISIONS.md` DR-24; limits `ARCHITECTURAL_DEBT.md` AD-21). As-built notes in §8.
> Builds on `ENTITIES_PHONE.md` (DR-19: computed, never recorded), `GATE_READS_PHONE.md` (DR-22: every read declared) and `ARCHITECTURAL_DEBT.md` AD-17. Contracts: `Capability.md`, `Entity.md`. **This is the first read of something Orb has never read, so it needs a new declared capability and a new Android permission — which is why it is a design for your decision, not a quiet build.**

## 1. Why, in plain words

Mentions can say *"everything that mentions this phone number"*. It cannot say **"everything about Ravi"**, because *Ravi* is a word, not a handle: only you (or your contacts) know that "Ravi", "Ravi Kumar" and +91 98765 43210 are one person. That is the step from a pile of notes to a memory.
There are only three honest sources of that knowledge, and the choice between them is the real decision here.

## 2. The options

| | How Orb learns who "Ravi" is | Cost |
| --- | --- | --- |
| **A. Your contacts, opt-in (recommended)** | A new capability `orb.read.contacts` reads names, numbers and emails **from the phone's contacts, on the phone, when you open a People screen** — in memory, never stored. A person = a contact; "everything about Ravi" = kept items that mention his **name or any of his numbers or emails** | Contacts are among the most sensitive things on a phone: a new Android permission (`READ_CONTACTS`), asked once with a plain sentence, revocable here and in Android's settings |
| **B. A model** | A language model decides "Ravi" is a person | A remote model is an irreversible disclosure (DR-9); an on-device one does not exist on this build. **Not available** |
| **C. Your own list** | You tell Orb *"Ravi = these numbers"* by hand | No permission, but you do the work, and the list is words about your life that must be sealed like a note (never written in the clear journal) |

**Recommendation: A**, built so that it costs as little as possible — and **C can be added later** beside it without changing anything (a person you typed is just another source of the same name→handles map).

## 3. What A would do

1. **A declared capability `orb.read.contacts` v1**, tier *Observe*, in the registry beside the other reads, its words pinned like theirs:
   *Reads the names, phone numbers and email addresses in your contacts — only while you have the People screen open, only on the phone. Nothing is kept, nothing leaves the phone, and nothing is written to your contacts.*
   **Allowed by your grant** (a recorded decision, as the package scan's is) **and Android's own permission**, asked at the first grant. **Withdrawn** by *Revoke* on *What Orb may do* (and in Android's settings).
2. **A People screen.** It lists the contacts that your kept words actually mention (not your whole address book): each with **how many kept items** and *how it knew* — **by number** (an item contains one of his numbers: strong) or **by name** (an item names him: weaker, and labelled so). Tap a person → **everything about him**: the items, newest first, the dates and amounts that appear with him, and — because his numbers and emails are all one person — **his several numbers become one**, which closes AD-17's *"his two numbers stay two"* **without recording any merge**.
3. **Computed, never recorded** (DR-19): contacts are read when the screen opens, matched against kept words in memory, and let go. No person is ever written to the journal; erasing an item removes it from every person; revoking the capability empties the screen.
4. **Name matching is deliberately plain** (and held to hand-written cases, as the handle and relative-day readers are): a **whole word, capitalised** (so *Will* the contact is not *will* the verb), at least three letters; the **full name always**, the **first name only if it is unique among your contacts** (two Ravis → matched by full name or number only, and the screen says *"2 contacts share this first name"*). It cannot tell a person from a word that happens to be a name (*Mark*, *May*), so by-name matches say *"mentions the word 'Ravi'"*.

## 4. What it changes in the architecture

- `Capabilities`: one more declaration (`orb.read.contacts`); the guard's list of **reads Orb does not have** loses `ContactsContract`, which becomes a **declared read confined to one file** (`ContactsReader`) — and every *other* undeclared read (calendar, location, microphone, camera, clipboard, SMS, usage stats) stays forbidden.
- The manifest guard allows `READ_CONTACTS` — **only that** — and still forbids the network and every other sensitive permission.
- `Mentions` gains a person-aware lookup; the brain gets one new pure function (name matching), a TypeScript reference and a Kotlin port with shared hand-written vectors.
- **Nothing new is stored, recorded or sent.** No new journal event types.

## 5. Risks

| Risk | Handling |
| --- | --- |
| Reading contacts is a large privacy step | Opt-in by a recorded grant; read only while the screen is open; nothing kept or exported; declared, pinned and visible on *What Orb may do*; revocable; the screen is secure like Recall |
| A wrong match (*Mark*, *May*, a shared first name) | Capitalised whole words only; unique first names only; every by-name match labelled as a word, not a fact; by-number matches shown as the stronger kind |
| It exposes a contact to someone holding the unlocked phone | Same exposure as the Contacts app itself; the screen hides itself from screenshots like Recall |
| Cost with a large address book | Contacts are read once per opening and indexed in memory; kept items are bounded as in Recall (the newest 500); the screen says what it did not look at |
| Contacts that sync from several accounts duplicate | Grouped by their numbers and emails; two contacts sharing a number are one person on the screen, and it says so |

## 6. Not in this slice

Writing or editing contacts; contact photos, groups and birthdays; *"remind me to call Ravi"* from a sentence (the name is found; turning a sentence into an action is a later, gated step); other languages' names; names of places and organisations (a different source); option C; any model.

## 7. For the operator to approve

1. **Option A** — your contacts, opt-in, read only while the People screen is open — and that **C (your own list) can come later** beside it.
2. **The declaration** in §3.1 (`orb.read.contacts` v1, tier *Observe*) and **`READ_CONTACTS` only**, asked at the first grant.
3. **The matching rules** in §3.4: capitalised whole words, three letters or more, first names only when unique, every by-name match labelled as a word.

## 8. As built

- **As designed:** capability `orb.read.contacts` v1 (Observe), `READ_CONTACTS` only, asked at the first grant; read only while People is open; computed, never stored; matching rules exactly §3.4; the first name is matched only when unique among the contacts, three letters or more, capitalised; by-name matches say *mentions the word “…”*; grouping by shared number or email.
- **Added to the design:** (a) the evidence is shown as *by number / by email / by name* (email is its own, strong kind); (b) **one record per opening, counts only** (`orb.contacts.read`: contacts looked at, people mentioned) — §4 said *no new journal event types*; a read this sensitive that left no trace would break `Capability.md` inv. 6, and the record carries no name, number or address; (c) the grant and revoke are the existing `grants.granted` / `grants.revoked` events with this capability's id; (d) a person's detail also shows *what often appears with them* (the same ranking Mentions uses).
- **Where it lives:** `runtime/entities/src/names.ts` (reference), `runtime/brain/.../Names.kt` (the phone's twin, held to the same 31 hand-written vectors), `Mentions` (the only Java file that calls the brain's `Names`), `ContactsReader` (the only file that touches the provider), `ContactsAccess` (the grant), `People` (grouping and evidence), `PeopleActivity` (the screen), `ContactsFacts` (the record).
- **Not built:** §6, unchanged.

## 9. Revised after the first device run (DR-25)

The first run was on a phone with **2537 contacts**. Five invented texts produced **32 people**, all by-name matches of ordinary words, so the screen was unreadable. Two changes, approved ("Yes, go ahead with both"): the list is split into **people tied by a number or an email** (sure, shown) and **people only a name ties** (possible,
collapsed under *Show N that only a name matches*, headed *Might be…*); and a first name is **not read as the first word of the text, a line or a sentence**, where a capital means nothing. The full name is unchanged; a script with no case is exempt. Costs, in AD-21. The counts-only record gains `possible` (version 2).
