# tools/governance — API

## `docs/FILE_CLASSES.json`
`{ classes: { NAME: { gate: null | GATE, about } }, rules: [{ glob, class, watch? }], selfGoverning: [glob] }`. `watch: "manifest-permissions"` gates a file only when its permissions differ from the base revision.

## `docs/APPROVALS.json`
`{ approvals: [{ gate, paths: [glob], ref, by, date: "YYYY-MM-DD", until?: "YYYY-MM-DD", note }] }`.

## Library (`lib.mjs`)

| Function | Returns |
|---|---|
| `classify(file, classesDoc)` | `{class, gate, watch, rule}` |
| `covered(file, gate, approvals, today)` | the approvals that cover it |
| `check(files, classesDoc, approvalsDoc, ctx)` | `{files, byClass, unapproved, approved, generated, unclassified, selfGoverning, ok}`; `ctx = {today, permissionsChanged(file)}` |
| `permissionsOf(manifestText)` | sorted permission, feature, query and intent entries |
| `validateClasses(doc)` / `validateApprovals(doc)` | a list of error strings |

## Command line
See [README](README.md). Flags: `--diff <range>`, `--files a,b`, `--today`, `--root`.
