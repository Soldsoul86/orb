#!/usr/bin/env bash
# Regenerates the erasure-export fixture from the Java that erases on the phone.
#
# `GenErasureExport` calls `Erase.execute`, so the declarations, the refusal and the
# envelope hashes they name are the phone's own output (same reasoning as
# gen-share-export.sh). Regenerating changes every id and hash; tests assert shapes
# and agreements, never literals.
set -euo pipefail
cd "$(dirname "$0")/.."

PKG="dev.orb.gen"
PKG_PATH="${PKG//.//}"
OUT="build/gen-erasure"
PIXEL="../../apps/pixel"

rm -rf "$OUT"; mkdir -p "$OUT/classes" "$OUT/src/$PKG_PATH"

for source in "$PIXEL"/pass1/src/Journal.java.in "$PIXEL"/pass1/src/Json.java.in \
              "$PIXEL"/pass1/src/Hlc.java.in "$PIXEL"/pass1/src/Ids.java.in \
              "$PIXEL"/orb/src/Shares.java.in "$PIXEL"/orb/src/Start.java.in \
              "$PIXEL"/orb/src/Erasure.java.in "$PIXEL"/orb/src/Rekeep.java.in "$PIXEL"/orb/src/Erase.java.in \
              "$PIXEL"/orb/src/Attachments.java.in "$PIXEL"/orb/src/Install.java.in \
              "$PIXEL"/orb/src/AllowList.java.in "$PIXEL"/orb/src/AssistPolicy.java.in \
              tools/GenErasureExport.java.in; do
  name="$(basename "$source" .java.in)"
  sed -e "s/@PKG@/$PKG/g" "$source" > "$OUT/src/$PKG_PATH/$name.java"
done
cp -r "$PIXEL"/pass1/tests/shim/android "$OUT/src/android"

javac -d "$OUT/classes" $(find "$OUT/src" -name '*.java')
java -cp "$OUT/classes" "$PKG.GenErasureExport" > tests/fixtures/erasure-export.txt
echo "wrote tests/fixtures/erasure-export.txt ($(wc -l < tests/fixtures/erasure-export.txt) events)"
