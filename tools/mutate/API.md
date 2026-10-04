# tools/mutate — API

## Mutant list

A JSON array, or `{ "mutants": [...] }`, of

```json
{ "file": "src/LoopRules.java.in", "old": "cmp == 0", "new": "cmp != 0", "equivalent": "optional reason" }
```

`file` is relative to the config's `cwd` (for the phone app, `apps/pixel/orb`).
`old` must be non-empty and different from `new`.

## Command line

`--list` (required) · `--config` · `--workers` · `--only a-b` · `--json out.json` · `--keep` (keep the temp workspaces) ·
`--verify` (only check each `old` still occurs in the current source; no suite runs; exit 1 if any is missing).

## Config

```json
{ "about": "...", "copy": ["dirs to copy"], "cwd": "where to run", "test": "shell command",
  "pass": "regex the suite prints on success", "fail": "regex the suite prints on failure", "build": "regex for a compile error",
  "root": "optional: repository root override (tests use it)" }
```

## Library (`lib.mjs`)

| Function | Returns |
|---|---|
| `apply(source, mutant)` | the source with the first `old` replaced, or `null` if `old` is absent |
| `classify({exitCode, output}, {pass, fail, build})` | `"alive"` · `"killed"` · `"invalid"` |
| `share(total, n, k)` | the mutant indices worker `k` of `n` runs (round-robin) |
| `parseList(json)` | validated mutants, or throws naming the entry |
| `summarise(results)` | counts: killed, alive, equivalent, missing, invalid |
| `clean(summary)` | `true` when nothing is alive and no mutant has gone missing |
