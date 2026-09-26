#!/usr/bin/env bash
# Runs pass 2's Java on a desktop JVM. Needs a JDK; no Android SDK, no Gradle.
#
# `Json` is taken from pass 1 rather than copied. Two copies of the canonical
# encoder would be two implementations of the one thing `DEVICE_LOOP.md` §7 R2
# says must not diverge, and a copy drifts silently.
set -euo pipefail

cd "$(dirname "$0")/.."
PKG="${ORB_PROBE_PKG:-dev.orb.pass2}"
PKG_PATH="${PKG//.//}"
OUT="build/tests"

rm -rf "$OUT"; mkdir -p "$OUT/classes" "$OUT/src/$PKG_PATH"

# Only the pure logic. The rest of `src/` is platform code -- the reads, the
# application, the receiver -- and compiling it here would need an android.jar
# the desktop suite deliberately does without.
for source in src/Grants.java.in ../pass1/src/Json.java.in tests/*.java.in; do
  name="$(basename "$source" .java.in)"
  sed -e "s/@PKG@/$PKG/g" "$source" > "$OUT/src/$PKG_PATH/$name.java"
done

javac -Xlint:all -d "$OUT/classes" "$OUT/src/$PKG_PATH"/*.java
java -cp "$OUT/classes" "$PKG.Tests"
