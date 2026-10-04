# tools/slice — API

## `docs/slices/<ID>.json`
```json
{ "id": "MONEY-B", "title": "…", "design": "docs/MONEY_PHONE.md", "decisions": ["DR-44"], "base": "<commit the slice started from>",
  "scenarios": ["M-0xx"], "invariants": ["I-0xx"],
  "scope": { "files": ["globs"], "alsoAllowed": ["globs"] },
  "budget": { "maxFiles": 40, "maxLines": 4000, "maxFailedRuns": 3 },
  "required": ["phone", "tools", "mutation", "fit"], "proof": ["commands, for the reader"],
  "limitations": ["…"], "expectFitChange": false }
```
`required` names the proof the report must have to be anything but `INCOMPLETE`: `phone`, `tools`, `mutation`, `fit`.

## Library (`lib.mjs`)

| Function | Returns |
|---|---|
| `validateSlice(slice)` | error strings |
| `parseNumstat(text)` / `budgetCheck(changes, slice, isGenerated)` | `[{file, added, removed}]` / `{files, lines, outside, over, ok}` |
| `decisionSection(md, "DR-44")` / `pendingFor(md, id)` | a decision's text; open queue entries naming the slice |
| `phoneSummary` / `toolsSummary` / `fitDispositions` / `fitDelta` | summaries of the tools' output |
| `statusOf(model)` / `stopsMet(model)` | `{status, reasons}` / the stop conditions met |
| `renderReport(model)` / `renderContext(slice, parts)` | markdown |

## Command line
See [README](README.md). `--base <rev>` overrides the slice's base; `--root <dir>` another repository.
