# tools/governance — tests

`node --test tools/governance/tests/governance.test.mjs` (also `npm run test:tools`).

* Classification: first matching rule, `**/` matching no directory, unclassified files.
* Approvals: gate, path, start date, expiry (last day inclusive), several records for one file.
* Ungated classes need nothing; generated files are listed; a manifest gates only when its permissions differ; a keystore always does.
* `permissionsOf` ignores comments and order and sees permissions, features, queries and intents.
* Self-governing files are always flagged.
* Validation of both tables.
* Command line on a real temporary git repository: an unapproved protocol edit fails; recording the approval passes and is flagged; a manifest edit gates by permission; untracked files are seen; malformed and missing tables.
* The repository's own tables are well formed and every file a rule names exists.
