# tools/mutate

A mutation-testing harness. A passing suite proves the tests that exist pass; it does not prove the tests that
*should* exist do. The harness makes one small textual change at a time (a `<` becomes `<=`, a constant moves by
one, a guard is removed), runs the suite, and reports every change **no test noticed** — an *alive* mutant.
Each alive mutant is either a missing test (write it) or an *equivalent* change that cannot alter behaviour
(say why, in the list).

```
node tools/mutate/mutate.mjs --list tools/mutate/lists/par2.json
node tools/mutate/mutate.mjs --list <list> [--config <config>] [--workers 4] [--only 0-9] [--json out.json] [--keep]
```

* `--list` a mutant list (`lists/`; see [INDEX](lists/INDEX.md)).
* `--config` which suite to run (default [`orb-app.json`](orb-app.json), the phone app). [`tools-export.json`](tools-export.json) is the example for a Node tool.
* `--only a-b` a range of mutants (inclusive, zero-based).

Exit status: `0` nothing alive · `1` something alive · `2` the baseline fails or the arguments are wrong.

The real tree is never modified: each worker runs in its own copy in the system temp directory.
See [DESIGN](DESIGN.md), [API](API.md), [TESTS](TESTS.md).
