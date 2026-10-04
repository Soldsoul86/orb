# tools/governance

The **governance check** (`docs/ENGINEERING_SYSTEM.md` §3.5): which files an agent may change on its own, and which it may not change without a record that a human approved.

* `docs/FILE_CLASSES.json` gives every path one **class** — `CONSTITUTIONAL`, `SECURITY`, `CONTRACT`, `PROTOCOL`, `GENERATED`, `TEST`, `TOOL`, `DEVICE`, `DECISION`, `DOMAIN` — by the first rule whose glob matches; a class may carry a **gate** (`PROTOCOL_APPROVAL`, `DESIGN_APPROVAL`, `SECURITY_APPROVAL`, `RELEASE_APPROVAL`).
* `docs/APPROVALS.json` records what a human approved: the gate, the paths, the decision (`DR-44`), the date and an optional end date.
* A change to a gated file with no covering approval is **UNAPPROVED**. A change to a **self-governing** file (the class table, the approvals, the registries, this tool, `CLAUDE.md`) is flagged for review whatever the approvals say, because an approval file cannot prove who wrote it.

```
node tools/governance/cli.mjs check                      # the working tree against HEAD, untracked files included
node tools/governance/cli.mjs check --diff 8df010d..HEAD
node tools/governance/cli.mjs check --files a,b          # named files
```

Exit status: `0` every gated change has an approval · `1` an unapproved gated change, or a malformed table · `2` unusable input. It is a **report, not a lock**: detect, report, learn, stabilise — a blocking rule comes only after Money B and C show it catches the right things without noise.
See [DESIGN](DESIGN.md), [API](API.md), [TESTS](TESTS.md).
