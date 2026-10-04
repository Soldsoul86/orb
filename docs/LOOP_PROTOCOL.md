# The Loop Protocol v0.1 — what is open between you and the world (proposed)

> Status: **approved 2026-10-04 ("approve the Loop protocol design") and slice 1 built — the protocol is *not yet frozen*; the fit test on the real inbox comes first** (§13; `DEVICE_LOOP.md` §7b94; `DECISIONS.md` DR-41; `ARCHITECTURAL_DEBT.md` AD-36). As-built notes in §18. Direction chosen by the operator the same day ("Yes to all four"): the name **Loop**; kinds plus owner plus origin; a **fit test on the real corpus before anything freezes**; an **ordinal basis** instead of a numeric confidence for rule-derived loops.
> **A Loop is the smallest persistent unit of something a human expects to happen, owes, must do, attend, decide, receive, or respond to** — an open, or potentially open, obligation or expectation between an actor and the world. It is not an action: *Action* (`contracts/Action.md`) stays reserved for Orb's own attempt to change the world.
> **Refined by the operator the same day, and applied here:** five stored kinds (a *get* is a GIVE owned by THEM — never a second loop); two owners, and **every loop has a resolvable next mover**; three origins (the one you wrote yourself is `stated`); the basis words **observed / stated / inferred**; the fit test reports **AMBIGUOUS** and **UNMAPPABLE** apart; and **information is not a loop** merely because it holds a date, an amount, a person or imperative-looking words.
> Governed by `CONSTITUTION.md` Art. II (§6–10), Art. XI (§42–43), Art. VII. Builds on `COMMITMENTS_PHONE.md` (the two-direction commitment that is already on the phone), `COMING_UP_PHONE.md` (dates), `UNDERSTANDING_PHONE.md` (computed statements, recorded answers), `GATE_PHONE.md` (authorization), `contracts/Belief.md`, `contracts/Evidence.md`, `contracts/Action.md`.
> This document defines **a vocabulary and its rules**. It adds **no capability, no permission, no screen and no kernel contract**.

## 1. Why, in plain words

Everything Orb can read — a bank text, a bill, a delivery message, a calendar entry, a person you promised something to — is **evidence of one thing: something is open between you and the world, or it just closed.** Today each source is built as its own feature (Messages, Coming up, Commitments, the brief), and each re-invents what "open", "overdue" and "waiting" mean.

The Loop protocol says it once. **A loop is something open: you owe it, or someone owes it to you.** Sources become *adapters* that open, advance or close loops; screens (Today, Waiting, Coming up, the brief) become *views* over loops. A new source then costs an adapter, not an architecture.

Two things it is **not**: it is not a task manager (a loop is thin: kind, owner, object, a date, a person, evidence), and it is not a store of truth (a loop is an *interpretation* that cites evidence and can always be recomputed).

## 2. Where it sits (no new kernel contract)

```
 APP / DEVICE          ──►  OBSERVATION / EVIDENCE   (immutable; Art. II §6–7)
 (SMS, calendar, …)             │
                                ▼   adapter (a rule, versioned; or later a model)
                          LOOP  (an interpretation: a Belief that cites evidence)
                                │
                  ┌─────────────┼──────────────┐
                  ▼             ▼              ▼
               TODAY        WAITING FOR     COMING UP / BRIEF      ← views, never stored
                                │
                                ▼   only through a Capability + Policy (the gate)
                          AUTHORIZATION ──► EXECUTION (an Action, `contracts/Action.md`)
```

- **A Loop is a specialisation of a Belief** (`contracts/Belief.md`): an interpretation held with explicit uncertainty, citing Evidence. It needs no new kernel contract.
- **"Action" is not reused.** `contracts/Action.md` means *Orb attempted to change the world*. That is the *execution* layer. A loop is the thing a human has open. The words stay apart in every doc and every line of code.
- **The four layers never merge** (Art. II, XI): *evidence* ≠ *interpretation (loop)* ≠ *authorization (Policy/gate)* ≠ *execution (Action)*. Understanding a loop authorizes nothing.

## 3. The parts of a loop

A loop has **a kind, an owner (the next mover), an origin** — three small, independent facts — plus what it is about and when.

### 3.1 Kind — what is owed (five)

| Kind | Meaning | Core question | Includes | Excludes |
| --- | --- | --- | --- | --- |
| **DO** | An act, with no one to hand it to | What must be done? | file a return, renew a document, book a test, sign | acts whose point is to hand something over (→ GIVE); being somewhere (→ ATTEND) |
| **GIVE** | A thing goes from one party to another: money, a document, information, an item, access, approval. **Owned by me: I owe it. Owned by them: I am waiting to receive it** | What is owed, by whom, to whom? | pay a bill, send an invoice, return a parcel, share a PAN — and, owned by them: a refund, a salary, a delivery, a document I asked for | the act of paying *as an event* (that is evidence that closes it); nothing is expected (a promotional notice) |
| **ATTEND** | Presence at a place or time | Where/when must I be? | meeting, flight, appointment, reservation | a date that nobody expects you to act on (evidence only) |
| **RESPOND** | A reply is owed | Who is waiting for an answer? | an unanswered question or request, a callback | a reply whose content is a *thing* (→ GIVE) |
| **DECIDE** | A choice is open | What must I choose or approve? | pick a flight, approve a quote, confirm a booking | a choice already made (evidence) |

**Why five, not eight.** `ASK` and `PROMISE` are not things that are open; they are *how a loop began* (§3.3). `GET` is `GIVE` seen from the other side, so it is **one loop** with a different owner and **not a kind of its own**: a GIVE owned by THEM is the expectation from ME. Two ways to write the same thing would be two sources of truth, and would let Today list the same invoice twice. (`LoopRules.plain` reads a GIVE owned by them as *a get*, for words on a screen; it is never stored.)

### 3.2 Owner — who must move next

`me` | `them`. **The same real-world loop has exactly one owner at a time**, and it is **always one of these two: a loop must have a resolvable next mover** — the answer to *who must move next for this to progress?* The counterparty may be unknown; the next mover may not. Where it cannot be said, there is no loop (it is evidence, or a question to ask you). *They owe me a refund* and *I am waiting for their refund* are one loop, owner `them`, kind GIVE. If the ball moves (they ask me for a form; I send it), that is a **lifecycle event** (§5), not a second loop.

*Waiting for* = open loops with owner `them`. *On me* = open loops with owner `me`. Both are views.

### 3.3 Origin — how it began (the speech acts live here)

| Origin | Meaning | Example |
| --- | --- | --- |
| `stated` | A source, or you, state an obligation or expectation (a bill, a booking, a delivery; a commitment you wrote down yourself) | credit-card statement: ₹8,421 due 10 Oct |
| `asked` | Someone asked something of you, or you asked of someone | "Can you send me the invoice tomorrow?" → kind GIVE, owner `me`, origin `asked` |
| `promised` | Someone, you included, said they would | "Sure, I'll send it tomorrow." → the same loop, origin becomes `promised` (a **lifecycle event**, §5; the loop is not duplicated) |

Origin carries the *social weight*: a `promised` loop that is past its date is a **broken promise** candidate (said plainly: "still open, 2 days past Friday" — never "you failed"). An `asked` loop is a request not yet accepted. Origin never changes the kind.

### 3.4 What it is about, and when

- **Object** — what: an amount (integer minor units + ISO currency), a document or item class, or **words** (sealed). 
- **Counterparty** — a person, organisation or `unknown` (an Entity, `contracts/Entity.md`).
- **When** — one of: `due` (a day), `at` (an instant, ATTEND), `window` (from–to), or none. Recurrence is a **generator of loops, not a field** (§12).
- **Place** — optional (ATTEND).
- **Relations** — `requires[]`, `part_of[]`: **reserved, empty in v0.1** (§12).

## 4. The envelope

```
Loop {
  protocol:     "loop/0.1"
  key:          blinded identity (§8)        // before it is confirmed
  id:           the opening event's id       // once it is confirmed
  kind:         DO | GIVE | ATTEND | RESPOND | DECIDE
  owner:        me | them                     // the next mover; never absent
  origin:       stated | asked | promised
  counterparty: entity ref | unknown | none
  object:       { class, amount?{minor, currency}, words?(sealed) }
  when:         { due? | at? | window? , place? }
  basis:        observed | stated | inferred    // §6; never a number
  rule:         { id, version }                  // which adapter rule read it
  evidence:     [ evidence refs ]                // ≥ 1, always
  relations:    { requires: [], part_of: [] }    // reserved
}
```

**Deliberately absent:**

- **`status`** — it is a *fold over lifecycle events* (§5), never a field.
- **`auth` / "what Orb may do"** — authorization is the Policy and the gate. A field here would be a second source of truth. A reminder or hand-off *cites the loop*; the gate decides on its own record.
- **`confidence` as a number** — see §6.

### Invariants (these are the part that freezes)

1. **No loop without evidence.** `evidence` is non-empty; a loop whose evidence is erased ceases to be shown as derived (it can still exist if you confirmed it — §9).
2. **One real-world loop, one identity, one owner at a time.**
3. **A loop is never marked closed by absence.** No evidence is not "not done"; it is "still open".
4. **`done` needs a declared closure evidence class** (§7), or your own tap.
5. **Interpretation never rewrites history.** Reinterpreting is a new *derivation* from unchanged evidence; events are never mutated (CLAUDE.md).
6. **Every transition names its cause**: an observation, a rule, or a user act.
7. **Understanding does not authorize.** No loop causes an action by existing.
8. **A loop has a resolvable next mover** — `me` or `them` — so Today, Waiting for, Overdue, follow-up, reminders, delegation and the brief are all *views of one fact* and not separate concepts.
9. **Information is not a loop merely because it contains a date, an amount, a person or imperative-looking text.** A loop exists only when there is a human-relevant unresolved obligation or expectation. An OTP, a balance and a discount are evidence; "your insurance expires on 15 October" may become a loop, and only because its meaning is an obligation or a decision.

## 5. Lifecycle — events, and the state they fold to

Events (appended; never edited). A loop is **recorded only when you confirm it or act on it** (§9); derived loops that you have not confirmed are computed each time and written nowhere.

| Event | Meaning |
| --- | --- |
| `orb.loop.opened` | A loop exists: you confirmed one proposed from evidence, or made it yourself. Carries kind, owner, origin, due, basis, rule ref, a blinded counterparty key, and the *identity* of a sealed note (words, amount, name). |
| `orb.loop.advanced` | The ball moved or the shape changed: owner changed, origin became `promised`, amount/date refined by new evidence. Cites the evidence. |
| `orb.loop.moved` | A new date (or none). |
| `orb.loop.closed` | Closed — carries **who/what closed it**: `by: you` or `by: evidence` with the evidence ref and its class (§7). |
| `orb.loop.dropped` | You decided not to. |
| `orb.loop.reopened` | Back to open. |
| `orb.loop.linked` | You said two loops are the same one, or that two observations belong together (§8). |
| `orb.loop.split` | You said one loop is really two. |

**State is computed, from the events and today's date:**

| State | Rule |
| --- | --- |
| open | opened, not closed/dropped, no date or date ahead |
| due | date is today |
| overdue | date passed, not closed/dropped (kinds other than ATTEND) |
| passed | ATTEND whose time has passed with no closure — **not "overdue"** |
| done | last event is `closed` |
| dropped | last event is `dropped` |
| *suggested closed* | an annotation on an open loop: evidence that **suggests** closure exists (§7) — never changes the state |

**Views, never stored:** Today (due + overdue + on me), Waiting for (owner `them`, open), Coming up (dates ahead), Broken promises (origin `promised`, overdue), the Morning brief (counts over these).

**Existing history is not rewritten.** `orb.commitment.opened/moved/done/dropped/reopened` are **protocol-v0 forms** of `orb.loop.*`; the reader treats them as aliases (kind chosen by the commitment's direction: *I owe* → a DO owned by `me`, *waiting for them* → a GIVE owned by `them`; origin `stated` — you wrote it down). New code writes `orb.loop.*`. See §10.

## 6. Basis and provenance — no numeric confidence

Art. XI §43: confidence is recorded faithfully, never resolved into certainty, never silently upgraded. A rule that matched a template is not "0.96". So for rule-derived loops:

| Basis | Meaning | Example |
| --- | --- | --- |
| `observed` | The source shows it happening | a delivery out for delivery; a payment that failed |
| `stated` | The source, or a person, says it in so many words | "Total due ₹8,421 on 10-Oct"; "I'll send it tomorrow" |
| `inferred` | A rule concludes it from shape or convention, and could be wrong | an EMI debit repeated monthly → next one expected; "Friday" resolved from when it was written |

(The earlier draft's `guessed` is folded into `inferred`; the rule id says which convention.)

Every derived loop carries `rule: {id, version}` so a change of rule is **recomputable and auditable** (Art. II §9–10). A numeric confidence is reserved for **model-produced** interpretations later, held as the model's own Belief with its provenance (`contracts/InferenceRecord.md`), never mixed into rule output.

## 7. Closure — what may close a loop, and what only suggests

Orb **never assumes** a loop closed (Art. XI §42). Closure evidence has three classes, declared **per kind** and per adapter:

| Class | Meaning | Effect |
| --- | --- | --- |
| **A. You** | You tapped Done | always closes |
| **B. Closes** | An observation the adapter declares is *exact* for this loop (a debit of the same amount to the same payee after the bill) | closes, citing the evidence, **shown as "closed by evidence" and reversible** |
| **C. Suggests** | Related evidence, not exact (a message you sent to the same person after their request) | marks the loop *suggested closed* ("may be answered — confirm?"); the loop stays open |

| Kind | A | B (exact) | C (suggests) |
| --- | --- | --- | --- |
| DO | yes | only where an adapter has a confirmation (e.g. a filing receipt) | — |
| GIVE, owned by me | yes | money: the matching debit | a sent message/document to the counterparty |
| GIVE, owned by them (a get) | yes | money: the matching credit; an item: the delivered notice | a related notice |
| ATTEND | yes | none — time passing is `passed`, not done | a calendar/location signal (not collected today) |
| RESPOND | yes | none | an outgoing message or call to that person after the request |
| DECIDE | yes | none | a confirmation message |

**A closure from evidence is a record that cites that evidence** (`orb.loop.closed`, `by: evidence`). Because it is an event, it is journaled, reversible (`reopened`), and replayable.

## 8. Identity and correlation — one loop, however many messages

Most phone evidence *closes or advances* a loop; very little opens one (a debit text closes a bill). So the hard part of every adapter is **matching an observation to the loop it belongs to** — the statement, the reminder and the payment confirmation are one loop.

- **Key** — a deterministic, blinded digest: `Attachments.address(context, "loop:" + kind + ":" + counterpartyKey + ":" + objectClass + ":" + period)`, first 16 hex, the same blinding as Understanding (`und:`). The adapter, not the protocol, defines `objectClass` and `period` (e.g. *card ending 1234, billing month 2026-09*).
- **Matching rules** (the protocol defines the form; each adapter supplies values):
  1. Same counterparty key + same object class + same amount (exact, minor units) + due within ±N days (N set by the adapter, recorded in `rule`).
  2. Observations that satisfy rule 1 **attach to the same loop**.
  3. Observations that satisfy only part of it (same payee, different amount) **do not merge**.
- **Ambiguity never merges.** Two loops shown is safer than one wrong; you can say "same" (`orb.loop.linked`) or "different" (`orb.loop.split`), and **those answers are events** (as in Understanding).
- **Order independence.** Computing the loops from the same observations in a different order yields the same loops (a conformance requirement, §11).

## 9. Proposed versus confirmed — what is written down

This is the existing, proven pattern (Coming up, Understanding, Commitments), made explicit:

| | Where it lives | What is written |
| --- | --- | --- |
| **Proposed** (derived from evidence, you have not confirmed) | **a view, computed each time** from the evidence; **never stored** | nothing |
| **Confirmed** (you opened it, or tapped "Track this") | an event + a sealed note | `orb.loop.opened` etc. |

Consequences:

- The journal never holds message text, names or amounts in the clear — only **kind, owner, origin, due day, basis, rule ref, blinded counterparty key**, and the identity of a **sealed note** (words, amount, name) that is erased by destroying its key.
- Erasing the source evidence removes a *proposed* loop by construction. A *confirmed* loop is yours and survives, losing only its lineage (as commitments already do).
- Recomputation (Art. II §9) is therefore: proposed loops are always recomputed from the source; confirmed loops are the fold of their events.

## 10. How today's features map (no rewrite)

| Built | In the protocol |
| --- | --- |
| Commitment, *I owe* | kind DO (a lower bound: with a person it may really be a GIVE), owner `me`, origin `stated` |
| Commitment, *Waiting for them* | kind GIVE, owner `them`, origin `stated` |
| Coming up (a written future date) | a proposed loop, basis `stated` (or `inferred` for relative days); kind by adapter (ATTEND for appointments, else evidence only) |
| Understanding "regular touch / waiting" | **evidence about RESPOND** (a pattern), not a loop |
| Reminder | an *execution* (an Action) that **cites** a loop; not a loop |
| Morning brief | a **view** over loops (counts) |
| Messages (SMS) | an **adapter**: observations → open/advance/close |

Nothing built needs to change for v0.1: the **reader** learns `orb.commitment.*` ⇒ `orb.loop.*`.

## 11. Adapters, "not a loop", and the conformance corpus

**An adapter** reads one source and, for each observation, returns exactly one of:
`opens` · `advances` · `closes` · `evidence` (relevant, opens nothing) · `noise` (not about the user's obligations) · `ambiguous` (rules disagree) · `unmapped` (no rule reads it).
It declares: its **rule ids and versions**, its **objectClass and period**, its **matching tolerances**, and its **closure evidence classes** (§7). It reads only what the app already holds, in its existing capability.

**Not a loop (inclusion rule).** A loop opens only when there is *a human-relevant unresolved obligation or expectation* — something to do, give, receive, attend, answer or decide. **Information is not a loop merely because it contains a date, an amount, a person or imperative-looking text.** These are **evidence only or noise**: OTPs, promotions, balance notices, marketing, receipts for things already complete, a date nobody expects action on. The protection is deliberate: without it Orb becomes a notification classifier dressed as a personal operating system.

**The conformance corpus** — language-neutral fixtures in `docs/fixtures/loops/`:

- Each case: *a small set of synthetic observations (fabricated senders/amounts)* → *the expected loops (kind, owner, origin, due, basis, state on a given day)* → *the expected classification of each observation*.
- Cases for **each kind** (open, advance, close, correlate, ambiguity, no-loop, order independence, erasure of evidence).
- **Any adapter, by me or another agent, must pass it.** The tests run in the phone's Java test runner now; the fixtures are plain JSON so another implementation can run them unchanged.
- **Mutation checks** on the rules, as every slice so far.

## 12. Reserved, deferred

- **Relations** (`requires`, `part_of`) — trips, purchases and projects as *computed groupings of loops*. Fields reserved, empty; "blocked" is defined later, when a real adapter needs it.
- **Recurrence** — an EMI or rent is a *rule that generates* the next loop, not a loop with a repeat field. Designed with the first adapter that needs it (Money).
- **A model adapter** — conversational sources ("can you send…") need language understanding that rules cannot do. The interface is the adapter interface above; a model-backed adapter would emit loops with a model's own Belief/InferenceRecord. **Whether any model ever sees the user's messages is a separate decision** and is not made here.
- **Informational states** (a balance, a stock level) — not loops; a different concept, deliberately left out.
- **Wider kinds** — a new kind is *additive* in a new minor version; old loops are never reinterpreted.

## 13. The fit test — evidence before freezing

The protocol freezes **after** it has been held against the real corpus, not before.

**What it is.** A *counts-only* classification of the operator's real SMS (≈ 23,600 service messages), using a coarse draft adapter, to measure the protocol and not to build Money. Each **service** message (from a name or short code) lands in **exactly one** place: a loop **kind** it opens, moves on or closes (DO · GIVE, split by who owes · ATTEND · RESPOND · DECIDE), or **NOT_A_LOOP** (noise, or only information), or **UNMAPPABLE** (no rule reads it), or **AMBIGUOUS** (two rules read it as different loops, or one as opening what another closes). Messages from a **number** are counted and **not read** — conversation needs language (§12). Output, as counts only:

```
N service messages            (C from numbers, not read)
 DO        x   GIVE  x  (by me x · by them x)   ATTEND x   RESPOND x   DECIDE x
 NOT_A_LOOP x  (noise x · only information x)
 UNMAPPABLE x  (largest sender groups, by brand code)
 AMBIGUOUS  x  (which pairs of rules disagree, by rule name)
 openings with an amount x → closings of the same amount from the same sender x
```

Individual messages are not shown unless the operator asks. The unmappable and ambiguous groups are what tell us whether the ontology is missing something.

**Where it runs.** The messages never leave the phone: either (a) on the phone as a counts-only report on the Messages screen (a small build, same shape as the other reports), or (b) on the container **only** if the operator re-uploads the backup file for that purpose, counts-only and never committed. The operator chooses; (a) is the default (local-first).

**Acceptance — the protocol freezes only if all hold:**

1. Every message has exactly one classification; none needs a field the envelope lacks.
2. `unmapped` ≤ 10 % of non-noise messages, and `ambiguous` small enough to be a few named rule pairs, not a pattern.
3. The ten largest unmapped clusters and the commonest ambiguous pairs are inspected and **none requires a new kind, a third owner, or a new envelope field** (if one does: revise to v0.2 and re-run).
4. The conformance corpus passes, including order independence.
5. No test or record in the journal contains a message body, a name or an amount in the clear.

## 14. Risks

| Risk | Handling |
| --- | --- |
| **Over-abstraction**: eight words become a framework nobody needs | Six kinds; every field earns its place from a built feature or the fit test; relations, recurrence and models reserved, not built |
| **Freezing the wrong taxonomy** | Freeze the *envelope and invariants*, version the *vocabulary*; recompute from evidence; fit test first |
| **False loops** (a notice taken for an obligation) | Exclusion rule (§11); proposed loops are views you confirm; nothing happens uninvited |
| **Missed or wrong matching** (two loops for one bill, or one for two) | Ambiguity never merges; "same/different" answers are events; adapters declare tolerances; order independence is tested |
| **Orb appears to know what is done** | Closure classes (§7); absence is never closure; "closed by evidence" is shown and reversible; wording is "still open" |
| **A rule is wrong and quietly changes your Today** | Every loop carries `rule {id, version}`; a rule change is visible and recomputable |
| **Privacy: amounts and names in a screen or journal** | Journal holds only kind/owner/origin/day/basis/rule/blinded key; words, amounts and names are sealed; secure windows as elsewhere |
| **Becomes a task manager** | Thin by construction; no priorities, tags, subtasks or assignment |
| **Protocol drifts from the code** | The conformance corpus is the contract; docs and tests change together |
| **Language (WhatsApp, chat) needs a model** | Out of v0.1; interface fixed; the privacy decision is its own design |

## 15. Where the work lands when approved

1. **v0.1 text frozen only after the fit test** (§13).
2. Pure rules in the phone app (`LoopRules`: kind/owner/origin vocabulary, state fold, views) plus the **reader alias** for `orb.commitment.*`; **no new screen, permission or capability**.
3. The conformance corpus and its runner, mutation-checked.
4. A first adapter — the **Money** adapter — written *against* the protocol, in its own design, using the same fit data.
5. Package docs (`README / DESIGN / API / TESTS`) for the protocol; DR and AD entries at build.

## 16. For the operator to approve

1. **Loop** is the name; a loop is *the smallest persistent unit of something a human expects to happen, owes, must do, attend, decide, receive, or respond to* — an interpretation (a Belief) that cites evidence — **no new kernel contract**, and "Action" keeps meaning execution.
2. **Five kinds** (DO, GIVE, ATTEND, RESPOND, DECIDE; a get is a GIVE owned by them), **one owner at a time and always a next mover** (me / them), and **origin** (stated / asked / promised) carrying the speech acts.
3. **No stored status, no authorization field, no numeric confidence**; ordinal **basis** (observed / stated / inferred) with a **rule id and version**.
4. **Closure classes** (you / exact evidence / suggests), absence is never closure.
5. **Proposed loops are computed views; only confirmed loops and your acts are events**; the journal carries no text, name or amount in the clear.
6. **Existing `orb.commitment.*` events are read as protocol v0** — no history is rewritten.
7. **The fit test (§13) comes before any freeze**, and Money is the first adapter after it.

## 17. Questions only you can answer — answered by default

The operator approved without answering these three, so the recommended defaults were taken (say so and any of them changes):

1. **Where the fit test runs**: **on the phone** — a counts-only report on the Messages screen, recorded only when you tap. Nothing leaves the phone.
2. **Words**: screens keep **"Waiting for"** and **"On me"** (as Today says now); the kind names are not shown.
3. **Broken promise**: stays **inside Today's overdue** ("still open, 2 days past Friday"); no separate list yet.

## 18. As built — slice 1 (2026-10-04)

What exists, and what does not.

**Built (pure, tested off the phone, `apps/pixel/orb`):**

- **`LoopRules`** — the vocabulary (five kinds, two owners, three origins, three bases, closure classes; `plain` reads a GIVE owned by them as a *get* for words on a screen), the **one fold** (`Loop.apply`) from lifecycle events to a loop, `stateOf` (open · dueToday · overdue · **passed** · done · dropped), the views (`onMe`, `waitingFor`, `saidStillOpen`), `sameLoop`/`groups` (matching that does not depend on arrival order) and `keyMaterial`. `Event.parse` reads a journal line as a protocol event; only enumerated, clear fields are read.
- **The alias, without a rewrite.** `orb.commitment.*` are read as protocol v0 (`done` is a close by you; *I owe* is a DO on me, *waiting for them* is a GIVE owned by them; origin `stated`). **`Commitments` no longer has its own state rules**: it reads its events through `LoopRules.parse`/`apply` and its `status` is `LoopRules.stateOf`, so a commitment and a loop cannot disagree about *overdue*. Every Commitments test passed unchanged.
- **`LoopFacts`** — the only builders of `orb.loop.*` records, refusing a word outside the vocabulary (a `GET` kind, an `unknown` owner, a `self` origin and a `guessed` basis are all outside it), a rule id that is not a short lower-case name, a counterparty that is not a blinded key. No status, no authorization, no confidence field exists to be filled.
- **The conformance corpus**, `docs/fixtures/loops/` (plain JSON, synthetic): `lifecycle.json` (26 cases, including an opening with no next mover, which is not a loop), `matching.json` (9 cases, each also run in **every order** of its observations), `fit.json` (27 service messages → role, kind, next mover, amount, rule — including the ambiguous ones; 5 amount cases; 8 sender brands), `inbox.json` (a small inbox read as a whole, with matching). A test checks that **every rule of the draft reading is reached by a case**. Any other implementation runs the same files.
- **`LoopFit`** — the draft reading for the fit test (§13): first-match rules, documented as guesses (`rules()`); `Report` with counts only; the matching of a closing to an opening (same sender brand, same amount to the minor unit, within 45 days, closing not before opening) uses the protocol's own `sameLoop`.
- **On the Messages screen**: after *Look*, a paragraph — *"Protocol fit (a draft reading of N messages from names and short codes; M from numbers are not read). Each can open, move on or close a loop: DO x · GIVE x (x owed by you, x owed to you) · ATTEND x · RESPOND x · DECIDE x. Not a loop: x (noise, only information). Could not be read: x (P% of the rest). Ambiguous: x. Of K openings with an amount, J have a closing of the same amount from the same sender."* — and a button, **Record this fit report (counts only)**. **Nothing is recorded unless you tap it.** One record, `orb.loop.fit.reported`: numbers, the protocol and rule-set names, the brand codes of the ten largest unmapped groups, and the names of the five rule pairs that most often disagree.

**Not built, on purpose:** any writer of `orb.loop.opened` outside a test (nothing yet opens a loop); any adapter beyond the draft fit reading; Money; recurrence; relations; a model; a Loops screen; the brief or Today reading loops (they read commitments, as before — same state function).

**The fit test is a measurement, and the draft rules are coarse.** The 10 % bar in §13 is for the protocol, not for these rules: a high `unmapped` on the first pass is expected and is the finding (what the protocol needs next, by sender), not a failure. Freezing waits for the operator's result and a second look at the clusters.

**Scope note on §13.** The fit pass reads each service message's words once, in memory, to choose a role, and keeps nothing but the role, kind, amount (as a number), sender brand and day — only to count matches — all discarded when the Look screen closes. This is inside the words of `orb.read.messages` v1 ("Reads, in the one message-backup file you choose, the conversations and messages … only counts are recorded"); **no capability changed**.

## 19. First fit result (2026-10-04, counts only)

The operator's inbox (25,552 messages; 23,633 from names and short codes) read by the draft rules: **closes 4,915 · opens 990 · advances 105 · ambiguous 1,043 · information 65 · noise 3,186 · could not be read 13,329 (65 % of the non-noise; one sender is 62 % of those).** Full table and reading: `DEVICE_LOOP.md` §7b94, *Result*.

- **Not frozen; not contradicted.** DO, GIVE (either owner), ATTEND and DECIDE occur; RESPOND does not in service SMS. The unread bulk is a property of the draft rules and one large sender, so criterion 3 (§13) cannot yet be judged.
- **Closing needs a loop to close.** 4,280 money-out messages against 262 openings that owe money: a debit with no open loop is an *observed transfer* (evidence), never a closure. This is the shape of Money.
- **Matching on sender + exact amount + 45 days matched 11 of 326 openings.** Which dimension fails is the next measurement (v58: relaxed matching, counts only).
- **A message that closes one obligation and opens the next** is suspected in 252 cases (money-out + bill-due). If an example confirms it, recurrence (§12) gets designed with Money; no new kind is implied.
- **Next:** a template census per large sender (distinct shapes, share of the commonest; numbers only) and the relaxed-matching figures, then the rules for the largest readable senders, then a second fit report.
