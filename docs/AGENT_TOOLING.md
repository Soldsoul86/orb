# Agent tooling

How Orb is developed with AI agents, as code rather than habit. Status: **accepted as practice** — it records what was
already being done by hand and now has tests; it changes no product architecture and no kernel contract.

## What is here

| Piece | Where | Purpose |
|---|---|---|
| Mutation harness | `tools/mutate` | Finds the behaviours no test checks. 53 mutant lists (`lists/INDEX.md`, with how many still apply). |
| Fit probe | `tools/fit` | Runs the phone's reading rules on a real message backup; counts only. |
| Export analyser | `tools/export` | Reads a device export; counts and names only. |
| Project commands | `.claude/commands` | `/mutate`, `/fit`, `/export` — the above, with the rules for using them. |
| Project agents | `.claude/agents` | `mutation-reviewer` (triage survivors), `export-reader` (read exports without opening them). |

## The working loop these serve

Design doc (status *proposed*) → operator approval → build with unit tests → **mutation check** → real-data **fit** (counts only)
→ APK → on-device **export** → **analyse** against numbered predictions → docs. The three tools are the three measuring steps.

## Rules the tooling enforces or encodes

1. **Tests are judged by what they would miss.** A green suite is the baseline; the mutation run is the measurement.
   A survivor is a missing test or a documented equivalent — never ignored, never "fixed" by editing the check.
2. **No person's words in any output.** Tools that touch real data print counts and field names; their tests plant a canary and fail on a leak.
3. **Real data stays out of the repository.** Exports, backups, message files are inputs, never outputs.
4. **The tools reuse the product's code.** The probe compiles the app's own sources through the app's own test script — it never re-implements a rule.
5. **A stale mutant list is not a clean one.** `--verify` and the exit status say so.
6. **Agents do not widen their own reach.** `export-reader` has no way to open the file except through the analyser; commands say what not to print.

## Not here, deliberately

* A tool that dumps message text (used once, off-repo, during rule development) — reading text is the person's call on their own device.
* Anything that talks to the phone or a network. Exports arrive by the operator's hand.
* Automatic approval or merging. Approval gates in `CLAUDE.md` are unchanged.

## Verifying

`npm run test:tools` (part of `npm run verify`). Mutation-testing the tooling itself: `tools/mutate/tools-export.json`.
