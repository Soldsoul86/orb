#!/usr/bin/env bash
set -euo pipefail
work="${RUNNER_TEMP:?}/keep-local-next-signing"
mkdir -p "$work" delivery evidence encrypted-signing-backup test-artifacts
chmod 700 "$work"
trap 'rm -rf "$work"' EXIT
if [ -n "${KEEP_LOCAL_NEXT_KEYSTORE_BASE64:-}" ]; then
  printf '%s' "$KEEP_LOCAL_NEXT_KEYSTORE_BASE64" | base64 -d > "$work/keep-local-next.p12"
else
  test "${ALLOW_INITIAL_SIGNING:-false}" = true || { echo 'Signing backup must be restored to KEEP_LOCAL_NEXT_KEYSTORE_BASE64; refusing a replacement key.'; exit 1; }
  keytool -genkeypair -storetype PKCS12 -keystore "$work/keep-local-next.p12" -storepass android -keypass android -alias keep-local-next -dname 'CN=Keep Local Next' -keyalg RSA -keysize 3072 -validity 10000 -noprompt
fi
# Only the recipient PUBLIC certificate is committed. The private decryption key
# remains in the user's workspace, never in Git or an Actions artifact.
openssl cms -encrypt -binary -aes256 -in "$work/keep-local-next.p12" -outform DER -out encrypted-signing-backup/keep-local-next.p12.cms signing/recovery-certificate.pem
signer="$ANDROID_HOME/build-tools/35.0.0/apksigner"
"$signer" sign --ks "$work/keep-local-next.p12" --ks-key-alias keep-local-next --ks-pass pass:android --key-pass pass:android --out delivery/Keep-Local-Next-0.2.0.apk app/build/outputs/apk/debug/app-debug-unsigned.apk
"$signer" verify --verbose --print-certs delivery/Keep-Local-Next-0.2.0.apk | tee evidence/signing-certificate.txt
if [ -f signing/expected-certificate.sha256 ]; then
  grep -F "$(cat signing/expected-certificate.sha256)" evidence/signing-certificate.txt
fi
sha256sum delivery/Keep-Local-Next-0.2.0.apk | tee delivery/SHA256SUMS.txt
test_apk=$(find app/build/outputs/apk/androidTest/debug -name '*.apk' -print -quit)
"$signer" sign --ks "$work/keep-local-next.p12" --ks-key-alias keep-local-next --ks-pass pass:android --key-pass pass:android --out test-artifacts/tests.apk "$test_apk"
cp delivery/Keep-Local-Next-0.2.0.apk test-artifacts/app.apk
cp previous/app/build/outputs/apk/debug/app-debug.apk test-artifacts/original.apk
echo 'e2b823fe7ee9d4f242b20d781c76b283060c0ff441fc2862a3f2adf7d36dfa2a  test-artifacts/original.apk' | sha256sum -c -
printf '%s\n' 'Keep Local Next: com.keep.local.next. Installs alongside com.keep.local.' 'Separate storage: existing CAD Test is not automatically imported.' 'No Play Protect approval or physical phone compatibility has been claimed.' > delivery/READ-ME.txt
printf '%s\n' 'Encrypted new-app signing key; retain with the PRIVATE recovery-key download.' 'Decrypt: openssl cms -decrypt -binary -inform DER -in keep-local-next.p12.cms -inkey recovery-private-key.pem -out keep-local-next.p12' 'Keystore alias: keep-local-next; store/key password: android. Keep the private key secret.' 'For future CI: restore base64 of decrypted keystore as repository secret KEEP_LOCAL_NEXT_KEYSTORE_BASE64.' > encrypted-signing-backup/RESTORE.txt
