# Verification

Run `python3 core-tests/db_contract.py`, then
`bash gradlew :app:testDebugUnitTest :app:lintDebug :app:assembleDebug`.
Run `bash gradlew :app:connectedDebugAndroidTest` on a device/emulator.
Instrumentation covers note creation, save, reopen, prefix retrieval, SQLite
edit/delete, bounded previews, packaged permissions and a traversal attempt.

The GitHub workflow uploads APKs and reports and tests API 29/36. Its passing
emulator checks would not prove physical-phone recording or memory performance.
See docs/VERIFICATION.txt for executed results and docs/acceptance.md for
physical-device gates. Keep Play Protect enabled throughout installation tests.
