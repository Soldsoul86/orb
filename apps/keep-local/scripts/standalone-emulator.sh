#!/usr/bin/env bash
set -euo pipefail
artifact="${1:?artifact directory}"
evidence=apps/keep-local/evidence
mkdir -p "$evidence"
trap 'timeout 10s adb logcat -d > "$evidence/standalone-logcat.txt" || true; timeout 10s adb shell uiautomator dump /data/local/tmp/window.xml >/dev/null 2>&1 && timeout 10s adb pull /data/local/tmp/window.xml "$evidence/window.xml" >/dev/null 2>&1 || true; timeout 10s adb exec-out screencap -p > "$evidence/screen.png" || true' EXIT
test "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" = 1
adb shell screenrecord --size 320x480 --bit-rate 500000 --time-limit 2 /data/local/tmp/cad-test.mp4
adb pull /data/local/tmp/cad-test.mp4 "$evidence/cad-test.mp4"
python3 apps/keep-local/scripts/seed-export-fixture.py
seed() {
  package="$1"
  adb shell am force-stop "$package"
  adb shell run-as "$package" mkdir -p files/media databases
  adb shell "run-as $package sh -c 'cat > files/media/cad-test.mp4'" < "$evidence/cad-test.mp4"
  adb shell "run-as $package sh -c 'cat > databases/memories.db'" < "$evidence/fixture-memories.db"
}
check_media() {
  adb exec-out run-as "$1" cat files/media/cad-test.mp4 > "$evidence/readback.mp4"
  cmp "$evidence/cad-test.mp4" "$evidence/readback.mp4"
}
adb install "$artifact/original.apk"
seed com.keep.local
adb install "$artifact/app.apk" | tee "$evidence/side-by-side-install.txt"
check_media com.keep.local
adb shell am start -W -n com.keep.local.next/.MainActivity
seed com.keep.local.next
adb install "$artifact/tests.apk"
timeout 240s adb shell am instrument -w com.keep.local.next.test/androidx.test.runner.AndroidJUnitRunner | tee "$evidence/standalone-tests.txt"
grep -Eq '^OK \([1-9][0-9]* tests?\)' "$evidence/standalone-tests.txt"
adb shell am force-stop com.keep.local.next
adb install -r "$artifact/app.apk" | tee "$evidence/same-key-reinstall.txt"
adb shell am start -W -n com.keep.local.next/.MainActivity | tee "$evidence/restart.txt"
check_media com.keep.local.next
check_media com.keep.local
adb shell pm path com.keep.local
adb shell pm path com.keep.local.next
printf '%s\n' 'PASS: both apps installed side by side; old and new recordings retained; export tests passed; same-key reinstall and restart passed.' | tee "$evidence/result.txt"
