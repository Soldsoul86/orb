#!/usr/bin/env bash
# Regenerates the observed-export fixture: the phone's own Kotlin brain and Java shell
# (`Observe.run`) observing events the phone's own code kept.
#
# Every record is the phone's output; only the inputs are invented, and the test asserts none
# of their words appear in the file. Regenerating changes every id and hash; tests assert shapes
# and agreements, never literals.
set -euo pipefail
cd "$(dirname "$0")/.."

PKG="dev.orb.gen"
PKG_PATH="${PKG//.//}"
OUT="build/gen-observed"
PIXEL="../../apps/pixel"
BRAIN_HOME="$(cd ../../runtime/brain && ./build.sh | tail -1)"
BRAIN_CLASSES="$(cd ../../runtime/brain && pwd)/build/classes"

rm -rf "$OUT"; mkdir -p "$OUT/classes" "$OUT/src/$PKG_PATH"

for source in "$PIXEL"/pass1/src/Journal.java.in "$PIXEL"/pass1/src/Json.java.in \
              "$PIXEL"/pass1/src/Hlc.java.in "$PIXEL"/pass1/src/Ids.java.in \
              "$PIXEL"/orb/src/Shares.java.in "$PIXEL"/orb/src/Start.java.in \
              "$PIXEL"/orb/src/Erasure.java.in "$PIXEL"/orb/src/Erase.java.in \
              "$PIXEL"/orb/src/Attachments.java.in "$PIXEL"/orb/src/Install.java.in \
              "$PIXEL"/orb/src/AssistPolicy.java.in "$PIXEL"/orb/src/AllowList.java.in \
              "$PIXEL"/orb/src/AssistFacts.java.in "$PIXEL"/orb/src/ScreenText.java.in \
              "$PIXEL"/orb/src/Capture.java.in "$PIXEL"/orb/src/Observe.java.in \
              tools/GenObservedExport.java.in; do
  name="$(basename "$source" .java.in)"
  sed -e "s/@PKG@/$PKG/g" "$source" > "$OUT/src/$PKG_PATH/$name.java"
done
cp -r "$PIXEL"/pass1/tests/shim/android "$OUT/src/android"

javac -cp "$BRAIN_CLASSES" -d "$OUT/classes" $(find "$OUT/src" -name '*.java') 2>&1 | grep -v JAVA_TOOL || true
java -cp "$OUT/classes:$BRAIN_CLASSES:$BRAIN_HOME/lib/kotlin-stdlib.jar" "$PKG.GenObservedExport" 2>&1 \
  | grep -v JAVA_TOOL > tests/fixtures/observed-export.txt
echo "wrote tests/fixtures/observed-export.txt ($(wc -l < tests/fixtures/observed-export.txt) events)"
