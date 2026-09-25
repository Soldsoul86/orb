#!/usr/bin/env bash
# Builds the Orb device probe (DEVICE_LOOP.md P0) without Gradle.
#
# Deliberately toolchain-minimal: aapt2 -> javac -> d8 -> zipalign -> apksigner.
# Fewer moving parts than an AGP build, and nothing to resolve from a network at
# build time, so the artifact is reproducible from the SDK alone.
set -euo pipefail

SDK="${ANDROID_HOME:?set ANDROID_HOME to your Android SDK}"
API=36
BT="$SDK/build-tools/36.0.0"
JAR="$SDK/platforms/android-$API/android.jar"
OUT="${1:-build}"

rm -rf "$OUT"; mkdir -p "$OUT/classes"

# Resources: none. The manifest links on its own.
"$BT/aapt2" link \
  -o "$OUT/base.apk" \
  -I "$JAR" \
  --manifest AndroidManifest.xml \
  --min-sdk-version 34 \
  --target-sdk-version "$API"

javac -source 17 -target 17 -classpath "$JAR" -d "$OUT/classes" \
  $(find src -name '*.java') 2>&1 | grep -v '^Note:' || true

"$BT/d8" --lib "$JAR" --min-api 34 --output "$OUT" \
  $(find "$OUT/classes" -name '*.class')

# Add the dex with python rather than the `zip` binary: one less thing that has
# to exist on the machine doing the build.
python3 - "$OUT" <<'PYEOF'
import sys, zipfile, pathlib
out = pathlib.Path(sys.argv[1])
with zipfile.ZipFile(out / "base.apk", "a", zipfile.ZIP_DEFLATED) as apk:
    apk.write(out / "classes.dex", "classes.dex")
PYEOF

# A debug keystore generated on the spot: this probe tests the install gate,
# not a release identity. A real build needs a key you keep.
if [ ! -f "$OUT/probe.keystore" ]; then
  keytool -genkeypair \
    -keystore "$OUT/probe.keystore" -storepass orbprobe -keypass orbprobe \
    -alias probe -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Orb Probe, O=Orb"
fi

"$BT/zipalign" -f -p 4 "$OUT/base.apk" "$OUT/aligned.apk"
"$BT/apksigner" sign \
  --ks "$OUT/probe.keystore" --ks-pass pass:orbprobe --key-pass pass:orbprobe \
  --ks-key-alias probe \
  --min-sdk-version 34 \
  --out "$OUT/orb-probe.apk" "$OUT/aligned.apk"

"$BT/apksigner" verify --print-certs "$OUT/orb-probe.apk"
ls -lh "$OUT/orb-probe.apk"
