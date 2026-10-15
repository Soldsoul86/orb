## Portable identity beta (pi/1)

The existing messenger is preserved. My identity now offers locally owned keys, signed purpose policies, encrypted recovery and explicit provider migration. This beta needs a compatible separate provider; the existing personal-chat relay is unchanged. It does not migrate earlier v1/v2 identities automatically.

Start with [migration demo](PROVIDER_MIGRATION_DEMO.md), [executed tests](TEST_RESULTS.md), [open protocol](OPEN_PROTOCOL.md), [limits](LIMITATIONS.md), and [threat model](docs/portability/THREAT_MODEL.md). Identity core: Nimbus JOSE+JWT; message encryption remains libsignal. Provider examples are not live deployments.

# Veil — private communication, under your touch

An Android-first, one-to-one messenger with concealed media, hold-to-reveal interaction, and moving recipient watermarks. Kotlin / Jetpack Compose client; a small opaque-envelope Python relay.

**Status: signed debug APK built in Orb CI; not a completed or verified v0.1 release.** Android compilation, lint, policy/native Signal tests and relay tests passed in GitHub Actions. See [the delivery report](docs/STATUS.md) for exact build and encryption results. The user reports a successful basic two-phone check; detailed A–J acceptance results and physical capture verification remain unrecorded. Do not use this development build for consequential secrets.

## Programmable purposes preview

A separate **Veil Purposes Preview** app now adds multiple purpose addresses, explicit publication, public discovery, encrypted text requests, approval, office hours, pause/revocation and invitation links/QR. It installs beside the existing app, preserving its identity and messages. [Download and two-phone walkthrough](docs/purposes/DEMO.md) · [22-case test matrix](docs/purposes/TESTING.md) · [architecture](docs/purposes/DESIGN.md) · [API](docs/purposes/API.md) · [threat model](docs/purposes/SECURITY.md).

The text-only preview and live additive `/v2` relay are tested as described in those reports. Purpose media/documents, recovery, background notifications and broader English interpretation are not implemented. Existing `/v1` chat/media and the original-app signing guard remain intact. This is a debuggable pilot, not an audited production release.

## Setup update and download status

0.1.2 adds **Get started** with the hosted relay, one-tap invitation sharing, and one shared 60-digit safety number on both phones. The build and automated tests passed. **An update over the installed 0.1.1 is blocked by a signing-key mismatch. Keep the current app installed; do not uninstall or clear its data.** The previous signing-key cache did not save its key. See [the signing diagnosis and recovery requirements](docs/ONBOARDING.md).

[0.1.2 build and tests](https://github.com/Soldsoul86/orb/actions/runs/38723409751) · [0.1.2 APK ZIP for fresh disposable test installations only](https://github.com/Soldsoul86/orb/actions/runs/38723409751/artifacts/11967018962). This binary cannot update the delivered 0.1.1 APK. A newer CI guard blocks publishing incompatible replacements.

[Existing 0.1.1 APK ZIP](https://github.com/Soldsoul86/orb/actions/runs/38707141433/artifacts/11959076411) remains the version the user tested on two phones. It includes the unlock-cover fix and works with the live relay. Existing users do not need to reinstall it.

## Implemented in source

- Two-way invitation exchange, pinned peer identity and explicit shared safety-number comparison.
- Signal libsignal 0.105.0 PQXDH and ratcheting sessions; text, photos and short videos encrypted before upload.
- Android Keystore encrypted atomic vault containing identity/session state, outbox and received messages.
- Native biometric/device credential unlock; dark Compose onboarding, conversation list, chat, mode selection and attachment picker.
- Secure windows, excluded recents, immediate native concealment on touch release, cancellation, focus loss and backgrounding.
- Media stays in memory while viewing. No media export provider, public file, gallery save or plaintext disk cache.
- Animated repeated watermark using the recipient's short identity fingerprint, message marker and changing UTC time.
- Sender-selected message expiration (1 minute / 1 hour / 1 day); optional 15-second media opening, persisted across reopen.
- Durable ciphertext retries, receiver commit-before-ack and replay bookkeeping.

Only one person can be paired with an installation. Both sides must exchange invitations **before** importing the other's invitation. Messages are retrieved while the app is open and unlocked. There are no notifications or background push tokens. “Relayed” means accepted by the relay, not delivered or read.

## Build on a development machine

Prerequisites: JDK **21**, trusted Gradle **8.13**, Android SDK Platform **35**, Build Tools **35.0.0**, Android platform-tools, NDK **27.0.12077973**, and access to Google Maven, Maven Central, Gradle and Signal's Maven repository. Android Studio can install the SDK and set `local.properties` for you.

```sh
cd apps/veil
# Set sdk.dir in local.properties or configure ANDROID_HOME for your SDK.
gradle --version                 # must report Gradle 8.13, JVM 21
./scripts/bootstrap.sh          # generates standard Gradle wrapper, builds and runs JVM tests
./gradlew :app:assembleDebug :app:assembleDebugAndroidTest
./gradlew :app:lintDebug
```

The Orb workflow at `../../.github/workflows/veil-apk.yml` builds this application independently on the `codex/veil-apk` branch. Download the `veil-debug-apk` artifact from the successful run linked in [the delivery report](docs/STATUS.md), extract its ZIP, and install `veil-debug.apk`. It includes a SHA-256 checksum. A successful build does not certify physical protection.

The wrapper JAR/scripts cannot be downloaded/generated in the provided environment; `scripts/bootstrap.sh` generates them using the specified trusted Gradle installation. Commit the generated wrapper after successful build. Dependencies and plugin versions are pinned, but dependency verification checksums/lockfiles are not yet generated; do that after resolving trusted artifacts. Do not disable TLS verification to make dependency downloads work.

Expected APK after a successful build: `app/build/outputs/apk/debug/app-debug.apk`. Debug builds permit `run-as` and instrumentation; they are for testing. A distributed release needs a private signing key, non-debuggable release APK, license notices, and independent review.

## Hosted Render trial

A dedicated Singapore web service and PostgreSQL database have been provisioned in the user's confirmed Render workspace. The service is **live** at `https://veil-relay-soldsoul86.onrender.com`. Public HTTPS checks passed for two disposable inboxes, 128-byte and 5-MiB opaque payloads, authorization separation, idempotent retry, acknowledgement and cleanup. This verifies relay transport, not Android two-phone delivery. [Dashboard links, setup steps and hosting limits](relay/HOSTING.md). The free database expires November 14, 2026. The installed 0.1.1 APK is compatible; no update is required for this relay.

## Run an HTTPS relay

Python **3.12+** is sufficient; no pip packages or third-party service credentials are needed. The relay must run on a host reachable by both phones. Use a domain with valid public TLS; the app rejects HTTP and redirects and does not trust user-added certificate authorities by default.

```sh
cd apps/veil
python3 -m unittest discover -s relay -v
VEIL_DB=/path/to/private/veil.sqlite3 python3 relay/server.py
# Separate process, after installing Caddy and pointing DNS at this host:
VEIL_DOMAIN=relay.example.com caddy run --config relay/Caddyfile
```

Create the database directory writable only by the relay's dedicated OS account. The server binds to `127.0.0.1:8080` by default; Caddy exposes HTTPS on 443. Keep the Python port off the public network. Run both as supervised services for a persistent installation. Do not enable access/body/header logs. For the provisioned Render alternative, use the hosted trial above; Caddy is only needed for your own separate self-hosted deployment.

Mailbox lifetime is 30 days, envelope maximum lifetime is seven days, and the UI offers up to one day. In this minimal version inbox renewal and key rotation require resetting and pairing both test installations again. No reset is performed automatically.

## Install and pair two phones

For 0.1.2, use fresh disposable test installations only. This build cannot update the existing 0.1.1 installation; keep that working installation intact.

1. Use two Android **9 / API 28 or later** phones with PIN/password screen locks. Enable USB debugging only for development. Connect both to a network that reaches your HTTPS relay.
2. Run `adb devices`, then install the APK on both with `adb -s SERIAL install -r app/build/outputs/apk/debug/app-debug.apk`.
3. Unlock Veil using biometrics or device credential. In 0.1.2, tap **Get started** on both phones to use the built-in relay. **Use another server** allows a shared custom HTTPS origin. In 0.1.1, enter the same relay origin manually.
4. On **both** phones choose **Share my invitation** (0.1.1: **Prepare my invitation → Share invitation**). Exchange the invitations privately. Sharing or using the system picker locks Veil; unlock again on return. Save each invitation in the trusted exchange channel before importing the other.
5. Import the other phone's invitation. Compare **every group** of your shared safety number in person or on a trusted call. Both phones must show the same number. If one phone still uses 0.1.1, expand **Comparing with an older version?** and cross-compare both complete identity codes instead. Confirm only after the comparison matches.
6. Open **Your person**. Send text, then use **+** to choose a JPEG, PNG, WebP or MP4. Media limit: **5 MiB**; video: **15 seconds**. Veil does not transcode. Sender-owned gallery originals remain where they were.
7. Pick **Eyes-Only**, send a photo, and keep the receiving app open/unlocked. Tap the media; hold to reveal; release to conceal. Test again with video. Choose a one-minute lifetime to check disappearance.
8. Follow [the A–J test procedure](docs/TESTING.md) before declaring the product usable or capture-protected on those devices.

## Verification and design records

- [Architecture and security decisions](docs/ARCHITECTURE.md)
- [Threat model, platform support and limitations](docs/SECURITY.md)
- [Tests, two-phone automation, and physical test checklist](docs/TESTING.md)
- [Actual results, blockers and v0.2 priorities](docs/STATUS.md)
- [Third-party dependencies and licensing](docs/DEPENDENCIES.md)

Private communication should feel natural. Copying it should be difficult, deliberate, and potentially attributable. Another camera, a modified recipient app, or a compromised phone can still copy what a recipient can see. Watermarks are a deterrent, never forensic proof.

## License

The standalone Veil code in this directory is licensed under AGPL-3.0-only; see [LICENSE](LICENSE). This is separate from the existing Orb runtime. Signal libsignal is also AGPL-3.0-only. Corresponding application source and build instructions are on the `codex/veil-apk` branch; retain dependency notices and consult [the dependency record](docs/DEPENDENCIES.md) before redistribution.
