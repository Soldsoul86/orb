#!/usr/bin/env bash
# Regenerates the share-export fixture from the Java that writes it on the phone.
#
# The records come out of `apps/pixel/orb/src/Shares.java.in` — the class
# `ShareActivity` calls — so the fixture is the phone's own output for synthetic
# inputs. A hand-written one would agree with the TypeScript importer by
# construction and prove nothing about the pair. Same reasoning as gen-export.sh.
#
# Regenerating changes every id and timestamp, so a diff of the fixture is noise;
# the test asserts shapes and counts, never ids.
set -euo pipefail
cd "$(dirname "$0")/.."

PKG="dev.orb.gen"
PKG_PATH="${PKG//.//}"
OUT="build/gen-share"
PIXEL="../../apps/pixel"

rm -rf "$OUT"; mkdir -p "$OUT/classes" "$OUT/src/$PKG_PATH"

for source in "$PIXEL"/pass1/src/Journal.java.in "$PIXEL"/pass1/src/Json.java.in \
              "$PIXEL"/pass1/src/Hlc.java.in "$PIXEL"/pass1/src/Ids.java.in \
              "$PIXEL"/orb/src/Shares.java.in "$PIXEL"/orb/src/Start.java.in tools/GenShareExport.java.in; do
  name="$(basename "$source" .java.in)"
  sed -e "s/@PKG@/$PKG/g" "$source" > "$OUT/src/$PKG_PATH/$name.java"
done
cp -r "$PIXEL"/pass1/tests/shim/android "$OUT/src/android"

javac -d "$OUT/classes" $(find "$OUT/src" -name '*.java')
java -cp "$OUT/classes" "$PKG.GenShareExport" > tests/fixtures/share-export.txt
echo "wrote tests/fixtures/share-export.txt ($(wc -l < tests/fixtures/share-export.txt) events)"
