# Final milestone status: safe foundation, not guest-chat delivery

Follow-up: [Matrix-native guest decision checkpoint](matrix/README.md) proposes a
separate maintained Matrix channel and records the current environment blockers.
It does not implement messaging or satisfy the release gate. The historical PR #8
results and Signal-adapter investigation below remain evidence for that milestone.

Implemented in draft PR #8: https://github.com/Soldsoul86/orb/pull/8

## Actually implemented

Strict public-controller HTTPS address parsing; duplicate-key-safe JSON and existing ES256/JWS signature verification in Web Crypto; a public fixture signed by Veil's real Nimbus identity-core; wrong-key/tamper/route/known-rollback negative tests; minimal browser entry and honest request/expiry/revocation/session-loss copy; optional-install presentation tests; loopback-only static development server and an unconditionally closed send/release gate. No runtime dependencies added to the Android application. No production files changed.

## Demonstrated and not demonstrated

Local Node checks: 10 PASS, 1 Nimbus fixture NOT TESTED locally. Python gate checks: 4 PASS. Local existing provider checks: 14 PASS, 6 PostgreSQL SKIPPED locally. Remote CI results are recorded below after completion.

No browser guest has sent an encrypted request to Android or received an encrypted reply. No real guest acceptance, browser session persistence, reconnecting transport, one-time/reusable invitation issuance, Android guest-name/Block UI, or browser/app transfer has been implemented. UI-state screenshots are synthetic and labeled. There is no owner/guest journey video because that journey does not yet work.

The existing native signed v9 APK, its package/signer and live Render service remain unchanged. No new APK or public guest deployment is delivered. No new credentials or hosting spend is needed for this isolated foundation. Physical stock-camera, two-phone and screen-reader tests remain NOT TESTED / PHYSICAL TEST REQUIRED.

## Why release is blocked

The supplied brief says: “No public launch unless compatible, reviewed browser E2EE has been demonstrated and independently security-reviewed”. Official libsignal is Node-native on JS; older official browser JS is archived. The community WASM candidates inspected have version/review gaps relative to Veil's 0.105.0 sessions. A documented wrapper self-review is not verified independent coverage. Browser/Android Signal interoperability and the integration security review are absent. The public-signature proof does not fill that gap.

Current `/i#token` QR links also lack an independently delivered purpose-controller pin. Browser guest links must pin the intended controller, while still treating a forwarded link as permission to request only. Active compromise of the server serving browser JS remains a separate web-code trust risk even with good E2EE libraries. An isolated origin and CSP reduce attack surface but do not solve malicious first-load code.

## Next three priorities

1. Select and independently review a narrow Signal WASM adapter pinned to Veil's upstream version, including license and maintenance plan. If unsuitable, decide explicitly on a separately versioned reviewed Olm/MLS guest channel while preserving existing identities/sessions.
2. Prove real browser ↔ unchanged Android encrypted request/reply, pinned key binding, tamper/wrong-key/replay rejection and atomic persistent ratchet/outbox behavior with synthetic identities.
3. Complete guest routing, approvals/Block, expiry/rate/abuse enforcement, resilient browser return and real-device UX; independently review and release only after T01–T18 are satisfied. Do not promise notification or sideloaded-session transfer that has not been implemented.

## Observed CI — 2026-10-21

PASS https://github.com/Soldsoul86/orb/actions/runs/39531620094, tested commit `21ce591afc7a9ba2f61fa68e02b66af4447c04cc`:

- 11 Node checks, including Nimbus public-state verification; 4 Python gate checks.
- 3 Kotlin identity-core tests and 25 app JVM tests; Android lint passed.
- 20 provider/invitation tests including all 6 PostgreSQL fixtures; 32 relay tests with PostgreSQL. No skipped tests in those two suites.
- Real Chromium public-signature verification, disabled-send/POST denial, CSP/no local plaintext persistence, XSS literal rendering and synthetic state/RTL/200% layout checks passed.
- Official Signal0.105.0 browser-bundling probe reproduced Node-native dependency failure: BLOCKED, not message-E2EE PASS.
- Screenshots and test reports: workflow artifact `veil-guest-disabled-evidence`. Screenshots deliberately say SYNTHETIC UI ONLY for simulated states. No full owner/guest communication video or physical-device evidence exists.

Initial CI configuration failed because provider test dependencies / PostgreSQL driver were not installed; corrected. A later configuration skipped portable PostgreSQL fixtures because their opt-in variable differed from the relay's; corrected to `VEIL_TEST_POSTGRES_URL`, and all 20/32 tests ran in the final run. The unrelated Orb root verify failure persists; this is not an all-repository green claim.

GitHub comparison against baseline confirms additions only: isolated guest directory, new CI workflow, and a public-fixture test in identity-core. Existing production Android, identity, relay and signing files are byte-unchanged. Final documentation-only commit does not change tested executable code.
