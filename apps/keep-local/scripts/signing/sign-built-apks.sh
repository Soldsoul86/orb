#!/usr/bin/env bash
set -euo pipefail
mkdir -p delivery signed-fixtures evidence signing/responses
javac -cp "$ANDROID_HOME/build-tools/35.0.0/lib/apksigner.jar" -d "$RUNNER_TEMP/sign-classes" scripts/signing/DetachedSigner.java
echo '595b837ac277ced67ea7ec1b6c74875558fb7892718f20d5c99c2069ba5d3325  compiled/delivery/Keep-Local-0.4.1-unsigned.apk' | sha256sum -c -
pending=0
for name in app tests; do
  if [ "$name" = app ]; then
    input=compiled/delivery/Keep-Local-0.4.1-unsigned.apk
    output=delivery/Keep-Local-0.4.1.apk
  else
    input=fixtures/tests.apk
    output=signed-fixtures/tests.apk
  fi
  echo "Signing input: $name"
  sha256sum "$input"
  if java -cp "$RUNNER_TEMP/sign-classes:$ANDROID_HOME/build-tools/35.0.0/lib/apksigner.jar" DetachedSigner "$input" "$output" signing/app-certificate.pem signing/responses > "evidence/$name-signing.txt" 2>&1; then
    "$ANDROID_HOME/build-tools/35.0.0/apksigner" verify --verbose --print-certs "$output" | tee "evidence/$name-certificate.txt"
    grep -F "$(cat signing/expected-certificate.sha256)" "evidence/$name-certificate.txt"
  else
    cat "evidence/$name-signing.txt"
    rm -f "$output"
    pending=1
  fi
done
test "$pending" = 0
cp delivery/Keep-Local-0.4.1.apk signed-fixtures/app.apk
cp previous/Keep-Local-0.4.0.apk signed-fixtures/baseline.apk
echo '86b01e6cf1655b535c6d74ec890ab78c7738b03edfcacf21874c71ba10bacce9  signed-fixtures/baseline.apk' | sha256sum -c -
"$ANDROID_HOME/build-tools/35.0.0/apksigner" verify --print-certs signed-fixtures/baseline.apk | tee evidence/baseline-certificate.txt
grep -F "$(cat signing/expected-certificate.sha256)" evidence/baseline-certificate.txt
apkanalyzer manifest print delivery/Keep-Local-0.4.1.apk > evidence/manifest.xml
python3 scripts/check_packaged_manifest.py evidence/manifest.xml
sha256sum delivery/Keep-Local-0.4.1.apk | tee delivery/SHA256SUMS.txt
printf '%s\n' 'Install Keep-Local-0.4.1.apk over Keep Local 0.4.0 (com.keep.local.next). Do not uninstall or clear app data.' 'Settings: Start / resume indexing continues saved checkpoints; no Rescan or index reset is necessary.' 'Basic search is available while deep processing continues. Unsupported audio is explicitly reported.' 'Copy indexing diagnostics for counts and worker status without filenames or excerpts.' 'Existing recordings, UUIDs, source permissions, model packs and review decisions are preserved.' 'Physical-phone acceptance remains to be performed; see source docs/INDEXING_PHONE_CHECKS.txt.' 'No physical-device or Play Protect approval is claimed. Never disable security protections.' > delivery/INSTALL.txt
