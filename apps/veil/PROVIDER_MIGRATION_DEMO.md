# Reproduce provider replacement

The exact tested source and run evidence are listed in TEST_RESULTS.md. This demonstration never stops your existing personal-chat Render relay.

## Local/JVM proof

Requirements: JDK 21, Gradle 8.13, Android SDK platform35/build-tools35.0.0/NDK27.0.12077973, Python3.12+, Linux x86_64 supported by libsignal. From repository root:

```sh
python3 -m venv .venv-portability
. .venv-portability/bin/activate
pip install -r apps/veil/portable-provider/requirements.txt
python -m unittest discover -s apps/veil/portable-provider -v
gradle -p apps/veil --no-daemon :identity-core:test :app:testDebugUnitTest
```

`PortabilityIntegrationTest` automatically starts A and B in different Python processes, separate temporary SQLite DBs and TCP origins; no shared identity database. It creates two independent identities, publishes a chosen facet, authenticates the first contact, denies pre-approval chat, approves and exchanges real libsignal text. It exports a JWE and tests a wrong key. Then it stops A's process, removes its DB, confirms its port refuses connections, creates a fresh client with no Signal state, restores on B, checks independent Python verification, rejects a forged route, and exchanges a **new** Signal message/reply through B. Every post-shutdown client transport call asserts it is directed at B. Finally revocation blocks further send. Test-only local HTTP is explicit; it is not a production trust setting.

Report `apps/veil/app/build/reports/tests/testDebugUnitTest/classes/chat.veil.PortabilityIntegrationTest.html` includes the proof's PASS line. Fixture secrets and messages are not emitted into logs; temporary files are removed. No physical-device result is inferred from this test.

## Two Android emulators with TLS

Use `.github/workflows/veil-portability.yml` for the complete reproducible setup. It starts two separate API35 AOSP x86_64 AVDs and builds the preview app plus instrumentation APK. Both use the same production PortableSession, libsignal JNI and Android Keystore-backed Vault as the app. Only the test HTTP client trusts a generated disposable fixture CA. Production RelayClient trust is unchanged.

With two **fresh disposable** emulators already booted on 5554/5556 and build artifacts present:

```sh
gradle -p apps/veil --no-daemon -PveilPurposePreview=true :app:assembleDebug :app:assembleDebugAndroidTest
python apps/veil/scripts/portable_two_devices.py --owner emulator-5554 --peer emulator-5556
```

The script refuses non-emulator serials, uses separate TLS ports18443/18444 and DBs, installs without uninstalling, coordinates actual Android instrumentation on each device, shuts down A, clears only the disposable owner's portable vault to model a fresh client, restores, runs the independent Python verifier, exchanges new encrypted text/reply, then revokes. This must not be run on a daily-use emulator containing valuable identities. Test fixture recovery files are private to disposable app storage and removed; do not upload test secret files as artifacts.

## Two real phones and independently administered services

1. Build/install the preserved-signature **Veil Purposes Preview** APK. Keep any original Veil installation and its chats; do not uninstall it. Set an Android PIN/biometric, unlock, open My identity.
2. Each provider operator runs `portable-provider/provider.py` behind HTTPS on their own host/account, using their own DB directory and TLS/domain/host credentials. Copy the relevant `deploy/*.env.example`, replace placeholder domain, provision a persistent private directory, run with Python requirements, and put a TLS reverse proxy in front. Never share A's DB/volume or login with B. There is no upstream registry URL or company credential to set. `/healthz` must report `pi/1`. Public hosting is an operator task; example domains are not live services.
3. Each person taps Create identity. No network, phone or email is needed. A creates a purpose pointing to A's provider, confirms typed rules and any public listing, then activates it. B creates a separate local purpose to present when requesting contact. Private default is not searchable; use A's full signed card or explicitly opt into public search.
4. A shares the signed invitation card. B pastes it under Find a purpose, chooses their own purpose, reviews rules and sends one introduction. A refreshes inbox, reviews and approves. Both compare the full safety number through a trusted channel, then send/refresh actual text.
5. A creates an encrypted recovery backup, records its random key separately and retypes it, then saves JWE through Android's document picker. Keep the key private. There is no message-history backup in this format.
6. On a fresh client, A selects Restore, opens the JWE and supplies the key. Review restored approved grants, choose Move to another provider for the desired purpose, enter B's independent HTTPS origin and confirm disclosure/rules. Each facet moves separately; nothing publishes all facets together.
7. **Only after backing up and arranging the new route**, stop A's disposable/test service and database access. Do not shut down a live shared relay used by unrelated users. Keep A offline throughout the decisive message test.
8. A shares the new signed route card through another channel. In the existing conversation B pastes it under Contact moved providers and confirms Verify identity & accept new session. Controller pin must match; wrong key/older revision fails. Compare the changed Signal safety number if needed. B sends a new message; A refreshes/decrypts/replies through B. Verify with provider logs/network controls that no A request was possible; logs must not include message bodies or private keys.
9. Run `python apps/veil/portable-provider/open_verifier.py route-card.json '<previously pinned RFC9278 ID>'` on an independent computer with only PyJWT/cryptography installed. It has no network code and prints only verification status/revision. This demonstrates key continuity, not legal-name verification or global freshness.
10. Verify outside-hours queue/reject, expiry and revocation. Capture actual device/operator evidence and label it separately from CI. Physical recovery/file picker, OEM screenshots/recording/sharing and photographing the watermark remain manual checks.

## What survives

Same private ownership key and purpose controller ID; confirmed signed policy; owner-controlled approved unexpired grants; authorized peer identity pins. The new route, operational device key, epoch and Signal session change deliberately. Old messages, queued ciphertext, pending requests, provider handles and automatic route discovery do not survive. Missing/stale backups may lose later revocations. Original provider cannot sign the new route without the user's controller key, but can refuse service, retain metadata and lie about old state to a party that never learned the newer revision.
