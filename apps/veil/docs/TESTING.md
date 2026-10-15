# Verification ledger and test procedure

Use exactly these labels: **PASS**, **FAIL**, **NOT TESTED**, **DEVICE REQUIRED**. A skipped test is not PASS. A flag inspection or emulator screenshot is not physical-device verification. Record build hash, phone model, Android version/security patch, app version, test inputs and observations without real private content.

## Results from local checks and Orb CI — 2026-10-15

| Check | Result | Evidence |
|---|---|---|
| Relay reader/writer authorization separation | PASS | `test_capability_separation` |
| Durable delivery, acknowledgement and idempotent upload retry | PASS | `test_delivery_ack_and_idempotent_retry` (database-level) |
| Relay TTL removes expired envelopes | PASS | `test_expiration` |
| Malformed envelope / expired / overlong TTL rejection | PASS | `test_invalid_payload_and_ttl` |
| Cross-mailbox isolation, box revocation, registration limits | PASS | Three additional relay tests |
| Mailbox quota | PASS | `test_quota` |
| Opaque storage, hashed capabilities | PASS | `test_storage_is_opaque_and_capabilities_hashed`; synthetic random bytes, not proof of client encryption |
| Real HTTP, two network clients | PASS | All 10 relay tests pass on the GitHub runner; initial local socket restriction remains |
| Python syntax and shell bootstrap syntax | PASS | `py_compile`; `bash -n` |
| Android build / lint / JVM tests | PASS | Orb CI: debug and test APK compiled; 6 JVM tests pass; lint 0 errors / 27 warnings |
| Native libsignal on Linux/JVM | PASS | 4 actual native protocol tests; shared source also compiled into Android instrumentation |
| Secure-view and Android-native instrumentation execution | NOT TESTED | Instrumentation APK compiled but no Android runtime used |
| Two-phone harness | NOT TESTED | Sources supplied; no phones/emulators/HTTPS relay |
| Physical screenshot / recorder / casting / watermark | DEVICE REQUIRED | No physical devices attached |

The initial relay test run surfaced the socket restriction as an error; it is now an explicit skip with the blocker retained here. No code failure was hidden as a passing network test.

[Exact build, artifact, checksum and caveats](STATUS.md). CI is not physical-device verification.

## Automated checks to reproduce

```sh
python3 -m unittest discover -s relay -v
./gradlew :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
# Unlock the connected test device at OS level first; leave its screen awake.
./gradlew :app:connectedDebugAndroidTest
```

`PolicyTest` checks reveal state, release, background transitions and exact expiry/budget boundaries. The production native viewer uses this policy plus synchronous opaque cover and monotonic expiry checks. `SignalIntegrationTest` uses actual native libsignal for bidirectional text, maximum media-size bytes, restart serialization, tamper rejection, replay rejection, out-of-order messages and simultaneous initiation. Synthetic media bytes here verify the cryptographic path; they do not verify codec rendering. `ProtectionTest` checks the Activity secure flag and real native photo view down/up/cancel/focus callbacks; it does not claim to verify the OS compositor or optical results. `TwoPhoneHarness` is skipped by ordinary instrumentation runs unless explicitly configured.

### Real two-device automation

Use **fresh test installations** on two unlocked devices. The harness will create and pair their test identities and store synthetic test messages. It does not erase an existing vault; setup fails on an already configured installation. Clear app data yourself only if the data is disposable. Do not use real conversations for this harness.

```sh
./gradlew :app:assembleDebug :app:assembleDebugAndroidTest
adb -s PHONE_A install -r app/build/outputs/apk/debug/app-debug.apk
adb -s PHONE_B install -r app/build/outputs/apk/debug/app-debug.apk
adb -s PHONE_A install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb -s PHONE_B install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
python3 scripts/two_phone.py --a PHONE_A --b PHONE_B \
  --relay https://relay.example.com --video /path/to/test-under-15s.mp4
```

Both phones need PIN/password screen locks and must remain OS-unlocked. The debug harness calls the same Messenger and native encryption code without interacting with the app's biometric UI; this is test instrumentation, not a production unlock route. Invitations are exchanged privately over USB by the host, and the harness marks the resulting fixed test identities compared. Test biometric UI and the human verification step separately.

If the relay database is local to the harness host, add `--relay-db /path/to/veil.sqlite3` to inspect queued ciphertext before the receiving phone fetches it. Otherwise run `python3 scripts/inspect_relay.py /path/to/veil.sqlite3 --canary VEIL_E2E_CANARY_5738` on the relay host while the receiver is paused. This is a sampled canary check, not a cryptographic proof or log audit.

The script runs text/photo delivery, optional exact-byte video delivery and a 65-second expiration wait. It reports device/emulator identity without presenting an emulator run as a physical-device test. Its test photo is a generated PNG; the video must be a real supplied fixture <=5 MiB and <=15s. The script does not test video duration validation in the picker or playback in the viewer. It cleans its local public invitations and fixture files after success; remove `files/harness` from failed disposable runs. No private keys or message bodies are printed. `adb run-as` is a debug capability, and is not available in release builds.

## Required A–J acceptance sequence

| Test | Procedure and pass criterion | Current result |
|---|---|---|
| A: text | Pair through UI; compare both full fingerprints. Send a unique dummy sentence A→B and reply B→A; restart both; retry an offline send. Exact text, no duplicates, correct state after reconnect | NOT TESTED |
| B: photo | Send a known JPEG/PNG/WebP. Confirm it decodes on B, without a public-gallery file. Also test a short real MP4, pause/resume and malformed/oversized imports | NOT TESTED |
| C: Eyes-Only | Open received photo; no media pixels visible until a deliberate hold. Marks must identify the intended recipient, not the sender | NOT TESTED |
| D: screenshot | With media revealed, try hardware buttons, screenshot quick setting, `adb exec-out screencap -p`, and a supported accessibility screenshot path. No protected media/text pixels may be present. Record OS refusal or black pixels separately | DEVICE REQUIRED |
| E: recording / sharing | Start system recorder BEFORE opening Veil; reveal and release; background/foreground; inspect saved video frame by frame. Repeat starting while Veil is open, then conference screen sharing and vendor casting to another display. Verify remote output itself | DEVICE REQUIRED |
| F: hold/release | Photo and video: down, up, pointer leaves bounds, CANCEL, second finger, rapid repeat, interrupted gesture. Cover must be applied synchronously on release/cancel, video/audio pause; no stuck reveal. Measure optical latency with external high-frame-rate recording | DEVICE REQUIRED; native callback test NOT TESTED |
| G: switching | Reveal then Home/Recents/notification shade/split screen/lockscreen/rotation/phone interruption. No previous frame on return, no media in recents, unlock required. Include system picker return and auth cancellation | DEVICE REQUIRED |
| H: backend | Pause B before it fetches. Inspect pending DB envelopes and proxy configuration on the relay host. Decode transport base64 and search unique plaintext canaries/photo bytes; verify no plaintext payload, private key, read capability or notification body exists. Resume B and verify successful decryption. Inspect network request schema and confirm transport content is Signal ciphertext | NOT TESTED; opaque relay unit test alone is insufficient |
| I: second camera | Physically photograph/film a revealed bright photo, dark photo and moving video using another phone. At normal viewing distance, check recipient marker and timestamp visibility; try a central crop, edge crop, contrast change and social-media re-encode. Rate usability and residual marks. Log sample photos with tester consent | DEVICE REQUIRED — optical capture expected to succeed; deterrence must be evaluated, not assumed |
| J: expiration | Send 1-minute text and media, observe both clients at deadline, close/reopen, hold during expiry, open after offline delay. Test 15-second opening and reopen before/after deadline. Inspect relay pruning and encrypted vault rewrite. Try clock rollback and modified recipients and record bypasses as limitations | NOT TESTED; relay expiry unit test PASS only |

Example screenshot and recorder commands on a **test device** (use synthetic content only):

```sh
adb -s PHONE_B exec-out screencap -p > screenshot-attempt.png
adb -s PHONE_B shell screenrecord --time-limit 15 /sdcard/veil-capture-test.mp4
adb -s PHONE_B pull /sdcard/veil-capture-test.mp4
adb -s PHONE_B shell rm /sdcard/veil-capture-test.mp4
```

ADB/system screenrecord can differ from MediaProjection/conferencing capture; all relevant paths need separate results. A black screenshot is expected when secure capture works, so it is not usable evidence that the watermark actually rendered. Test watermark readability with a second camera. Do not create a non-secure debug viewer just to get flattering screenshots.

## Further adversarial cases

- Alter one invitation key or signature, mismatch identity comparisons, wrong relay, expired invite, same-device invite, consumed prekey and simultaneous first sends.
- Interrupt after ratchet serialization but before upload; interrupt after upload before local outbox removal; interrupt after decrypt commit before ack. Restart and check exactly one logical message with no lost session.
- Changed identity must fail closed. Tampered ciphertext, replayed IDs, ID/body mismatch, oversized response, invalid MIME and expired payload must not render.
- Kill the process while viewing; reopen within/after the persisted opening limit. Change wall clock, reboot and restore old data to document honest-client deletion limits.
- Inspect `files`, `cache`, `no_backup`, MediaStore, notifications, logs and backup/transfer output for synthetic plaintext canaries. Validate there are no exported providers or unrestricted media URIs.
- Try trusted and untrusted keyboards, TalkBack, touch assistance, overlay windows, picture-in-picture from another app and accessibility semantic extraction. Document usability failures honestly.
- Test 5 MiB attachments and near-capacity state on a low-memory device; failed writes must not create new identities. Verify key loss produces an error and never silently resets trust.
