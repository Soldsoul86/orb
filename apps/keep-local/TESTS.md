# Verification

Run `python3 core-tests/db_contract.py`, then
`bash gradlew :app:testDebugUnitTest :app:lintDebug :app:assembleDebug`.
Run `bash gradlew :app:connectedDebugAndroidTest` on a device/emulator.
Instrumentation covers note creation, save, reopen, prefix retrieval, SQLite
edit/delete, bounded previews, packaged permissions and a traversal attempt.

The Share Export workflow passed 6 JVM tests and 8 instrumentation tests on
each of API 29/36. It uploads an unsigned APK and reports; release signing is
blocked by the missing original private key. Emulator checks do not prove
physical-phone recording or memory performance.
See docs/VERIFICATION.txt for executed results and docs/acceptance.md for
physical-device gates. Keep Play Protect enabled throughout installation tests.

Share/export adds JVM filename/streaming/error tests and Android tests using a
seeded v1 CAD Test MP4. `scripts/export-emulator.sh` runs only on emulators,
checks the original signing mismatch, then tests same-key fixture upgrades,
chooser grants to a separate test APK, Gallery copies, Files export, cancellation,
provider access boundaries and large-file streaming. CI's fixture certificate
is never evidence of compatibility with the originally delivered APK.
See docs/SHARE_EXPORT.txt for current limitations and key requirements.
