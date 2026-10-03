# Using what Orb now holds — the dates in a document, the line they are on, and a commitment from it (option 1; proposed)

> Status: **proposed 2026-10-03, awaiting the operator's go-ahead** ("Yes, go ahead with the design for option 1" asked for this write-up; building waits for the next "yes"). Nothing here is built.
> Builds on: Sources (`SOURCES_PHONE.md`, DR-33 — four PDFs are kept on the operator's phone), Coming up (`COMING_UP_PHONE.md`, DR-21), relative days (`RELATIVE_DAYS_PHONE.md`, DR-23), Commitments (`COMMITMENTS_PHONE.md`, DR-30), person links (`PERSON_LINK_PHONE.md`, DR-29). **No new capability, no new permission, no new record.**

## 1. Why, in plain words

Orb now holds the *words* of your PDFs. Everything it already does with kept words — find a date, offer a reminder, make a commitment, tie to a person — will run on them. But those views were made for **short things you shared or saw on a screen**, and a PDF is neither short nor written the same way. Reading the code (I cannot read your PDFs — they are sealed on your phone), four things will go wrong, in this order of annoyance:

1. **Coming up lists every future date in a document**, with the **top of the document** as its only context (the letterhead, not the line the date is on). An invoice with a due date, a statement period and a renewal clause becomes three unlabelled *Remind me* rows that all say the same company name.
2. **Relative days are read from the day you kept it** (*Friday* → the next Friday after the keep). For a short note you wrote, that is right; for a document written weeks ago and kept today, it is meaningless. Documents should not get guesses.
3. **The commitment you can make from a dated row is pre-filled with the item's first words**, which for a PDF is not the promise.
4. **Nothing says who a PDF is about**, and a 43,000-character document mentions many names.

This slice fixes the first three. The fourth is a smaller, separate step (§5).

## 2. What you would see

**Coming up, for documents** (items kept from the Documents source; everything else is unchanged):

- **Only dates written down.** No *Friday* or *tomorrow* guesses are made from a document.
- **The line the date is on**, in the document's own words, under the date — *"Payment due by 3 Oct 2026"* — instead of the top of the document. If the line is long it is cut at a word and marked.
- **Dates that look like a deadline come first.** A date whose line has a cue — *due, pay, payable, by (right before the date), before, on or before, last date, deadline, expires, expiry, valid until/till, renew, renewal, appointment, check-in, departure, arrival, delivery, interview, exam* — is listed with the other deadlines. **Every other future date in the document** is folded under *Other dates in this document (N)*, one tap to open. The cue list is a short fixed English list written in the code and held by tests; it is a sort, not a filter — **no date is hidden, only put second**.
- **At most 12 dates per document** are listed, the soonest first; the rest are counted (*and 5 more*).
- **The quiet dot on the main screen does not count a document's *other* dates** — only its deadline-looking ones — so a statement cannot make Orb look urgent.

**Make a commitment from a dated line.** The existing *Make a commitment…* on a Coming up row opens the same card (words, *I owe it / I'm waiting for them*, the date, who it is with, **Keep**), but for a document the words are **that line** (editable), the date is **that date**, and you choose the direction and the person as always. Nothing is filed until you press **Keep**. This is the existing commitment path unchanged — same record, same note, same state rules (Orb never marks anything done).

## 3. How it works, and why nothing new is recorded

- **A document is recognised by what the clear record already says**: its `orb.shared` event has `referrer: orb-source://documents`. No new field.
- **A new pure class, `DocumentDates`** (no Android): given the document's text, today's date and nothing else, it splits the text into lines, finds the dates **per line** with the same date reader every other view uses (`Mentions`), drops the past, attaches the line, ranks by the cue list, caps at 12 and returns the rest as a count. It reads the text in memory; the answer is never stored (DR-19 — a view, not a record). An erased item is simply not in the list.
- `ComingUp.compute` calls it for document items and keeps its current road for everything else. **Coming up still writes nothing, reaches no notification, alarm or journal append** — the source test that says so keeps holding it.
- **No change** to capabilities, to the manifest, to the importer or to any event type.

## 4. Risks, said plainly

| Risk | Handling |
| --- | --- |
| **A PDF's text comes out in the reader's order, not the page's.** Columns can interleave, so "the line a date is on" can be a fragment or two things joined (AD-28 item 1). | The line is shown as read and is **editable on the commitment card**; if your PDFs read badly the dates still show, with a worse line. This is exactly what the first device round decides. |
| **A cue word in the wrong place** (*prepared by 3 Oct*, *by* appearing in a sentence). | *By* counts only when it is **immediately before the date**; the rest of the cues are whole words. A wrong cue puts a date first instead of second — it never hides one. |
| **A date format the reader does not know.** | Same as today everywhere in Orb: day-first numeric and *12 Oct 2026* forms are read; others are not. Documents using other forms show fewer dates, never wrong ones. |
| **English only.** A Hindi or Tamil document's cue words are not in the list. | Its dates still appear (second group). Other languages are a later step, as for nudges. |
| **A date in the past kept as "upcoming"** | Dropped, as today. |
| **Speed.** A 43,000-character document is ~1,000 lines. | Each document is read once when Coming up opens; a measured cap on lines per document is part of the build (and a test), not a guess. |
| **Not testable off the phone:** how *your* PDFs read. | Everything except that is. The first round asks you to look at three real documents. |

## 5. Not in this slice (and what is next in line)

- **Who a PDF is about.** The proposal for the next step: on a document's detail, **"People in this document"** — only the contacts it names *surely* (full name, number or email; never a first-name guess, which over 43,000 characters is noise) — each with one tap to *This is about (name)*, the link you already make by hand. Nothing is linked unless you tap.
- **Amounts** (*Amount due ₹18,250*) as a second line on a deadline row — tempting, but money and currency need their own care.
- **A model proposing commitments** from the text — its own decision about what leaves the phone (DR-9); the deterministic version above comes first so you can see how far rules go.
- **Document kinds** (invoice, ticket, statement) — the cue list is the cheap version of this.
- **Keeping the original file** or a viewer.

## 6. For the operator to approve

1. **Documents get their own rules in Coming up**: written dates only (no guesses), the line each date is on, deadline-looking dates first and the rest folded, at most 12 per document.
2. **The commitment from a dated line uses that line** (editable) — the existing card, unchanged otherwise.
3. **The cue list** in §2 (English, fixed, a sort and never a filter). Tell me words you want added or removed.
4. **The quiet dot ignores a document's other dates.**
5. **People in a document is a separate step** (§5), not in this build.

*One thing you can do now, if you like, with no new build:* open **Coming up** on v42 and tell me what the four PDFs show there. It would show me the real problem before I fix an imagined one.
