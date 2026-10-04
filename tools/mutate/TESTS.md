# tools/mutate — tests

`node --test tools/mutate/tests/mutate.test.mjs` (also `npm run test:tools`).

* Unit: `apply`, `classify` (every outcome, including a failing summary with exit 0 and a build error without a
  summary), `share` (every index exactly once), `summarise`, `parseList` (accepts both shapes; refuses empty `old`,
  `old == new`, missing fields).
* End to end, on a toy project built in a temp directory: a mutant the suite catches is killed; one it does not is
  alive and exits 1; the real tree is byte-identical afterwards; an alive mutant documented as equivalent leaves the
  run clean; a failing baseline exits 2; `--only` picks a range; `--verify` reports a mutant whose text has gone and runs no suite; a missing mutant fails the run (a stale list is not a clean one).
* The export analyser is mutation-tested with this tool: `node tools/mutate/mutate.mjs --config tools/mutate/tools-export.json --list tools/mutate/lists/tools-export.json` → 31 killed.
