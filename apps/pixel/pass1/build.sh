#!/usr/bin/env bash
# Builds the Orb pass-1 probe (DEVICE_LOOP.md §5) without Gradle.
#
# No Gradle and no libraries, on purpose. This is a measuring instrument: if it
# pulled in a framework, a process that died would leave us unable to say
# whether Android killed it or the framework did. Zero dependencies means what
# it measures is the platform.
#
# The production phone host is Kotlin per CLAUDE.md; this is not that.
set -euo pipefail

SDK="${ANDROID_HOME:?set ANDROID_HOME to your Android SDK}"
API=36
BT="$SDK/build-tools/36.0.0"
JAR="$SDK/platforms/android-$API/android.jar"

PKG="${ORB_PROBE_PKG:-dev.orb.pass1}"
LABEL="${ORB_PROBE_LABEL:-Orb pass 1}"
OUT="${1:-build/${PKG##*.}}"
PKG_PATH="${PKG//.//}"

rm -rf "$OUT"; mkdir -p "$OUT/classes" "$OUT/src/$PKG_PATH"

sed -e "s/@PKG@/$PKG/g" -e "s/@LABEL@/$LABEL/g" \
  AndroidManifest.xml > "$OUT/AndroidManifest.xml"
for source in src/*.java.in; do
  name="$(basename "$source" .java.in)"
  sed -e "s/@PKG@/$PKG/g" "$source" > "$OUT/src/$PKG_PATH/$name.java"
done

"$BT/aapt2" link \
  -o "$OUT/base.apk" \
  -I "$JAR" \
  --manifest "$OUT/AndroidManifest.xml" \
  --min-sdk-version 34 \
  --target-sdk-version "$API"

javac -source 17 -target 17 -classpath "$JAR" -d "$OUT/classes" \
  $(find "$OUT/src" -name '*.java') 2>&1 | grep -v '^Note:' || true

"$BT/d8" --lib "$JAR" --min-api 34 --output "$OUT" \
  $(find "$OUT/classes" -name '*.class')

python3 - "$OUT" <<'PYEOF'
import sys, zipfile, pathlib
out = pathlib.Path(sys.argv[1])
with zipfile.ZipFile(out / "base.apk", "a", zipfile.ZIP_DEFLATED) as apk:
    apk.write(out / "classes.dex", "classes.dex")
PYEOF

if [ ! -f "$OUT/probe.keystore" ]; then
  keytool -genkeypair \
    -keystore "$OUT/probe.keystore" -storepass orbprobe -keypass orbprobe \
    -alias probe -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=$LABEL, O=Orb"
fi

"$BT/zipalign" -f -p 4 "$OUT/base.apk" "$OUT/aligned.apk"
"$BT/apksigner" sign \
  --ks "$OUT/probe.keystore" --ks-pass pass:orbprobe --key-pass pass:orbprobe \
  --ks-key-alias probe \
  --min-sdk-version 34 \
  --out "$OUT/${PKG##*.}.apk" "$OUT/aligned.apk"

"$BT/apksigner" verify "$OUT/${PKG##*.}.apk" && echo "signature ok"
ls -lh "$OUT/${PKG##*.}.apk"
echo "package: $PKG"
