#!/usr/bin/env bash
set -euo pipefail
artifact="${1:?artifact}"
evidence=apps/keep-local/evidence
mkdir -p "$evidence"
trap 'timeout 10s adb logcat -d > "$evidence/logcat.txt" || true; timeout 10s adb exec-out screencap -p > "$evidence/screen.png" || true' EXIT
test "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" = 1
adb install "$artifact/baseline.apk"
unzip -p "$artifact/tests.apk" assets/m0.mp4 > "$evidence/cad-test.mp4"
python3 apps/keep-local/scripts/seed-export-fixture.py
adb shell run-as com.keep.local.next mkdir -p databases files/media
adb shell "run-as com.keep.local.next sh -c 'cat > files/media/cad-test.mp4'" < "$evidence/cad-test.mp4"
adb shell "run-as com.keep.local.next sh -c 'cat > databases/memories.db'" < "$evidence/fixture-memories.db"
# Seed installed model bytes before upgrade, verify every file survives unchanged.
mkdir -p /tmp/kl-model
unzip -q model-pack/visual-model-pack.zip -d /tmp/kl-model
printf '%s' clip-vit-b32-int8-v1 > /tmp/kl-model/installed
adb push /tmp/kl-model /data/local/tmp/kl-model
adb shell run-as com.keep.local.next mkdir -p files/models/clip-vit-b32-int8-v1
for f in vision.onnx text.onnx vocab.json merges.txt installed; do
  adb shell "cat /data/local/tmp/kl-model/$f | run-as com.keep.local.next sh -c 'cat > files/models/clip-vit-b32-int8-v1/$f'"
done
adb shell "run-as com.keep.local.next sh -c 'sha256sum files/models/clip-vit-b32-int8-v1/*'" > "$evidence/models-before.txt"
adb install -r "$artifact/app.apk" | tee "$evidence/upgrade.txt"
adb shell "run-as com.keep.local.next sh -c 'sha256sum files/models/clip-vit-b32-int8-v1/*'" > "$evidence/models-after.txt"
cmp "$evidence/models-before.txt" "$evidence/models-after.txt"
adb install "$artifact/tests.apk"
mkdir -p "$evidence/document-originals"
printf 'Manufacturer warranty\nWarranty expires 2028-06-30\nKeep this document for your records.\n' > "$evidence/document-originals/warranty.txt"
printf 'Purchase receipt\nInvoice date 2026-09-17\nTotal INR 1250.00\n' > "$evidence/document-originals/receipt.txt"
printf 'A quiet afternoon with blue skies. No special plans.\n' > "$evidence/document-originals/negative.txt"
adb shell mkdir -p /sdcard/Documents/KeepLocalFixtures
adb push "$evidence/document-originals/." /sdcard/Documents/KeepLocalFixtures/

adb shell cmd connectivity airplane-mode enable || true
adb shell svc wifi disable
adb shell svc data disable
adb shell settings get global airplane_mode_on | tee "$evidence/airplane-mode.txt"
timeout 180s adb shell am instrument -w -e class com.keep.local.next.IndexRestartTest -e restart_phase before com.keep.local.next.test/androidx.test.runner.AndroidJUnitRunner | tee "$evidence/restart-before.txt"
grep -F 'OK (1 test)' "$evidence/restart-before.txt"
adb shell am force-stop com.keep.local.next
adb shell am start -W -n com.keep.local.next/.MainActivity
timeout 180s adb shell am instrument -w -e class com.keep.local.next.IndexRestartTest -e restart_phase after com.keep.local.next.test/androidx.test.runner.AndroidJUnitRunner | tee "$evidence/restart-after.txt"
grep -F 'OK (1 test)' "$evidence/restart-after.txt"
timeout 300s adb shell am instrument -w -e class com.keep.local.next.AuthorizedLibraryTest,com.keep.local.next.DocumentParserTest com.keep.local.next.test/androidx.test.runner.AndroidJUnitRunner | tee "$evidence/library-tests.txt"
grep -F 'OK (5 tests)' "$evidence/library-tests.txt"
timeout 900s adb shell am instrument -w -e notClass com.keep.local.next.IndexRestartTest,com.keep.local.next.AuthorizedLibraryTest,com.keep.local.next.DocumentParserTest com.keep.local.next.test/androidx.test.runner.AndroidJUnitRunner | tee "$evidence/tests.txt"
grep -Eq '^OK \([1-9][0-9]* tests?\)' "$evidence/tests.txt"
adb shell am force-stop com.keep.local.next
adb shell am start -W -n com.keep.local.next/.MainActivity
adb exec-out run-as com.keep.local.next cat files/media/cad-test.mp4 > "$evidence/readback.mp4"
cmp "$evidence/readback.mp4" "$evidence/cad-test.mp4"
adb exec-out run-as com.keep.local.next cat files/visual-benchmark.json > "$evidence/visual-benchmark.json"
adb exec-out run-as com.keep.local.next cat files/creative-demo.png > "$evidence/creative-demo.png"
cat "$evidence/visual-benchmark.json"
adb shell dumpsys meminfo com.keep.local.next > "$evidence/meminfo.txt"
adb pull /sdcard/Documents/KeepLocalFixtures "$evidence/documents-after"
diff -r "$evidence/document-originals" "$evidence/documents-after"
echo 'PASS: same-package upgrade, v1 migration, original retention, offline visual retrieval and export suite.'
