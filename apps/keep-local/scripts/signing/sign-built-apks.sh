#!/usr/bin/env bash
set -euo pipefail
mkdir -p delivery signed-fixtures evidence signing/responses
javac -cp "$ANDROID_HOME/build-tools/35.0.0/lib/apksigner.jar" -d "$RUNNER_TEMP/sign-classes" scripts/signing/DetachedSigner.java
echo '5032860db4780c1e680af1bc6bd3e9eb1f2528a351ca49074dd91589d0bc0b8f  compiled/delivery/Keep-Local-0.4.0-unsigned.apk' | sha256sum -c -
pending=0
for name in app tests; do
  if [ "$name" = app ]; then
    input=compiled/delivery/Keep-Local-0.4.0-unsigned.apk
    output=delivery/Keep-Local-0.4.0.apk
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
cp delivery/Keep-Local-0.4.0.apk signed-fixtures/app.apk
cp previous/Keep-Local-0.3.0.apk signed-fixtures/baseline.apk
echo '0a216042706e546794f9791e3be6ed6d3096d8587fee0f2f5e14e9116a83ff60  signed-fixtures/baseline.apk' | sha256sum -c -
"$ANDROID_HOME/build-tools/35.0.0/apksigner" verify --print-certs signed-fixtures/baseline.apk | tee evidence/baseline-certificate.txt
grep -F "$(cat signing/expected-certificate.sha256)" evidence/baseline-certificate.txt
apkanalyzer manifest print delivery/Keep-Local-0.4.0.apk > evidence/manifest.xml
python3 scripts/check_packaged_manifest.py evidence/manifest.xml
sha256sum delivery/Keep-Local-0.4.0.apk | tee delivery/SHA256SUMS.txt
printf '%s\n' 'Install Keep-Local-0.4.0.apk over Keep Local 0.3.0 / Next (com.keep.local.next). Do not uninstall.' 'The separate original com.keep.local app is not updated; keep it installed.' 'Settings: authorize photos/videos/audio or a document folder; then Start / resume indexing.' 'Worth Reviewing: inspect evidence, then Keep, Correct or Dismiss. All processing is local.' 'Existing model packs are preserved. Visual search/reuse suggestions require the optional CLIP pack.' 'No physical-device or Play Protect approval is claimed. Never disable security protections.' > delivery/INSTALL.txt
