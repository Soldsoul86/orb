---
description: Run one slice through the engineering system — context, design, tests first, proof, review packet — and stop at the first stop condition
argument-hint: <slice id, e.g. MONEY-B>
---

You are the **builder** for slice `$ARGUMENTS` (`docs/ENGINEERING_SYSTEM.md`, `tools/slice/README.md`). Work in this order and do not skip a step.

1. **Read `docs/SETTLED.md`** (it is short; `CLAUDE.md` requires it before you call anything new, broken or in need of fixing).
2. **Load the slice.** `docs/slices/$ARGUMENTS.json` must exist and its design must be *approved* (a `Decided` DR in `docs/DECISIONS.md`). If either is not so, stop and write the question to `docs/DECISIONS_PENDING.md`. Then `node tools/slice/cli.mjs context $ARGUMENTS --out artifacts/context/$ARGUMENTS.md` and **read that pack, not the repository**. If you need something that is not in the pack, say what and why and stop — do not widen your reading.
3. **State the design and the risks** in your own words (CLAUDE.md workflow 3–5): which invariants the change threatens (`node tools/scenarios/cli.mjs impact --diff <base>`), what could produce a false loop, a false closure, a duplicate movement or a privacy leak.
4. **Scenarios and tests first.** For each behaviour the design requires, add the scenario (given / when / then / **mustNot**, invariants, files) to `docs/scenarios/` and the test that proves it, with the check's exact name in `proof`. A scenario with no passing named check is a *draft*; it never counts as proof.
5. **Implement inside the scope.** After each substantial step run `node tools/slice/cli.mjs budget $ARGUMENTS`. Do not edit a file of class `CONSTITUTIONAL`, `PROTOCOL`, `CONTRACT` or `SECURITY` (`docs/FILE_CLASSES.json`) unless `docs/APPROVALS.json` covers it — and never edit the registries, the class table, the approvals or a slice file to make a check pass.
6. **Prove it**, in this order, saving the outputs: the phone suite (`bash apps/pixel/orb/tests/run.sh`), the tool tests (`npm run test:tools`), `node tools/scenarios/cli.mjs check --suite …`, lint and typecheck, the mutation list for what you touched (`/mutate`) — every survivor a test or a documented equivalent — the fit probe on the real backup when the reading rules or the ledger moved (`/fit`, counts only), and `node tools/governance/cli.mjs check`.
7. **Write the review packet:** `node tools/slice/cli.mjs report $ARGUMENTS --suite phone=… --suite tools=… --mutation … --fit …`. Read its status. `BLOCKED` is yours to fix; `INCOMPLETE` means you did not bring a required proof.
8. **Stop conditions** (stop, write `docs/DECISIONS_PENDING.md`, report — do not improvise): a design conflict; a constitutional or protocol file needing a change without an approval; an unknown privacy implication; a new permission; ambiguous protocol semantics; **three consecutive failed repairs**; a ledger or fit change the scenarios do not explain.
9. Commit with the repository's attribution lines and push to the branch you were given. Do **not** open a pull request unless asked. Finish by giving the operator the report's path and its status, in plain words.

Counts, names and paths only in everything you write: never a message, a payee, a number of a person.
