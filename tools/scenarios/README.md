# tools/scenarios

The tooling for the **invariant registry** (`docs/invariants/INVARIANTS.json`) and the **scenario registry** (`docs/scenarios/*.json`) — `docs/ENGINEERING_SYSTEM.md` §3.1–3.2.

* An **invariant** is a law (`I-004`: *replay equals live*), with the files whose change puts it at risk (`threatenedBy`) and the named checks that hold it (`heldBy`).
* A **scenario** is a concrete case (`M-004`: *two real identical payments stay two*): given / when / then / mustNot, the invariants it exercises, the files it concerns, and **`proof`** — the exact names of checks in the phone suite or the tools' tests.
* **A scenario is never itself proof.** Its state is *derived*: `draft` (names no proof) · `tested` (every named check ran and passed) · `failing` · `unproven` (a named check did not run — deleted, renamed, skipped, or its suite not run) · `regressed` (was tested, is not now).

```
node tools/scenarios/cli.mjs list
node tools/scenarios/cli.mjs check  --run                       # run both suites, then derive every state
node tools/scenarios/cli.mjs check  --suite phone=out.txt --suite tools=out2.txt [--baseline f] [--write-baseline f]
node tools/scenarios/cli.mjs impact --diff HEAD~1 --run         # which invariants and scenarios do these changes put at risk?
```

Exit status: `0` clean (drafts are allowed and counted) · `1` a scenario is failing, unproven or regressed, a registry is malformed, or an impacted invariant is not held · `2` unusable input.
See [DESIGN](DESIGN.md), [API](API.md), [TESTS](TESTS.md).
