# Change report — MONEY-A: Money slice A — keep what Orb read, and the money-moved ledger (SMS only)

Commit 927b349 (working tree has uncommitted changes) · base e8ddeda · 2026-10-04

**Status: REVIEW REQUIRED**
- 15 self-governing file(s) changed
- 1 draft scenario(s) in this slice

## What changed
- Files 71 · lines +10571 −7 · budget 80 files / 12000 lines
- By class: TOOL 34 · SECURITY 1 · DOMAIN 13 · TEST 8 · GENERATED 3 · PROTOCOL 11 · DECISION 3 · DEVICE 1
- Generated files in the change (never hand-edited): 3

## Gates
- Gated changes 11 · approved 11 · unapproved 0
  - PROTOCOL docs/APPROVALS.json — DR-45
  - PROTOCOL docs/ENGINEERING_SYSTEM.md — DR-45
  - PROTOCOL docs/FILE_CLASSES.json — DR-45
  - PROTOCOL docs/MONEY_PHONE.md — DR-44
  - PROTOCOL docs/fixtures/money/corroboration.json — DR-44
  - PROTOCOL docs/invariants/INVARIANTS.json — DR-45
  - PROTOCOL docs/scenarios/loop.json — DR-45
  - PROTOCOL docs/scenarios/money.json — DR-45
  - PROTOCOL docs/scenarios/observation.json — DR-45
  - PROTOCOL docs/scenarios/other.json — DR-45
  - PROTOCOL docs/slices/MONEY-A.json — DR-44
  - SELF-GOVERNING docs/APPROVALS.json changed: review required whatever the approvals say
  - SELF-GOVERNING docs/FILE_CLASSES.json changed: review required whatever the approvals say
  - SELF-GOVERNING docs/invariants/INVARIANTS.json changed: review required whatever the approvals say
  - SELF-GOVERNING docs/scenarios/loop.json changed: review required whatever the approvals say
  - SELF-GOVERNING docs/scenarios/money.json changed: review required whatever the approvals say
  - SELF-GOVERNING docs/scenarios/observation.json changed: review required whatever the approvals say
  - SELF-GOVERNING docs/scenarios/other.json changed: review required whatever the approvals say
  - SELF-GOVERNING docs/slices/MONEY-A.json changed: review required whatever the approvals say
  - SELF-GOVERNING tools/governance/API.md changed: review required whatever the approvals say
  - SELF-GOVERNING tools/governance/DESIGN.md changed: review required whatever the approvals say
  - SELF-GOVERNING tools/governance/README.md changed: review required whatever the approvals say
  - SELF-GOVERNING tools/governance/TESTS.md changed: review required whatever the approvals say
  - SELF-GOVERNING tools/governance/cli.mjs changed: review required whatever the approvals say
  - SELF-GOVERNING tools/governance/lib.mjs changed: review required whatever the approvals say
  - SELF-GOVERNING tools/governance/tests/governance.test.mjs changed: review required whatever the approvals say

## Scenarios
- Registry 40: tested 37 · draft 3 · failing 0 · unproven 0 · regressed 0
- High-risk proven 21/24
- In this slice 19: M-001 tested, M-002 tested, M-003 tested, M-004 tested, M-005 tested, M-006 tested, M-007 tested, M-008 tested, M-009 tested, M-010 tested, M-011 tested, M-012 tested, M-013 tested, M-014 tested, M-015 tested, M-016 tested, M-017 tested, M-018 tested, M-019 draft
- Affected by the change (40): LOOP-001, LOOP-002, LOOP-003, LOOP-004, M-001, M-002, M-003, M-004, M-005, M-006, M-007, M-008, M-009, M-010, M-011, M-012, M-013, M-014, M-015, M-016, M-017, M-018, M-019, M-020, M-021, OBS-001, OBS-002, OBS-003, OBS-004, OBS-005, OBS-006, OBS-007, OBS-008, OBS-009, OBS-010, PRIV-001, PRIV-002, TOOL-001, TOOL-002, TOOL-003

## Invariants
- Threatened 16 · held 16 · not held 0
  - I-001 held — Evidence is not interpretation: an observation says what happened and nothing of what it means for a person (no kind, owner, origin or status).
  - I-002 held — Every observation has provenance: a source, an adapter and a tier, and an inferred subject names the rule that inferred it.
  - I-003 held — The same fact read twice is one fact: observation identity is idempotent, and so is keeping and the ledger.
  - I-004 held — Replay equals live: the ledger and the observations rebuilt from sealed bundles are exactly those computed from the live facts.
  - I-005 held — Raw source text never enters the journal, an export, a probe or a fit report: only counts, blinded keys and names of closed vocabularies.
  - I-006 held — Nothing closes without the person: closing is not an effect of any observation, time passing never closes a loop, and evidence that only suggests never changes a state.
  - I-007 held — The ledger is not a view of loops: money moved is read from value.moved alone; a movement with no loop and a loop with no movement are both possible, and they meet only in correlation.
  - I-008 held — Quieting a source never rewrites, closes or erases what the person already accepted or what Orb already kept.
  - I-009 held — One source's kept observations can be erased without touching another's, and erasing is destroying the key.
  - I-010 held — How a subject is known decides how strongly evidence points: a rule's inference only suggests; a reference the source gave is exact; neither closes.
  - I-011 held — The ledger says moved, never spent or earned, and never adds one currency to another.
  - I-012 held — Declared confidence is metadata: nothing that decides ever reads it as a quantity or compares it with a threshold.
  - I-013 held — Keeping facts is the person's recorded decision, made at the one place that keeps them, and switching it off erases nothing.
  - I-014 held — A capability's words are frozen with its version: a change to what it says is a different capability.
  - I-015 held — Every service message is counted in exactly one disposition, and the dispositions add up to the service total.
  - I-016 held — Orb has no network: the manifest asks for no INTERNET, so nothing it reads can leave the phone by its own act.

## Proof
- Phone suite: 3317 checks, 0 failed
- Tool tests: 70 checks, 0 failed
- Mutation: killed 49 · alive 0 · equivalent 5 · missing 0 · invalid 0 of 54

## Fit
- Dispositions (23633 service messages; coverage, not accuracy): LOOP 1379 · CLOSURE_CANDIDATE 20 · LEDGER_ONLY 6074 · NOT_A_LOOP 11997 · AMBIGUOUS 119 · UNMAPPABLE 4044
- Change from the last report: LOOP 0 · CLOSURE_CANDIDATE 0 · LEDGER_ONLY 0 · NOT_A_LOOP 0 · AMBIGUOUS 0 · UNMAPPABLE 0 (unchanged)

## Permissions
- Unchanged

## Privacy
- Privacy scenarios proven 7/8

## Decisions
- Approved designs this slice rests on: DR-43, DR-44
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
- Slice A predates the engineering system; this slice file and its scenarios were written after the code, from it (M-001…M-018) and from the design (M-019).
- The fit probe reads the inbox the rules were tuned on: coverage, not accuracy.
- The ledger's account is the sender code of the bank's messages; whom the money went to arrives with the statement (slice C).
- A failed keep leaving the older bundle is designed but untested (M-019 is a draft).
- tools/mutate/** was added to the scope while the slice ran: the engineering system's own mutation config and list (tools-engsys) were written during it. The report flagged this as out of scope until the slice file said so.
