# tools/export — API

## Command line
See [README](README.md). Prediction file: `{ "checks": [ { "id": "P340", "type": "orb.sender.judged", "min": 1, "max": 9 } ] }` — `min`/`max` optional, inclusive.

## Library (`lib.mjs`)

| Function | Returns |
|---|---|
| `parse(text)` | `{ events, unparseable }` |
| `chain(events)` | `{ events, linkBreaks, payloadMismatches, sealed, ok }` |
| `typeCounts(events)` | `{ type: n }` sorted by type |
| `builds(events)` | version codes of `orb.process.start`, in order, without repeats |
| `faults(events)` | `{ crashed, caught }` |
| `latestReports(events)` | latest numeric-only payload per closed-list type |
| `payloadKeys(events, type)` | sorted field names |
| `diff(before, after)` | `{ added, changed, newBuilds }` |
| `check(events, predictions)` | `{ results: [{id, type, n, ok}], ok }` |
