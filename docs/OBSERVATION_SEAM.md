# The Observation seam v0.1 — one way in for everything the world tells Orb (proposed)

> Status: **proposed — not approved, nothing built.** Direction chosen by the operator on 2026-10-04, after the first two fit rounds on the real inbox: five decisions ("Normalizer → Observation → Interpreter", off-phone pull adapters with a write-only local app API, persisted normalized Observations with no raw text, source marks, *Pay* as a handoff only), plus two refinements (how a subject is known is **named, not scored**; a trust tier is **provenance authenticity, not truth**).
> Governed by `CONSTITUTION.md` Art. I (history), Art. II (§6–10), Art. XI (§41–43), Art. VII. **Reconciled with the kernel contracts it touches** (§2): `contracts/Observation.md`, `Evidence.md`, `Belief.md`, `Action.md`; and with `LOOP_PROTOCOL.md` v0.1 (the interpretation target), `SENDER_MARKS_PHONE.md` (generalised here to source marks), `ERASURE.md`.
> Adds **no Android permission and no public API**. The app-facing API (§11) is specified and **not built**.

## 1. Why, in plain words

The two fit rounds showed one flaw and one opportunity.

- **The flaw.** The SMS reading goes straight from words to a loop effect ("closes a GIVE owned by me"). So 4,280 payments counted as 4,280 "closings" against only 262 obligations that owe money. **A payment is not a closure.** It is *money moved*. Whether it fulfilled an obligation is a separate question, answered only if a matching open loop exists.
- **The opportunity.** Reading SMS is the *hardest* source Orb will ever have — free text, no reference, spoofable. Other sources (a calendar, a bank feed, an app that cooperates) give structured facts with real references. If they all arrive as the **same kind of fact**, Orb needs one interpretation engine, not one per source — and each new source costs a *normalizer*, not an architecture.

So Orb gets one hard seam. Everything the world tells it becomes an **Observation** — a fact, with provenance — and only then does Orb's own, versioned, deterministic **Interpreter** decide what it means for a person.

```
 SOURCE (SMS · calendar · bank feed · an app)
    │  raw — seen transiently, never kept
    ▼
 NORMALIZER  (one per source; pure; says what happened, never what it means)
    ▼
 OBSERVATION  ──────────────►  sealed monthly store  (no raw text)
    │
    ├─► LEDGER    (a view over `value.moved`; never a second store)
    │
    ▼
 CORRELATE  (is this about something already open?)
    ▼
 INTERPRETER  (Orb-owned table, versioned)
    ▼
 LOOP EFFECT:  OPEN · ADVANCE · CLOSE(class) · NONE
    ▼
 LOOP (LOOP_PROTOCOL.md)  ─►  TODAY · WAITING · COMING UP · BRIEF

 separately:  POLICY ─► AUTHORIZATION ─► ACTION ─► external world   (never from an Observation)
```

**The rule that holds it together:** *an Observation is a fact about the world; a Loop is Orb's interpretation of what that fact means for a human.* Each can be recomputed without rewriting the other.

## 2. Reconciliation with the kernel (read this before the rest)

An Observation already exists as a kernel contract. This design **extends it with a payload kind and adds nothing to the kernel**; where they overlap, the kernel wins.

| Kernel says (`Observation.md`) | This design |
| --- | --- |
| An Observation is recorded as an **Event**, immutable, append-only; corrections are new Observations; never edited or deleted | Kept. A month of normalized observations is **one Event** (`orb.observations.kept`) attributed to the import source. A corrected month is a **new** bundle; the old bundle's key may be destroyed under `ERASURE.md` (history keeps the Event; the content is gone) |
| **References, never copies**: raw content is an Attachment by content hash | Kept. The Event carries the bundle's content hash; the observations are *inside the sealed Attachment*. **Raw SMS text, bodies and notifications are never kept at all** — only the normalized fact |
| Always **attributed** to a source identity (a value, not a dependency) | Kept. `source` is a value: `{kind, id}` (§8), blinded in the journal |
| **Occurrence, not truth** | Kept, and sharpened: a trust tier (§9) says how authentic the *provenance* is, never whether the fact is true |
| Carries **`confidencePercent`** (an integer 0–100, "proposals, not measurements") | Kept. Each normalizer declares a constant per observation class, **recorded and never used by the Interpreter** to decide anything. The Interpreter uses only the ordinal **basis** (§4). No fake probability enters interpretation |
| New observation **payload schemas** may be added freely, versioned | This is one: `observation.bundle.v1` — N normalized observations as a single sealed Attachment. A bundle is an Observation of *an import*, not N Events |
| Evidence (`Evidence.md`) grounds Beliefs in Observations | A **Loop is a Belief** citing Evidence; its events cite the bundle (and, once indexed, the observation id inside it) |

**Why a bundle and not one Event per Observation.** The operator's file alone yields on the order of ten thousand observations a year. One Event each would multiply the journal ~10×, and every screen reads the journal whole. A bundle per month keeps history, hash, attribution and erasure semantics intact at a size the phone can carry. **This is an architectural choice and is asked for explicitly in §14.**

## 3. The Observation (the envelope)

```
Observation {
  protocol:    "obs/0.1"
  id:          deterministic: hash(adapter, source, type, subject.reference, occurred, amount)
               // the same fact imported twice is one fact (idempotent)
  type:        from the vocabulary (§5)
  source:      { kind, id, tier, adapter:{id,version} }          // §8, §9
  occurred:    when it happened in the world     (a day, or an instant where it matters)
  seen:        when Orb saw it                   (never used to decide anything)
  bearer:      me | them | unknown                // for statements: who must move
  counterparty: entity ref | none
  subject:     { class, reference, basis: observed|stated|inferred, rule?: {id,version} }   // §6
  object:      { class, amount?{minor,currency}, words?(sealed) }
  when:        { due? | at? | window? , place? }  // for what is said about the future
  confidencePercent: integer 0–100                // declared by the normalizer; kernel field; not read by the Interpreter
}
```

**Deliberately absent:** `kind`, `owner`, `origin`, `status` — those are **Orb's** (the Loop protocol). An app or a normalizer says *what happened*, never *what it means for you*. This keeps the ontology in one place; otherwise every integration becomes its own interpretation.

## 4. Basis — how Orb knows

One ordinal everywhere, as in the Loop protocol (§6 there): **observed** (the source shows it happening, with its own reference), **stated** (the source says it in so many words — "invoice 4471", "card ending 1234, period Sept"), **inferred** (a rule concludes it from shape or convention — "same sender, same amount, within 45 days"). A rule's `id` and `version` always accompany an inferred value.

## 5. The vocabulary v0.1 and the Interpreter table

Thirteen types. Small on purpose; a new one is additive.

| Observation type | Meaning | Interpreter effect (kind · owner · origin) |
| --- | --- | --- |
| `obligation.stated` | Someone states something is owed or expected: a bill (bearer me), a refund pending (bearer them), a document requested (bearer me), a delivery promised (bearer them) | **OPEN** · GIVE (a thing: money, document, item) or DO (an act) · owner = bearer · origin **stated** |
| `obligation.progressed` | It moved on (dispatched, out for delivery, refund initiated, payment failed — `stage` says which) | **ADVANCE** the matching loop; **OPEN** one if none is known and the world is plainly telling us (a shipment on its way) |
| `obligation.fulfilled` | The source says it was fulfilled (delivered, refund credited, invoice received) | **CLOSE** the matching loop — class by §7. No matching loop: **NONE** |
| `obligation.withdrawn` | Cancelled or waived | **CLOSE** the matching loop (class by §7) |
| `attendance.scheduled` | A time and place to be | **OPEN** · ATTEND · me · stated |
| `attendance.changed` | Time or place changed | **ADVANCE** (date) |
| `attendance.cancelled` | It is off | **CLOSE** (class by §7) |
| `request.received` | Someone asks something of you (a payment request, a form to sign; a message that asks — only where a source can say so without reading language) | **OPEN** · GIVE or DO · me · origin **asked** |
| `request.answered` | You or they responded | **ADVANCE** or **CLOSE** a RESPOND |
| `decision.requested` | A choice or approval is needed | **OPEN** · DECIDE · me · asked/stated |
| `decision.made` | It was made | **CLOSE** the DECIDE |
| `value.moved` | Money (or a counted asset) moved: `direction` out / in, amount, counterparty | **LEDGER, always.** And a **CLOSE candidate** for a matching open GIVE (out → owner me; in → owner them), class by §7. **No matching loop: ledger only** |
| `information.noted` | Relevant but opens nothing (a balance, a fill, a hold) | **NONE** (evidence only) |

**Not a type, on purpose:** a one-time code, a promotion, a greeting. A normalizer **discards** them and says why (`code`, `promo`, `quiet`, `unreadable`); the *counts* of discards are kept, the content is not.

**What the Interpreter never does.** It does not read words, call a model, or look at the clock; it is a pure function of *(observations, the loops that exist, the person's marks, its own version)*. A new version recomputes; nothing is rewritten.

## 6. Subject and correlation — "how do we know it is the same thing?"

Not "how confident are we", but **which kind of knowing**:

```
subject: { reference: "order_123",            basis: observed }                      // the source's own id
subject: { reference: "card·1234·2026-09",    basis: stated   }                      // the words give it
subject: { reference: <blinded derived key>,  basis: inferred, rule: sms.payment.correlation.v1 }
```

- **Correlate** binds an observation to a loop: exact reference when `observed`/`stated`; a rule (same counterparty, same object class, same amount to the minor unit, within N days — N is the rule's) when `inferred`.
- **Ambiguity never merges.** Two candidate loops: both stay; the person can say *same* or *different* (events), as in the Loop protocol (§8).
- **Order independence.** The same observations in any order give the same loops (a conformance requirement).

## 7. Closure — what an observation may do to a loop

The Loop protocol's closure classes (§7 there) are decided **by the subject's basis**, not by the adapter's say-so:

| The subject is known by… | A `fulfilled` / `value.moved` / `withdrawn` observation is… |
| --- | --- |
| **observed** or **stated** reference | **exact** evidence |
| **inferred** (a rule) | **suggests** — the loop stays open, annotated *may be paid — confirm?* |

**Default policy for the first build: even *exact* evidence only suggests** (an annotation the person sees and confirms), because "Orb never marks anything done" is a rule the person has lived with since commitments. Closing by exact evidence automatically can be switched on later, per kind, after the person has seen it be right. This is a *policy*, not a protocol change (asked in §14). **Absence is never closure.**

## 8. Sources, and source marks

A **source** is anything Orb receives observations from, written `{kind, id}`:

| kind | id | tier |
| --- | --- | --- |
| `sms.sender` | the sender code (`HDFCBK`) — as built | T0 |
| `app` | an Android package | T0 / T2 |
| `account` | a connected account (a mailbox, a bank feed) | T1 |
| `connector.feed` | a feed from the user's own connector | T1 |

**Source marks generalise sender marks** (DR-42): *quiet* / *clear*, an event with a blinded key and counts, **one meaning everywhere**. `orb.sender.judged` is read as the `sms.sender` kind of `orb.source.judged` — history is never rewritten. A new source kind ships with its adapter and, being a wider use of the same capability, with a new capability version — not an edit.

**Quiet, precisely.** A quiet source's **new** observations are **not persisted and not interpreted**; the discard is counted. What was kept **before** the mark stays in the store but is excluded from interpretation (taking the mark back restores it at once); a separate, explicit **"erase what Orb kept from this source"** destroys it. A mark **never closes, deletes or alters a loop the person already accepted**.

## 9. Trust tiers — provenance authenticity, never truth

| Tier | Source | What the provenance proves | What it does *not* prove |
| --- | --- | --- | --- |
| **T0 surface** | SMS, notifications, screen text | This appeared on this phone, attributed to this sender code | The sender is who the code says (codes can be spoofed); the fact is true |
| **T1 authorised pull** | the person's own session with a provider, via their connector | The provider returned this to the person's authorised session | The fact is true; that nothing was missed |
| **T2 cooperative push** | an app that calls Orb's local API | The app (by its signing identity) really sent this | The fact is true in the world |

A tier is recorded in `source.tier` and **shown** on the *Why is Orb showing this?* screen. It is never turned into a score.

## 10. The normalizer contract (what an adapter is)

A normalizer is a pure, deterministic function of **one raw item** (an SMS, a calendar entry, an API event) and a small context (the day, the person's marks), returning:

```
Result { observations: [Observation], discarded: { reason: count } }   // reasons: code · promo · quiet · unreadable · ambiguous
```

It must: be **idempotent** (stable `id`); never emit `kind`/`owner`/`origin`; never keep raw content (the raw item is dropped when the function returns); declare its **rule ids and versions**, its `confidencePercent` constants (as *proposals*), and which subject bases it can produce. It must **not** read other observations (correlation is not its job). `authenticate / subscribe / fetch` belong to the *source plumbing* of the adapters that need them and live **off the phone** for T1 (§11).

A message that two normalizer rules read as different facts is **`ambiguous`** — counted, never forced into a type — exactly as in the fit report.

## 11. Boundaries

1. **OBSERVE: app → Orb, one way.** *(Specified, not built.)* A local, **write-only** entry point on the phone. The caller is identified by its Android signing identity and **may speak only for itself** (`source.app` = its own package). It sends Observations — never loops. It receives *accepted / rejected*, nothing else; **it cannot read anything Orb holds**. Each app is allowed individually (an allow-list, like the assistant's), can be marked quiet like any source, and is rate-limited. Not built until three independent adapters have shared the seam.
2. **PULL: off the phone.** T1 adapters (mail, bank) run in `packages/connector` on the person's own machine, and hand the phone an **observation bundle file** through the existing import path. **The phone gains no INTERNET permission.**
3. **INTERPRET: Orb → Loop.** §5, Orb-owned, versioned.
4. **AUTHORIZE → ACT.** Policy, the capability gate and an Action (`contracts/Action.md`), exactly as today. **A Loop and an Observation never execute anything.**
5. ***Pay* is a handoff.** It opens the payee's own app with what Orb knows; Orb **does not** move money, hold funds or create a transaction. (There is deliberately no executor or payment engine.)

## 12. Persistence

- **What is kept:** normalized observations only. **Never** raw text, a notification body, an OTP, a link.
- **How:** one sealed Attachment per **calendar month, all sources** (a bounded count — dozens, not thousands), content-addressed, with the Event `orb.observations.kept` (month, count, blinded sources, content hash). A re-import of the same month yields the same hash; a month with new facts is a new bundle and the old one's key may be destroyed.
- **Erasing one source's observations** rewrites the affected months without them (a new bundle) and destroys the old keys. **Erasing everything** destroys every bundle's key.
- **Replay:** the Interpreter is run over the bundles plus the journal (marks, confirmations, closes, drops). Proposed loops are *recomputed*; confirmed loops are the fold of their events (Loop protocol §9).
- **Retention:** a rolling window (asked in §14).
- **The Ledger** is a *view* over `value.moved` observations: sums by counterparty and month, computed when asked. It is not stored, so it cannot disagree with the observations.

## 13. The reference implementation, and the proof

The existing SMS path becomes the **first reference implementation** of the seam. Its current rules map as follows (the fit report's *roles* become *effects of observations*):

| Today's rule (`LoopFit`) | Becomes |
| --- | --- |
| code · promo | **discard** (`code`, `promo`) |
| failed | `obligation.progressed` (stage `failed`, bearer me) |
| refund-started · in-transit | `obligation.progressed` (bearer them) |
| payment-done | `value.moved` (out) **and** `obligation.fulfilled` (bearer me; subject *stated*: "towards your card ending…") |
| money-out · transfer-out | `value.moved` (out) |
| money-in | `value.moved` (in) |
| order | `obligation.stated` (bearer them) |
| delivered | `obligation.fulfilled` (bearer them) |
| bill-due · renew | `obligation.stated` (bearer me; act vs thing by object class) |
| collect-request | `request.received` |
| approve | `decision.requested` |
| attend | `attendance.scheduled` |
| balance · hold | `information.noted` |
| trade-fill | `information.noted` for now; an exchange is a **Money-design** question (`value.exchanged`) |

**The proof obligation.** The refactor is accepted only if **every current fixture still passes** — the lifecycle, matching, fit and inbox corpora, the sender-mark tests — and the **real-file report reproduces** (the container probe's counts: 23,633 service messages; 4,044 unread; 119 ambiguous), except where the seam **deliberately** changes a number: "closes" is replaced by *CLOSE of a known loop* plus *ledger only*. That difference is the point and is reported as such.

**New conformance, adapter-independent.** Three levels, so a calendar adapter and an API adapter run the *same* second and third:
1. **Normalizer fixtures**: raw item → observations + discards (per adapter).
2. **Interpreter fixtures**: a sequence of observations (and the marks) → loop effects and states. *No adapter appears.* This is where the seam is held.
3. **End to end**: raw → states.
Plus: idempotence (the same observation twice is one), order independence, quiet sources, and erasure of a source.

## 14. Questions only you can answer

1. **A bundle per month, not an Event per observation** (§2). It satisfies the kernel through a new observation payload kind, at a tenth of the journal's growth. Agree?
2. **`confidencePercent` as declared constants per rule class, recorded and never used by the Interpreter** (§2). Agree? (The alternative — leaving the field out — would break the kernel contract.)
3. **Suggest-only closing at first**, even for exact evidence (§7). Or close automatically from the start?
4. **Retention:** how many months of observations does Orb keep? I'd start with **24**.
5. **Quiet means "do not keep new, do not interpret old; erase on request"** (§8). Or should a quiet source's already-kept observations be erased when it is marked?
6. **Leave `value.exchanged` (a trade fill) for the Money design.** Agree?

## 15. Order of work, once approved

1. This document approved (as written or amended).
2. **Refactor** the SMS path behind the seam — Normalizer / Observation / Interpreter in the phone app — with the whole existing suite and the real-file probe as the proof (§13). No new screen, permission or capability.
3. **Fit again** on the real file: the new effects, and the first honest *ledger-only* count.
4. **Money** as the first real adapter-and-view on the seam: the ledger, recurring obligations, and the bank/payment senders already readable.
5. Only then: the local app-facing API, and the first T1 adapter in the connector — **after three adapters share the seam**.

## 16. Risks

| Risk | Handling |
| --- | --- |
| The seam is more machinery than the problem needs today | It replaces, not adds: `LoopFit`'s rules become a normalizer and a table. The refactor must keep every fixture green; if it cannot, it is wrong |
| Persisting facts about money, even sealed, widens what the phone holds | Normalized only, never raw; sealed per month; erasable by key; bounded window; a quiet source stops being kept |
| An observation from an app is *wrong or hostile* ("payment due: pay now") | Tier and provenance are shown, never scored; an observation only ever opens a *proposed* loop; nothing executes; each app can be marked quiet; *Pay* is a handoff |
| A signed event is mistaken for a true event | §9 says it plainly; the *Why* screen shows the tier |
| The Interpreter table becomes a hidden policy | It is data with an id and a version; a change recomputes and is auditable; fixtures hold it |
| The vocabulary grows without discipline | Additive only; every type has an Interpreter row and a fixture |
| The journal's "every Observation is an Event" is read strictly | §2 and §14.1 put the choice to you; the alternative (one Event each) is stated with its cost |

## 17. Not in this document

The public SDK and app-facing API (§11 specifies only the boundary); any pull adapter; models and language (`request.received` from chat needs them — a separate privacy decision); Money's categories, recurrence and the `value.exchanged` type; a rule format as data; multi-device sync of observations.
