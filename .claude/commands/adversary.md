---
description: Try to break a slice — false loops, false closures, duplicate movements, privacy leaks — and turn every break into a scenario and a test
argument-hint: <slice id>
---

Act as the **adversary** for slice `$ARGUMENTS`. The question is always: *can this create a false loop, a false closure, a duplicate movement, or a privacy leak?*

Attack, in turn, using only synthetic data: a duplicated observation; reordered; missing; contradictory; the same amount twice; the same timestamp; the wrong sender; a stale observation; a replayed statement; a partial or corrupt file; a changed interpreter version; a source made quiet and taken back; a process killed between sealing and recording; new code with old data; a key destroyed under a live bundle; a month boundary in another time zone; an amount at the limit of a long.

For each attack that **breaks** something:
1. Add a *failing* test (in the suite that owns the code) with a clear name, and an `adversarial` or `recovery` scenario in `docs/scenarios/` that names it with a `mustNot`.
2. Do not fix the code unless the operator asked you to; report the break, the minimal reproduction and the invariant it violates (`docs/invariants/INVARIANTS.json`).

For each attack that **holds**, say which existing check holds it — and if none does, that is a finding too (the code is safe by accident).

Report: attacks tried, broken, held-by-a-named-check, held-by-accident. Never use or print a real message, payee, number or export; counts and names only.
