# The Loop Protocol v0.1 — what is open between you and the world (proposed)

> Status: **proposed — not approved, nothing built.** Direction chosen by the operator on 2026-10-04 ("Yes to all four, go ahead with the Loop protocol design"): the name **Loop**; six kinds plus owner plus origin; a **fit test on the real corpus before anything freezes**; an **ordinal basis** instead of a numeric confidence for rule-derived loops.
> Governed by `CONSTITUTION.md` Art. II (§6–10), Art. XI (§42–43), Art. VII. Builds on `COMMITMENTS_PHONE.md` (the two-direction commitment that is already on the phone), `COMING_UP_PHONE.md` (dates), `UNDERSTANDING_PHONE.md` (computed statements, recorded answers), `GATE_PHONE.md` (authorization), `contracts/Belief.md`, `contracts/Evidence.md`, `contracts/Action.md`.
> This document defines **a vocabulary and its rules**. It adds **no capability, no permission, no screen and no kernel contract**.

## 1. Why, in plain words

Everything Orb can read — a bank text, a bill, a delivery message, a calendar entry, a person you promised something to — is **evidence of one thing: something is open between you and the world, or it just closed.** Today each source is built as its own feature (Messages, Coming up, Commitments, the brief), and each re-invents what "open", "overdue" and "waiting" mean.

The Loop protocol says it once. **A loop is something open: you owe it, or you are waiting for it.** Sources become *adapters* that open, advance or close loops; screens (Today, Waiting, Coming up, the brief) become *views* over loops. A new source then costs an adapter, not an architecture.

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

A loop has **a kind, an owner, an origin** — three small, independent facts — plus what it is about and when.

### 3.1 Kind — what is owed (six)

| Kind | Meaning | Core question | Includes | Excludes |
| --- | --- | --- | --- | --- |
| **DO** | An act, with no one to hand it to | What must be done? | file a return, renew a document, book a test, sign | acts whose point is to hand something over (→ GIVE); being somewhere (→ ATTEND) |
| **GIVE** | A thing goes from one party to another: money, a document, information, an item, access, approval | What is owed, to whom? | pay a bill, send an invoice, return a parcel, share a PAN | the act of paying *as an event* (that is evidence that closes it) |
| **GET** | The mirror of GIVE: a thing is expected *by you* | What am I waiting to receive? | refund, salary, delivery, a document, a reply's *content* when the content is a thing | nothing is expected (a promotional notice) |
| **ATTEND** | Presence at a place or time | Where/when must I be? | meeting, flight, appointment, reservation | a date that nobody expects you to act on (evidence only) |
| **RESPOND** | A reply is owed | Who is waiting for an answer? | an unanswered question or request, a callback | a reply whose content is a *thing* (→ GIVE/GET) |
| **DECIDE** | A choice is open | What must I choose or approve? | pick a flight, approve a quote, confirm a booking | a choice already made (evidence) |

**Why six, not eight.** `ASK` and `PROMISE` are not things that are open; they are *how a loop began* (§3.3). `GET` is `GIVE` seen from the other side, so it is **one loop** with a different owner, never two records — this is what stops Today from listing the same invoice five times.

### 3.2 Owner — who must move next

`me` | `them` (a named counterparty, or `unknown`). **The same real-world loop has exactly one owner at a time.** *They owe me a refund* and *I am waiting for their refund* are one loop, owner `them`, kind GET. If the ball moves (they ask me for a form; I send it), that is a **lifecycle event** (§5), not a second loop.

*Waiting for* = open loops with owner `them`. *On me* = open loops with owner `me`. Both are views.

### 3.3 Origin — how it began (the speech acts live here)

| Origin | Meaning | Example |
| --- | --- | --- |
| `stated` | A source states an obligation or expectation (a bill, a booking, a delivery) | credit-card statement: ₹8,421 due 10 Oct |
| `asked` | Someone asked something of you, or you asked of someone | "Can you send me the invoice tomorrow?" → kind GIVE, owner `me`, origin `asked` |
| `promised` | Someone, you included, said they would | "Sure, I'll send it tomorrow." → the same loop, origin becomes `promised` (a **lifecycle event**, §5; the loop is not duplicated) |
| `self` | You made it up yourself | the commitments already on the phone |

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
  kind:         DO | GIVE | GET | ATTEND | RESPOND | DECIDE
  owner:        me | them | unknown
  origin:       stated | asked | promised | self
  counterparty: entity ref | unknown | none
  object:       { class, amount?{minor, currency}, words?(sealed) }
  when:         { due? | at? | window? , place? }
  basis:        stated | inferred | guessed      // §6; never a number
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

**Existing history is not rewritten.** `orb.commitment.opened/moved/done/dropped/reopened` are **protocol-v0 forms** of `orb.loop.*`; the reader treats them as aliases (kind chosen by the commitment's direction: *I owe* → owner `me`, *waiting for them* → owner `them`; origin `self`). New code writes `orb.loop.*`. See §10.

## 6. Basis and provenance — no numeric confidence

Art. XI §43: confidence is recorded faithfully, never resolved into certainty, never silently upgraded. A rule that matched a template is not "0.96". So for rule-derived loops:

| Basis | Meaning | Example |
| --- | --- | --- |
| `stated` | The source says it in so many words | "Total due ₹8,421 on 10-Oct" |
| `inferred` | A rule concludes it from the source's shape | an EMI debit repeated monthly → next one expected |
| `guessed` | Resolved by a convention that can be wrong | "Friday" resolved from when it was written |

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
| GIVE | yes | money: the matching debit; otherwise none | a sent message/document to the counterparty |
| GET | yes | money: the matching credit; item: delivered notice | a related notice |
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
| Commitment, *I owe* | kind DO or GIVE (by whether it names a thing and a person), owner `me`, origin `self` |
| Commitment, *Waiting for them* | kind GET, owner `them`, origin `self` |
| Coming up (a written future date) | a proposed loop, basis `stated` (or `guessed` for relative days); kind by adapter (ATTEND for appointments, else evidence only) |
| Understanding "regular touch / waiting" | **evidence about RESPOND** (a pattern), not a loop |
| Reminder | an *execution* (an Action) that **cites** a loop; not a loop |
| Morning brief | a **view** over loops (counts) |
| Messages (SMS) | an **adapter**: observations → open/advance/close |

Nothing built needs to change for v0.1: the **reader** learns `orb.commitment.*` ⇒ `orb.loop.*`.

## 11. Adapters, "not a loop", and the conformance corpus

**An adapter** reads one source and, for each observation, returns exactly one of:
`opens` · `advances` · `closes` · `evidence-only` (relevant, opens nothing) · `noise` (not about the user's obligations) · `unreadable`.
It declares: its **rule ids and versions**, its **objectClass and period**, its **matching tolerances**, and its **closure evidence classes** (§7). It reads only what the app already holds, in its existing capability.

**Not a loop (inclusion rule).** A loop opens only when *a human has something to do, give, receive, attend, answer or decide*. These are **evidence only or noise**: OTPs, promotions, balance notices, marketing, receipts for things already complete, delivery "your order is placed" without an expectation you hold, a date nobody expects action on.

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

**What it is.** A *counts-only* classification of the operator's real SMS (≈ 23,600 service messages), using a coarse draft adapter, to measure the protocol and not to build Money. Each message lands in **exactly one** of: opens · advances · closes · evidence-only · noise · unreadable · **unmapped**. Output: a histogram by (kind, class), counts of unmapped by sender *header* (service headers only; never a person, never text).

**Where it runs.** The messages never leave the phone: either (a) on the phone as a counts-only report on the Messages screen (a small build, same shape as the other reports), or (b) on the container **only** if the operator re-uploads the backup file for that purpose, counts-only and never committed. The operator chooses; (a) is the default (local-first).

**Acceptance — the protocol freezes only if all hold:**

1. Every message has exactly one classification; none needs a field the envelope lacks.
2. `unmapped` ≤ 10 % of non-noise messages.
3. The ten largest unmapped clusters are inspected and **none requires a new kind, a new owner value, or a new envelope field** (if one does: revise to v0.2 and re-run).
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

1. **Loop** is the name; a loop is *something open between you and the world*, and it is an interpretation (a Belief) that cites evidence — **no new kernel contract**, and "Action" keeps meaning execution.
2. **Six kinds** (DO, GIVE, GET, ATTEND, RESPOND, DECIDE), **one owner at a time** (me / them), and **origin** (stated / asked / promised / self) carrying the speech acts.
3. **No stored status, no authorization field, no numeric confidence**; ordinal **basis** with a **rule id and version**.
4. **Closure classes** (you / exact evidence / suggests), absence is never closure.
5. **Proposed loops are computed views; only confirmed loops and your acts are events**; the journal carries no text, name or amount in the clear.
6. **Existing `orb.commitment.*` events are read as protocol v0** — no history is rewritten.
7. **The fit test (§13) comes before any freeze**, and Money is the first adapter after it.

## 17. Questions only you can answer

1. **Where the fit test runs**: on the phone (default; one small build) or on a file you re-upload for this purpose?
2. **Words**: in your own screens, should GET read "Waiting for" and GIVE/DO read "On me" (as Today does now), or do you want the kind names shown?
3. **Broken promise**: show it as its own list ("Said, still open"), or only inside Today's overdue?
