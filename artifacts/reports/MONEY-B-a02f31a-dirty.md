# Change report — MONEY-B: Money slice B — review what looks paid: Mark paid, Not this, Already paid (labels)

Commit a02f31a (working tree has uncommitted changes) · base 7a78370 · 2026-10-05

**Status: REVIEW REQUIRED**
- 4 self-governing file(s) changed

## What changed
- Files 22 · lines +4454 −40 · budget 40 files / 3500 lines
- By class: SECURITY 1 · DOMAIN 5 · TEST 4 · GENERATED 1 · PROTOCOL 6 · DECISION 3 · DEVICE 1 · TOOL 2
- Generated files in the change (never hand-edited): 1

## Gates
- Gated changes 6 · approved 6 · unapproved 0
  - PROTOCOL docs/APPROVALS.json — DR-45
  - PROTOCOL docs/ENGINEERING_SYSTEM.md — DR-45
  - PROTOCOL docs/MONEY_PHONE.md — DR-44
  - PROTOCOL docs/invariants/INVARIANTS.json — DR-45
  - PROTOCOL docs/scenarios/review.json — DR-45
  - PROTOCOL docs/slices/MONEY-B.json — DR-46
  - SELF-GOVERNING docs/APPROVALS.json changed: review required whatever the approvals say
  - SELF-GOVERNING docs/invariants/INVARIANTS.json changed: review required whatever the approvals say
  - SELF-GOVERNING docs/scenarios/review.json changed: review required whatever the approvals say
  - SELF-GOVERNING docs/slices/MONEY-B.json changed: review required whatever the approvals say

## Scenarios
- Registry 59: tested 56 · draft 3 · failing 0 · unproven 0 · regressed 0
- High-risk proven 32/35
- In this slice 18: REV-001 tested, REV-002 tested, REV-003 tested, REV-004 tested, REV-005 tested, REV-006 tested, REV-007 tested, REV-008 tested, REV-009 tested, REV-010 tested, REV-011 tested, REV-012 tested, REV-013 tested, REV-014 tested, REV-015 tested, REV-016 tested, REV-017 tested, REV-018 tested
- Affected by the change (48): LOOP-002, LOOP-003, LOOP-004, M-001, M-002, M-003, M-004, M-006, M-007, M-009, M-010, M-013, M-014, M-017, M-018, M-020, M-021, OBS-001, OBS-002, OBS-003, OBS-004, OBS-005, OBS-006, OBS-007, OBS-008, PRIV-001, PRIV-002, TOOL-001, TOOL-002, TOOL-003, REV-001, REV-002, REV-003, REV-004, REV-005, REV-006, REV-007, REV-008, REV-009, REV-010, REV-011, REV-012, REV-013, REV-014, REV-015, REV-016, REV-017, REV-018

## Invariants
- Threatened 10 · held 10 · not held 0
  - I-005 held — Raw source text never enters the journal, an export, a probe or a fit report: only counts, blinded keys and names of closed vocabularies.
  - I-006 held — Nothing closes without the person: closing is not an effect of any observation, time passing never closes a loop, and evidence that only suggests never changes a state.
  - I-007 held — The ledger is not a view of loops: money moved is read from value.moved alone; a movement with no loop and a loop with no movement are both possible, and they meet only in correlation.
  - I-010 held — How a subject is known decides how strongly evidence points: a rule's inference only suggests; a reference the source gave is exact; neither closes.
  - I-011 held — The ledger says moved, never spent or earned, and never adds one currency to another.
  - I-012 held — Declared confidence is metadata: nothing that decides ever reads it as a quantity or compares it with a threshold.
  - I-015 held — Every service message is counted in exactly one disposition, and the dispositions add up to the service total.
  - I-016 held — Orb has no network: the manifest asks for no INTERNET, so nothing it reads can leave the phone by its own act.
  - I-017 held — A person's answer about a candidate is a label: it is one event against blinded keys and opens, closes and changes nothing — no loop, no commitment, no ledger — and the measured precision is reported and never read by anything that decides.
  - I-018 held — An answer in the journal holds only blinded keys, enums and counts: never an amount, a sender code, a day or a word, and a key that is not a blinded key is refused.

## Proof
- Phone suite: 3476 checks, 0 failed
- Tool tests: 70 checks, 0 failed
- Mutation: killed 73 · alive 0 · equivalent 7 · missing 0 · invalid 0 of 80

## Fit
- NOT SUPPLIED

## Permissions
- Unchanged

## Privacy
- Privacy scenarios proven 9/10

## Decisions
- Approved designs this slice rests on: DR-43, DR-44, DR-46
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
- Obligations stay proposals: a Mark paid tap changes nothing on Today (DR-46).
- Only obligations the person owes (owner me) get Already paid; money owed to the person is judged as arrived, with no open-obligation list.
- The 60-day window and the 45-day matching window are policy constants, not measured.
- Precision from the first 20 answers measures one inbox's rules, tuned on that inbox.
- An answer is about a rule version: a normalizer version bump changes an observation's id and so the key of an obligation, and the review asks again (the answers were about the old rule).
- Matching, the 60-day window and the 'missed' window use UTC days; the screen shows local days.
- 'missed' is computed from raw movements of the same amount and direction; once a second source exists it should use the ledger's movements (corroborated) instead.
- The review's guards for 'nothing decides on the precision' are source tripwires; the answer path itself is held by behaviour.
- On the first real inbox 71 of 184 obligations are chains of reminders and 13 of the 20 candidate pairs sit in one: the unit of a label is the pair, not the obligation.
- The screens (Activities) are not compiled into the phone suite; a source scan guards the one mistake found, and the APK build is their compile check (the adversary found ReviewActivity would not have built).
- 'missed' attributes one stray movement to the earliest open obligation it fits, so it is counted once.
- The labels (orb.candidate.judged) are not erased by Erase source / Erase all: they hold only blinded keys and outlive the kept facts by design, like sender marks.
