# Historical Phase 0 verification record

This records the initial design-only checkpoint before the executable experiment.
Its NOT IMPLEMENTED and local BLOCKED statements apply to that checkpoint, not
the current branch. Current Actions results and remaining product gates are in
[integration-runs.md](evidence/integration-runs.md); reproduction is in
[integration/README.md](integration/README.md). Historical CI is never substituted
for a new Matrix interoperability result.

Date: 2026-10-21. Branch: `feat/veil-programmable-reachability-matrix`.
Base: `53eee234b03fb731b434662f2bd041d3755ca843` (`codex/veil-guest-gate`, PR #8).
**Overall delivery: BLOCKED. No genuine browser↔Android Matrix message exists.**
The delta is draft-reviewable as a decision/blocker package, not as the requested
working contact feature. No screenshots/video were produced; no synthetic UI is
offered as proof. No security assessment or cryptographic audit was performed.

## Repository hygiene

Workspace initially contained no checkout. Connected GitHub identified
`Soldsoul86/orb`, its branches, PR #8 and tags `veil-contact-v7`, `veil-qr-v8`,
`veil-qr-v9`. Main was `189e1d8ee348399fd3703a50ce88d7d4f759ed20`; using it would
omit the Veil purpose/guest groundwork. The new branch was created at PR #8's
exact head, without changing that PR or any existing branch.

Shell clone failed connecting to the configured proxy. All 465 base files were
retrieved through the GitHub connection and verified against their Git blob
SHA-1s. The reconstructed Git tree matched
`d89196a22871b82db4cc1b4cde190ce8fcea9fa2`; exact original commit bytes matched
the base SHA. Local checkout has a shallow boundary at that commit; full ancestor
history remains on GitHub. Local branch and origin match the actual repository.
No other working tree or uncommitted work was reset, stashed, overwritten or committed.
This is not a claim that a shell clone succeeded.

Only `apps/veil/guest-web/` changes: `matrix/` decision/probe/evidence files,
an index note in `STATUS.md`, and blocker wording in `release_gate.py` and
`src/gate.mjs`. Both gates retain their unconditional refusal. Android sources,
application ID, signer, Signal dependencies, identity/recovery, provider, relay,
other Orb modules and all deployment/workflow resources remain byte-unchanged.

## BEFORE and AFTER

Raw outputs: [baseline.txt](evidence/baseline.txt), [after.txt](evidence/after.txt),
[preflight.json](evidence/preflight.json).

| Check | Before | After / limitation |
|---|---|---|
| Guest Node suite | PASS 10, NOT TESTED 1 Nimbus fixture | Same 10 PASS / 1 skipped after gate wording change. Public signature validation, not message E2EE. |
| Python guest gate | PASS 4 | PASS 4; all HTTP mutations refused and environment cannot enable release. |
| Existing provider suite | PASS 14, NOT TESTED 6 PostgreSQL | Provider unchanged; baseline retained, not needlessly rerun. |
| Existing relay suite | PASS 30, NOT TESTED 2 | PostgreSQL reconnect and real HTTP skipped; relay unchanged. |
| Orb lint | PASS, 112 files | PASS, 112 files. Root lint does not validate this new Python probe. |
| Orb `npm run verify` | BLOCKED at build: `tsc: not found`, exit 127 | Same failure; no unrelated repair. Earlier PR's reported Orb failures are not reclassified as this environment's missing compiler. |
| Kotlin identity/app JVM/Android lint | BLOCKED locally | Gradle and Android SDK tools unavailable. No new local build claim. |
| Chromium fixture | BLOCKED | `PermissionError: [Errno 1] Operation not permitted` opening loopback socket, before browser launch. |
| Release command | Existing gate closed | PASS for refusal: exit 2, BLOCKED message. This is not a release PASS. |
| Matrix preflight | Not present | BLOCKED: loopback, Gradle, adb, sdkmanager, platform 35, Matrix JS import and npm/Maven proxy requests. |
| New Matrix crypto, UI or provider integration | NOT TESTED | NOT IMPLEMENTED; no adapter or homeserver installed. |

Historical CI was independently checked through GitHub:
[run 39531620094](https://github.com/Soldsoul86/orb/actions/runs/39531620094)
completed successfully at `21ce591afc7a9ba2f61fa68e02b66af4447c04cc`.
PR #8's final base commit is documentation-only and has no workflow run attached.
That historical run covered Android JVM/lint and PostgreSQL suites; it does not
prove this new Matrix proposal. No CI workflow was added or manually dispatched.
The existing root workflow automatically ran for the push and PR at
`3ebac79126989c999c68b39bf59363af0733aa68`:
[PR run 39564717501](https://github.com/Soldsoul86/orb/actions/runs/39564717501),
[push run 39564667077](https://github.com/Soldsoul86/orb/actions/runs/39564667077).
Both passed install, lint, build, independent package compilation and **666 tests**.
Both then FAILED the unrelated hard-exit demonstration with
`TypeError: event.risk.measured.toFixed is not a function` at
`scripts/simulate-hard-exit.mjs:201:45`. The identical failure was verified in
[baseline run 39531623756](https://github.com/Soldsoul86/orb/actions/runs/39531623756)
at `21ce591afc7a9ba2f61fa68e02b66af4447c04cc`. The script and its dependencies are
unchanged; no trading code was modified to make CI green. See
[ci-excerpts.txt](evidence/ci-excerpts.txt). Root CI does not run Matrix tests.
The final documentation/evidence-only commit uses `[skip ci]`; it does not change
the tested executable files. Overall CI remains **FAIL**, not all-green.

## Primary acceptance scenario

| ID | Required result | Status here |
|---|---|---|
| A | Existing Android build creates Home Repairs link for seven days | BLOCKED: new issuer/UI absent. Existing installation upgrade additionally DEVICE REQUIRED. |
| B | Ordinary mobile browser sends encrypted introduction without visible registration | BLOCKED: Matrix adapters/provisioner absent. |
| C | Pending state; second request refused through real network | BLOCKED: existing presentation tests do not prove new Matrix enforcement. |
| D | Owner decrypts, approves, replies in Veil | BLOCKED: no Android Matrix integration. |
| E | Browser decrypts reply and sends response | BLOCKED: no real Matrix session. |
| F | Revocation rejects subsequent contact | BLOCKED for Matrix; existing pi/1 policy tests PASS only for their original provider. |
| G | Backend/log/network contain ciphertext only, no E2EE secrets | NOT TESTED for Matrix; no server was run. Existing opaque-relay tests cannot substitute. |
| H | Personal Signal chat and installation remain usable; existing identity/provider checks pass | PASS source-preservation check and local provider baseline; real Signal exchange/install is DEVICE REQUIRED. Android identity regression BLOCKED locally, historical CI only. |

## Required negative-test coverage

The existing foundation tests remain useful, but **none of the following is a
Matrix integration PASS**. Status names below apply to the requested new channel.

| Test | Status | Existing evidence / missing proof |
|---|---|---|
| Forged identity / endpoint-key substitution | NOT TESTED | Existing JWS wrong-key rejection PASS; SDK device provenance not integrated. |
| Modified link / policy / malformed payload | NOT TESTED | Existing address, duplicate-JSON and signature tests PASS; new contact issuer/verifier absent. |
| Outdated/conflicting route | NOT TESTED | Existing known-revision rejection PASS; new Matrix route migration absent. |
| First-request replay | NOT TESTED | Existing provider nonce/intro tests PASS; Matrix bypass paths absent. |
| Browser reload / duplicate retry | NOT TESTED | No Matrix persisted outbox/transaction store. |
| Expired or revoked invitation | NOT TESTED | Existing invitation rules PASS; new profile deliberately caps approved access too. |
| Guessed link / brute force | NOT TESTED | Random-capability and quota design only. |
| Spam / many guests competing | NOT TESTED | Existing provider race/rate tests PASS; Matrix claim path not implemented. |
| Closed hours | NOT TESTED | Existing Python policy tests PASS; proposed Matrix strict reject mode not integrated. |
| Timezone boundary / DST gap and repeat | NOT TESTED | Existing schedule tests PASS; new channel end-to-end test absent. |
| Authorization changes in flight | NOT TESTED | No Matrix admission/commit ordering proof. |
| Decrypt error / ciphertext tampering | NOT TESTED | No Matrix SDK execution. |
| Unavailable homeserver / federation error | NOT TESTED | No homeserver; experiment initially excludes federation. |
| Cleared storage / blocked storage or third-party cookies | NOT TESTED | Presentation-only loss state PASS; real SDK persistence absent. |
| Server operator lacks plaintext | NOT TESTED | Requires raw event/storage/push/log inspection with known test sentinels. |
| Compromised code host | PASS documentation only | Residual endpoint compromise explicitly admitted in THREAT_MODEL.md; no prevention claim. |
| Browser screenshot/camera capture | PASS documentation only | No capture-prevention claim. Physical behavior is DEVICE REQUIRED. |
| Two independently operated Matrix providers / old one stopped | NOT TESTED | Existing pi/1 provider migration PASS does not establish Matrix portability. |

## Reproduce blockers now

From repository root:

```sh
python3 apps/veil/guest-web/matrix/preflight.py --network
python3 apps/veil/guest-web/tests/browser.py
node apps/veil/guest-web/tests/core.test.mjs
python3 -m unittest discover -s apps/veil/guest-web/tests -v
python3 -m unittest discover -s apps/veil/portable-provider -v
python3 -m unittest discover -s apps/veil/relay -v
npm run verify
python3 apps/veil/guest-web/release_gate.py
```

Preflight exits 2 here; browser exits 1; Orb verify exits 127; release gate
**must** exit 2 even on a fully equipped machine. These exit codes must not be
rewritten into successful chat evidence. Do not print tokens or proxy credentials
when investigating the missing network access.

## Resume the actual experiment

Use a runner with working loopback/network access, JDK 21, Gradle 8.13, Android
API 35/build tools, an emulator or Android test phone, Node >=22 and a browser.
Fetch and integrity-lock the inspected SDK releases; build the isolated Android
adapter and measure dependency/ABI/APK impact before touching the live app.
Verify maintenance/security releases again rather than blindly adopting these pins.

Run a disposable private homeserver, first probing guest register, device-key
upload/query/claim, room join/send/sync on both SDKs. If native guests fail, test
transparent pseudonymous technical accounts and document exact credentials and
enforcement scope. Do not use public open registration or the live Veil relay.

Implement the signed bindings and transactional enforcement in API.md before
claiming the user journey. Test direct homeserver API bypass and concurrent claims.
Then use browser and Android endpoints to send the two exact brief messages,
approve, reply, reload/retry and revoke; inspect ciphertext with logging sanitized.
Keep a real trace with SDK versions and authenticated device fingerprints, never
private keys. Repeat with two isolated providers and independent signed-route
sharing; report exactly what survives. Finish physical-phone and independent
security gates before any public send deployment.
