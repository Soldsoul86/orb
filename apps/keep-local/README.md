# Keep Local

Remember what matters. Recognize when it matters. Prepare what helps.

Native Kotlin, Android 10+. Flagship-first and adaptive; there is no entry-level
phone or 4 GB product constraint. All core memory functions are local. No
INTERNET, broad storage, analytics or cloud AI permission/capability is added.

Version **0.4.1** is the Phase A indexing-stability release. There is one Keep Local
application. The package remains `com.keep.local.next`, with the retained signing
certificate; install over the delivered 0.4.0 APK without uninstalling or clearing
its data. Existing recordings, model packs, permissions and review decisions stay.

Discovery, document extraction and visual processing now take turns. Resume keeps
saved scan cursors. Successful work continues without failure-retry backoff; corrupt
files have bounded retries. Settings separates basic-searchable metadata, deep work,
partial video checkpoints, completed assets and failures. **Copy indexing diagnostics**
contains counts and worker status, without filenames or private excerpts. Date searches
accept YYYY-MM-DD (UTC / recorded date where EXIF has no timezone).

For the existing paused phone library, tap **Start / resume indexing** once. Do not
reset the index to make counters change. Search already discovered filenames while
deep work continues. Physical acceptance remains required before advancing to new
personal-intelligence features. See `docs/INDEXING_AUDIT.txt`,
`docs/INDEXING_RESULTS.txt` and `docs/INDEXING_PHONE_CHECKS.txt`.

Open **Settings → Choose what Keep Local can remember**. Authorize individual
media categories and/or a document folder, then **Start / resume indexing**.
Originals remain in their source locations. Review suggested document clues,
capture-time groups and similar visual material in **Worth Reviewing**. Keep,
Correct and Dismiss are stored locally, separately from original evidence.

The existing ~148 MiB local CLIP model pack remains optional and is preserved
on upgrade. Install it through **Settings → Models and visual index** if absent.
Without it, notes, imports, text/document extraction, literal document suggestions,
metadata grouping, playback, text search and sharing work locally. Visual search
and visual-similarity suggestions require the pack. No extra model was introduced.

See `docs/DISCOVERY_04.txt` for implementation limits and acceptance evidence,
and `docs/MODELS_AND_LICENSES.txt` for model/runtime choices and licenses.
Historical reports describe their corresponding versions only.

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
actual image pixels and sampled frames; it does not certify actions. PDFs use bounded local Latin OCR (first 20 pages); UTF-8 text and DOCX
text are supported. Other office formats and encrypted PDFs are unsupported.

## Build and verification

Use JDK 17, SDK platform 36, build-tools 35.0.0 and the checked Gradle wrapper.
The app compiles unsigned by default. Use the retained signing key or the public
detached-signature workflow in `docs/SIGNING.txt` to produce an upgradeable APK.
Never replace the signing identity or uninstall an app to fix a mismatch.

`keep-local-compile.yml` prepares pinned models/test fixtures and runs Gradle
assembly, JVM tests and lint. `keep-local-android.yml` signs exact compiled
artifacts and tests an in-place update against the delivered 0.4.0 APK on API29
and API36. Model fixtures and unsigned/test APKs are not phone releases.

The app never requires disabling Play Protect. Emulator installation does not
establish physical-device compatibility or Play Protect approval. See
`docs/INDEXING_RESULTS.txt` for release evidence and remaining gates.
