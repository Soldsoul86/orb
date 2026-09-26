#!/usr/bin/env bash
# Regenerates the pass-2 export fixture from the Java that writes it on the phone.
#
# The fixture must come from the implementation it is a fixture for. A
# hand-written one would agree with the TypeScript reader by construction and
# prove nothing about the pair — which is the whole point of the test that uses
# it. Same reasoning as `apps/pixel/pass1/tools/gen-vectors.py`.
set -euo pipefail
cd "$(dirname "$0")/.."

PKG="dev.orb.gen"
PKG_PATH="${PKG//.//}"
OUT="build/gen"
PIXEL="../../apps/pixel"

rm -rf "$OUT"; mkdir -p "$OUT/classes" "$OUT/src/$PKG_PATH"

for source in "$PIXEL"/pass1/src/Journal.java.in "$PIXEL"/pass1/src/Json.java.in \
              "$PIXEL"/pass1/src/Hlc.java.in "$PIXEL"/pass1/src/Ids.java.in \
              "$PIXEL"/pass2/src/Grants.java.in tools/GenExport.java.in; do
  name="$(basename "$source" .java.in)"
  sed -e "s/@PKG@/$PKG/g" "$source" > "$OUT/src/$PKG_PATH/$name.java"
done
cp -r "$PIXEL"/pass1/tests/shim/android "$OUT/src/android"

javac -d "$OUT/classes" $(find "$OUT/src" -name '*.java')
java -cp "$OUT/classes" "$PKG.GenExport" > tests/fixtures/pass2-export.txt
echo "wrote tests/fixtures/pass2-export.txt ($(wc -l < tests/fixtures/pass2-export.txt) events)"
