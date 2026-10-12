# Keep Local engineering build — 2026-10-12

Source: user-provided `keep-local-android-mvp.zip`. Repository review:
https://github.com/Soldsoul86/orb/pull/1

## Changes

- Corrected SQLite FTS4 prefix syntax. The original `"dead"*` failed to match
  `deadline`; `"dead*"` matches. Added desktop SQLite and Android regressions.
- Query result previews now load up to 240 characters per text field; detail
  screens still load full originals. This bounds list memory without changing
  search coverage or stored text.
- Recorder instances are owned before configuration, so failure during setup
  releases them. Failed database saves remove partial/final media, while an OCR
  scheduling failure no longer deletes a successfully saved import.
- Guarded the microphone foreground-service type on Android 10, handle recorder
  error callbacks, and limit screen file size to available space minus a reserve.
- Explicitly exclude every supported backup domain from both Android 12+ cloud
  backup and device transfer; keep legacy backups disabled as well.
- Removed delayed UI callbacks on activity teardown, guarded async callbacks,
  preserved editor text across recreation with stable view IDs, handled service
  launch failures, and paused playback when leaving its activity.
- Applied window insets for modern Android. Notification permission is requested
  during recording rather than blocking a first note capture.
- Enforced network-permission removal during manifest merging. CI checks the
  packaged permission allowlist, backup flag, SDK levels, and APK signature.
- Added Android instrumentation for the first note flow, FTS updates/deletes,
  bounded previews, installed permissions and path traversal rejection.
- Added GitHub Actions with JDK 17, Gradle 8.13 (distribution checksum), AGP 8.13.2,
  Kotlin 2.2.21, SDK 36 and build tools 35.0.0. Emulator jobs install the exact
  published app and test APKs. No new AI feature was added.

## Verification scope

The debug APK builds, passes signature checks and installs on API 29/36 emulators.
All 3 JVM tests and 3 Android tests per emulator pass. Lint has 0 errors and 29
non-blocking warnings. See VERIFICATION.txt for the CI run, hashes and measurements.
Desktop checks do not prove Android behavior; emulator results do not prove a
retail 4 GB phone. The first phone procedure is in PHONE_TEST.txt.

| Feature | Current verification boundary |
|---|---|
| Note capture/save/reopen/prefix retrieval | VERIFIED on API 29/36 emulators |
| Search edit/delete and bounded previews | VERIFIED in desktop SQLite and API 29/36 Android tests |
| Permission allowlist, no Internet permission, backup flag | VERIFIED packaged APK and backup-rule configuration checks |
| Import/share of photos/files/audio/video | Compiled; device flow unverified |
| Voice and consent-based screen recording | Compiled and statically audited; runtime unverified |
| Recording stop/revoke/rotation/low-storage behavior | Physical-device tests outstanding |
| Playback, Latin OCR, video OCR markers | Compiled; end-to-end behavior unverified |
| Optional on-device dictation | Compiled; needs a supported installed OS recognizer |
| Audio transcription, PDF content indexing, direct camera capture | Incomplete/not implemented |
| Phone installation, Play Protect, 4 GB RAM performance | Unverified; no physical phone attached |

## Limits and blockers

CI debug keys are ephemeral. Cross-run updates may fail with a signing mismatch;
do not uninstall important memories to resolve this. Persistent signing and
export are release tasks. Builds are repeatable from versioned sources, but
byte-identical reproducibility is not claimed (runner images/actions/signing vary).

The existing Orb `verify` workflow fails its **Hard exit demonstration** with
`TypeError: event.risk.measured.toFixed is not a function`. The same failure was
observed on the unchanged base commit `189e1d8ee348399fd3703a50ce88d7d4f759ed20`
(run 38255662912); its lint, build and tests passed. This is independent of the
Keep Local Android workflow and was not changed in this task.

No Play Protect bypass is required or recommended. A valid APK signature proves
integrity, not Play Protect approval. No claim is made about physical-device
compatibility, peak recording/OCR memory, thermal behavior or battery life.
