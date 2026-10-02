# People starts from a search — you choose the person (B3/B4; approved and built)

> Status: **approved 2026-10-02 ("Yes, go ahead with the search design") and built** (`DEVICE_LOOP.md` §7b72, `orb-app-v35-search.apk`; `DECISIONS.md` DR-27). Builds on `PEOPLE_PHONE.md` (DR-24, DR-25) and `PERSON_ACTION_PHONE.md` (DR-26). **No new capability, permission or event type.**

## 1. Why, in plain words

On a phone with 2537 contacts, People guessed who your words were about and listed the guesses first. Most of the guesses were not people: WhatsApp groups, shops, a coffee machine, a company. The guess cannot be made reliable, so the screen should not make *you* wade through it
before you can act. **You choose the person; Orb finds what it knows about them.**

## 2. What changed

1. **People opens on a search box.** Type two letters or more of a contact's name; matching contacts appear. **Nothing is listed until you type.** Case does not matter; edge blanks are ignored. Best first: the name **starts** with what you typed, then a **word** of the name starts with it, then it is **inside** a name; equals in name order; at most **25**.
2. **Every contact can be chosen**, mentioned in your words or not (contacts sharing a number or an address are one person, found by either name). Tap one: the same person window as before — their numbers and emails, what often appears with them, every kept item that mentions them — and **Remind me about this person…**. A person nothing mentions says so and can still be reminded about.
3. **What the words mention is behind a button**, collapsed: *Who my words mention (N sure, M might be)*. Inside it, unchanged: the people tied by a number or an email, then *Might be* behind its own button.
4. Unchanged: contacts are read only while People is open; nothing about a person is stored or recorded; one counts-only record per opening; the window is secure.

## 3. Risks

| Risk | Handling |
| --- | --- |
| Common names: *Ravi* has several contacts | You see them all and pick; Orb does not choose between them |
| A typed name on screen | Held in memory for the screen and let go; read by a text watcher, never stored or logged; the window is secure |
| The search finds a contact that is a shop or a group | It is *your* choice; nothing says it is a person |

## 4. Not in this slice

Searching by phone number; recently chosen or pinned people (a list of people would be sealed like a note — a separate decision); starred contacts (an extra attribute read, so a change to the declaration); calling or messaging.
