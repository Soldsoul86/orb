# Codex task: device proof, not feature proliferation

Repository: this directory. Treat the code and tests as unverified Android source, not a functioning APK.

1. In a Mac with Android Studio/SDK 36, run `./gradlew :app:assembleDebug` and fix **all** compile/runtime/manifest errors while preserving offline-only and 4 GB RAM requirements. Do not add broad permissions or internet. Add meaningful Android instrumentation/UI tests.
2. Install on a real retail 4 GB Android device, preferably API 34/35/36 as well as one older Android. Execute `docs/acceptance.md`; capture logcat, meminfo, timings and evidence. Never label an untested gate as passed.
3. Test MediaProjection consent, foreground service microphone permission, recording stop on consent revoke, notification actions, portrait/full-app recording, camera/microphone privacy indicators, protected Instagram content limitations. A permission grant for one capture must never be reused silently.
4. Test Android Share flows (Instagram URL; image; MP4; voice file; PDF), OCR indexing (Latin), FTS update/delete, media playback and jump-to-timestamp. Preserve original user text separate from imperfect OCR.
5. Optimize first for capture stability on 4 GB RAM and 64 GB storage; then search latency. If speech recognition on the OS is unavailable, keep the saved voice file and show a clear limitation; never pretend a transcript exists or invoke a remote model.
6. Produce an installable debug APK, a build/test report with PASS/FAIL/NOT TESTED for each gate, and a minimal set of fixes. Do not enlarge scope with agents, cloud sync, vector databases, accounts, monetization or multi-platform UI until the core passes.
