# What Orb has noticed — understanding, not a profile (B5; proposed)

> Status: **approved 2026-10-03 ("Yes, go ahead with the design for the profile", then "Yes, go ahead with the build") and built — slice 1, awaiting the device** (`DEVICE_LOOP.md` §7b87, `orb-app-v50-noticed.apk`). Slice 2 (your own words) waits for the device check. Decision record: `DECISIONS.md` DR-38. As-built notes in §9.
> Builds on `PEOPLE_PHONE.md`, `CALLS_PHONE.md`, `MESSAGES_PHONE.md`, `DOCUMENT_PEOPLE_PHONE.md`, `COMMITMENTS_PHONE.md` (the pattern for a thing *you* confirm), `PERSON_LINK_PHONE.md` (the sealed-note pattern). Governed by **Constitution Art. XII** (§44–47): *identity is an evolving model, not a profile.*

## 1. Why, in plain words

Orb now holds a good deal you chose to give it: your contacts, your calls, your kept documents and message months. Each is shown on its own. Nothing yet **draws them together** into *"who matters to you, and how things stand"* — and drawing them together is exactly what a "profile" is, which is why it needs your explicit permission and your hand on every statement.

Two things the Constitution already settles, and this design keeps:
- **Orb never stores "who you are."** It stores *evidence*, and *what you said about it*. A statement like *"you are in regular touch with Ravi"* is **worked out again each time from what Orb holds**, like a commitment's state — never saved as an attribute. (§44: *a profile stores attributes; Orb stores understanding.*)
- **You do not edit it; you tell Orb, and it is history.** Confirming or rejecting a statement is an **event** — interpreted like any other signal, never an edit, and never silent. (§45.)

So the thing built here is called **What Orb has noticed**, not a profile.

## 2. What you would see and do

1. **Off until you turn it on.** On the People screen a new button, **What Orb has noticed**. The first time, a card says: *"Orb will look across your contacts, calls and the things you kept, and suggest things it has noticed — for example, who you are in regular touch with. It only uses what you have already allowed (if calls are off, it does not use calls). Nothing leaves your phone. You decide each one."* — **Cancel** is the default, **Turn on** is a recorded decision, and **What Orb may do** can switch it off again.
2. **A short list, each statement in plain words with its working:**
   - *"You are in regular touch with **Ravi Kumar**."* — *because: 9 spoken calls in the last 90 days; messages kept from 4 months.*
   - *"You used to speak with **Priya Shah** about monthly, and not for 4 months."* — *because: 7 spoken calls from 5 to 12 months ago; none in the last 120 days.*
   - *"**Sharma Traders** appears in 5 things you kept."* — *because: 3 documents and 2 message months.*
   Each has **That's right · Not true · Not now**. *Not now* records nothing and it comes back; the other two are events.
3. **After you answer.** *That's right* → the person is marked on the People list and on their page (*"you said: in regular touch"*), and sorted up. *Not true* → Orb does not suggest it again, and lists it under **You said no** with **Undo**. **You said yes** is a list too, with **Undo**.
4. **It stays honest as things change.** A statement you confirmed whose evidence has faded (no spoken calls in 120 days and no kept messages in 4 months) comes back as *"Still in regular touch with Ravi?"* — Orb **never removes what you said by itself**, it asks (Art. XII: understanding decays and is revised by new evidence).
5. **Your own words (slice 2, after the device check of slice 1).** On a person's page: *"What is Ravi to you?"* — you type *electrician*. It is the only way a **category** ever enters: **Orb proposes patterns; the words for what someone is come from you.** A sealed note, like a commitment's words.

## 3. How the statements are made (no model, no network)

Pure rules, fixed thresholds, English words from templates — the same input gives the same statements, so a replay agrees with the phone.

| Statement | Proposed when | Working shown |
| --- | --- | --- |
| **Regular touch** | **≥ 6 spoken calls in the last 90 days**, or **kept messages in ≥ 3 of the last 6 finished months** | the two counts |
| **Gone quiet** | **≥ 4 spoken calls from 120 to 365 days ago**, none in the last 120 days, and no kept message in the last 4 finished months | the counts, the gap |
| **Appears in many things** | **≥ 4 kept items** (documents, message months) tie to the person | items by kind |

Calls are *spoken* (incoming or outgoing with a duration), as `CallsRules` already says. Persons are People's *sure* persons (a number, an email or a link); a person only a name ties to is never the subject. At most **30** statements are listed, strongest first. **No message word, document word or call detail is read** — only **counts** that People and Calls already compute.

## 4. What is recorded, and what is not

- `orb.understand.granted` / `orb.understand.revoked` — the recorded decision to use the feature (the same `PackageGrants` pattern, with the same marker-file reconcile at start).
- `orb.understanding.judged` — one per answer: the **kind**, a **blinded key** for the subject, the **verdict** (`confirmed`, `rejected`, `cleared`), and the **evidence band** at that moment (the counts, as numbers), citing the kept items it rested on in its `causes` (*show your working*). **No name, number, email or word is in the journal.** The key is a keyed hash made with Orb's own secret (as the Messages keys are), so it reveals nothing and cannot be reversed. **The verdict is the last event for a key**, so a restore and a replay agree.
- `orb.understand.read` — counts only (how many were proposed, confirmed, rejected) each time the screen opens, like `orb.calls.read`.
- **Not recorded:** the statements themselves (they are computed), anyone's name, a number of calls beside a person, anything from a message or document.
- **Erasing a kept item** weakens the statements that rested on it (they are recomputed); a statement with no evidence left simply stops appearing, and an old *That's right* for it sits inert in the journal — a few bytes naming nothing.
- **A contact whose numbers change** gets a new key; the old verdict is orphaned (inert). Said plainly in §6.

## 5. What it changes in the architecture

- **New capability `orb.understand` v1** (tier *Observe*, switchable): a derived view over data other capabilities already read. It adds **no Android permission, no manifest change, no network**, and it **never turns another source on** — it uses calls only if Calls is on, messages only if Messages is, and so on. Its declared words are pinned in `Capabilities` like the others'.
- **The contacts are still read only by `PeopleActivity`**, while it is open (the rule from `PERSON_LINK_PHONE.md` §4): the new screen is a **mode of People**, not a reader of its own.
- New pure code: `UnderstandingRules` (the thresholds and sentences), `UnderstandingFacts` (the only builder of the records, and the reader of the last verdict per key); `UnderstandingAccess` (grant/revoke/reconcile); `People` gains the marks (*regular touch* on the list and the page). Tests and mutation checks as for every slice; a guard that nothing here reads a message word, a document word, or a call's number.
- **Computed views are never stored (DR-19):** nothing about a statement is saved except your verdict and the counts it rested on.

## 6. Risks, said plainly

| Risk | Handling |
| --- | --- |
| **A wrong or creepy statement.** An inference about a person can be wrong, or hurt (*gone quiet* about someone who has died). | Wording is **"Orb has noticed"**, never *"is"*; only **counts of contact**, never content or categories; **Not true** is one tap and permanent; **Not now** leaves no trace; the whole feature is off until asked for. *Gone quiet* is the sensitive one — if you want it out of slice 1, it is a one-line cut. |
| **A profile by the back door.** Combining sources is the sensitive act. | Explicit, recorded permission; each source still gated separately; every statement shows its working; nothing is stored as an attribute (Art. XII). |
| **A verdict orphaned** when a contact changes number or two contacts merge. | The key follows the person's strongest identifier; a changed key means Orb asks again. Merging/splitting persons is still unbuilt (AD-17). |
| **Slow.** Each opening recomputes People and reads the call log. | Same cost as opening People today (a second for ~25,000 messages was measured for Messages; calls read ~1,500 rows). Measure on the device; an index only if it hurts (as for Messages). |
| **"Regular touch" thresholds are guesses.** | Fixed, in one place, shown in the working, and the first device round is the test of them. |
| **Count words that mislead.** *9 calls* does not mean a close relationship. | The sentence says what was counted, not what it means. |

## 7. For the operator to approve

1. **The name and the stance:** *What Orb has noticed*, understanding and not a profile (Art. XII) — **a statement is computed, never stored; only your answer is.**
2. **Slice 1 = the three kinds** in §3 (*regular touch*, *gone quiet*, *appears in many things*) — keep all three, or drop *gone quiet*?
3. **Off until you turn it on**, recorded, switchable in What Orb may do.
4. **Slice 2 = your words** (*What is Ravi to you?*), built after slice 1 is checked on the phone.
5. **The thresholds** in §3 as the first guesses to test.

## 8. Not in this slice

About-you facts (your own numbers, emails, places, routines), money or payment patterns, anything read from the words of a message or document, anything that acts on a statement (a reminder, a nudge, a message), merging or splitting persons, and any model or network use.

## 9. As built (slice 1, v50)

- **Where it lives.** `UnderstandingRules` (thresholds, the three rules, the sentences, the plan), `Understanding` (the counts, from People and the call log), `UnderstandingFacts` (the two records, the blinded key, the last verdict per key), `UnderstandingAccess` (grant, revoke, reconcile), the capability `orb.understand` v1 in `Capabilities` (words pinned), a **mode of `PeopleActivity`** (a button **What Orb has noticed**), a control in What Orb may do, and the reconcile at start. **No manifest change, no permission, no network.**
- **Who is a subject.** Every person in the book who has a number or an address, not only those a kept item mentions — so *regular touch* can come from calls alone. The stable identifier is the smallest of their numbers and addresses; the key is `HMAC(secret, "und:" + kind + ":" + id)`, sixteen hex characters. A person whose numbers change is asked again.
- **What is counted.** Spoken calls (as `CallsRules` says) against the person's numbers; kept message months (told from documents by where they came from) and other kept items tied by a **number, an address or your own link — never by a name alone**. No word of any item is looked at (a guard holds it).
- **Cannot check is not nothing.** With Calls off, or unreadable, no statement is made about calls either way, and a confirmed *regular touch* is **not** said to have faded (`faded` needs the log). The screen says which sources it used.
- **Quiet, as built:** ≥ 4 spoken calls from 120 to 365 days ago, none in the last 120 days, no kept message in the last 4 finished months (the design's "91–365" overlapped its own "last 120 days" and was made exact).
- **The answer.** `orb.understanding.judged` carries the kind, the key, the verdict (`confirmed`, `rejected`, `cleared`) and the numbers (`calls`/`months`, `earlier`, `items`), and **cites up to ten of the kept items** it rested on. **Not now** records nothing. A refusal stays a refusal however strong the evidence becomes; **Undo** is a `cleared` answer.
- **Effects, small and visible:** a confirmed *regular touch* puts *you said: in regular touch* on the person's row and page and lists them first among those a kept item names. Nothing acts on a statement.
- **Cost.** The call log is read once per opening of the mode, only if Calls is on; keys are made only for people with something to look at.
- **Not built:** slice 2 (your own words), merging persons, anything about you, anything read from words.


## 10. Bringing more context about a person — approved; step 1 ("your words") built, steps 2–3 not (2026-10-03, after the first device export)

**What the device showed.** Eleven *regular touch* and one *gone quiet* were confirmed, **all from calls alone** (`months: 0`): Orb knows *how often*, nothing about *who they are to you* or *what is between you*. That is what counts can give. More context has to come in a way that keeps Art. XII (§44–45): Orb never stores "who someone is"; context is either **told to it** (history, as intent), or **worked out again from what it holds** (computed, with its working), or **asked as a question** (your answer is the fact).

**Three ways in, in order of trust — and the order to build them.**

1. **You tell Orb (slice 2a — recommended first).** On a person's page: **"What is Ravi to you?"** — a few words of your own (*electrician, brother, landlord*) and, if you want, **a note** (*uses WhatsApp, prefers evenings*). A sealed note, like a commitment's words (`COMMITMENTS_PHONE.md`, `PERSON_LINK_PHONE.md`): the journal holds only that a description exists (an event citing nothing, carrying the sealed note's identity); **no word is in it**. Editing is a new note; **Erase** destroys its key. Orb uses it as given: shown on the page and beside the name in statements (*You are in regular touch with Ravi (electrician).*), and **searchable** — *who is my electrician* becomes a search in People. **The words for what someone is come only from you; Orb never infers a category.** This is the only way a *category* ever enters.
2. **Orb counts more, from sources already on (slice 2b).** A **shape** section on the person's page, computed each time, each line with its working, nothing stored: *who usually starts the calls* (outgoing against incoming), *usual days and times* (weekday evenings, weekends), *first and last contact*, *longest quiet stretch*; and **what is between you**: open commitments (existing), dates ahead (existing), kept items by kind (invoices, documents, message months — by where they came from, never their words). A line becomes a *question* (*That's right / Not true*) only when it is the kind of thing worth confirming (*you usually call him in the evening*).
3. **Orb reads words — only with its own consent, and only as a question (a later, separate design).** Topics and roles from the words of messages and documents (*invoice*, *rent*, *appointment*) — deterministic cues first, the on-device brain only if the operator wants it. It is a **separate capability** (the words are what the Constitution minimises), off until turned on, and it only ever says *"Orb thinks Ravi may be a supplier (3 invoices). Right?"* — your answer is the fact, a *Not true* is permanent.

**What also connects (slice 2c).** The understanding should *steer* the sources, not only sit beside them: the **Messages** list marks and sorts the people you said you are in regular touch with, so ticking the right conversations is easy (today only one conversation is kept and so *months* is 0 for everyone). Gmail, later, brings emails into the same loop with no new idea.

**Risks.** A *role* typed by you can be wrong or unkind — it is yours, sealed, erasable, shown only on your phone. The *shape* of calls (times, who calls whom) is more intimate than a count — it stays on the page, behind the person, and is never recorded as a fact. Words-based suggestions are the most sensitive step and are not part of 2a or 2b. Each new statement needs a threshold, a working line, and mutation checks like the first three.

**For the operator to approve.** (1) Build **2a** first — your words about a person (role and note), sealed, searchable. (2) Then **2b** (the shape and what is between you) and **2c** (Messages marks the people you said you are in touch with). (3) **Words-based suggestions** wait for their own design.

## 11. As built — step 1, "What is Ravi to you?" (slice 2a, v51)

Approved 2026-10-03 ("Yes, go ahead with the build for step 1").

- **Where it lives.** `PersonNote` (the sealed note, reading the live notes, replacing and removing), `PersonNoteFacts` (the only builder of the record), `People.Person.role`/`note` (attached when People is computed), the form and the buttons on the person's page in `PeopleActivity`, a label in the held-items list, and the sealed note carried into a backup as words. **No capability, no permission, no manifest change, no network:** it reads nothing — it is words you write, like a commitment's.
- **What you do.** On a person's page, **Say what they are to you…** — a role (at most 60 characters) and an optional note (at most 1,000), in a form that says it stays on the phone, sealed, and that Orb never guesses. Later it reads **To you: electrician** and the note, with **Change…** and **Remove**. **Cancel** is the default on Remove's card.
- **What is recorded.** One `orb.person.described` event per save, carrying only the identity and size of the **sealed note**; **no word, name, number or address** is in the journal. The note holds who (names, numbers, addresses as they were that moment), the role and the note, with a nonce so two notes never share bytes.
- **Changing is replacing.** The new note is sealed and recorded first; only then are the older notes about the same person erased (their keys destroyed). A failure at any point leaves what was there. **The same words write nothing.** **Saving nothing removes.** **Remove erases for good.**
- **Which person.** Found again by a shared number or address, else by the same name; a different person who happens to share a name is also found by name (the same rule links use). If the contact has gone, the note is dormant — shown to no one.
- **Where it shows.** The page; the name wherever it is shown (*Ravi Kumar (electrician)*), including in the sentences of *What Orb has noticed*; and **People's search finds it** — typing *electri* finds the person, ranked just after a name that starts the same way.
- **Not built:** step 2 (the shape: who starts the calls, usual times, what is between you), step 3 (anything inferred from words), the Messages marks, and any use of the role to decide anything.

