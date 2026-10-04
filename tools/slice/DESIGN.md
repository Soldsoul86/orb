# tools/slice — design

`lib.mjs` is pure: budget and scope, decision and pending-entry extraction, summaries of the tools' output, the status and the rendering of the report. `cli.mjs` gathers (git, the registries, the suite outputs) and writes.

## Decisions

* **The report is a pure function of what was gathered.** The same inputs give the same text (tested), so two reports differ only because the work differs. The commit date, not the clock, dates it.
* **Status is conservative and has no "ready".** `BLOCKED` beats `INCOMPLETE` beats `REVIEW REQUIRED`. Missing proof is `INCOMPLETE`, not a pass: a report that hides an unrun suite is the thing this exists to prevent.
* **Absence is shown.** Every proof section says `NOT SUPPLIED` when its input was not given; the slice names which inputs it requires.
* **A clean commit's report is never overwritten.** A new commit is a new report; reports from a dirty tree carry `-dirty` and may be rewritten. Writing a report does not itself make the tree dirty.
* **Scope is globs plus an always-allowed list** (the records that record work: scenarios, decisions, state, the report directory). A file outside both is a blocker until the slice file is changed — and the slice file is protocol-class, so widening it needs an approval record.
* **The context pack is the slice's documents only.** Smaller context is less to hallucinate from and less to leak; the pack says to stop rather than widen.
* **Fit change is a stop condition unless expected.** A slice that is allowed to move the fit says so (`expectFitChange`); otherwise a changed disposition count the scenarios do not explain is a stop.

## Risks

* A slice file written after the code (MONEY-A, retroactively) can fit whatever happened. It says so in its limitations; the acceptance test is Money B, whose slice file is written first.
* The report is only as honest as its inputs: suite outputs and the mutation JSON come from the tools, not from the agent's say-so, and the report names the file it read them from only by kind.
