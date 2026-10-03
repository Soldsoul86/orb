# People in a document — who a PDF names, one tap to say who it is about (option 2; proposed)

> Status: **built 2026-10-03 (DR-35, AD-30) — awaiting the device (`DEVICE_LOOP.md` §7b81, `orb-app-v45-document-people.apk`).** The operator approved the design and the build ("Yes, go ahead with the build").
> Builds on: person links (`PERSON_LINK_PHONE.md`, DR-29), People and its sure/possible split (`PEOPLE_PHONE.md`, DR-24/25), documents (`SOURCES_PHONE.md` DR-33, `DOCUMENT_USE_PHONE.md` DR-34). It was named in `DOCUMENT_USE_PHONE.md` §5 as the next step. **No new capability, permission or record.**

## 1. Why, in plain words

You have kept a few PDFs. Each is about someone or some company — the telecom that sent the invoice, the doctor, the landlord. Orb can already tie a kept thing to a person **if you tell it** (*This is about a person…*), but it makes you **search your contacts from nothing** — and a PDF names its parties in plain sight: *ACME Telecom* is on the invoice, and a contact called ACME Telecom may be in your phone. Orb can **offer them**, and you **tap** to say yes.

Without this, a document is on a person's page only if its words happen to name them *and* the match is firm enough to count; a long PDF names many things by accident, so the firm-enough bar is high and most documents are on nobody's page.

## 2. What you would do and see

1. In **Recall**, open a kept PDF's window. **This is about a person…** is already there (it opens People in *choose* mode).
2. **New: for a document, the choose screen opens with a short list at the top — *This document names:* — of the contacts it names**, each with *how* in plain words (*has their number*, *has their email*, *their full name is written*), strongest first, **up to ten**. Below it, the search box works exactly as today.
3. Tap a name → the **same card as today** (*Link this to ACME Telecom? Orb will list it on their page.* — **Cancel is the default**) → **Link**. A contact already linked to this document shows **linked by you** instead of a tap.
4. On that person's page the document now appears as **you linked it** (sure), contributes to their context, and **its dates ahead (the deadlines, and the folded ones) appear on their page**, as for any linked item (DR-28/34). **Unlink** removes only the link.

**For anything that is not a document, nothing changes** — the choose screen is just the search, as today.

## 3. Which names count — and which never do

- **A phone number or an email address of the contact written in the document**, and **the contact's full name written in the document** (as `Names` already reads: whole words, the sentence-start rule from DR-25). These are offered.
- **A first name alone is never offered** for a document, even a unique one. Over thousands of characters a first name is a word, not a person (*Mark*, *Rose*, *Grace*, *Will*). They are not hidden from anywhere else in Orb — only not *suggested* here.
- **Most-firm first**: number, then email, then full name; ties by name. At most **10**; the rest are counted (*and 4 more — search to find them*).
- **The list is a suggestion and says how it knows.** A ten-digit account or order number can equal a contact's number by chance; the line *has their number* lets you judge. **Nothing is linked unless you tap.**

## 4. How it works, and what is and is not recorded

- **Recognised as a document** by the clear record already on it (`referrer: orb-source://documents`) — the same test Coming up uses; no new field.
- **No new read.** In choose mode People has **already** read the contacts and walked your kept items (that is how its screen is built, DR-24); the suggestions are **the matches it already found for that one item**, filtered by §3. So **contacts are still read only by the People screen, only while it is open**, and the capability's published words do not change. The one extra fact kept per match is **how** a name matched (*full* or *first*), which `Names` already returns and the screen used to drop.
- **Nothing is stored.** The suggestions exist for the life of the screen and are let go with it. **The only thing ever recorded is the link you confirm** — the existing `orb.person.linked`, with the sealed note — exactly as in DR-29.
- **No change** to capabilities, manifest, importer, event types, or what the link records.

## 5. Risks, said plainly

| Risk | Handling |
| --- | --- |
| **A coincidence**: a number in the document equals a contact's number; a business-like contact name appears in boilerplate | The line says *how* it matched; the card names the person; **Cancel is the default**; *Unlink* undoes it. A wrong link changes only what is shown on one page. |
| **A document that names nobody you have as a contact** | The list is simply not shown; the search below works as before. |
| **Contacts that are businesses** (*ACME Telecom*) | This is the best case: they match by full name and are what an invoice is about. Nothing special is needed. |
| **Two contacts with the same name** | Both are offered (the existing evidence groups contacts to people by number/email/name as People does). |
| **A long document is slow to match** | The match is already computed with the People screen; this adds no pass over the text. |
| **Not testable off the phone:** how often your PDFs name your contacts firmly | The first round asks you to try it on the real ones. |

## 6. Not in this slice

- **Automatic linking** — nothing is ever linked without your tap (the principle of DR-29).
- **The same list for short items** (shared notes, screens): their names already count as *possible* people; offering them in the choose screen is an easy extension, but not asked for.
- **Amounts, organisations that are not contacts, a model reading the document** (DR-9).
- **Linking a document to several people in one tap.**
- **Showing, on the document's window in Recall, who it names** — that would be a second place that reads contacts, which Recall must never do (`PERSON_LINK_PHONE.md` §4).

## 7. For the operator to approve

1. **The choose screen for a document opens with *This document names:*** — contacts named by number, email or **full name**, strongest first, at most ten — above the unchanged search.
2. **A first name alone is never suggested for a document.**
3. **Tapping uses the existing card (Cancel first) and the existing link**; nothing is linked without a tap; nothing new is recorded.
4. **Documents only** for now.

## 8. As built

- **`DocumentPeople`** (new, pure): the people one item names firmly — a number, an address or the whole name — strongest first (number, address, name; ties by name), at most ten with the rest counted; `isDocument` from the clear record (and not when erased). It imports no Android class, reads no contacts, writes nothing.
- **`People`**: each `Evidence` now also carries **`named`** — how the item's own words name the person (`number`, `email`, `full`, `first`, or none), **whatever else ties them** (so a person you linked is still known to be named by their number). When the same person is named both ways in one item, **the whole name wins over a first name**, whichever the text wrote first (before, the first match found was kept).
- **`PeopleActivity`**: in choose mode for a document, **above the search**, *This document names:* — each person with how (*has their number / has their email / their full name is written*) and *tap to link*; a person you already linked says *You linked this to them* and is not tappable; *and N more — search to find them*. A tap opens **the same card** as a search result (Cancel first) and the same link. For anything that is not a document nothing changes.
- **Nothing new is read, stored or recorded.** The suggestions are what the People screen had already found for that one item, filtered; the only thing recorded is the link you confirm (`orb.person.linked`, DR-29).
- **Tests.** Number/email/whole-name order and ties; first names never offered (unique, shared, or alone however often); the whole name beating a first name in either order; only this item's people; linked shows as linked and still says how it is named; a person linked but not named is not offered; the cap of ten and the count; only documents (a shared note, an unknown id, an erased document); and source guards (rules pure; choose mode only; the same card; suggestions above the search; one link call).
