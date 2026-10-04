# tools/slice

A **slice** is one bounded piece of work with a design behind it (`docs/ENGINEERING_SYSTEM.md` §3.3–3.4). Its file, `docs/slices/<ID>.json`, names the design and decisions it rests on, the scenarios and invariants in play, the files in scope, a budget, and the proof it must bring. This tool gives an agent two things and the operator one:

```
node tools/slice/cli.mjs context MONEY-B [--out f]   # the context pack: the slice's own documents, and nothing else
node tools/slice/cli.mjs budget  MONEY-B             # files and lines against the budget; anything outside the scope
node tools/slice/cli.mjs report  MONEY-B --suite phone=out.txt --suite tools=out2.txt --mutation m.json --fit probe.txt
```

* **context** — the slice file, the stop conditions, the design, each cited decision's section, the invariants and scenarios in play, the file classes and gates, the open decisions that name the slice, and the files in scope. An agent that needs something else says so and stops.
* **budget** — fails (exit 1) when the change is over the file or line budget or touches a file outside the scope. Generated files are not counted.
* **report** — the **change report**, written to `artifacts/reports/<ID>-<commit>.md` and never overwritten for a clean commit: what changed by class, gates and approvals, scenarios and invariants, proof (suites, mutation, fit with its change from the last report), permissions delta, privacy, decisions, stop conditions met, known limitations. Its status is `BLOCKED`, `INCOMPLETE` (required proof not supplied) or `REVIEW REQUIRED` — **never "ready"**: a person always reads it.

The commands that drive this are `/slice`, `/review` and `/adversary` in `.claude/commands`.
See [DESIGN](DESIGN.md), [API](API.md), [TESTS](TESTS.md).
