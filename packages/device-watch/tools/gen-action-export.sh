#!/usr/bin/env bash
# Regenerates the action-export fixture from the Java that writes it on the phone.
#
# The records come out of `Remind` and `ActionFacts` — the classes the phone runs — on real keys, so the fixture is the
# phone's own output for invented inputs. Same reasoning as gen-export.sh and gen-erasure-export.sh. Regenerating
# changes every id and timestamp; the test asserts shapes, counts and lineage, never ids.
set -euo pipefail
cd "$(dirname "$0")/.."

PKG="dev.orb.gen"
PKG_PATH="${PKG//.//}"
OUT="build/gen-action"
PIXEL="../../apps/pixel"

rm -rf "$OUT"; mkdir -p "$OUT/classes" "$OUT/src/$PKG_PATH"

for source in "$PIXEL"/pass1/src/Journal.java.in "$PIXEL"/pass1/src/Json.java.in \
              "$PIXEL"/pass1/src/Hlc.java.in "$PIXEL"/pass1/src/Ids.java.in \
              "$PIXEL"/orb/src/Shares.java.in "$PIXEL"/orb/src/Start.java.in \
              "$PIXEL"/orb/src/Erasure.java.in "$PIXEL"/orb/src/Erase.java.in \
              "$PIXEL"/orb/src/Attachments.java.in "$PIXEL"/orb/src/Install.java.in \
              "$PIXEL"/orb/src/AllowList.java.in "$PIXEL"/orb/src/AssistPolicy.java.in \
              "$PIXEL"/orb/src/Rekeep.java.in "$PIXEL"/orb/src/SharedText.java.in \
              "$PIXEL"/orb/src/ReminderNote.java.in "$PIXEL"/orb/src/ActionFacts.java.in \
              "$PIXEL"/orb/src/Reminders.java.in "$PIXEL"/orb/src/Remind.java.in \
              tools/GenActionExport.java.in; do
  name="$(basename "$source" .java.in)"
  sed -e "s/@PKG@/$PKG/g" "$source" > "$OUT/src/$PKG_PATH/$name.java"
done
cp -r "$PIXEL"/pass1/tests/shim/android "$OUT/src/android"

javac -d "$OUT/classes" $(find "$OUT/src" -name '*.java')
java -cp "$OUT/classes" "$PKG.GenActionExport" > tests/fixtures/action-export.txt
echo "wrote tests/fixtures/action-export.txt ($(wc -l < tests/fixtures/action-export.txt) events)"
