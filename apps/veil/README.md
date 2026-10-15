# Veil — private communication, under your touch

An Android-first, one-to-one messenger with concealed media, hold-to-reveal interaction, and moving recipient watermarks. Kotlin / Jetpack Compose client; a small opaque-envelope Python relay.

**Status: signed debug APK built in Orb CI; not a completed or verified v0.1 release.** Android compilation, lint, policy tests and all 10 relay tests passed in GitHub Actions. See [the delivery report](docs/STATUS.md) for exact build and encryption results. Two-device delivery and physical capture tests remain NOT TESTED. Do not use this development build for consequential secrets.

## Latest download / unlock fix

[Download 0.1.1-dev APK ZIP](https://github.com/Soldsoul86/orb/actions/runs/38707141433/artifacts/11959076411). Extract and install `veil-debug.apk`. This fixes the privacy cover remaining after successful unlock. Four Android 15 emulator tests now verify the unlock/native concealment transitions. The tests inject the accepted authentication callback; physical fingerprint/PIN behavior still needs a retest.

The previous APK used a different temporary debug signing key. Uninstall the old **Veil** first, then install this version. Uninstalling clears Veil’s local identity and messages. [Details and checksum](docs/STATUS.md).

## Implemented in source

- Two-way invitation exchange, pinned peer identity and explicit full-code comparison.
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

## Run an HTTPS relay

Python **3.12+** is sufficient; no pip packages or third-party service credentials are needed. The relay must run on a host reachable by both phones. Use a domain with valid public TLS; the app rejects HTTP and redirects and does not trust user-added certificate authorities by default.

```sh
cd apps/veil
python3 -m unittest discover -s relay -v
VEIL_DB=/path/to/private/veil.sqlite3 python3 relay/server.py
# Separate process, after installing Caddy and pointing DNS at this host:
VEIL_DOMAIN=relay.example.com caddy run --config relay/Caddyfile
```

Create the database directory writable only by the relay's dedicated OS account. The server binds to `127.0.0.1:8080` by default; Caddy exposes HTTPS on 443. Keep the Python port off the public network. Run both as supervised services for a persistent installation. Do not enable access/body/header logs. There is no deployment created or hosted URL supplied by this workspace.

Mailbox lifetime is 30 days, envelope maximum lifetime is seven days, and the UI offers up to one day. In this minimal version inbox renewal and key rotation require resetting and pairing both test installations again. No reset is performed automatically.

## Install and pair two phones

1. Use two Android **9 / API 28 or later** phones with PIN/password screen locks. Enable USB debugging only for development. Connect both to a network that reaches your HTTPS relay.
2. Run `adb devices`, then install the APK on both with `adb -s SERIAL install -r app/build/outputs/apk/debug/app-debug.apk`.
3. Unlock Veil using biometrics or device credential. Enter the same HTTPS relay origin on both phones.
4. On **both** phones choose **Prepare my invitation → Share invitation**. Exchange the invitations privately. Sharing or using the system picker locks Veil; unlock again on return. Save each invitation in the trusted exchange channel before importing the other.
5. Import the other phone's invitation. Compare both **complete** identity codes in person or through a trusted call. Each “Your identity” must match the other's “Their identity.” Confirm only when both match.
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
