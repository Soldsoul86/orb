# tools

The development tooling that was ad-hoc scripts in a scratch directory, now code: versioned, tested, and
documented like everything else. None of it is part of the product; the product never imports from here.

| Tool | What it is for | Run |
|---|---|---|
| [`mutate/`](mutate/README.md) | Mutation harness. Breaks the source one small way at a time, runs the suite, and reports which breakages **no test noticed**. | `node tools/mutate/mutate.mjs --list tools/mutate/lists/par2.json` |
| [`fit/`](fit/README.md) | Real-corpus fit probe. Runs the phone's reading rules over a real message backup and prints **counts only**. | `tools/fit/probe.sh <backup.json>` |
| [`scenarios/`](scenarios/README.md) | Invariant and scenario registries. A scenario's state is **derived** from the named checks that prove it; `impact` says which invariants a change threatens. | `node tools/scenarios/cli.mjs check --run` |
| [`governance/`](governance/README.md) | File classes, approval gates and the approval records; flags a gated change without a record. | `node tools/governance/cli.mjs check` |
| [`slice/`](slice/README.md) | A slice's context pack, budget and generated **change report** (never "ready": blocked, incomplete or review required). | `node tools/slice/cli.mjs report <ID> …` |
| [`export/`](export/README.md) | Export analyser. Reads a device export: hash chain, builds, faults, counts by type, prediction checks. **Counts and names only.** | `node tools/export/analyse.mjs <export.txt>` |

Claude Code project commands (`/slice`, `/review`, `/adversary`, `/mutate`, `/fit`, `/export`) and five agents live in [`../.claude`](../.claude); the working
agreement they encode is in [`../docs/AGENT_TOOLING.md`](../docs/AGENT_TOOLING.md) and the whole system in [`../docs/ENGINEERING_SYSTEM.md`](../docs/ENGINEERING_SYSTEM.md).

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
