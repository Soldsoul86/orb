#!/usr/bin/env bash
# Runs the Orb app's erasure logic on a desktop JVM. JDK only; no SDK.
#
# Same arrangement as the other phone suites: the shipped sources are compiled
# unmodified, and the one thing Android supplies — a directory — is a stand-in on the
# test classpath. `Journal`, `Json`, `Hlc`, `Ids` come from pass 1 and `Harness` from
# its tests, taken at build time and never copied.
set -euo pipefail

cd "$(dirname "$0")/.."
PKG="${ORB_PROBE_PKG:-dev.orb.app}"
PKG_PATH="${PKG//.//}"
OUT="build/tests"

rm -rf "$OUT"; mkdir -p "$OUT/classes" "$OUT/src/$PKG_PATH"

for source in src/Erasure.java.in src/Erase.java.in src/Attachments.java.in src/Install.java.in \
              src/AssistPolicy.java.in src/AllowList.java.in src/AssistFacts.java.in src/PixelStats.java.in src/ScreenText.java.in src/Capture.java.in src/Recall.java.in \
              ../pass1/src/Journal.java.in ../pass1/src/Json.java.in \
              ../pass1/src/Hlc.java.in ../pass1/src/Ids.java.in \
              ../pass1/tests/Harness.java.in tests/*.java.in; do
  name="$(basename "$source" .java.in)"
  sed -e "s/@PKG@/$PKG/g" "$source" > "$OUT/src/$PKG_PATH/$name.java"
done

javac -Xlint:all -d "$OUT/classes" ../pass1/tests/shim/android/content/Context.java "$OUT/src/$PKG_PATH"/*.java
java -Dorb.root="$PWD" -cp "$OUT/classes" "$PKG.Tests"
