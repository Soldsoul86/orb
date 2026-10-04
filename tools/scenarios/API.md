# tools/scenarios — API

## Registries

`docs/invariants/INVARIANTS.json`: `{ invariants: [{ id: "I-004", statement, source, threatenedBy: [glob], heldBy: [{suite, group?, check}] }] }`.

`docs/scenarios/<name>.json`: `{ domain, scenarios: [{ id: "M-004", name, category, risk, invariants: [id], files: [glob], given: [], when: [], then: [], mustNot: [], proof: [{suite, group?, check}], device?: {section} }] }`.

* `category`: happy · boundary · adversarial · privacy · recovery · evolution. `risk`: high · medium · low. `suite`: `phone` (the Java harness) · `tools` (`node --test` spec output).
* Every list but `proof` and `heldBy` must be non-empty; ids are unique across files; every invariant a scenario names must exist.

## Library (`lib.mjs`)

| Function | Returns |
|---|---|
| `parseSuite(kind, text)` / `indexSuites({phone, tools})` | `[{group, name, ok}]` per suite |
| `normalise(name)` | the name as the phone prints it |
| `stateOf(scenario, suites, previous?)` | `{state, missing, failing}` |
| `derive(scenarios, suites, baseline?)` / `summarise(derived)` | states; counts and `ok` |
| `validateInvariants(doc)` / `validateScenarios(doc, ids, seen?)` | a list of error strings |
| `globToRegExp(glob)` / `touches(globs, files)` | matching |
| `impact(files, invariants, scenarios, suites)` | `{threatened, affected}` |

## Command line
See [README](README.md). Flags: `--root <dir>` (a registry root other than this repository), `--run`, `--suite kind=file` (repeatable), `--baseline`, `--write-baseline`, `--diff <range>`, `--files a,b`.
