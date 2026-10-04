# tools/governance — design

`lib.mjs` is pure (file lists and the two tables in; counts and lists out); `cli.mjs` reads git and the tables.

## Decisions

* **Class by first matching rule.** A short ordered table is easier to audit than per-file annotations, and a file no rule names is `DOMAIN`, ungated, and counted as unclassified so a gap is visible.
* **Gates belong to classes; approvals belong to paths and dates.** An approval says *which paths a decision approved*; it is for one gate, from its date, until its `until` if any. It does not say *what* was done to the file; whether an amendment stays within the decision is a judgment the review packet puts in front of a person.
* **The manifest is gated by its permissions, not by its bytes.** Adding an activity is routine; adding a permission, feature, query or intent is a security change. `permissionsOf` lists those entries; a differing list is the gate.
* **Self-governing files are always flagged.** The approvals file cannot prove who edited it. The check cannot close that gap; it makes the edit impossible to miss in the change report. The real protection is the operator reading the report.
* **Checks before blocks.** Nothing here stops a tool call. When B and C have shown the false-positive rate, the same table can drive a pre-commit hook.
* **Generated files are listed, never "fixed".** A hand edit to a build artifact is indistinguishable from a build, so the report names every generated file in a change and leaves the judgment to the review.

## Risks

* An agent adds an approval for itself. Mitigation: self-governing flag, and approvals must name a decision (`ref`) a person can look up.
* A rule too broad (`docs/fixtures/**` is protocol) makes routine corpus changes need records. Accepted: a conformance corpus *is* protocol.
