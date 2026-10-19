# Veil contact preview — delivery report

Report date: 2026-10-19. App version 0.3.2-contact-preview, versionCode 7. Minimum Android 9/API 28; targets Android 15/API 35. Automated device results below are API-35 AOSP emulators.

## 1. Actual screen changes

Chats shows requests and conversations with a New contact button. Reach me lists private invitations. Settings contains Back up my identity, Restore my identity, Move my identity and advanced controls. The universal Discover tab is removed from ordinary navigation. The original personal media chat remains reachable from Chats; older purpose-pilot data is accessible under advanced controls.

New contact offers Temporary, Work and Personal. Temporary creates the local identity automatically, publishes a private capability URL and opens the native Sharesheet. Invitation details show an absolute local expiry, Share again, Copy, a QR of the same URL and Cancel. Interrupted creation can resume with the same saved identity, invitation and rules; changing rules during an unresolved retry is rejected explicitly. Opening a received URL shows the chosen name, supported content, hours, approval requirement and independent timers; only Request contact sends an introduction. The owner sees Accept/Decline; an accepted relationship shows its access end time and End access with inline confirmation. This keeps focus inside the secured Activity, so confirmation does not trigger the app lock.

Work defaults to weekdays 09:00–18:00 in the device timezone, with readable submission/delivery/notification behavior and optional Change rules. The simple editor supports weekdays or all days and same-day hours; overnight windows and arbitrary weekday selection are not implemented. Recovery and migration retain the existing cryptographic operations with simpler entry points and explicit limits. The new experience supports native light/dark themes and enlarged text.

## 2. Interaction map

Before: Chats → My identity (1) → Create identity on this device (2) → Create a purpose (3). At that point the user still faced a provider URL and advanced policy form; a complete baseline share was not timed because a portable provider was not connected to that UI. Do not infer an invented old share time.

After: Chats → New contact (1) → Temporary (2) → Share invitation (3 total, 2 after entering New contact). Measured on an API-35 emulator against the live hosted HTTPS service, warmed by a capability check: 7,557 ms from unlocked Chats to the real system Sharesheet, including publication (one measured run, not a cold-service or startup benchmark).

End access: End access → confirmation (2 taps). Device credential/biometric input, system target selection, typing and scrolling are reported separately from app button taps. First-time five-person task success and the proposed 30-second target are NOT TESTED; a script is included.

## 3. Preserved security and messaging

Byte-for-byte source comparison against the prior preview confirms no changes to SignalSession, PurposeCipher, Messenger, Vault, SecureMediaView, PurposePolicy or identity-core. Native libsignal 0.105.0 still encrypts text/media; Nimbus JOSE identity signing/JWE recovery, Android Keystore, existing vault names and user-held recovery keys remain unchanged. Migration uses the same signed controller/grant/session protocol and no automatic route discovery.

The compatible service extension adds hashed random invitation capabilities and server-enforced expiry/cancellation; accepted access still uses the existing signed grant. The hosted relay is deployed at https://veil-relay-soldsoul86.onrender.com on commit e63e638e2a7c4fbbe33f80632c09d2824f4137e7, using the existing database with a separate `veil_portable` schema. No new paid resource, credential-entry step, analytics or phone/email requirement was added.

## 4. Demonstrated real flows and failures

In run https://github.com/Soldsoul86/orb/actions/runs/39197149425, two API-35 emulators passed eight invitation stages: create and retry, preview without claiming, explicit introduction, signed approval, actual native-Signal message/reply, cancellation and revocation denial. Eleven existing migration stages also passed: provider A's process stopped, database removed and TCP port refused; fresh identity restore; independently verified controller; new Signal session/message/reply through separate B; revocation enforced. Both provider stacks share one CI host/operator; separately operated providers and physical-device portability remain NOT TESTED.

A new JVM test injects lost responses after real service commits for invitation creation, reservation, introduction, acceptance and sending. Restarted sessions retry the same identity, invitation, request and ciphertext; no duplicate message appears. Malformed links do not create an identity/request. Provider tests separately prove preview never claims, wrong-owner operations fail, cancellation rejects pending access, and invitation expiry does not shorten an approved relationship's seven days.

The final live UI run https://github.com/Soldsoul86/orb/actions/runs/39200431098 passed all eight stages on two emulators against the deployed HTTPS service: native Sharesheet, recipient request, owner acceptance, message, reply, receipt, inline End access confirmation, and blocked sending after revocation. The confirmation remained unlocked and focused. This run uses the same production source as the signed v7 APK. ACTION_VIEW is exercised through the app handler; physical browser/resolver association remains unverified.

## 5. Results and boundaries

| Verification | Result |
|---|---|
| Original provider baseline | PASS: 9 tests |
| Original identity/core + app JVM baseline | PASS: 2 + 19 tests |
| Original Android regressions before redesign | PASS: 14 tests |
| Updated SQLite provider suite | PASS: 14 tests |
| Dedicated PostgreSQL invitation/isolation suite | PASS: 6 tests |
| Relay regression suite in CI | PASS: 31 tests; 1 PostgreSQL-specific test skipped |
| Identity core + updated app JVM | PASS: 2 + 24 tests |
| Updated Android regressions — signed build | PASS: 17 tests (native focus test and secure flag test run in separate instrumentation processes, unchanged assertions) |
| Combined long-session UX run | FAIL: live return-from-Sharesheet unlock timed out; later native test lacked real window focus. Contact/migration stages passed in that same run. |
| Preserved-signer upgrade | PASS: actual v5 install, encrypted fixtures, v6 and v7 install -r, data/key/session verification |
| Native two-emulator contact + migration stages | PASS: 8 + 11 stages |
| Live HTTPS UI + Sharesheet | PASS: all 8 stages, including End access and blocked sending |
| Light/dark, 150% text, constrained screen | PASS: eight UI capture stages across four profiles, 20 actual after screens |
| Android lint | PASS: 0 errors; 29 warnings, 1 hint remain |
| Five first-time testers | NOT TESTED — people required |
| Physical phone sharing, biometrics, OEM capture paths and camera watermark | DEVICE REQUIRED |
| TalkBack/switch access, physical rotation/browser handoff and rigorous startup profiling | NOT TESTED |
| Unrelated Orb root verification | FAIL — existing Hard exit demonstration: `event.risk.measured.toFixed is not a function`; lint/build/package tests pass; no Orb runtime edits |

Reference successful signed build: https://github.com/Soldsoul86/orb/actions/runs/39200435127 . Baseline: https://github.com/Soldsoul86/orb/actions/runs/39190027335 . Initial screenshot collection failed after Gradle uninstalled the test app; corrected collection produced inspected real screens at https://github.com/Soldsoul86/orb/actions/runs/39191501896 .

Earlier checks found and corrected an actual QR-format false detection, an invitation handler that failed to import while already unlocked, retained scroll positions between pages, and test-fixture contamination. Live link assertions also exposed an ActivityScenario cleanup mismatch after the production handler replaced its intent; the harness restores its launch intent only after assertions. A real-window-focus precondition failed when combined with other UI tests; the signed-build run passed those existing assertions on its emulator. The later combined UX run reproduced the missing-focus precondition; this is recorded separately and not presented as a green combined run. A dedicated diagnostic run identified `Application Not Responding: com.android.launcher3` as the focused window before test authentication. The isolated fixture reduces rendering size and closes only a confirmed Launcher3 ANR before stages; it never dismisses a Veil failure or forces app focus. No capture-protection flag was removed and no assertion was weakened to get a green result. Authentication acceptance is supplied by test-only reflection, so these tests do not verify Android's biometric matcher.

## 6. Artifacts and reproducibility

APK: `veil-contact-preview.apk` in the delivery ZIP. Its SHA-256 is:
`143f7ee0371c9b9d1678f28cfcc6bcf10859bf4a8aed1c8ad54caac536029b07`.

The published APK artifact was downloaded, its checksum checked, and every APK ZIP member read successfully. The immutable signed APK comes from source 62c5ce0a74b748c6a4ec1b20a6368da6119b861e. The earlier v6 candidate exposed a focus-loss bug when opening an End access dialog. V7 uses an inline confirmation within the protected Activity and hides irrelevant expiry labels after revocation; the lock and capture behavior remain intact. Direct APK artifact: https://github.com/Soldsoul86/orb/actions/runs/39200435127/artifacts/12163464106 . Screenshots are actual app renders with synthetic data, captured inside instrumentation while FLAG_SECURE remains set; they are UX evidence, not encryption or physical capture verification. The delivery includes screenshots, CHANGELOG, this report, architecture/limits, the physical/user-test script, MANIFEST and SHA256SUMS. The delivery workflow publishes `veil-contact-preview.zip` and its companion `.sha256`. Packaging opens every APK/PNG and reopens the completed ZIP to verify CRCs and byte-for-byte readback. MANIFEST records the immutable signed source/build. The architecture and physical-test documents describe the v6 foundation; this report includes the final v7 fixes.

Reproduce with JDK 21, Gradle 8.13, Android SDK 35/build-tools 35.0.0 and NDK 27.0.12077973. Install `apps/veil/relay/requirements.txt` and `portable-provider/requirements.txt`; run the Python suites, `gradle -p apps/veil -PveilPurposePreview=true :identity-core:test :app:testDebugUnitTest :app:assembleDebug :app:assembleDebugAndroidTest :app:lintDebug`, then the scripts/workflows included in the repo. Local generic debug builds do not automatically inherit the distributed preview signer. The authorized signing workflow restores the pinned existing key and fails closed if missing.

## 7. Signing and update compatibility

Package: `chat.veil.purposes.preview`. The actual previously distributed v5/v6 APKs and actual new APK contain certificate SHA-256:
`e241ad4e30de7812469e70f72065960eafd5ee3f2fab089ac40a89783647f6a4`.

The actual APK signing blocks were compared locally, in addition to CI apksigner verification. An emulator installed the real distributed v5, seeded all three encrypted vaults and a live Signal session, then installed the actual v6 and final v7 with `adb install -r` without uninstalling. Ciphertext files, ownership/controller keys and continued ratchet encryption/decryption matched. This is an update to Veil Purposes Preview. It is not a compatible replacement for the separate original `chat.veil` package, whose earlier signing key is unavailable. Do not uninstall or clear either app to work around a signing mismatch.

## 8. Known limitations

Portable contacts are text-only; media/Eyes-Only remain in the existing personal path. Invitations require approval but are not one-recipient capabilities; four initial channel slots and existing wallet/service quotas apply. Expiry and revocation stop future authorized service access, not copies or recipient-controlled history. Pending cancellation/permission changes are not represented as server completion.

A name and accepted request are not verified real-world identity. The opaque URL resolver can substitute an unverified first-contact identity if compromised; users must compare full safety numbers out-of-band. Capture flags cannot prevent another camera, modified clients or rooted-device extraction. App backups/recovery exclude history, live sessions and invitation capabilities. Older backups may omit later revocations; restored access must be reviewed before migration. Moving providers requires explicit out-of-band new address exchange; no automatic discovery or deferred fresh-install link recovery exists. Free relay startup can delay initial sharing; notifications are silent in-app, with no background push guarantee. The preserved cache-based preview signing process is not production key management. This signed preview is a debuggable APK: an authorized ADB/debugger session has greater access than it would with a hardened production release.

## 9. Next improvements, based on observed friction

1. Make link opening and return from Android's Sharesheet clearer across real browsers/OEM phones; the user has already reported cumbersome setup, and this is the remaining system-app handoff.
2. Improve identity comparison without silently trusting a contact. The user specifically identified comparing codes as cumbersome; test an accessible verification journey with five first-time users.
3. Reduce the split between portable text contacts and personal media pairing. The current visible distinction forces a second setup path for photos/videos; extend only through a reviewed compatible design, with quotas and migration behavior specified first.
