# Purpose verification — 2026-10-15

This report separates native cryptographic integration, API tests, emulator UI checks and physical-phone evidence. Fixture accounts exist only in isolated test databases. No synthetic production directory profiles were published.

## Executed evidence

| Check | Result | Evidence / boundary |
|---|---|---|
| SQLite relay regression | PASS: 31, one PostgreSQL-only skip | [Veil Relay run](https://github.com/Soldsoul86/orb/actions/runs/38751974592), 32 collected tests |
| PostgreSQL 17 relay regression | PASS: 32, no skips | Same run; includes independent connection concurrency and reconnect |
| JVM suite | PASS: 17, no failures/skips | [Purpose run](https://github.com/Soldsoul86/orb/actions/runs/38751974618); native libsignal loaded, not mocked |
| Two independent Signal clients through actual HTTP relay | PASS | `PurposeNetworkTest`: temporary Python process, real sockets/SQLite, controlled server clock. Not two Android phones |
| Android 15 / API 35 AOSP x86_64 | PASS: 12 instrumentation tests | Same purpose run; unlock/curtain, secure flag, native reveal/conceal, safety number, purpose ciphertext, QR bitmap decoding, publication/unsupported-input UI |
| APK + instrumentation APK compilation | PASS | Same purpose run; publication of a compatible original-app update remains blocked |
| Android lint | PASS, warnings remain | 0 errors, 29 warnings, 1 hint in preview report. Not a security audit |
| Public relay after deployment | PASS | [Live HTTPS run](https://github.com/Soldsoul86/orb/actions/runs/38753909599): health, old `/v1` 128-byte + 5-MiB opaque transport, auth, retry, acknowledgement, cleanup; `/v2/capabilities` and handoff headers |
| Render deployment | PASS: live | `dep-db8e8f7avr4c73b63ing`, backend source `bdfbd21ebd22752d645d1359548d2075554c48df`; no error-level application logs returned for the sampled post-deploy window |
| Local workspace Python suite | PASS: 30, two skips | 32 collected; this workspace forbids socket creation and has no PostgreSQL URL. CI executed those paths |
| Unrelated root Orb `verify` | FAIL | Existing trading code: `event.risk.measured.toFixed is not a function`; not changed in this work. Repository-wide CI is not green |

The [side-by-side APK build](https://github.com/Soldsoul86/orb/actions/runs/38753791606) repeated all 17 JVM and 12 Android tests successfully, verified the separate application ID and APK signature, and saved the explicit preview signing-key cache. The downloaded APK checksum and signing certificate match the CI outputs. [Download/demo](DEMO.md). Authentication instrumentation calls the post-authentication code path; it does not prove an OS biometric matcher or physical fingerprint works. API 28–34 and other OEM devices were not executed here.

## Uploaded prompt acceptance cases

| # | Result | What was actually checked / remains |
|---|---|---|
| 01 Existing normal messaging | PASS automated; DEVICE REQUIRED full phone regression | Existing relay tests, native Signal tests and live `/v1` transport. Previous basic two-phone success is user-reported, not a new test of this APK |
| 02 Existing encryption intact | PASS integration | `SignalSession.kt` unchanged; real libsignal introduction/reply, encrypted context checks and database canary assertions |
| 03 No phone/email/OTP | PASS API/source; DEVICE REQUIRED first-run usability | Device-generated capability registration and independent keys; no phone/email fields or account-provider dependency |
| 04 Three facets/policies/addresses | PASS API/integration | Work, unlisted Personal and expiring Sale created in isolated accounts |
| 05 Public vs private search | PASS | Search returns opted-in Work and omits unlisted/link-only purposes; exact private lookup requires invite |
| 06 Discovery → encrypted request | PASS native HTTP; DEVICE REQUIRED Android/international | Two independently generated native clients; not two physical countries/phones |
| 07 Discovery is not permission | PASS | One introduction; further sends refused before approval |
| 08 Grant bound to one facet | PASS | Bound grant routing and authenticated inner facet/grant IDs; cross-facet request denied |
| 09 Unauthorized sender | PASS | Foreign capability cannot fetch/send another grant |
| 10 Stale-client revocation/block/pause/expiry | PASS | Raw API calls, queue deletion/retention and expiry assertions; no disabled-button-only enforcement |
| 11 India/NZ schedule + DST | PASS | Kolkata exact open/close/weekend, Auckland skipped/repeated hour; deterministic server clock tests |
| 12 Queue/reject correctness | PASS | Ciphertext survives reopen, cannot fetch while closed, appears at opening; REJECT path stores nothing |
| 13 Concurrent intro quota | PASS | Multiple threads and separate SQLite/PostgreSQL connections serialize reservations/introductions |
| 14 Database unreadability | PASS integration within stated trust model | Actual Signal canary and raw private-key/token absence in SQLite/WAL. No penetration test against a malicious key-substituting directory |
| 15 Independent edits | PASS | Version checks and scoped publication/pause changes leave other facets unchanged |
| 16 Shared URL opens correct app/policy | PASS parser/HTTPS handoff; DEVICE REQUIRED OS journey | Same-origin validation and safe landing checked; Android/browser app-choice routing not physically exercised |
| 17 QR and link equivalence | PASS Android bitmap/parser; DEVICE REQUIRED camera | Generated QR decoded to exact invitation URL, including private fragment. Camera scanning delegated to system camera; image import implemented |
| 18 Malicious/unknown prose | PASS JVM + Compose UI | Unsupported input blocks review until corrected or explicitly discarded; public activation requires consent |
| 19 Recovery | BLOCKED | No recovery/export/transfer implementation. UI visibly disabled and loss warning shown; no restoration claim |
| 20 No public permanent identifier | PASS API | No phone/email/internal account ID in directory responses; server can still correlate ownership |
| 21 Abuse/rate limiting | PASS bounded API tests | Query/intro/message/report bounds and one-account/facet limit. Not Sybil-proof or load-tested |
| 22 No plaintext/secrets in logs | PASS source review + storage tests; NOT TESTED comprehensive platform logs | Relay suppresses access/body logging; app has no content logging; search in POST. Hosting/OS/browser logs and production device logcat need separate review |

## Reproduce automated checks

Use Python 3.12+, JDK 21, Gradle 8.13, Android SDK/platform 35, Build Tools 35.0.0 and NDK 27.0.12077973. The workspace lacks an SDK/emulator; the checked-in GitHub workflows supply them.

```sh
python -m pip install -r apps/veil/relay/requirements.txt
python -m unittest discover -s apps/veil/relay -v
# Optional second run: set TEST_DATABASE_URL to a DISPOSABLE PostgreSQL database.
# Never run destructive test fixtures against the deployed relay database.
cd apps/veil
gradle --no-daemon -PveilPurposePreview=true :app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:assembleDebugAndroidTest
gradle --no-daemon -PveilPurposePreview=true :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=chat.veil.UnlockRegressionTest,chat.veil.ProtectionTest,chat.veil.SafetyNumberTest,chat.veil.PurposeCipherTest,chat.veil.PurposeQrTest,chat.veil.PurposeEditorTest
```

`PurposeNetworkTest` launches `relay/demo_fixture.py`. Clock control uses the parent process's stdin only; production server has no test clock endpoint. The test creates temporary fixture identities, inspects actual stored encrypted bytes, decrypts on the other native client, advances server time and verifies a stale client after revocation. The fixture is never deployed.

For deployed transport only, run `python apps/veil/relay/smoke_https.py HTTPS_ORIGIN` and `python apps/veil/relay/smoke_purposes_https.py HTTPS_ORIGIN`. The first creates/deletes disposable legacy inboxes; the second is read-only. Neither tests purpose messaging from Android.

## Physical/manual gates — DEVICE REQUIRED unless marked otherwise

- Install the preview beside existing Veil on two phones; verify existing app identity/history remain accessible. Verify actual biometric/PIN unlock, keyboard, scrolling, slow/free-service startup and reconnect.
- Execute [the two-account demo](DEMO.md) over separate networks. Record phone/OS/build, result and timestamps. International geography cannot be inferred from a loopback test.
- Open copied/shared HTTPS links from common browsers/chat apps and system camera; import a received QR image. Confirm private invite fragments survive each path and no personal identifier is shown.
- Review/approve/reject distinct contacts, edit/pause/resume one purpose, then revoke while the other phone is offline. Reconnect and confirm queued sends fail appropriately.
- Exercise real office-hour transitions and wrong device clock, airplane mode, process death before/after server acknowledgement and force-stop/restart. Detailed crash stress is NOT TESTED.
- Re-run original capture A–J matrix: OS screenshot, MediaProjection recording/sharing/casting, recents, hold/release, focus/background concealment, expiry and second-camera watermark visibility. Emulator flag/callback checks do not prove physical capture restrictions.
- Time purpose creation with an unfamiliar user. The under-60-second target is NOT TESTED; low-/mid-range performance and accessibility are NOT TESTED.
- Recovery and purpose document/image/video transfer are BLOCKED by unimplemented safe flows. Do not attempt data clearing or uninstall to test recovery on a working identity.

Revocation and disappearing messages cannot erase plaintext, screenshots or camera recordings already held by a recipient. A rooted/debuggable recipient can bypass local controls. See [SECURITY.md](SECURITY.md).
