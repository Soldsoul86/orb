#!/usr/bin/env bash
# Runs the grants probe's pure logic on a desktop JVM. JDK only; no SDK.
#
# `Grants` comes from pass 2 and `Json` and `Harness` from pass 1, taken at
# build time and never copied in. The probe exists to check the parser that
# would actually ship (§7 R2); a private copy of it here could agree with the
# device while the real one disagreed, which is the one way a probe can lie.
set -euo pipefail

cd "$(dirname "$0")/.."
PKG="${ORB_PROBE_PKG:-dev.orb.probeg}"
PKG_PATH="${PKG//.//}"
OUT="build/tests"

rm -rf "$OUT"; mkdir -p "$OUT/classes" "$OUT/src/$PKG_PATH"

# `MainActivity` is left out: it is nothing but platform calls, and compiling it
# here would need an android.jar the desktop suite deliberately does without.
for source in src/Readout.java.in ../pass2/src/Grants.java.in ../pass1/src/Json.java.in \
              ../pass1/tests/Harness.java.in tests/*.java.in; do
  name="$(basename "$source" .java.in)"
  sed -e "s/@PKG@/$PKG/g" "$source" > "$OUT/src/$PKG_PATH/$name.java"
done

javac -Xlint:all -d "$OUT/classes" "$OUT/src/$PKG_PATH"/*.java
java -cp "$OUT/classes" "$PKG.Tests"
