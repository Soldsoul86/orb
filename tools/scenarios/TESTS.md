# tools/scenarios — tests

`node --test tools/scenarios/tests/scenarios.test.mjs` (also `npm run test:tools`).

* Parsing: the phone harness (groups, passes, failures, the summary ignored) and the node spec reporter; `normalise`.
* Derived state: draft, tested, failing, unproven (a deleted/renamed check, a suite that was not run), group disambiguation, a duplicated name failing if any copy fails, regressed.
* Summary: counts, the high-risk ratio, and that drafts alone never fail.
* Validation: every required field of an invariant and a scenario, unknown invariant, duplicate ids across files, a malformed proof, an uncited device proof.
* Globs and impact: what is threatened, whether it is held, which scenarios are affected by file and by invariant.
* Command line on a toy repository: exit 0/1/2, which scenario is named, baselines, malformed registries, impact.
* The repository's own registries are well formed.
* The registries are exercised against the real suites in `docs/ENGINEERING_SYSTEM.md` §6 step 1 (`check --run`: 37 tested, 3 drafts at seeding).
