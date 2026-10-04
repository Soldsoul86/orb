# tools/scenarios — design

`lib.mjs` is pure (suite text and registry objects in, plain data out); `cli.mjs` is the shell (files, git, running the suites, exit codes).

## Decisions

* **State is derived, never typed.** The failure mode of every registry is claiming something is proven after the proof has gone. A scenario therefore holds no state: it holds the *names* of its checks, and the state is computed from a suite run. A check that was deleted, renamed or skipped is `unproven`, not silently passing.
* **Proof is by exact check name** (normalised the way the phone prints: any non-ASCII character is `?`), optionally narrowed by group. If a name occurs in several places they must all pass. Exact names make the link breakable on purpose — a rename shows up at once.
* **JSON, no dependencies.** Node has no YAML parser and `tools/` takes no dependencies.
* **Drafts are allowed and counted.** A scenario with no proof is a requirement waiting for its test (the statement-balance rule of `MONEY_PHONE.md` §12, before the statement adapter exists); it never fails a check, and the high-risk proven ratio shows it.
* **`impact` is the first form of the impact graph:** changed file → invariants whose `threatenedBy` match → whether their `heldBy` checks still run and pass → scenarios touched by file or by invariant. A threatened invariant with no `heldBy` check is a failure: a law nothing holds.
* **`device_proven` and `export_proven` are not states yet.** They need the prediction registry (Phase 3); until then a scenario may cite its `DEVICE_LOOP.md` section in a `device` field, which is validated and displayed, never a flag.
* **Baselines.** `--write-baseline` records the derived states; `--baseline` turns `tested → not tested` into `regressed`. The baseline is data for the change report, not a source of truth.

## Risks

* Names that match a *vacuous* test: the registry proves the check passed, not that it checks the right thing. Mitigation: scenarios are written from the design's requirements, `mustNot` is mandatory, and mutation lists protect the code (`tools/mutate`).
* Registry rot by edit: the registry files are protocol-class — changing them needs an approval record (`tools/governance`).
* A phone-suite run takes about a minute; `check --run` is for slices and release, not for every edit.
