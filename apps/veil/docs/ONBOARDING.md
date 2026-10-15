# Setup simplification — 0.1.2-dev

## Feedback

The user reports trying Veil on two phones and that it is working, with setup feeling cumbersome. This is a useful user-reported two-phone check. It does not specify device models, Android versions, text/photo/video coverage, capture attempts or optical watermark results; the individual A–J acceptance cases are not all marked PASS from this report.

## Behavior

New installations now offer **Get started**, using the existing hosted relay automatically. A different HTTPS relay remains available under **Use another server**. No network request is made until the user taps Get started. Existing vaults continue using their stored relay and identity.

Pairing has two labeled steps, **Send yours** and **Add theirs**. **Share my invitation** generates the existing invitation and opens Android's share chooser in one action. The user still chooses the recipient and app. Both people must share before importing; the text says this explicitly. The app does not claim the invitation was sent when the chooser opens, does not read the clipboard automatically, and still locks on leaving the app.

Identity comparison now shows one shared 60-digit number in twelve groups of five. Both people see the same number and must compare every group in person or over a trusted call before confirming. The app does not automatically verify identity, truncate the comparison, or send the number to the relay. Existing verified pairings are preserved. Under **Comparing with an older version?**, both original full SHA-256 identity codes remain available for cross-comparison with 0.1.1.

The number uses libsignal 0.105.0 `NumericFingerprintGenerator(5200).createFor(2, ...)`. Since Veil has no account name or phone number, each serialized public identity key also serves as that installation's stable identifier. Libsignal handles the fingerprint algorithm and symmetric display order. Public-key changes invalidate the controller's in-memory result cache. Generation runs in the existing serialized IO controller, not during Compose rendering. This is a display change using an established implementation, not a new encryption protocol.

Three shared JVM/Android native tests check symmetry, all 60 digits, stability after reloading key bytes, either identity changing, malformed inputs, and libsignal's published known-answer vector. Android CI also retains the four unlock/concealment regressions.

 Invitation format, Signal sessions, local vault format, deadlines and secure-window behavior are unchanged. This is an onboarding update, not a new pairing or cryptographic protocol.

## Installation and verification

Version code 3 / 0.1.2-dev. **In-place upgrade BLOCKED. Keep the working 0.1.1 installation; do not uninstall or clear app data.** The built 0.1.2 APK has a different signing certificate, so Android rejects it as an update. Although the storage format is unchanged, this is not sufficient for upgrade compatibility.

The 0.1.1 CI log explicitly reports `Path Validation Error: Path(s) specified in the action for caching do(es) not exist, hence no cache is being saved.` The intended `~/.android/debug.keystore` cache never saved the generated key. The 0.1.2 build also missed that cache. No original signing private key was found in the available workspace/artifacts; it cannot be reconstructed from the APK's public certificate. This corrects the earlier assumption that the signing identity was preserved.

- Delivered 0.1.1 certificate SHA-256: `bfc5d191b2daff5eef95b531c4775a0c4f2d6564eaf2ab110922253b7f2e43da`.
- Tested 0.1.2 certificate SHA-256: `b8846d4e3103d322b8bc4459bd85ca84aa016ff92e15141251bc84b50cbb37b5`.
- The tested 0.1.2 binary is for a fresh disposable test installation only; it is not delivered as a compatible replacement. Replacing a working installation would lose its local identity/messages and require both people to pair again. No reset or migration has been performed.

## Signing publication guard

The follow-up build change removes the ineffective signing-key cache. An optional repository Actions secret `VEIL_DEBUG_KEYSTORE_B64` supplies a preserved original Android debug keystore (alias `androiddebugkey`, standard debug passwords) to an explicit temporary path; Gradle uses that path for the app and test APKs. The temporary file is removed at job end. Never put a signing private key in the source tree, logs, chat or APK artifacts.

Without that secret, ordinary disposable debug builds/tests still run, but APK publication now checks the actual signer against the delivered 0.1.1 certificate and fails closed on mismatch. Supplying a newly generated key cannot solve the 0.1.1 update problem. If the original key exists in a separate operator backup, encode that keystore as base64 locally and add it privately under repository Settings → Secrets and variables → Actions → New repository secret. Re-run the workflow; the pinned certificate must match before an APK is uploaded. Do not weaken the pin to make CI green.

If the original key cannot be recovered, an update preserving the current installation is unavailable. A future separately signed distribution needs an explicitly planned new installation/migration, private durable signing-key custody and user acknowledgement of any data loss. This task does not perform that migration.

The existing unlock regression checks identify the Get started screen and still assert native cover removal, focus/background locking and repeated unlock. The tested app build passed 9 JVM tests, 7 Android 15 emulator tests, 13 relay tests (one Postgres-only test skipped), lint (0 errors, 27 warnings), v2 signature verification and downloaded checksums. Exact run links are in STATUS.md. Real on-device upgrade and the new identity UI on two physical phones remain NOT TESTED.

The signing follow-up CI run 38724685503 passed compilation/JVM/relay/lint, but its Android suite finished 6 PASS / 1 FAIL: the native reveal test did not obtain actual window focus within its setup deadline. The same test passed in the delivered binary's build. This intermittent failure is unresolved and was not disabled or reported as PASS. The fingerprint and unlock tests passed again. The publication guard therefore was not reached in this run; its runtime validation remains NOT TESTED.

The default relay remains a development service in Singapore; the free database expires November 14, 2026 and must be upgraded for continued use. See relay/HOSTING.md. Supplying a default address does not change those hosting limits.
