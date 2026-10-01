#!/usr/bin/env bash
# Runs the assist probe's pure logic on a desktop JVM. JDK only; no SDK.
#
# `Json` and `Harness` come from pass 1, taken at build time and never copied in.
# The platform glue is left out of the compile — it is nothing but Android calls —
# but it is **read**: `GuardTest` scans its source for anything that could record,
# log or persist what a screen contained.
set -euo pipefail

cd "$(dirname "$0")/.."
PKG="${ORB_PROBE_PKG:-dev.orb.probea}"
PKG_PATH="${PKG//.//}"
OUT="build/tests"

rm -rf "$OUT"; mkdir -p "$OUT/classes" "$OUT/src/$PKG_PATH"

for source in src/Facts.java.in ../orb/src/PixelStats.java.in ../pass1/src/Json.java.in \
              ../pass1/tests/Harness.java.in tests/*.java.in; do
  name="$(basename "$source" .java.in)"
  sed -e "s/@PKG@/$PKG/g" "$source" > "$OUT/src/$PKG_PATH/$name.java"
done

javac -Xlint:all -d "$OUT/classes" "$OUT/src/$PKG_PATH"/*.java
java -Dprobe.root="$PWD" -cp "$OUT/classes" "$PKG.Tests"
