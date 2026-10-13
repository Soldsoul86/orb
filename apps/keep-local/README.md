# Keep Local — Your creative memory.

Find the right material for your next creation, wherever you choose to make it.

Native Kotlin, Android 10+. Flagship-first and adaptive; there is no entry-level
phone or 4 GB product constraint. All core memory functions are local. No
INTERNET, broad storage, analytics or cloud AI permission/capability is added.

Version 0.3.0 implements the Creative Memory foundation and a first offline
visual-search slice. It retains application ID `com.keep.local.next` and the
recovered signing identity of Keep Local Next 0.2.0. Keep the separate original
`com.keep.local` installation intact; its signing key remains unavailable.

Install the APK over Next, then choose **Visual memory → Install local model
pack** and select `visual-model-pack.zip` from local Files. The ~148 MiB model
pack is optional: notes, imports, OCR, text search, playback and sharing already
work without it. Tap **Index / resume my library** to opt in. Search descriptions
in the main search field; visual matches explain their source and approximate
video-frame timestamp. No filename/tag vocabulary or example query is hardcoded.

See `docs/CREATIVE_MEMORY.txt` for verified scope and limitations,
`docs/MODELS_AND_LICENSES.txt` for model choices and licenses, and the final
verification report for measured results. Historical 0.1/0.2 reports describe
those versions only. Physical flagship benchmarks, robust temporal action
recognition, saved-audio transcription and creative collections remain pending.

## Preserved capabilities (historical verification in docs/VERIFICATION.txt)

| Flow | Capability |
|---|---|
| **Capture** | New note, Android Share target (text/links/images/video/audio/files), multi-file import via system file picker, voice recording (.m4a), consent-based screen recording (.mp4), optional microphone alongside video |
| **Fast shortcut** | User-addable Quick Settings tile opening Android screen-capture consent |
| **Remember** | App-private copies, original text separated from extracted text, local Latin-script OCR for images and 12 small sampled video frames, time markers, simple transparent suggestion rules, pinning, editing notes |
| **Retrieve** | SQLite FTS4 full-text search with prefix matching, type filters, video/audio player, jump to matching sampled-video OCR timestamp, delete original and index |
| **Resource discipline** | Native Activity UI; no WebView or running LLM; hardware H.264 24fps up to 1280×720 at 1.6Mbps; 30-minute/1 GiB screen cap; 1-hour microphone cap; imported files read in 64 KiB chunks; OCR jobs outside the UI thread; bounded 12-frame OCR |
| **Privacy** | No `INTERNET` permission or cloud processing; no telemetry, analytics, account, or backup; explicit user action for all media and optional mic permission |

## Current limits

Saved-audio transcription, temporal action recognition, identities, collections,
trimming and semantic document search are not included yet. Visual search ranks
actual image pixels and sampled frames; it does not certify actions. Existing
PDF imports are searchable by title/context but not automatically parsed.

## Build and verification

Use JDK 17, SDK platform 36, build-tools 35.0.0 and the checked Gradle wrapper.
The app compiles unsigned by default. Use the retained signing key or the public
detached-signature workflow in `docs/SIGNING.txt` to produce an upgradeable APK.
Never replace the signing identity or uninstall an app to fix a mismatch.

`keep-local-compile.yml` prepares pinned models/test fixtures and runs Gradle
assembly, JVM tests and lint. `keep-local-android.yml` signs exact compiled
artifacts and tests an in-place update against the delivered 0.2.0 APK on API29
and API36. Model fixtures and unsigned/test APKs are not phone releases.

The app never requires disabling Play Protect. Emulator installation does not
establish physical-device compatibility or Play Protect approval. See
`docs/CREATIVE_RESULTS.txt` for evidence and remaining gates.
