# Money v0.1 — an adapter and a view on the Observation seam, not a module

> Status: **approved 2026-10-04 with the decisions in §15; build in progress (slice A).** Written after "Money should be designed as a Money adapter over the Observation seam" and "design first". `DECISIONS.md` DR-44.
> Governed by `CONSTITUTION.md` Art. I (history), Art. II, Art. VII, Art. XI; built **on** `OBSERVATION_SEAM.md` (every type, effect and rule there stands) and `LOOP_PROTOCOL.md` (a payment closes nothing by itself). Adds **no kernel contract, no public API and no network permission**. One new capability (§7), nothing else on the phone's permission list.

## 1. The question, and what would answer it

> **Can Orb reliably turn financial observations into ledger entries, and correctly correlate only the subset that actually corresponds to known Loops?**

Not "can Orb understand personal finance". The seam has already given a first answer on the real inbox: **6,094 payments stated, 20 that look like the end of something open, 6,074 ledger-only.** What is *not* yet known, and why this slice exists:

1. **Is the ledger complete and counted once?** The SMS ledger has never been checked against anything independent. Counts alone cannot tell us what the SMS reading *missed*; only a second, independent witness of the same money can. That is the real reason for a second source (§3).
2. **Are the 20 candidates right, and are there candidates missed?** Nobody has yet been asked "was this paid?". The answers (§6) are the first ground truth Orb has about its own correlation.

Everything below exists to answer those two, and nothing else is built.

## 2. What "Money" is made of

| Piece | Is | Is not |
| --- | --- | --- |
| **Statement adapter** (§3) | a second source of `value.moved`, with the bank's own references | a bank connection (the phone gains no network permission) |
| **Corroboration** (§4) | a computed rule that says *these two observations are one movement* — the ledger counts a movement once | a new store; it is a view, as the seam says the ledger must be |
| **Ledger view** (§5) | a read-only screen: money *moved*, by month, direction and account | spending analysis, categories, budgets |
| **Keeping** (§7) | the first caller of `ObservationStore.keep`, behind one capability | a second source of truth: bundles hold facts, the ledger is computed from them |
| **Candidate review** (§6) | *Mark paid* / *Not this* on `CLOSURE_CANDIDATE` — the measurement instrument | automatic closing (still not an effect) |

No new Observation type. No new Interpreter effect. If a piece needs one, the design is wrong and comes back to you.

## 3. The statement adapter

**What it reads.** A statement the person exports from their own bank or UPI app and picks with the system file picker — the same route as the message backup. **CSV only in v1** (XLSX is a zip, PDF is a layout; neither without a library, and the phone takes no dependencies). The file is read as a stream, row by row, and dropped; **no row, narration or file is kept** — only the normalized facts, in the sealed bundle (§7).

**One profile per layout, as data.** A profile is a small closed declaration — delimiter, header names, date format, amount convention (separate debit/credit columns, or one signed column), decimal and grouping marks, the name of the reference column — in `docs/fixtures/money/profiles/<id>.json`, versioned. It is a **column map**, not a rule language (that stays out, `OBSERVATION_SEAM.md` §17). A new bank costs a profile and its fixture, not code. The profile id and version are the adapter's `{id, version}`.

**What a row becomes.**

| Row | Observation | Notes |
| --- | --- | --- |
| a debit / credit | `value.moved` out / in, amount in minor units, currency, `occurred` = the value date | `source = {kind: account, id: <blinded account key>, tier: T1}` |
| its reference (UTR / RRN / cheque no.) | `subject.reference`, basis **`observed`** if the reference has its own column, **`stated`** if it was found inside the narration, otherwise **`inferred`** by rule `money.statement.noref.v1` | the reference is what makes correlation *exact* when an obligation carries the same one |
| the payee in the narration | `counterparty`, **sealed in the bundle only** — never in the journal Event, an export or a probe line | a person's name can be here; see §11 question 3 |
| balance, charges, interest | balance → discarded (`balance`); charges and interest are ordinary `value.moved` | no categories (§9) |
| a header, a total line, an unreadable row | discarded with a reason, counted | exactly the seam's discard rule |

**The profile must prove it read the file right, without a human.** If the statement has a balance column, the chain *opening + credits − debits = closing* is checked row by row; **a file whose rows do not reproduce its balances is refused whole** (a sign convention or a date format read wrongly would otherwise put wrong money in a ledger quietly). Without a balance column, the import preview shows the counts and totals for the person to check against the statement's own summary, and keeps nothing until they say so.

**Tier.** `T1` — the person's own export from the provider — with `how = file` shown on *Why is Orb showing this?*. A file proves the person handed it over; it does not prove the bank wrote it, and the screen does not pretend otherwise (`OBSERVATION_SEAM.md` §9: provenance, never truth).

## 4. Corroboration — the ledger counts a movement once

The seam's `Observation.id` includes the source, so **the same real payment seen as an SMS and as a statement row is two observations**. That is right for provenance and wrong for a ledger: summed naively, the ledger double-counts. So:

- **A movement** is a set of one or more `value.moved` observations judged to be the same real-world event.
- **Rule `money.corroborate.v1`** (data: id, version, window): same direction, same currency, same amount to the minor unit, `occurred` within **1 day**, and — when both carry one — the same `observed`/`stated` reference. Observations are paired **one-to-one, earliest first, per source pair**; a surplus is left unpaired. Two chai payments of ₹40 in one day are two movements whether one source saw both or two sources saw one each: pairing is by count, never by merging.
- **Ambiguity never merges** (seam §6). If pairing is not unique (same amount, same day, no reference) it still pairs by count and the movement is marked **`paired by count`**, shown as such.
- **Order independence and idempotence** are conformance requirements, as for correlation. Quieting or erasing one source *un-pairs* it by recomputation; nothing is rewritten.
- A movement carries its **witnesses** (which sources saw it). The ledger shows, per month: movements; seen by both; **by SMS only**; **by statement only**. **The last two are the measurement of the SMS reading's completeness** — "by statement only" is money the SMS rules missed, and the count is exact without anyone reading a message.

This is a **view**, computed on open; it is not stored, so it cannot disagree with the observations.

## 5. The ledger view

One read-only screen, `FLAG_SECURE`, opened from the main screen: for a month, **money moved out and in**, per account, with the witness counts of §4, and a list of movements (date, amount, direction, account, witnesses, and the counterparty label when a statement gave one). Tapping a movement shows *Why is Orb showing this?*: its witnesses, their tiers, the rule that paired them.

**It says "moved", never "spent" or "earned".** The real inbox contains both card spends and the payments that settle the card; a total of "out" would count that money twice, and neither the SMS nor the statement can say that two accounts belong to the same person's one pocket. Own-account transfers are **not inferred**; the person may mark a movement *between my accounts* (an event; it changes how the ledger groups it, never the observation). v1 shows the honest number and the note *"Card payments and card spends both appear as money moved."*

Multiple currencies are **never summed together**; each is its own line.

## 6. Candidate review — the instrument that measures correlation

> **Superseded for slice B by §17 (DR-46):** *Mark paid* is a label, not `orb.loop.closed`; the text below is the original design.

The seam already yields `CLOSURE_CANDIDATE`. v1 adds the only thing missing: the person's answer, as events, on the loop row (Coming up / Waiting): **Looks like this was paid — *Mark paid* · *Not this***.

- **Mark paid** → the existing `orb.loop.closed` (`LOOP_PROTOCOL.md` §6–7), `by: you`, carrying the observation key as the evidence the person confirmed. Nothing closes without this tap.
- **Not this** → `orb.candidate.judged {loop, observationKey (blinded), verdict: notThis}`. The pair is never proposed again; the *count* of these is the false-correlation rate. (Tiny new event; schema `v1`; `DECISIONS` DR-44 notes it.)
- **Already paid** — on any open obligation the person can say it is already paid. Orb then checks, **in the ledger, once**, whether a movement of that amount exists inside the window that was *not* proposed. If so, that is a **missed correlation** (a false negative), recorded as a count in the same event (the same `orb.loop.closed`, `by: you`, `because: alreadyPaid`, with `missedCorrelation: true|false`).

These three answers give, for the first time, a measured **precision** (paid / (paid + not-this)) and a measured **miss count** for the correlator. They gate nothing automatically; they are the argument any future per-kind automatic closing would have to be made from (`OBSERVATION_SEAM.md` §7).

## 7. Keeping, and the one new capability

`ObservationStore.keep` has been built, tested and called by no screen. The statement adapter is the first thing that *needs* it (a statement row cannot be re-derived once the file is gone). So:

- After the message look (and after a statement import), one button: **Keep what Orb read** — *"Orb will keep the facts (amounts, days, who) sealed on this phone, by source and month, for 24 months. It will not keep any message or statement text."* Counts shown first.
- Capability **`orb.observations.keep` v1** (Observe tier, switchable, wording pinned by the existing registry test); switching it off stops keeping and **offers** (never does) *Erase what Orb kept* — erase is its own act.
- Journal: the existing `orb.observations.kept` Event per bundle — blinded source key, month, count, hash. **No amount, sender code, payee or fact in the journal.**
- A second capability for the read side — `orb.read.statements` v1 — is declared like `orb.read.messages` is (grant on first use, recorded, revocable). The file picker needs no Android permission.

## 8. Not in this slice (decided, so it is not reopened by accident)

- **Categories, budgets, "spending", charts.** The ledger's job is *moved*.
- **Recurrence** (the same amount to the same payee monthly, so "your rent is due"). It is the **second slice**, as an inferred `obligation.stated` by a named rule — only once the ledger is trustworthy.
- **Trade fills.** They stay `information.noted`. `value.exchanged` stays deferred (`OBSERVATION_SEAM.md` §14.6). The operator's trades arrive as **push notifications**, a different surface (a notification listener is a new permission and its own design).
- **Pay.** A handoff to the payee's own app only. Orb never moves money.
- **The cooperative app API.** Not built. The gate is stated in §10.
- **XLSX/PDF statements, multi-device sync, account aggregators, a model reading narrations.**

## 9. Counterparty — an honest limit

On SMS, `counterparty` today is the **sender code** (`HDFCBK`) — the *reporting institution*, not the payee; the payee's name is in the words and is not read. So until a statement is imported the ledger can show **which account moved, not whom the money went to**. The statement is where a payee first exists. This is stated on the screen, not hidden.

## 10. The three-source gate for the app API

The operator's rule: no app API until three genuinely different sources share the seam. Recorded here so it is checkable:

1. **SMS** — T0, free text, push-in-time, `value.moved` / `obligation.*` (done, v59).
2. **Statement** — T1, structured file, batch, real references, `value.moved` (this document).
3. **A third that is not money** — proposed: **a calendar file (`.ics`) picked by the person**, which needs no permission and exercises `attendance.*` and a different `subject` basis. Its own design, after Money's results; it is the point at which the Observation contract has been produced by three unlike things.

Only then is the write-only local API (`OBSERVATION_SEAM.md` §11) worth specifying for building.

## 11. Order of work, once approved

Each step ends in the tests, a mutation list, and — where the phone is involved — an APK and an export you can check with `tools/export`.

1. **Tooling first (no phone).** `tools/fit` prints the six-way disposition you asked for for every service message — `LOOP`, `NOT_A_LOOP`, `UNMAPPABLE`, `AMBIGUOUS`, `LEDGER_ONLY`, `CLOSURE_CANDIDATE` — summing to the service total, as coverage not accuracy. Fixtures for corroboration and the statement profile. The corroboration rule, tested on the SMS corpus alone (it must be a no-op there: one source, nothing to pair).
2. **Slice A — keep and see (SMS only).** `orb.observations.keep`, the Keep button, the ledger screen on the 6,094 movements; replay from bundles gives a ledger identical to the live one (hash-equal). *Verifies the "ledger entries" half.*
3. **Slice B — review.** *Mark paid* / *Not this* / *Already paid*, the three events, and the counts in the export analyser. *Starts the correlation ground truth.*
4. **Slice C — the statement.** The adapter, the first profile (for your bank), the balance-chain check, corroboration live, the witness counts. *Verifies the completeness of the SMS ledger.*
5. **Fit and read-out.** What the numbers say, counts only, against §12. Then recurrence is designed — not before.

## 12. What would count as success (stated before anything is built)

| Measure | Source | Bar |
| --- | --- | --- |
| No automatic closing | source guard | **hard: zero** — `CLOSE` is not an effect; in slice B a candidate is only ever *labelled* by the person's tap (§17) and nothing is closed |
| Counted once | fixtures | **hard:** a payment seen by two sources is one movement in every order; two real identical payments stay two |
| Replay | tests + device | **hard:** the ledger replayed from sealed bundles equals the ledger computed live |
| Statement read right | balance chain | **hard:** a file whose rows do not reproduce its balances is refused |
| Candidate precision | the person's taps | **reported**, not gated, until at least 20 answers; every *Not this* is a defect report on rule `sms.payment.correlation.v1` |
| Missed correlations | *Already paid* | **reported** |
| SMS ledger completeness | witness counts | **reported** per month: both / SMS only / statement only |
| No text leaves the phone | privacy guard + canary tests | **hard:** no message, narration or payee in the journal, an export, or a probe line |

The reported measures are descriptive. If precision on the first 20 is poor, the correlation rule is wrong and gets fixed before anything else is built on it.

## 13. Risks

| Risk | Handling |
| --- | --- |
| **Double counting** (SMS + statement; card spend + card settlement) | §4 pairs by count; §5 says "moved", not "spent"; own-account transfers are the person's mark, never inferred |
| A **wrong profile** puts wrong money in the ledger quietly | balance-chain check; the preview before keeping; refusal of the whole file, never a partial one |
| A statement is the **most sensitive file** the phone will have read | stream and drop; sealed per source × month; erasable by key; payee only inside the seal; canary tests; no probe prints it |
| Corroboration **merges two different payments** | one-to-one pairing by count; ambiguity marked, never merged; the rule is data with an id and a version |
| The **person's taps are the only ground truth**, and are few | reported not gated; no claim of accuracy below 20 answers |
| The view is read as **advice** ("you spent…") | "moved"; no categories; no totals across currencies |
| Scope creep into a finance app | §8 is the list of what is not here; each item needs its own design |

## 14. Questions for you

1. **Order.** Slices A → B → C as in §11 (SMS-only ledger and review first, the statement last), or the statement first because it is the only independent measurement? *Recommendation: A, B, C — A and B need no new file and give you something on the phone this week; C needs a sample from you either way.*
2. **The first statement.** Which account is the first, and what can its app export — CSV, XLSX or PDF? **I need only the header row** (the column names, one line, no data) to write the profile. If it is XLSX or PDF only, C moves behind a design for that format.
3. **The payee, sealed.** Store the payee text **inside the sealed bundle** (so the ledger can say *whom*), never in the journal, exports or probes — or keep **no payee at all** and let the ledger say only account, day, amount? *Recommendation: sealed payee; it is the person's own record of whom they paid, erasable by key, and without it the ledger is a list of anonymous numbers.*
4. **The bars in §12.** Are the "hard" ones the right ones, and is "reported, not gated, until 20 answers" the right treatment of precision?
5. **Third source.** Is the `.ics` calendar file the right third adapter, or is there another you would rather prove the seam with (a document, a different app)?

## 15. Decisions (2026-10-04) and amendments made while building

**The operator's answers.** (1) Order **A → B → C**: SMS-only keep and ledger, then review/ground truth, then the independent statement witness — "the statement should not arrive before we know exactly what the SMS pipeline is claiming". The point of B is a **labelled set** that lets correlation precision and recall be measured once the statement exists. (2) **One ordinary account, CSV first**; the header row (no data) is all that is needed for the profile; **XLSX and PDF are separate format designs, later**; the first adapter is single-account — no cross-account money semantics. (3) **Payee/narration text is stored sealed** in the observation bundle and is the only place raw payee text survives — never in the journal, an export, fit output or probe output. (4) The hard bars of §12 are right. **Precision is reported, never used as a gate:** below 20 answers the metric reads *insufficient sample*, from 20 it is *reported*; the number never switches anything on. Automatic closure stays disabled whatever the number; allowing it would be a separate design decision, per kind and evidence class. (5) **`.ics` is the third source.**

**An architectural rule, added.** *The ledger is not a view of loops.* ₹8,421 may have moved with no loop at all, and a GIVE of ₹8,421 may exist with no movement yet. Both are read from observations; they are related only by **correlation**, never by being the same entity — which is what the 4,280-payments-to-262-obligations result showed. The ledger is built from `value.moved` alone and does not consult a loop.

**Amendments found by measuring the real file (counts only), before building A:**
- **Corroboration pairs across adapters, not across senders.** The §4 text said the SMS-only ledger is a no-op "one source, nothing to pair". SMS has one *source* per sender code, so that was wrong as worded. The rule is: a movement holds **at most one witness per adapter**; observations from different senders of the *same* adapter are never paired. So A is a true no-op, and an SMS bank-debit and the card's "payment received" for the same money are still two movements. Whether a cross-sender rule is worth having is measured, not assumed: the fit probe counts same-amount, same-day, different-sender pairs (descriptive only; nothing acts on it).
- **What is kept is bounded.** Keeping every fact would make 347 bundles (and as many journal events) for the last 24 months of this inbox; `information.noted` is evidence only and has no effect on any loop or the ledger, so it is **not kept**. That leaves 323 bundles (79 of them hold money). The journal grows by one small event per bundle, once; an unchanged month writes nothing.
- **Dispositions.** `tools/fit` and the fit report give each service message exactly one of `LOOP` · `CLOSURE_CANDIDATE` · `LEDGER_ONLY` · `NOT_A_LOOP` · `AMBIGUOUS` · `UNMAPPABLE`, summing to the service total. Precedence for a message that is several things: ambiguous, unmappable, closure candidate, loop, ledger only, not a loop. Coverage, not accuracy — the rules were tuned on this inbox.

## 16. Amendment from the first device round (2026-10-05): switched off means off

The first export showed 327 bundles kept (3,723 facts, 93 senders, 25 months, one grant, one revocation; no sender code or amount in any event) — the design held. It also showed a flaw: the person switched keeping off and could not turn it on again, and a Keep tap would have silently turned it back on, so the switch gated nothing (`LEARNINGS.md` L-004). **Rule, as built in v61:** while the last record about `orb.observations.keep` is a revocation, **Keep refuses** and says where to turn it on; **What Orb may do** turns it on with a dialog that carries the pinned words and a yes (and keeps nothing itself); never having decided is not switched off — the first Keep is the person's first yes; a history that cannot be read counts as switched off. Switching off still erases nothing.

## 17. Slice B as decided (2026-10-05, DR-46)

The review's answers are **labels**: `orb.candidate.judged` `{schema, obligation, payment, verdict: paid | notThis | alreadyPaid, shown: candidate | open, missed, ruleId, ruleVersion, windowDays}` with blinded keys (`cand:ob:`, `cand:pay:`) — no amount, sender, day or word. **Nothing opens, closes or changes**: not a loop, a commitment or the ledger. *Mark paid* and *Not this* answer a **candidate** (a payment that looks like the end of a bill, or — for money owed to the person — that it arrived); *Not this* hides that pair only; *Mark paid* and *Already paid* settle the obligation for the review. *Already paid* is offered on an **open obligation of the last 60 days** (`Review.OPEN_WINDOW_DAYS`, a policy constant) that has no candidate, and records `missed: true` when the ledger holds a movement of that amount and direction inside the obligation's window that the correlator did **not** match to it. The screen reports **precision (paid ÷ paid + not this)** only from 20 answers (`insufficient sample` below) and **nothing reads it but the screen**. §6's `orb.loop.closed` is superseded by this for slice B; *Track this* is a later design. Reached from **Money moved**; secure like Recall; reads only the kept facts.

### 17a. Refinements from the independent review of slice B (2026-10-05)

An independent reviewer (the `reviewer` agent, read-only) read the first build against this design and found it **not ready**; the findings that changed the build:

- **The unit of a label is the pair, not the obligation.** Measured on the first inbox (container, counts only): **71 of 184 obligations are chains of two or more reminders, and 13 of the 20 candidate pairs sit in one.** Settling a whole obligation on one *Mark paid* would have hidden questions that were never asked. So *Mark paid* and *Not this* each answer **one pair** (this bill, this payment); a bill with a payment marked paid, or answered *Already paid*, is **settled** and not offered as open again; the next payment of a chain is still asked. This refines §17 without changing DR-46's intent (labels, nothing closed).
- **Answers are read back as sets** (a duplicated or restored journal counts an answer once). **The answer path is one function** (`ReviewFacts.record`: one event, nothing else) and is tested end to end: recorded, read back, the question gone, the commitments exactly as they were.
- **A rule is named by a closed vocabulary** (`[a-z.]{0,64}`), never free text.
- **The screen** says after each tap that it only teaches Orb, shows candidates and open bills in separate caps (so candidates cannot crowd out *Already paid*), and explains that a *miss* means a payment of the same amount that Orb did not link, not that it was the person's.
- **Stated, not fixed:** an answer is about a *rule version* (a normalizer version bump changes an observation's id and so an obligation's key, and the review asks again); matching and windows use UTC days while the screen shows local days; *missed* is computed from raw movements and should use the ledger's corroborated movements once a second source exists (slice C).
