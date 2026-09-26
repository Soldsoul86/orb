#!/usr/bin/env bash
# Builds Orb pass 2 (DEVICE_LOOP.md §7 R4) without Gradle.
#
# Same toolchain and the same reason as pass 1: aapt2 -> javac -> d8 -> zipalign
# -> apksigner, nothing resolved from a network at build time, no libraries. An
# instrument that pulled in a framework would leave us unable to say whether a
# failure was the platform's or the framework's.
set -euo pipefail

SDK="${ANDROID_HOME:?set ANDROID_HOME to your Android SDK}"
API=36
BT="$SDK/build-tools/36.0.0"
JAR="$SDK/platforms/android-$API/android.jar"

PKG="${ORB_PROBE_PKG:-dev.orb.pass2}"
LABEL="${ORB_PROBE_LABEL:-Orb pass 2}"
# Minutes since the epoch: versionCode is a signed 32-bit int, so a plain
# timestamp overflows it and a yymmddHHMM stamp passes 2^31 in this decade.
VERSION_CODE="${ORB_VERSION_CODE:-$(( $(date -u +%s) / 60 ))}"
OUT="${1:-build/${PKG##*.}}"
PKG_PATH="${PKG//.//}"

# The keystore lives OUTSIDE the output directory, which is wiped every build.
# An APK signed with a new key cannot upgrade one signed with the old key --
# Android refuses the install outright -- so regenerating it per build would
# silently force an uninstall, and an uninstall takes the journal with it.
KEYSTORE="${ORB_KEYSTORE:-keys/${PKG##*.}.keystore}"
mkdir -p "$(dirname "$KEYSTORE")"

rm -rf "$OUT"; mkdir -p "$OUT/classes" "$OUT/src/$PKG_PATH"

sed -e "s/@PKG@/$PKG/g" -e "s/@LABEL@/$LABEL/g" -e "s/@VERSION_CODE@/$VERSION_CODE/g" \
  AndroidManifest.xml > "$OUT/AndroidManifest.xml"

# The journal itself comes from pass 1, taken at build time and never copied.
# Two copies of the encoder would be two implementations of the one thing §7 R2
# says must not diverge, and a copy drifts silently. Pass 2 is a second app with
# its own lane, not a second journal format.
for source in src/*.java.in \
              ../pass1/src/Journal.java.in ../pass1/src/Json.java.in \
              ../pass1/src/Hlc.java.in ../pass1/src/Ids.java.in; do
  name="$(basename "$source" .java.in)"
  sed -e "s/@PKG@/$PKG/g" "$source" > "$OUT/src/$PKG_PATH/$name.java"
done

"$BT/aapt2" link \
  -o "$OUT/base.apk" \
  -I "$JAR" \
  --manifest "$OUT/AndroidManifest.xml" \
  --min-sdk-version 34 \
  --target-sdk-version "$API"

# A failed compile must stop the build. Piping javac into a filter would hide
# its exit code, and the next step would package whichever classes survived.
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
  echo "!! NEW SIGNING KEY at $KEYSTORE"
  echo "!! This APK cannot upgrade an install signed with a different key."
  echo "!! Export the journal BEFORE uninstalling to reinstall, or the run's"
  echo "!! evidence goes with the app."
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
echo "signing key: $KEYSTORE"
