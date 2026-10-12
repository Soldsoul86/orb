# Release 0.1 acceptance — physical 4 GB device required

Do not say "working on a ₹15,000 device" merely because Gradle compiles. Test on at least two actual retail 4 GB RAM Android phones, including Android 14+ (projection consent and foreground service rules).

## Gates

1. **Build/installation:** release and debug build, clean install, launch, rotate, force stop, reopen; no crashes and no Play policy issues at target SDK 36.
2. **Share:** share a URL from Instagram, 5 MB photo, 50 MB MP4, audio clip, PDF; all copies remain searchable by title/note. Ten consecutive shares with app not already open. No duplicate created on configuration recreation.
3. **Video:** authorize each session; record a 10-minute 720p Reel with visible on-screen text; stop via notification; verify playable MP4, stored size, OCR text markers, reopen. Verify denied consent, protected/black content, screen rotation, incoming call, low storage and interrupted service don't crash or falsely report success.
4. **Voice:** deny and grant mic permissions; record at 1, 10, 60 minutes; stop via notification; verify playable, filename searchable, never confuse microphone with app playback audio.
5. **Retrieval:** insert 10,000 mixed metadata rows (bench seed script or instrumentation). Search frequent and rare words, Unicode, punctuation/quotes and long text. FTS insert/edit/delete must have zero stale results. Measure p50/p95 latency from keystroke to rendered results. First target p95 under 300 ms, adjust based on measurements (not claimed reached).
6. **Performance:** use `adb shell dumpsys meminfo com.keep.local` during idle, screen capture, OCR and playback; measure peak PSS and thermal/foreground CPU. First target peak app PSS under 250 MB outside hardware encoder; tune after actual measurement. No ANR; OCR never causes capture frame drops. This is a hypothesis, not an observed result.
7. **Offline:** start airplane mode; capture, save, OCR, query, watch and delete with no network. *Dictate* may explicitly say unsupported if the required device offline recognizer is missing; never attempt cloud fallback.
8. **Privacy/security:** verify manifest has no INTERNET or broad storage permission, backups off. Test read-only content provider URI cannot escape private `media/` and cannot write. Test deleting an entry removes the file and its index. Review recording-notification visibility.
9. **Reliability:** repeated start/stop (20x), permission cancellation (10x), low-space (3x), process kill during OCR, reboot with queue pending; no orphan files older than 24h after next launch.
10. **Evidence:** report device model, retail price (if relevant), Android version, RAM, screen recording duration, size, PSS, p95 search, failures with logcat excerpt, and build hash. Record PASS/FAIL/NOT TESTED for every gate.

## Automated checks available in source artifact

`./core-tests/run.sh` exercises pure deterministic indexing utilities. `python3 core-tests/db_contract.py` executes the real SQLite schema definitions from `MemoryDb.kt` in a local SQLite engine and validates index updates and permission boundaries. Neither tests Android screen recording or a 4 GB phone.

## Current build evidence

A debug APK now builds, has a verified signature, and installs on API 29/36
emulators. The note capture/save/reopen/retrieve instrumentation passes on both.
See VERIFICATION.txt for the exact tested commit, APK hash and CI run. The
physical-device gates above remain outstanding; emulator results are not phone
compatibility or Play Protect approval.
