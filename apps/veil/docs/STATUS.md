# Delivery report — 2026-10-15

## Live relay — 2026-10-15

`https://veil-relay-soldsoul86.onrender.com` is live in Singapore, with a separate persistent PostgreSQL database. The user configured the private database connection in Render. [Live HTTPS test run 38714151908](https://github.com/Soldsoul86/orb/actions/runs/38714151908) passed at 09:36:30 UTC: health, two disposable inboxes, 128-byte and 5-MiB opaque payloads, idempotent retry, reader/writer and cross-inbox access checks, acknowledgement and cleanup. No real conversations or private keys were used.

The installed 0.1.1 APK is compatible. Both people enter this same HTTPS origin, create their own inbox, each share their own invitation **before importing the other's**, compare complete identity codes, and keep Veil open/unlocked to receive messages. No background push notifications are implemented.

The free server may take about a minute to wake after idle. The free database expires November 14, 2026; an upgrade is needed for continued use. [Hosting details](../relay/HOSTING.md). These live transport checks do not establish Android two-phone delivery, combined Signal-to-relay integration or physical capture protection.

## Latest APK: 0.1.1-dev — unlock cover fix

**Use this replacement:** [APK ZIP](https://github.com/Soldsoul86/orb/actions/runs/38707141433/artifacts/11959076411) · [successful build](https://github.com/Soldsoul86/orb/actions/runs/38707141433).

The user installed 0.1.0 on a phone and reported that “Veil is locked / Tap to unlock” remained after authentication. Fixed the Compose state observation that left the native privacy cover on top. [Cause, test design and upgrade instructions](UNLOCK_FIX.md).

- Code commit `598746ab36d6329d369e0d65c8c234ae4e6c40d2`; version code 2, `0.1.1-dev`.
- **PASS:** 4 Android 15/API 35 x86_64 emulator instrumentation tests: successful unlock removes the native cover; background/focus loss and repeated unlock; native hold/release/cancel/focus concealment; FLAG_SECURE present before authentication.
- The unlock tests supply an accepted authentication callback using test-only reflection. They do not test the OS biometric/PIN matcher. A retest on the affected phone is required.
- **PASS:** 10 relay tests, 6 JVM tests including actual native Signal, debug/test APK compilation, APK v2 signature and downloaded checksum.
- Lint: **0 errors, 27 warnings**, unchanged from the previous build.
- APK: 72,714,690 bytes. ZIP: 32,470,903 bytes.
- APK SHA-256: `465e294593ea868ed34bddfd8963d1b2a79c33b4b613f37b2550355af3cd4aba`.
- The old and new APK signing certificates differ (confirmed from their v2 signing blocks). **Uninstall the old Veil before installing this replacement; uninstall deletes its local identity/messages.** Do not uninstall unrelated Orb applications. The new debug key is cached for future CI builds; cache eviction remains a limitation.
- Two-phone end-to-end delivery, Android-native Signal tests, OS capture/recording/casting and optical watermark tests remain **NOT TESTED / DEVICE REQUIRED**. Passing view tests on an emulator is not a physical capture guarantee.

The sections below preserve the original 0.1.0 delivery record; the newer results above supersede its build/emulator status.

## 1. Actually built

An Android Kotlin/Compose source project named **Veil**, with setup/pairing, an identity-comparison gate, one-conversation list, chat composer, media picker, Normal/Protected/Eyes-Only selection, a native protected media viewer, animated repeated watermark and sender expiration controls. Source includes real libsignal calls, Android Keystore vault encryption, HTTP relay transport, persistent ratchet/outbox/inbox handling and biometric/device-credential app entry. The Python/SQLite relay and local tests execute without external packages.

This is **not a completed v0.1 release**. A signed universal debug APK has now been built in Orb CI. It has not been installed or launched on Android; runtime UX, device capture protection and two-phone delivery remain unverified.

## Download and exact build

- [Download APK ZIP](https://github.com/Soldsoul86/orb/actions/runs/38698579359/artifacts/11954194230): extract `veil-debug.apk` and its SHA-256 file.
- [Successful workflow and logs](https://github.com/Soldsoul86/orb/actions/runs/38698579359).
- Source: `Soldsoul86/orb`, branch `codex/veil-apk`, application at `apps/veil`; APK code commit `88ddb36a4d94b25fef3d576241c3364addcfb831`. Later documentation-only commits do not change this binary.
- Package `chat.veil`; version `0.1.0-dev` (1); Android 9/API 28 minimum, target API 35. ARM64, ARMv7, x86 and x86_64 included.
- APK: 72,714,690 bytes; compressed download: 32,470,836 bytes. Unused Signal testing JNI excluded and native debug symbols stripped; production Signal JNI retained on every ABI.
- APK SHA-256: `f48c1c2a1234297f4b05badd9c4215723db952c906be86150f7a8fba55424349`.
- APK Signature Scheme v2 verified by Android `apksigner`. This is a debug certificate, not a production identity. Future CI builds may use a different debug signing key; preserve test data before replacing an installation and do not uninstall unrelated Orb apps.
- Artifact retention currently expires January 13, 2027. Download and retain the APK/checksum; rebuild from source afterward.

## 2. Architecture / dependencies

Kotlin 2.2.20, Compose Material 3, libsignal 0.105.0, Android Keystore AES-GCM, AndroidX Biometric, Media3, OkHttp; Python standard-library HTTP and SQLite behind operator-managed Caddy HTTPS. Details in ARCHITECTURE.md and DEPENDENCIES.md.

## 3. Features demonstrated end to end

**None between Android devices.** GitHub Actions supplies the SDK and native Linux libraries, but no Android device/emulator has been used. Real HTTP relay tests pass on the CI runner. Four actual native libsignal integration tests pass on Linux/JVM: text/reply and serialized restart, 5 MiB media payload/out-of-order/duplicate rejection, tamper/wrong-identity rejection, and simultaneous initiation. These are cryptographic integration tests, not Android UI or two-phone demonstrations. The supplied two-phone harness remains unexecuted.

## 4. Security protections verified

Executed tests verify native Signal roundtrips and adversarial cases above, reveal/expiry policy boundaries, and relay capability separation, idempotent storage/ack, TTL pruning, quotas, malformed-envelope rejection, opaque storage of synthetic payloads and HTTP transport. Static source review confirms the intended secure-window, no-export/no-notification and encrypted-vault paths. These checks do **not** verify Android screenshot prevention, full client-to-relay canary test H, biometric behavior, lifecycle races or optical watermark readability.

## 5. Security limitations / unresolved risks

Full threat model in SECURITY.md. Key limits: recipient/root compromise and second cameras remain effective; watermark attribution is best-effort; disappearance is cooperative and not guaranteed secure erasure; traffic metadata remains visible; no key rotation/inbox renewal/recovery; no accessibility hold alternative; inline media needs memory profiling; no independent integration audit; no release signing or dependency verification; API/OEM compatibility remains untested. This project should not protect consequential real-world secrets yet.

## 6. Automated results

- Python relay in CI: **10 PASS**, zero skipped, including real HTTP transport. The initial local run was 9 pass / 1 skipped because local sockets are prohibited.
- Kotlin/JVM tests: **6 PASS**, zero failed/ignored: 2 policy tests and 4 real native libsignal tests.
- Debug application and Android instrumentation APK compilation: **PASS**.
- Android lint: **PASS**, 0 errors and 27 warnings. Warnings include dependency/target updates, missing launcher icon, drawing allocations, accessibility click semantics and untranslated strings; they remain release work.
- APK signing verification and downloaded checksum: **PASS**.
- Python and shell syntax checks: **PASS**.
- Android instrumentation execution, emulator UI, two-phone delivery and full test H: **NOT TESTED**.
- Capture/optical watermark/lifecycle timing: **DEVICE REQUIRED**. No physical results are fabricated.

The separate pre-existing Orb `verify` workflow failed its trading hard-exit demonstration with `event.risk.measured.toFixed is not a function` at `scripts/simulate-hard-exit.mjs:201`. Its earlier lint/build/compile/tests passed. Veil does not modify that code; the Veil APK workflow is green. See [the separate workflow](https://github.com/Soldsoul86/orb/actions/runs/38697571941).

## 7. Physical tests required

A–J in TESTING.md, including screenshot buttons/ADB/accessibility, OS recording, conferencing/casting, hold/release/cancel timing, background/recents transitions, true video/audio pause, fingerprint comparison, lock/reunlock, two-phone encrypted communication, opening/deletion deadlines, and a second phone's optical watermark evaluation. Run on at least two OEMs and multiple Android versions.

## 8. Installation / two-phone setup

README.md contains exact prerequisites, Gradle bootstrap, APK locations, Caddy relay setup, ADB installation and manual pairing flow. TESTING.md includes `scripts/two_phone.py` and the acceptance sequence. No hosted relay/domain or TLS certificate was provisioned. Existing credentials are unnecessary for a self-hosted relay, but the operator must supply hosting and a reachable HTTPS origin.

Initial local environmental blockers (Android build and HTTP test now resolved through GitHub Actions; local restrictions remain):

- No Gradle, Kotlin compiler, Android SDK, platform-tools/adb, emulator or physical Android device.
- `curl` through configured `http://proxy:8080` fails with `Failed to connect to proxy port 8080 ... Could not connect to server`.
- Local socket creation fails with `PermissionError: [Errno 1] Operation not permitted`.
- An additional-network retry stalled and was canceled by the user. No further approval wait was requested. Upstream text API review worked via the existing GitHub connector; that did not provide Android tooling or native binaries.

## 9. Three highest-priority v0.2 improvements

1. **Establish release confidence:** production signing, dependency verification and build provenance, independent protocol/storage/lifecycle review, and a repeatable multi-OEM physical capture + optical watermark test matrix. This is also a gate for calling v0.1 complete.
2. **Make sessions durable over months:** authenticated prekey rotation, mailbox renewal/revocation, safe device replacement/re-pair UX, malformed-envelope quarantine and independent send/receive retry scheduling.
3. **Improve the signature experience:** accessible deliberate-reveal alternatives with explicit tradeoffs, measured watermark contrast/crop resilience, safer media normalization/metadata stripping, and streamed encrypted storage to bound memory use.

## Incremental execution record

| Phase | Implementation | Verification |
|---|---|---|
| 0: audit / architecture | Complete source/design audit and documented choices | Environment and upstream source inspected |
| 1: encrypted text | Pairing, pinned identity, native protocol adapter, vault and relay source | Native Signal and relay HTTP tests PASS; two-phone delivery NOT TESTED |
| 2: media | Encrypted inline photo/video import and playback source | Native 5 MiB crypto payload test PASS; Android codecs/two-phone tests NOT TESTED |
| 3: protected chat | Secure window, recents exclusion, native concealment, no export source | Source review only; device capture tests required |
| 4: Eyes-Only / watermark | Hold/cancel/release, pause, deadlines, repeated animated overlay source | Policy tests PASS; native view execution/optical verification NOT TESTED |
| 5: adversarial testing / refinement | Relay tests, test harness, threat model, UX error/lock handling | Signed debug build and 16 automated tests PASS; physical acceptance remains open |
