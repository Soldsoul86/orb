#!/usr/bin/env bash
set -euo pipefail
# Runs ONLY on disposable CI machines. These keys are NEVER upgrade/release keys.
work="${RUNNER_TEMP:?CI runner required}/keep-local-test-signing"
mkdir -p "$work" evidence test-artifacts
keytool -genkeypair -keystore "$work/fixture.jks" -storepass android -keypass android -alias fixture -dname 'CN=DISPOSABLE EMULATOR FIXTURE ONLY' -keyalg RSA -validity 2 -noprompt
signer="$ANDROID_HOME/build-tools/35.0.0/apksigner"
original="previous/app/build/outputs/apk/debug/app-debug.apk"
echo 'e2b823fe7ee9d4f242b20d781c76b283060c0ff441fc2862a3f2adf7d36dfa2a  previous/app/build/outputs/apk/debug/app-debug.apk' | sha256sum -c -
"$signer" verify --print-certs "$original" | tee evidence/original-certificate.txt
grep -q '323de20c67ad49e07d67d623b527306a96c80ba4ad7bccf573093b85b95ee7c9' evidence/original-certificate.txt
cp "$original" test-artifacts/original.apk
unsigned=app/build/outputs/apk/debug/app-debug-unsigned.apk
# Explicitly re-sign test copies only; the unsigned deliverable is unchanged.
test_apk=$(find app/build/outputs/apk/androidTest/debug -name '*.apk' -print -quit)
for entry in "$original:baseline-fixture.apk" "$unsigned:update-fixture.apk" "$test_apk:tests-fixture.apk"; do
  source="${entry%:*}"
  target="${entry##*:}"
  "$signer" sign --ks "$work/fixture.jks" --ks-key-alias fixture --ks-pass pass:android --key-pass pass:android --out "test-artifacts/$target" "$source"
done
"$signer" verify --print-certs test-artifacts/update-fixture.apk > evidence/fixture-certificate-NOT-FOR-UPGRADE.txt
if grep -q '323de20c67ad49e07d67d623b527306a96c80ba4ad7bccf573093b85b95ee7c9' evidence/fixture-certificate-NOT-FOR-UPGRADE.txt; then exit 1; fi
if KEEP_LOCAL_KEYSTORE="$work/fixture.jks" KEEP_LOCAL_STORE_PASSWORD=android KEEP_LOCAL_KEY_ALIAS=fixture KEEP_LOCAL_KEY_PASSWORD=android bash gradlew --no-daemon help > evidence/wrong-signing-key-gate.txt 2>&1; then
  echo 'Wrong signing key was accepted'; exit 1
fi
grep -q 'RELEASE BLOCKED: signing certificate does not match' evidence/wrong-signing-key-gate.txt
rm "$work/fixture.jks"
printf '%s\n' 'RELEASE BLOCKED: original signing key is unavailable. Product APK is UNSIGNED.' 'Test APKs are disposable emulator fixtures, cannot update the delivered APK, and must not be installed on a phone containing recordings.' > evidence/RELEASE-BLOCKER.txt
cp evidence/RELEASE-BLOCKER.txt test-artifacts/DO-NOT-INSTALL-ON-YOUR-PHONE.txt
sha256sum "$unsigned" > evidence/UNSIGNED-APK-SHA256.txt
