# The phone's entities — B3, first slice (proposed)

> Status: **approved 2026-10-02 ("Yes, go with approach A") and built** (`DEVICE_LOOP.md` §7b63, `orb-app-v27-mentions.apk`; `DECISIONS.md` DR-19). As-built notes in §9.
> Implements `ROADMAP.md` Track B step B3 under `DECISIONS.md` DR-16 (Kotlin; **rules before any model**).
> Contracts: `Entity.md`, `Relationship.md`, `Evidence.md`. **One reading of `Entity.md` §2 is applied narrowly here and is flagged in §4 for approval.**

## 1. Why, in plain words

Orb can keep things and say where each came from. It cannot yet say **"everything I have that mentions this"** — a phone number, a website, a UPI id, an amount, a date.
That is the step from a pile of notes to a memory. This slice does the part that can be done **reliably, on the phone, with rules and no model**, and says honestly what it cannot do.

## 2. What it can and cannot do without a model

| Can, by rule, reliably | Cannot, honestly |
| --- | --- |
| **Phone numbers** (India-first: `+91`, 10-digit mobiles, normalised so two spellings are one) | **People's names** — "Ravi" is a word; deciding it is a person, and the same one, needs a model or the person's own contacts (a read that is a `Capability`, i.e. **B5**) |
| **Web addresses** and the **site** they belong to | **Places** — same reason |
| **UPI ids** (`name@bank`) and **email addresses** | **Organisations** — same reason |
| **Amounts** (`₹1,200`, `Rs. 500`) | Whether two *different* handles are one subject ("his two numbers") — that is a **person's decision** (§4) |
| **Dates** that name themselves (`12/10/2026`, `12 Oct`) — *not* "Friday", which needs today's date and a guess about which | Anything in a **picture** (DR-18: no OCR yet) |

A handle is an **Entity of a narrow kind**: *this phone number, this site, this UPI id*. The words people most want ("Ravi") come when a model or the contacts gate exists; the contract allows new Entity types freely (`Entity.md` §5).

## 3. The design

1. **A pure extractor** (`runtime/brain`, Kotlin; a TypeScript reference with shared vectors, the B2 pattern): text in, a list of *(kind, normalised value)* out. No Android, no files, deterministic, refuses nothing it cannot read (it just finds nothing).
2. **Entities are a projection, computed when a screen opens, never stored** — the same road as Recall (DR-15): open each kept item's words in memory, extract, group. *Everything mentioning +91 98… * is a query over sealed words.
3. **Where it shows.** Recall's item dialog gains **Mentions** (the handles in this item); tapping one lists **every other kept item that mentions the same handle** (and says "from N items", never a count of things it could not read). Behind `FLAG_SECURE`, like Recall.
4. **Relationships**: two handles in one item are *mentioned together* — a derived edge, shown in the same list, never written down.
5. **Erasure is automatic.** A projection over sealed words cannot outlive them: erase an item and its handles vanish from every answer on the next open; nothing in the journal ever named one. (`Entity.md` inv. 3 and `ERASURE.md` §3 hold by construction.)

## 4. The one thing that needs your approval — and why

`Entity.md` §2 says *"the resolution is recorded as an Event."* On this phone **a recorded entity would be written in the clear** — the journal has no payload sealing (AD-12) — so
*"phone number +91 98…"* would sit in the journal beside a record that was designed to say only *how much* and not *what*. That would undo the work of §7b60 for every kept item. Three ways out:

| | What | Cost |
| --- | --- | --- |
| **A. Compute, never record (recommended)** | Entities and relationships are a **projection**, as `Entity.md` §1 already allows ("recomputable from history"). Nothing is written. A **person's decision** (merge two handles, name one) is the only thing that would ever be recorded — **not in this slice** | Linear in the number of items (AD-13: ≈ hundreds is fine, thousands is slow); no merge/split yet, so "his two numbers" stay two |
| B. Record sealed | Write each entity as a sealed Attachment cited by an event; rebuild on erase | A derived index that must be kept in step with every erase — the failure mode erasure is built to avoid; more machinery for the same answer today |
| C. Seal the journal's payloads on the phone | AD-12's leading option | A large change to the journal and every reader; not justified by this slice |

**Recommendation: A**, with the contract's *recorded resolution* applied when a **person** decides something — which is when it carries meaning that cannot be recomputed. This deviates from the letter of §2 for machine resolution only, and the note goes into `Entity.md`: *"a resolution that can be recomputed from sealed content is not recorded in a journal that cannot seal it."*

## 5. Risks

| Risk | Handling |
| --- | --- |
| A "phone number" that is an order id or a card number | The extractor is strict (length, prefix, Luhn-style checks for card-like runs, which are **excluded and never shown**); every kind has vectors for what it must **not** match |
| The Mentions list is itself a sensitive index of a person's life | Same screen protection as Recall (`FLAG_SECURE`); never logged, never exported, never in the journal; a source guard like Recall's |
| Cost grows with the number of items (AD-13) | Stated, bounded to the newest 500 like Recall, and says when it stopped looking |
| Regional formats I get wrong | India-first; unknown formats are *not found*, never guessed; the list says "handles Orb recognises", not "everything in it" |
| Two implementations drift | Shared vectors, computed by TypeScript and checked by Kotlin — the B2 discipline, mutation-checked |

## 6. What it will be tested on

Per kind: what it must match and must not (including look-alikes: order numbers, card-like runs, version strings, times); normalisation (`+91 98765 43210` = `9876543210`); a handle in two items groups them, in an erased one does not; the same text in different casing; very long text; nothing written to the journal or disk (guard); TypeScript ↔ Kotlin vectors; `Mentions` for an erased item gone.

## 7. Not in this slice

People, places and organisations; merge/split by the person; any Event for an entity; entities in pictures; reminders or any action (B4/B5).

## 8. For the operator to approve

1. **Approach A** — compute, never record — and the narrow reading of `Entity.md` §2 (§4).
2. **The handle kinds** in the first column of §2 (and that names of people wait for the contacts gate or a model).
3. **Where it shows:** *Mentions* in Recall's item dialog, and the list of other items sharing a handle.

## 9. As built

- **`runtime/entities`** (TypeScript reference, no dependencies) and **`runtime/brain/.../Handles.kt`** (the phone's Kotlin) — both checked against the same **hand-written** cases
  (`runtime/entities/tests/handle-cases.ts`, serialised to `runtime/brain/tests/vectors/handles.json`), not against each other. 64 cases (25 of them must find nothing): what each kind must find and, as much, what it must **not**
  (order ids, `#`/`-` ids, card numbers, version numbers, invalid dates, mentions, landlines).
- **A card-like run that passes the Luhn check is excluded and never returned**; one that fails it is read as whatever else it is.
- **Whitespace is spelled out** in the link rule, not `\s`: the JVM's and JavaScript's differ and the two must agree — found by a mutation that survived until a case was written for it.
- **The page address counts** as part of an item's words (a remembered Chrome page mentions its own site), so *everything from this site* works.
- **`Mentions`** (Java) is the only new brain caller (`AssistGuardTest`); it wraps handles in its own value so no other file touches the brain. It reads and shows and **writes nothing**: a test
  compares the journal and every file on disk before and after, and a source guard forbids appends, logs, file writes and the sealed store in it and in the screen code.
- **The screen:** an item's dialog lists **Mentions** (`Phone  +91 98765 43210 ›`); tapping one lists every kept item that mentions it, says how many items could not be read or were not looked at,
  and shows the handles that most often appear **beside** it (*mentioned together*, derived, never stored). The list is as private as Recall: secure window, never exported.
- **Known limits** (`ARCHITECTURAL_DEBT.md` AD-17): no names, places or organisations; no merging of a person's several numbers; landlines and STD numbers are not found; two-digit years and
  "Friday" are not read; a ten-digit order number starting 6–9 is indistinguishable from a mobile; linear cost and the newest-500 bound (AD-13).

