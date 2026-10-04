---
description: Analyse a device export — chain, build, faults, what changed, and the numbered predictions — counts only
argument-hint: <export.txt> [--since earlier.txt] [--check predictions.json]
---

Read `docs/SETTLED.md` first: it lists findings in exports that are already settled; do not call one new, broken or in need of fixing without checking it.

Then run `node tools/export/analyse.mjs $ARGUMENTS` (`tools/export/README.md`).

* Use the analyser's output; do not `cat`, `head` or `grep` the export itself. It holds a person's data, and the
  tool's job is to be the only reader.
* State the chain result, the build, crashes and caught faults, and what changed since the previous export. Give
  each numbered prediction in `docs/DEVICE_LOOP.md` for this build a verdict (held / did not hold / cannot tell from
  counts) — only the mechanical ones can be checked here.
* Never commit the export. Say if it is not under `/root/.claude/uploads` or another place outside the repository.
