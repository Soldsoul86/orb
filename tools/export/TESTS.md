# tools/export — tests

`node --test tools/export/tests/export.test.mjs` (also `npm run test:tools`). Synthetic exports with a real hash chain; no real export is read.

* Parsing counts what it cannot read, including whitespace-only lines, and does not quote it.
* The chain verifies when clean; a removed event, a swapped pair and an edited payload are each caught; sealed payloads are counted; a truncated start is reported.
* Counts by type, builds in order without repeats and ignoring non-numeric codes, crash vs caught fault counts.
* Only numeric fields of closed-list reports are shown; other types are refused.
* `diff`, `check` (min, max, both, neither) and `payloadKeys`.
* Command line: exit codes 0/1/2; a secret planted in a payload never appears in any output.
* Mutation: `node tools/mutate/mutate.mjs --config tools/mutate/tools-export.json --list tools/mutate/lists/tools-export.json` → 31 of 31 killed.
