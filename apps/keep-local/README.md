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

### Not implemented (deliberately NOT claimed)

- **Automatic transcription of saved audio or Instagram soundtrack.** Microphone recording is saved; playback and title/user-note search work. A separate *Dictate* button uses Android's **on-device** recognizer only if the phone already supports it, and saves *text only*. It does not upload or quietly switch to cloud dictation.
- Capturing other apps' protected content or direct playback audio. Android may block video/audio capture; microphone input is not the same as internal sound.
- Semantic visual scene understanding, automatic video summaries, or a locally packaged LLM. The "intelligence" in this first version is offline OCR, bounded extraction, and transparent keyword suggestions.
- Passive access to Instagram history, private WhatsApp content, or all notifications. There is no stealth/background capture; sharing or screen recording is user-initiated.
- Optional encrypted backup/export/sync, multi-language OCR models, or device-specific transcoding fallback. An imported PDF can be played/opened by a viewer but isn't yet indexed internally beyond title and user note.

## Command-line build (Android Studio optional)

Use JDK 17, Android SDK platform 36, build-tools 35.0.0 and platform-tools.
Set `JAVA_HOME` and `ANDROID_HOME` to those installations, then:

```bash
sdkmanager 'platforms;android-36' 'build-tools;35.0.0' 'platform-tools'
bash gradlew --no-daemon :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

`gradlew` bootstraps SHA-256-checked Gradle 8.13. The Kotlin plugin is 2.2.21
and Android Gradle Plugin is 8.13.2. Build dependencies require network access;
core app functionality does not. `GRADLE_USER_HOME` is supported.

In `Soldsoul86/orb`, this standalone product lives in `apps/keep-local`.
The root `.github/workflows/keep-local-android.yml` builds a signed debug APK,
checks its actual merged permissions, uploads the APK and reports, and runs
instrumentation on API 29 and 36 emulators. Workflow source is also included
in this standalone archive; in Orb only the root copy runs.

CI debug keys are ephemeral: APKs from different runs may have different signing
certificates. Do not uninstall an app containing important memories to resolve a
signature mismatch: uninstall deletes its local data. Stable update signing is
still a release task. Debug signing is not Play Protect approval, and no part of
this workflow requires disabling Play Protect. Repeatable build instructions do
not establish byte-identical APK reproducibility; CI images/actions and debug
keys may change.

```bash
python3 core-tests/db_contract.py  # desktop SQLite + source manifest
bash gradlew :app:testDebugUnitTest
bash gradlew :app:connectedDebugAndroidTest  # needs an emulator/device
```

## Quick walkthrough

1. **Save a Reel**: in Instagram tap Android Share → Keep Local to save its link, **or** use the Quick Settings tile → authorize a screen recording → stop using the persistent notification. Open Keep Local; the captured `.mp4` is saved in private storage and OCR processes text from sampled frames. Screen recording doesn't implicitly capture internal app sound.
2. **Save voice**: tap `Voice`; speak; tap `Stop voice` or notification action. Rename and annotate the saved recording to make it retrievable. Voice clips have no automatic transcripts in this release.
3. **Find it**: search a saved title, note, shared link, or text detected in image/video. Tap result, tap **Play from matching moment** if there is a matching timestamp; otherwise tap **Play recording**.

See `docs/acceptance.md` and `docs/architecture.md` for test gates, data contract and failure cases.

### Share/export release status

The 0.2.0 source adds Share, Save to Gallery and Save to Files to saved media.
**The phone update is blocked:** the original 0.1.0 CI signing key was not
preserved and no backup is available. Do not uninstall the existing app.
An unsigned build or disposable emulator test APK cannot update it.
See `docs/SHARE_EXPORT.txt` for verification and the read-only USB recovery tool.
