#!/usr/bin/env bash
# Runs the pass-1 probe's Java on a desktop JVM.
#
# The probe has no tests on the device and cannot have any: it is a measuring
# instrument whose whole value is that nothing else runs inside it. But the
# classes that decide what history says -- the encoder and the journal -- are
# ordinary Java, and leaving them unexercised is how the section 5d defect
# reached a real run.
#
# Nothing here is compiled into the APK. `src/` is used exactly as the phone
# uses it; the only addition is a fake `android.content.Context` on the test
# classpath, because `Journal` asks Android for a directory and nothing else.
#
# No Android SDK, no Gradle, no test framework. Needs a JDK and python3.
set -euo pipefail

cd "$(dirname "$0")/.."
PKG="${ORB_PROBE_PKG:-dev.orb.pass1}"
PKG_PATH="${PKG//.//}"
OUT="build/tests"

rm -rf "$OUT"; mkdir -p "$OUT/classes" "$OUT/src/$PKG_PATH"

# Only the classes that do not need a real Android runtime. The services and the
# activity are platform glue and are answered by the device itself, not here.
for name in Json Hlc Ids Journal; do
  sed -e "s/@PKG@/$PKG/g" "src/$name.java.in" > "$OUT/src/$PKG_PATH/$name.java"
done
for source in tests/*.java.in; do
  name="$(basename "$source" .java.in)"
  sed -e "s/@PKG@/$PKG/g" "$source" > "$OUT/src/$PKG_PATH/$name.java"
done

# `Vectors.java` is generated so `tests/vectors.json` stays the single source of
# truth for both implementations. Hand-copying the fixture into Java would make
# the agreement it pins a copy of itself.
python3 tools/gen-vectors.py tests/vectors.json "$PKG" > "$OUT/src/$PKG_PATH/Vectors.java"

javac -Xlint:all -d "$OUT/classes" \
  tests/shim/android/content/Context.java \
  "$OUT/src/$PKG_PATH"/*.java

java -cp "$OUT/classes" "$PKG.Tests"
