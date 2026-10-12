#!/usr/bin/env bash
set -euo pipefail
artifact="${1:?Pass the downloaded APK artifact directory}"
evidence="apps/keep-local/evidence"
mkdir -p "$evidence"
# Install the exact APKs published by the build job, without rebuilding/signing.
adb install -r "$artifact/app/build/outputs/apk/debug/app-debug.apk"
adb install -r "$artifact/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk"
adb shell am instrument -w com.keep.local.test/androidx.test.runner.AndroidJUnitRunner | tee "$evidence/instrumentation.txt"
# am instrument may exit 0 even when tests fail; require the runner's success line.
grep -Eq '^OK \([1-9][0-9]* tests?\)' "$evidence/instrumentation.txt"
adb shell am start -W -n com.keep.local/.MainActivity | tee "$evidence/launch.txt"
adb shell dumpsys meminfo com.keep.local > "$evidence/emulator-meminfo.txt"
