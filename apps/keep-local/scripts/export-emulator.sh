#!/usr/bin/env bash
set -euo pipefail
artifact="${1:?artifact directory}"
evidence="apps/keep-local/evidence"
mkdir -p "$evidence"
trap 'timeout 10s adb logcat -d > "$evidence/export-logcat.txt" || true; timeout 10s adb shell uiautomator dump /data/local/tmp/window.xml >/dev/null 2>&1 && timeout 10s adb pull /data/local/tmp/window.xml "$evidence/window.xml" >/dev/null 2>&1 || true; timeout 10s adb exec-out screencap -p > "$evidence/screen.png" || true' EXIT
# Never run against a physical phone; package removal below is for disposable fixtures.
test "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" = 1
adb shell screenrecord --size 320x480 --bit-rate 500000 --time-limit 2 /data/local/tmp/cad-test.mp4
adb pull /data/local/tmp/cad-test.mp4 "$evidence/cad-test.mp4"
python3 apps/keep-local/scripts/seed-export-fixture.py
seed() {
  adb shell am force-stop com.keep.local
  adb shell run-as com.keep.local mkdir -p files/media databases
  adb shell "run-as com.keep.local sh -c 'cat > files/media/cad-test.mp4'" < "$evidence/cad-test.mp4"
  adb shell "run-as com.keep.local sh -c 'cat > databases/memories.db'" < "$evidence/fixture-memories.db"
}
check_original() {
  adb exec-out run-as com.keep.local cat files/media/cad-test.mp4 > "$evidence/readback.mp4"
  cmp "$evidence/cad-test.mp4" "$evidence/readback.mp4"
}
adb install "$artifact/original.apk"
seed
# Demonstrate the real release blocker rather than claiming fixture signing is compatible.
if adb install -r "$artifact/update-fixture.apk" > "$evidence/real-upgrade-rejected.txt" 2>&1; then
  echo 'Unexpected acceptance of mismatched certificate'; exit 1
fi
grep -q INSTALL_FAILED_UPDATE_INCOMPATIBLE "$evidence/real-upgrade-rejected.txt"
check_original
printf '%s\n' 'VERIFIED: incompatible upgrade is rejected; original recording remains intact.' | tee "$evidence/real-upgrade-status.txt"
# Clean this disposable emulator, then test database/media continuity with same-key fixtures.
adb uninstall com.keep.local
adb install "$artifact/baseline-fixture.apk"
seed
adb shell am start -W -n com.keep.local/.MainActivity
adb shell am force-stop com.keep.local
adb install -r "$artifact/update-fixture.apk" | tee "$evidence/fixture-upgrade.txt"
check_original
adb install "$artifact/tests-fixture.apk"
adb shell am instrument -w com.keep.local.test/androidx.test.runner.AndroidJUnitRunner | tee "$evidence/export-tests.txt"
if ! grep -Eq '^OK \([1-9][0-9]* tests?\)' "$evidence/export-tests.txt"; then
  adb logcat -d -s AndroidRuntime:E KeepLocalReceiver:V | tail -150
  exit 1
fi
adb shell am force-stop com.keep.local
adb shell am start -W -n com.keep.local/.MainActivity | tee "$evidence/restart.txt"
check_original
adb exec-out run-as com.keep.local cat databases/memories.db > "$evidence/after-memories.db"
adb shell dumpsys meminfo com.keep.local > "$evidence/export-meminfo.txt"
printf '%s\n' 'PASS: seeded v1 media survived same-fixture-key upgrade, tests and process restart.' 'This does NOT verify an upgrade of the previously delivered signing identity.' | tee "$evidence/fixture-continuity.txt"
