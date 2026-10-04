# tools

The development tooling that was ad-hoc scripts in a scratch directory, now code: versioned, tested, and
documented like everything else. None of it is part of the product; the product never imports from here.

| Tool | What it is for | Run |
|---|---|---|
| [`mutate/`](mutate/README.md) | Mutation harness. Breaks the source one small way at a time, runs the suite, and reports which breakages **no test noticed**. | `node tools/mutate/mutate.mjs --list tools/mutate/lists/par2.json` |
| [`fit/`](fit/README.md) | Real-corpus fit probe. Runs the phone's reading rules over a real message backup and prints **counts only**. | `tools/fit/probe.sh <backup.json>` |
| [`export/`](export/README.md) | Export analyser. Reads a device export: hash chain, builds, faults, counts by type, prediction checks. **Counts and names only.** | `node tools/export/analyse.mjs <export.txt>` |

Claude Code project commands (`/mutate`, `/fit`, `/export`) and two agents live in [`../.claude`](../.claude); the working
agreement they encode is in [`../docs/AGENT_TOOLING.md`](../docs/AGENT_TOOLING.md).

## The two rules every tool here keeps

1. **Never print what a person wrote.** Tools that read real data (`fit`, `export`) print counts, names of
   closed vocabularies and field *names*. Their tests plant a canary string in the input and fail if it comes out.
2. **Never commit real data.** Real exports, backups and message files stay outside the repository.
   Tests use synthetic inputs built on the spot.

## Checking the tools

```
npm run test:tools      # every tool's own tests (also part of npm run verify)
```

`mutate` is the one tool that tests other code; it is itself tested end to end against a toy project, and the export
analyser has been run through it (`tools/mutate/tools-export.json`, 31 mutants, none alive).
