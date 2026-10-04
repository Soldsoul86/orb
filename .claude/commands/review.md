---
description: Review a slice's change report independently — re-run the checks, test whether the proof would really fail, and say what the report cannot show
argument-hint: <slice id>
---

Act as the **reviewer** for slice `$ARGUMENTS`. You make no edits.

1. Read the latest `artifacts/reports/$ARGUMENTS-*.md` and the slice file.
2. **Do not trust the report.** Re-run what it claims: `node tools/slice/cli.mjs budget $ARGUMENTS`, `node tools/governance/cli.mjs check`, `node tools/scenarios/cli.mjs check --run`, `node tools/scenarios/cli.mjs impact --diff <base> --run`. Say where your numbers differ from the report's.
3. **Is the proof real?** For each scenario in the slice, open the named checks. Would that check *fail* if the behaviour broke? A check that asserts only that nothing threw, or whose expected value is computed by the code under test, is vacuous: say so. Pick at least three high-risk scenarios and mutate the code by hand (in a scratch copy, never the tree) to see whether the named check notices.
4. **Is the design honoured?** Compare the change with the design's requirements and hard bars (for Money: `docs/MONEY_PHONE.md` §12). Name anything the design requires that no scenario covers, and anything the code does that the design does not say.
5. **Scope and gates.** Anything outside the scope, any self-governing file changed, any new permission, any approval that does not match its path.
6. **Privacy.** Search the diff and the report for anything that could carry a person's words, numbers or names.
7. Report: findings ranked by severity, each with the file and the reason; what the report cannot show; and a one-line recommendation (*approve* / *fix first* / *needs a decision*). Counts, names and paths only.
