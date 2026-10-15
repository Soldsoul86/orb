# Delivery report — 2026-10-15

## 1. Actually built

An Android Kotlin/Compose source project named **Veil**, with setup/pairing, an identity-comparison gate, one-conversation list, chat composer, media picker, Normal/Protected/Eyes-Only selection, a native protected media viewer, animated repeated watermark and sender expiration controls. Source includes real libsignal calls, Android Keystore vault encryption, HTTP relay transport, persistent ratchet/outbox/inbox handling and biometric/device-credential app entry. The Python/SQLite relay and local tests execute without external packages.

This is **not a completed v0.1 release**. No Android binary has been built or launched. Runtime compatibility and security behavior are unverified. No mock screen or substitute encryption is presented as functioning delivery.

## 2. Architecture / dependencies

Kotlin 2.2.20, Compose Material 3, libsignal 0.105.0, Android Keystore AES-GCM, AndroidX Biometric, Media3, OkHttp; Python standard-library HTTP and SQLite behind operator-managed Caddy HTTPS. Details in ARCHITECTURE.md and DEPENDENCIES.md.

## 3. Features demonstrated end to end

**None between Android devices.** No phones, emulator, adb or SDK are available. The relay database operations are exercised locally. A real HTTP test is provided but cannot bind a socket in this environment. The supplied two-phone harness is unexecuted and must not be counted as a passing demonstration.

## 4. Security protections verified

Locally executed tests verify relay capability separation, idempotent storage/ack, TTL pruning, quotas, malformed-envelope rejection and opaque storage of synthetic payloads. Static source review confirms the intended secure-window, no-export/no-notification and encrypted-vault paths. It does **not** verify Android screenshot prevention, native encryption correctness, biometric behavior, lifecycle races or watermark readability.

## 5. Security limitations / unresolved risks

Full threat model in SECURITY.md. Key limits: recipient/root compromise and second cameras remain effective; watermark attribution is best-effort; disappearance is cooperative and not guaranteed secure erasure; traffic metadata remains visible; no key rotation/inbox renewal/recovery; no accessibility hold alternative; inline media needs memory profiling; no independent integration audit; no release signing or dependency verification; API/OEM compatibility remains untested. This project should not protect consequential real-world secrets yet.

## 6. Automated results

- Python relay: **9 PASS**, **1 NOT TESTED / skipped** (network socket denied).
- Python and shell syntax checks: **PASS**.
- Kotlin/JVM/native/instrumentation/two-phone tests: **NOT TESTED**. Test sources exist; no claim that they compile or pass.
- No physical test passed or failed because none could be attempted.

## 7. Physical tests required

A–J in TESTING.md, including screenshot buttons/ADB/accessibility, OS recording, conferencing/casting, hold/release/cancel timing, background/recents transitions, true video/audio pause, fingerprint comparison, lock/reunlock, two-phone encrypted communication, opening/deletion deadlines, and a second phone's optical watermark evaluation. Run on at least two OEMs and multiple Android versions.

## 8. Installation / two-phone setup

README.md contains exact prerequisites, Gradle bootstrap, APK locations, Caddy relay setup, ADB installation and manual pairing flow. TESTING.md includes `scripts/two_phone.py` and the acceptance sequence. No hosted relay/domain or TLS certificate was provisioned. Existing credentials are unnecessary for a self-hosted relay, but the operator must supply hosting and a reachable HTTPS origin.

Exact environmental blockers:

- No Gradle, Kotlin compiler, Android SDK, platform-tools/adb, emulator or physical Android device.
- `curl` through configured `http://proxy:8080` fails with `Failed to connect to proxy port 8080 ... Could not connect to server`.
- Local socket creation fails with `PermissionError: [Errno 1] Operation not permitted`.
- An additional-network retry stalled and was canceled by the user. No further approval wait was requested. Upstream text API review worked via the existing GitHub connector; that did not provide Android tooling or native binaries.

## 9. Three highest-priority v0.2 improvements

1. **Establish release confidence:** reproducible CI/build artifacts, dependency verification, independent protocol/storage/lifecycle review, and a repeatable multi-OEM physical capture + optical watermark test matrix. This is also a gate for calling v0.1 complete.
2. **Make sessions durable over months:** authenticated prekey rotation, mailbox renewal/revocation, safe device replacement/re-pair UX, malformed-envelope quarantine and independent send/receive retry scheduling.
3. **Improve the signature experience:** accessible deliberate-reveal alternatives with explicit tradeoffs, measured watermark contrast/crop resilience, safer media normalization/metadata stripping, and streamed encrypted storage to bound memory use.

## Incremental execution record

| Phase | Implementation | Verification |
|---|---|---|
| 0: audit / architecture | Complete source/design audit and documented choices | Environment and upstream source inspected |
| 1: encrypted text | Pairing, pinned identity, native protocol adapter, vault and relay source | Relay tests pass; Android protocol/transport blocked |
| 2: media | Encrypted inline photo/video import and playback source | Native and two-phone tests supplied, blocked |
| 3: protected chat | Secure window, recents exclusion, native concealment, no export source | Source review only; device capture tests required |
| 4: Eyes-Only / watermark | Hold/cancel/release, pause, deadlines, repeated animated overlay source | Policy and view tests supplied, blocked |
| 5: adversarial testing / refinement | Relay tests, test harness, threat model, UX error/lock handling | Partial; physical acceptance and Android build remain open |
