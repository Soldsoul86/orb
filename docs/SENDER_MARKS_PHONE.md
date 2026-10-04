# Sender marks — "this sender is not about my obligations" (proposed)

> Status: **proposed — not approved, nothing built.** Asked for by the operator on 2026-10-04 ("Yes, go ahead with the sender design"), after the first fit report showed that most of what the Loop reading cannot read is marketing and service chatter whose loop-ness is a judgement about the *sender*, not about words (`DEVICE_LOOP.md` §7b94, `LOOP_PROTOCOL.md` §19.1, `ARCHITECTURAL_DEBT.md` AD-36 item 11).
> Governed by `CONSTITUTION.md` Art. II (§6–10: interpretation is recomputable, history is not rewritten), Art. XII §44–45 (a person's answers are events; nothing about them is edited directly), Art. VII (capabilities and human agency). Builds on `LOOP_PROTOCOL.md` §11 (adapters, "not a loop"), `UNDERSTANDING_PHONE.md` (the pattern: computed statements, recorded answers, blinded keys), `MESSAGES_PHONE.md`.
> Adds **one capability** (declared, switchable, pinned words) and **no Android permission**. Nothing leaves the phone.

## 1. Why, in plain words

Your inbox has about 23,600 messages from companies — banks, shops, telecoms, a property site, a cab service. Orb reads a bill or a payment alert by its words. It cannot know that one sender is only ever advertising, or that another is your own exchange telling you about trades. **That is something only you know, and you know it once per sender, not once per message.**

So: **you tell Orb, once, that a sender is not about your obligations.** From then on, Orb treats everything from that sender as *not a loop* — it stops counting it, listing it, or reading it for bills — and you can take it back at any time. **Orb never decides this for you.** It may point at a sender that looks like a candidate; the decision is yours, and it is an event, not a setting.

## 2. What a sender is

A **sender** is who a service message is from, as the backup writes it: a name like `VM-HDFCBK` or `AD-GIOTTU-S`, or a numeric short code. Orb reduces it to one stable identifier:

- strip the two-letter route prefix (`VM-`, `AD-`) and a one-letter suffix (`-S`, `-T`): `VM-HDFCBK` and `HDFCBK-S` are both **HDFCBK**;
- a name with letters is itself; a **numeric short code** is itself (`56767` is its own sender — unlike the fit report's `SHORTCODE` lump, which is for counting only);
- **a phone number is never a sender.** People are not marked here; this is for services.

Two codes of one company (`HDFCBK`, `HDFCBN`) are two senders and are marked separately. Honest limit: Orb does not know that they are one company.

## 3. The decision, and where it lives

| | |
| --- | --- |
| **What you say** | *Not about my obligations* — or take it back (*clear*) |
| **Recorded as** | `orb.sender.judged`: a **blinded key** for the sender, the verdict (`quiet` or `clear`), and **two counts** the decision rested on (messages from that sender in the file you looked at, and how many of them the reading could not read) |
| **Never in the journal** | the sender's name, a number, an address, a word of any message |
| **The key** | `Attachments.address(context, "snd:" + senderId)`, first sixteen hex — a keyed hash made with Orb's own secret, so it reveals nothing and cannot be reversed (the same blinding as Understanding) |
| **Which counts** | the **last** verdict recorded for a key, so a restore and a replay agree; *clear* is a verdict, not a deletion |
| **What it is not** | a setting (nothing is edited), a rule (it names no words), or a learned model (nothing is inferred) |

Decisions are **history** (Art. II §7). Reading is **interpretation** that depends on them: the same messages, the same rule version and the same marks give the same result, every time.

## 4. What a quiet sender changes

For every adapter that reads messages — now the fit reading, later Money — **every message from a quiet sender is `not a loop` (noise, tagged `sender`)**, whatever its words say. That means a bill from a sender you marked quiet **will not appear**. That is the point, and it is also the risk, so:

1. **Orb tells you the cost.** After marking, the Senders screen says *"Quiet senders hid N messages that would have been read as a loop."* If that number is not small, it is a prompt to look again.
2. **It is always reversible**, in one tap, from the same screen. Clearing returns the sender to the ordinary reading.
3. **Only the Messages source** uses marks. They do not touch commitments, Today, the morning brief or anything you kept.

It changes **no stored item**: nothing is erased, and the messages you already kept are untouched.

## 5. The screen

**Messages → Senders…** (a new button on the Messages screen, shown after a *Look*). A secure window (no screenshots), like Recall.

- A list of **service senders from the file you just looked at**, most messages first, 15 at a time: *sender · N messages · M not read*. This is on screen only; **the journal holds none of it**.
- Each row: **Not about my obligations** · (if marked) **Take it back**.
- **Ordering, not deciding.** Rows whose messages were almost all unread (at least 50 messages and 90 % or more unread) are listed first with the words *"nothing here was read as a bill or a plan"*. Nothing is pre-ticked and nothing is marked without a tap.
- The cost line of §4, and a count of how many senders are quiet.
- The Look paragraph and the fit report **recompute at once** from per-sender tallies kept in memory; the file is not read again.

## 6. The capability

`orb.messages.senders` v1, **Observe**, declared in the registry, switchable, words pinned by a test:

> *"Lets you say that a sender of service messages is not about your obligations. Orb remembers only your answer, against a key that reveals nothing, and uses it to leave those messages out of what it reads from a message backup you choose. Nothing leaves the phone. You can take any answer back."*

Why a new capability and not an edit of `orb.read.messages` v1: that one says *"only counts are recorded"*; a recorded answer is a different kind of record, and the registry rule is that a wider use is new, never an edit. The grant is recorded at the **first mark** (your tap is the decision); **What Orb may do** gets a switch to turn marks off, which makes Orb ignore them (the events stay; they are history).

## 7. Parts (all pure except the screen)

| Part | Does |
| --- | --- |
| `SenderRules` | the sender identifier from an address; the order of the list; the "almost all unread" rule; the cost line's arithmetic |
| `SenderFacts` | the one record and the **last-verdict** reader (a `Keyer` is injected, as in Understanding) |
| `LoopFit` | takes the quiet set; keeps **per-sender tallies** (roles, kinds, matching lists) in memory so a mark can be applied without re-reading; reports `noise.sender` and the hidden-loop count |
| `SendersActivity` | the screen; secure window; writes the record on a tap |
| `Capabilities` | the declaration |

## 8. What is not in this slice

Marking by **word** or by **pattern** (that would be a rule and needs its own design); marking a **person** (not a sender); **sharing** marks between phones (a future sync question); **automatic** marking, ever; "about my obligations" as a positive verdict (a quiet sender can only be cleared back to the ordinary reading); applying marks to **Recall** or anything already kept.

## 9. Risks and trade-offs

| Risk | Handling |
| --- | --- |
| You mark your bank quiet by mistake and bills vanish | The cost line says how many loop-like messages were hidden; one tap takes it back; nothing is erased |
| A lookalike sender uses the same code | Codes are per carrier registration; marks are per code. A scam from the same code is hidden too. Said plainly; marks are for senders you know |
| One company, many codes | Each is its own mark; Orb does not guess they are one company |
| The list reveals who you deal with | It is on screen only, in a secure window, from the file you chose; the journal holds blinded keys and counts |
| A decision turns into a classifier that nobody can undo | Verdicts are events with a *clear*; reading is a pure function of (messages, rule version, marks) |
| Memory for per-sender tallies | At most 2,000 senders are tallied; the rest are one "other" row that cannot be marked |
| It starts to feel like email filters | It is deliberately thin: one verdict, no rules, no folders, no words |

## 10. Tests and checks

- **Conformance fixture** `docs/fixtures/loops/senders.json`: addresses → sender id (prefixes, suffixes, short codes, numbers); sequences of verdicts → the quiet set (last wins, *clear*, unknown keys ignored).
- **Pure tests** of the record (no name, no number, no word; the key is sixteen hex), the ordering rule, the cost arithmetic, and `LoopFit` with and without a quiet set (a quiet sender's messages move to `noise.sender`; the matching lists drop them; roles still add to the service total; the hidden-loop count equals what the unmarked reading called a loop).
- **Order independence**: the same marks in any order give the same report.
- **A source guard**: only `SendersActivity` writes `orb.sender.judged`; no other class reads a sender's name into a record.
- **Mutation checks** on every rule, as the previous slices.
- On the device: mark the largest unread sender; the Look paragraph's *could not be read* falls by about that sender's unread count; take it back and it returns.

## 11. For the operator to approve

1. **One verdict**: *not about my obligations*, with *take it back*. No positive verdict yet.
2. **A quiet sender is entirely not-a-loop** (including messages the rules would have read as a bill), with the **cost line** that says how many that was.
3. **The sender is the code without its route prefix and suffix**; a short code is its own sender; a phone number is never a sender.
4. **A new capability** `orb.messages.senders` v1, grant recorded at the first mark, switch in *What Orb may do*.
5. **A Senders screen** under Messages, from the file you just looked at, ordered by volume, with "almost all unread" listed first and **nothing pre-ticked**.
6. **Marks are events**: a blinded key, the verdict and two counts; never a name, number or word.

## 12. Questions only you can answer

1. Should a quiet sender hide **everything** from it (recommended — it is what "not about my obligations" means), or only the messages the reading could not read? The second is safer and does less: it cannot hide a bill, but it also leaves a marketing sender's "plan expires" alerts as loops.
2. Is the **90 % unread / 50 messages** line for listing candidates first right, or should the list simply be by volume?
3. Should the marks **apply to the morning brief and Today** if they ever read messages (not now, but later)? Recommended: yes, one meaning everywhere.
