#!/usr/bin/env bash
# Builds the Orb assist probe (DEVICE_LOOP.md §7b41, P23-P29) without Gradle.
#
# Same toolchain as pass 1 -- aapt2 -> javac -> d8 -> zipalign -> apksigner --
# and for the same reason: nothing resolves from a network at build time, so the
# artifact is reproducible from the SDK alone and a failure is the platform's.
#
# Its own package and its own key, never another app's: an APK signed with a
# different key cannot upgrade, and an uninstall takes a journal with it.
set -euo pipefail

SDK="${ANDROID_HOME:?set ANDROID_HOME to your Android SDK}"
API=36
BT="$SDK/build-tools/36.0.0"
JAR="$SDK/platforms/android-$API/android.jar"

PKG="${ORB_PROBE_PKG:-dev.orb.probea}"
LABEL="${ORB_PROBE_LABEL:-Orb assist probe}"
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

# `Install` from the app, and `Journal`, `Json`, `Hlc`, `Ids` from pass 1 -- taken,
# not copied, so the probe records with the code that would actually ship.
for source in src/*.java.in ../orb/src/Install.java.in \
              ../pass1/src/Journal.java.in ../pass1/src/Json.java.in \
              ../pass1/src/Hlc.java.in ../pass1/src/Ids.java.in; do
  name="$(basename "$source" .java.in)"
  sed -e "s/@PKG@/$PKG/g" "$source" > "$OUT/src/$PKG_PATH/$name.java"
done

# Resources: the two service declarations. Compiled first, then linked.
mkdir -p "$OUT/res/xml"
for xml in res/xml/*.xml; do
  sed -e "s/@PKG@/$PKG/g" "$xml" > "$OUT/res/xml/$(basename "$xml")"
done
"$BT/aapt2" compile --dir "$OUT/res" -o "$OUT/res.zip"
"$BT/aapt2" link \
  -o "$OUT/base.apk" \
  -I "$JAR" \
  --manifest "$OUT/AndroidManifest.xml" \
  -R "$OUT/res.zip" \
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
  echo "!! NEW SIGNING KEY at $KEYSTORE (throwaway; this probe stores no screen content)"
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
