# tools/mutate — design

**Functional core, imperative shell.** `lib.mjs` is pure: `apply` (one textual replacement), `classify` (a run's
output → killed / alive / invalid), `share` (fair split of mutants across workers), `parseList` (validate a list),
`summarise`. `mutate.mjs` is the shell: copies workspaces, runs the suite, prints.

## Decisions

* **Textual mutants, not an AST.** The phone app is Java templates (`*.java.in`), the runtime is TypeScript; a
  textual replace is the only mechanism that serves both, and a list is reviewable by a person. The cost: each
  mutant is hand-chosen. That is the point — the list is a record of what was considered.
* **First occurrence only.** `old` must identify one place. If it matches several, the mutant changes the first and
  the author extends `old` until it is unambiguous.
* **Three outcomes, not two.** A change that stops the build is `invalid`, not "killed": counting compile errors as
  kills inflates the score. `classify` calls a mutant *killed* only when the suite itself reported a failure or a
  non-zero exit; *alive* only when the suite positively reported a pass; anything else is `invalid`.
* **The baseline is run first.** If the unmutated copy does not pass, nothing is reported (exit 2).
* **Isolated workspaces.** Copies exclude `build/`, `node_modules/`, `.git/` and `*.apk`. Parallelism is by
  workspace, never by sharing one.
* **`equivalent` is a field, not a comment.** A list entry may carry `"equivalent": "<why>"`; if it survives it is
  counted as equivalent and does not fail the run. An equivalent claim that stops surviving shows as killed.

## Risks

* A mutant list tuned to the tests that exist measures nothing. Lists are written from the code's behaviour
  (boundaries, guards, constants, ordering), not from the tests.
* An `old` string that no longer matches (code moved) reports `missing`, not clean.
* The suite's pass/fail patterns are per-config; a wrong pattern fails safe (`invalid`).
