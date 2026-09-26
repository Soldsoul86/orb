#!/usr/bin/env bash
# Builds the Orb grants probe (DEVICE_LOOP.md P12-P14) without Gradle.
#
# Same toolchain as pass 1 -- aapt2 -> javac -> d8 -> zipalign -> apksigner --
# and for the same reason: nothing resolves from a network at build time, so the
# artifact is reproducible from the SDK alone and a failure is the platform's.
#
# Its own package and its own key, never pass 1's. Pass 1 is mid-run and holds
# the journal; an APK signed with a different key cannot upgrade it, so sharing
# a package id here would offer the operator an install that silently required
# an uninstall -- and an uninstall takes the run's evidence with it (§7 R4).
set -euo pipefail

SDK="${ANDROID_HOME:?set ANDROID_HOME to your Android SDK}"
API=36
BT="$SDK/build-tools/36.0.0"
JAR="$SDK/platforms/android-$API/android.jar"

PKG="${ORB_PROBE_PKG:-dev.orb.probeg}"
LABEL="${ORB_PROBE_LABEL:-Orb grants probe}"
# Minutes since the epoch: versionCode is a signed 32-bit int, so a plain
# timestamp overflows it and a yymmddHHMM stamp passes 2^31 in this decade.
VERSION_CODE="${ORB_VERSION_CODE:-$(( $(date -u +%s) / 60 ))}"
OUT="${1:-build/${PKG##*.}}"
PKG_PATH="${PKG//.//}"

KEYSTORE="${ORB_KEYSTORE:-keys/${PKG##*.}.keystore}"
mkdir -p "$(dirname "$KEYSTORE")"

rm -rf "$OUT"; mkdir -p "$OUT/classes" "$OUT/src/$PKG_PATH"

sed -e "s/@PKG@/$PKG/g" -e "s/@LABEL@/$LABEL/g" -e "s/@VERSION_CODE@/$VERSION_CODE/g" \
  AndroidManifest.xml > "$OUT/AndroidManifest.xml"

# `Grants` from pass 2 and `Json` from pass 1, taken and not copied. The point of
# running on the device is to see the parser that would actually ship meet the
# string the device actually returns; a copy could agree here and disagree there.
for source in src/*.java.in ../pass2/src/Grants.java.in ../pass1/src/Json.java.in; do
  name="$(basename "$source" .java.in)"
  sed -e "s/@PKG@/$PKG/g" "$source" > "$OUT/src/$PKG_PATH/$name.java"
done

# Resources: none. The manifest links on its own.
"$BT/aapt2" link \
  -o "$OUT/base.apk" \
  -I "$JAR" \
  --manifest "$OUT/AndroidManifest.xml" \
  --min-sdk-version 34 \
  --target-sdk-version "$API"

# A failed compile must stop the build. Piping javac into a filter would hide
# its exit code, and the next step would go on to package whichever classes did
# survive -- an APK missing the read it was built to perform.
if ! javac -source 17 -target 17 -classpath "$JAR" -d "$OUT/classes" \
     $(find "$OUT/src" -name '*.java') > "$OUT/javac.log" 2>&1; then
  grep -v '^Note:' "$OUT/javac.log" >&2 || true
  echo "compile failed" >&2
  exit 1
fi
grep -v '^Note:' "$OUT/javac.log" || true

"$BT/d8" --lib "$JAR" --min-api 34 --output "$OUT" \
  $(find "$OUT/classes" -name '*.class')

python3 - "$OUT" <<'PYEOF'
import sys, zipfile, pathlib
out = pathlib.Path(sys.argv[1])
with zipfile.ZipFile(out / "base.apk", "a", zipfile.ZIP_DEFLATED) as apk:
    apk.write(out / "classes.dex", "classes.dex")
PYEOF

if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair \
    -keystore "$KEYSTORE" -storepass orbprobe -keypass orbprobe \
    -alias probe -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=$LABEL, O=Orb"
  echo
  echo "!! NEW SIGNING KEY at $KEYSTORE (throwaway; this probe stores nothing)"
  echo
fi

"$BT/zipalign" -f -p 4 "$OUT/base.apk" "$OUT/aligned.apk"
"$BT/apksigner" sign \
  --ks "$KEYSTORE" --ks-pass pass:orbprobe --key-pass pass:orbprobe \
  --ks-key-alias probe \
  --min-sdk-version 34 \
  --out "$OUT/${PKG##*.}.apk" "$OUT/aligned.apk"

"$BT/apksigner" verify "$OUT/${PKG##*.}.apk" && echo "signature ok"
ls -lh "$OUT/${PKG##*.}.apk"
echo "package: $PKG  versionCode: $VERSION_CODE"
