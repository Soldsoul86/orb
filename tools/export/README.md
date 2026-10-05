# tools/export

The **export analyser**. A device export (Sources → Export, `orb-YYYYMMDD-HHMMSS.txt`) is the journal, one event per
line. The analyser reads one and answers the questions asked of every export — is the chain intact, which build is
this, did anything crash, what happened since the last one, do the numbered predictions hold — in **counts and names
only**.

```
node tools/export/analyse.mjs <export.txt>                        chain, builds, faults, counts by type, latest fit report
node tools/export/analyse.mjs <export.txt> --since <earlier.txt>  what changed since an earlier export
node tools/export/analyse.mjs <export.txt> --check <preds.json>   bounds on event counts (prediction file)
node tools/export/analyse.mjs <export.txt> --keys <type>          field names (never values) of one event type
node tools/export/analyse.mjs <export.txt> --tally <type>         counts of a closed vocabulary's values; for any other field only how many distinct values
```

Exit: `0` clean · `1` broken chain or failed check · `2` unusable file.

Real exports are never committed; keep them outside the repository.
See [DESIGN](DESIGN.md), [API](API.md), [TESTS](TESTS.md).
