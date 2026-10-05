# Change report — FIT-XSENDER: Cross-sender measurement — how often is a bill paid through another sender (counts only)

Commit 2f4d0e7 · base 19f82d7 · 2026-10-05

**Status: REVIEW REQUIRED**
- 3 self-governing file(s) changed

## What changed
- Files 11 · lines +1047 −162 · budget 20 files / 1500 lines
- By class: GENERATED 1 · PROTOCOL 4 · DECISION 1 · TOOL 5 · TEST 1
- Generated files in the change (never hand-edited): 1

## Gates
- Gated changes 4 · approved 4 · unapproved 0
  - PROTOCOL docs/APPROVALS.json — DR-45, DR-48
  - PROTOCOL docs/MONEY_PHONE.md — DR-44
  - PROTOCOL docs/scenarios/other.json — DR-45, DR-48
  - PROTOCOL docs/slices/FIT-XSENDER.json — DR-48
  - SELF-GOVERNING docs/APPROVALS.json changed: review required whatever the approvals say
  - SELF-GOVERNING docs/scenarios/other.json changed: review required whatever the approvals say
  - SELF-GOVERNING docs/slices/FIT-XSENDER.json changed: review required whatever the approvals say

## Scenarios
- Registry 62: tested 59 · draft 3 · failing 0 · unproven 0 · regressed 0
- High-risk proven 33/36
- In this slice 3: XS-001 tested, XS-002 tested, XS-003 tested
- Affected by the change (15): LOOP-002, M-013, M-017, M-018, M-020, M-021, PRIV-002, TOOL-001, TOOL-002, TOOL-003, XS-001, XS-002, XS-003, REV-007, REV-011

## Invariants
- Threatened 2 · held 2 · not held 0
  - I-005 held — Raw source text never enters the journal, an export, a probe or a fit report: only counts, blinded keys and names of closed vocabularies.
  - I-015 held — Every service message is counted in exactly one disposition, and the dispositions add up to the service total.

## Proof
- Phone suite: 3476 checks, 0 failed
- Tool tests: 74 checks, 0 failed
- Mutation: killed 18 · alive 0 · equivalent 4 · missing 0 · invalid 0 of 22

## Fit
- Dispositions (23633 service messages; coverage, not accuracy): LOOP 1379 · CLOSURE_CANDIDATE 20 · LEDGER_ONLY 6074 · NOT_A_LOOP 11997 · AMBIGUOUS 119 · UNMAPPABLE 4044
- No earlier report to compare with

## Permissions
- Unchanged

## Privacy
- Privacy scenarios proven 10/11

## Decisions
- Approved designs this slice rests on: DR-44, DR-48
- Open: none

## Stop conditions
- a design conflict: not met
- a change to a constitutional or protocol file without an approval record: not met
- an unknown privacy implication: not met
- a new permission, feature or query: not met
- ambiguous protocol semantics: not met
- three consecutive failed repairs: not met
- a behavioural change in the ledger or the fit that the slice's scenarios do not explain: not met

## Known limitations
- A measurement of one inbox, the one the rules were developed on: coverage, not precision, and not held-out.
- A candidate is exact amount, direction, currency and 0–45 days: the number of cross-sender candidates is an upper bound on real cross-sender payments, because coincidences of amount are counted. The probe does not estimate the coincidence rate.
- The 'unmatched' payments are mostly ordinary spending that no bill announced; the bill side (obligations) is the meaningful denominator.
- The payment definition is replicated from the correlator (it keeps its own); the probe prints a warning when the counts stop agreeing.
- It changes no rule: the correlator is untouched and nothing in the app reads this.
