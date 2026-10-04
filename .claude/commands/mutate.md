---
description: Mutation-test a change — run a mutant list against the suite and turn every survivor into a test or a documented equivalent
argument-hint: <list name in tools/mutate/lists, e.g. par8> [--config tools/mutate/orb-app.json]
---

Run the mutation harness (`tools/mutate/README.md`) for `$ARGUMENTS`.

1. `node tools/mutate/mutate.mjs --list tools/mutate/lists/<name>.json --verify` first. A `MISSING` mutant means the
   code moved since the list was written: say so, and repair or regenerate the entries before running anything.
2. Run it for real (a full run on the phone app is minutes; it needs the Java toolchain). Run long lists in the background.
3. For every `ALIVE` line, decide: is there behaviour the suite does not check? **Write the test** (in the suite that
   owns that code), then re-run only that mutant (`--only N`). If the change cannot alter behaviour, add
   `"equivalent": "<why>"` to the list entry — a sentence a reviewer can disagree with.
4. For new work, write the mutants from the code's behaviour (boundaries, guards, constants, ordering), **not** from the
   tests that exist, add the list to `tools/mutate/lists/` and a row to its `INDEX.md`.
5. Report `killed · alive · equivalent · missing · invalid` and what each survivor became. Never edit a test to make a
   mutant die without saying what real behaviour it now checks.
