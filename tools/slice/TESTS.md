# tools/slice — tests

`node --test tools/slice/tests/slice.test.mjs` (also `npm run test:tools`).

* Slice-file validation, field by field.
* Budget: files, lines, generated files not counted, every outside-scope file named, the always-allowed records, `alsoAllowed`.
* Decision sections (DR-1 is not DR-10), pending entries by slice among the open ones only, suite summaries, the fit disposition line and its change.
* Status: every blocker, incompleteness, the ordering `BLOCKED` > `INCOMPLETE` > `REVIEW REQUIRED`, the reasons review-required gives.
* Stop conditions met; the report's sections, determinism, and its rendering of a blocked, partly unsupplied change.
* Command line on a real temporary git repository: the context pack, the budget (inside and outside the scope), a report for a dirty and a clean tree, a clean commit's report never overwritten, a failing suite and an unapproved protocol edit blocking, missing required proof.
