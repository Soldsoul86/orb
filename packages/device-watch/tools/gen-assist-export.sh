#!/usr/bin/env bash
# Regenerates the assist-export fixture from the Java that keeps and erases on the phone.
#
# `GenAssistExport` calls `Capture.remember` and `Erase.execute`, so every record is the
# phone's own output. The inputs are an invented conversation, and the test asserts none of
# its words appear in the file. Regenerating changes every id and hash; tests assert shapes
# and agreements, never literals.
set -euo pipefail
cd "$(dirname "$0")/.."

PKG="dev.orb.gen"
PKG_PATH="${PKG//.//}"
OUT="build/gen-assist"
PIXEL="../../apps/pixel"

rm -rf "$OUT"; mkdir -p "$OUT/classes" "$OUT/src/$PKG_PATH"

for source in "$PIXEL"/pass1/src/Journal.java.in "$PIXEL"/pass1/src/Json.java.in \
              "$PIXEL"/pass1/src/Hlc.java.in "$PIXEL"/pass1/src/Ids.java.in \
              "$PIXEL"/orb/src/Start.java.in "$PIXEL"/orb/src/Erasure.java.in \
              "$PIXEL"/orb/src/Erase.java.in "$PIXEL"/orb/src/Attachments.java.in \
              "$PIXEL"/orb/src/Install.java.in "$PIXEL"/orb/src/AssistPolicy.java.in \
              "$PIXEL"/orb/src/AllowList.java.in "$PIXEL"/orb/src/AssistFacts.java.in \
              "$PIXEL"/orb/src/ScreenText.java.in "$PIXEL"/orb/src/Capture.java.in \
              tools/GenAssistExport.java.in; do
  name="$(basename "$source" .java.in)"
  sed -e "s/@PKG@/$PKG/g" "$source" > "$OUT/src/$PKG_PATH/$name.java"
done
cp -r "$PIXEL"/pass1/tests/shim/android "$OUT/src/android"

javac -d "$OUT/classes" $(find "$OUT/src" -name '*.java')
java -cp "$OUT/classes" "$PKG.GenAssistExport" > tests/fixtures/assist-export.txt
echo "wrote tests/fixtures/assist-export.txt ($(wc -l < tests/fixtures/assist-export.txt) events)"
