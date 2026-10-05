# Learnings — failures that became permanent defences

> Part of the engineering system (`ENGINEERING_SYSTEM.md` §3.6, DR-45). Every meaningful failure becomes one of: a scenario, an invariant, a mutant, a rule, a conformance case or a decision — and is recorded here so the reason survives the person who remembers it. Not a diary: an entry exists only if it changed a defence.

**Format** (checked by `npm run lint`): `## L-nnn — <what went wrong, one line>`, then the fields below in this order.

```
- **Failure:** <what happened, in counts and names>
- **Root cause:** <why>
- **Fix:** <what changed, with the commit or DR>
- **Regression:** <the scenario, check or mutant that now stands guard>
- **Invariant:** <I-nnn, or "none">
```

## L-001 — A payment was read as the closing of an obligation

- **Failure:** the first fit round reported 6,114 messages that "close" a loop; the second showed 4,280 money-out messages against 262 obligations that owe money.
- **Root cause:** a rule went straight from words to a loop effect; money moving (a fact) and an obligation ending (an interpretation) were one step.
- **Fix:** the Observation seam (DR-43, v59): normalizer → observation → interpreter, with `CLOSURE_CANDIDATE` and never a close.
- **Regression:** scenarios OBS-001, OBS-002, M-001; the fit report's disposition counts (6,094 payments, 20 candidates, 6,074 ledger only).
- **Invariant:** I-001, I-006, I-007.

## L-002 — Money slice A's first mutation round found fifteen behaviours with no test

- **Failure:** 15 of 54 mutants of the new ledger survived a green suite of 3,277 checks — among them: the earliest movement was not preferred as a partner, an ambiguous pairing could go unflagged, a month merged two currencies of one account, and the fingerprint ignored time.
- **Root cause:** tests were written from the examples in the design, not from what the code decides.
- **Fix:** 37 checks added (`LedgerTest`, group "corroboration: which fact pairs with which…"); two survivors documented as equivalent.
- **Regression:** `tools/mutate/lists/money-a.json`; scenarios M-003, M-004, M-009.
- **Invariant:** I-003, I-004.

## L-003 — A test renamed during a mutation fix left its scenario unproven

- **Failure:** while closing the second mutation round, a check in the dispositions test was renamed ("a payment with nothing open is ledger only" → "…, and so is one of a single cent"). Scenario M-018 still named the old text. The suite passed; nothing in the phone suite noticed.
- **Root cause:** a scenario names its proof by exact text, and a rename is a change to that text; only the scenario check reads both sides.
- **Fix:** M-018 now names the new text. Caught by the first change report of MONEY-A (`UNPROVEN M-018`), before the commit it would have shipped in.
- **Regression:** `tools/scenarios` derived state (`unproven` for a named check that did not run); the slice report's BLOCKED status for an unproven scenario.
- **Invariant:** none (a property of the registry itself: a scenario is never proof, only the named, passing check is).

## L-004 — "Switch off keeping facts" was a flag that gated nothing

- **Failure:** on the device (export 2026-10-05) the person switched keeping off and then could not turn it on again: the only control said *Turn on (opens Sources)* and led to a screen where Keep was still available. In fact a Keep tap silently re-granted the capability, so switching it off stopped nothing.
- **Root cause:** the capability's guard (I-013, scenario M-016) proved *structure* — keeping is reachable from one place, a revocation is recorded — not *behaviour*: that a revoked capability refuses a Keep. A switch that gates nothing passed every check.
- **Fix:** keeping is refused, before anything is shown, while the last record is a revocation (a doubt about the history counts as switched off); What Orb may do turns it on again by a dialog with the pinned words and a yes, and keeps nothing itself. v61.
- **Regression:** scenario M-022; five new checks incl. the guard that the refusal precedes the dialog and returns; mutation list `money-a2` (8 killed).
- **Invariant:** I-013 (restated: switched off means nothing is kept until it is turned on again with a yes).

## L-005 — The answer path of the review was unproven, and one answer would have hidden questions never asked

- **Failure:** the first build of Money B had 3,371 passing checks, a clean mutation run on its rules and 49 of 52 scenarios proven. The independent reviewer found (1) the function that writes an answer, `ReviewActivity.answer`, was not compiled into the suite at all: swapping the obligation key for the payment key there would have passed everything; (2) the proof of "an answer changes nothing" was greps for names (a write wrapped in a helper would pass) and a test that counted events it had appended itself; (3) a *Mark paid* settled a whole obligation, but on the real inbox 71 of 184 obligations are chains of reminders and 13 of the 20 candidate pairs sit in one.
- **Root cause:** I wrote the tests around the pure rules and let the screen hold the one write; the scenarios' proofs were structural. The chain data was available (the fit probe) and I did not look before choosing the unit of a label.
- **Fix:** `ReviewFacts.record` is the one write and is in the suite; end-to-end tests (record, fold, rebuild, commitments unchanged); the label is per pair; set-based counts; a closed vocabulary for the rule name. Stated limits are in `MONEY_PHONE.md` §17a and the slice file.
- **Regression:** scenarios REV-002, REV-004, REV-006, REV-007; invariant I-017 now says which parts are held by behaviour and which by tripwires; `tools/mutate/lists/money-b.json` (60 mutants).
- **Invariant:** I-017, I-018.
