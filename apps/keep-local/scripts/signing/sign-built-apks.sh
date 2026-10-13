#!/usr/bin/env bash
set -euo pipefail
mkdir -p delivery signed-fixtures evidence signing/responses
javac -cp "$ANDROID_HOME/build-tools/35.0.0/lib/apksigner.jar" -d "$RUNNER_TEMP/sign-classes" scripts/signing/DetachedSigner.java
echo '8b17d114c8407824beefb624a9b268986db2a8d146d07d900e1ef24225e2e5f2  compiled/delivery/Keep-Local-0.3.0-unsigned.apk' | sha256sum -c -
pending=0
for name in app tests; do
  if [ "$name" = app ]; then
    input=compiled/delivery/Keep-Local-0.3.0-unsigned.apk
    output=delivery/Keep-Local-0.3.0.apk
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
cp delivery/Keep-Local-0.3.0.apk signed-fixtures/app.apk
cp previous/Keep-Local-Next-0.2.0.apk signed-fixtures/baseline.apk
echo 'b084edca59a156bc9f98ccc1ced38de45c0c1637c143b3eb82b75a5745c09f07  signed-fixtures/baseline.apk' | sha256sum -c -
sha256sum delivery/Keep-Local-0.3.0.apk | tee delivery/SHA256SUMS.txt
printf '%s\n' 'Install this update over Keep Local Next (com.keep.local.next). No uninstall needed.' 'The older separate com.keep.local app is not updated; keep it installed.' 'For visual retrieval, install visual-model-pack.zip from Visual memory, then opt in to indexing.' 'Core text search and exports work without the model. Visual suggestions are not proof of an action or identity.' > delivery/INSTALL.txt
