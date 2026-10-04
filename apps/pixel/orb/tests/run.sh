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

# The brain (Kotlin) is compiled once, by its own build; the shell that calls it is under test here.
BRAIN="$(cd ../../../runtime/brain && ./build.sh | tail -1)"
BRAIN_CLASSES="$(cd ../../../runtime/brain && pwd)/build/classes"

for source in src/Erasure.java.in src/Erase.java.in src/Attachments.java.in src/Install.java.in \
              src/AssistPolicy.java.in src/AllowList.java.in src/AssistFacts.java.in src/PixelStats.java.in src/ScreenText.java.in src/Capture.java.in src/Recall.java.in src/Observe.java.in src/Provenance.java.in src/Shares.java.in src/Backup.java.in src/DeclaredPackages.java.in src/SharedText.java.in src/PackageGrants.java.in src/Rekeep.java.in src/Mentions.java.in src/ActionFacts.java.in src/Reminders.java.in src/ReminderNote.java.in src/Remind.java.in src/ComingUp.java.in src/Capabilities.java.in src/People.java.in src/ContactsFacts.java.in src/Handoff.java.in src/HandoffFacts.java.in src/Nudge.java.in src/SafetyRules.java.in src/SafetyFacts.java.in src/DocumentsRules.java.in src/DocumentDates.java.in src/DocumentPeople.java.in src/MessagesXml.java.in src/MessagesJson.java.in src/MessagesFile.java.in src/MessagesRules.java.in src/MessagesFacts.java.in src/MessagesFlow.java.in src/BriefRules.java.in src/BriefFacts.java.in src/BriefConfig.java.in src/Brief.java.in src/UnderstandingRules.java.in src/UnderstandingFacts.java.in src/Understanding.java.in src/CallsRules.java.in src/CallsFacts.java.in src/DocumentsFacts.java.in src/DocumentsFlow.java.in src/PersonLink.java.in src/PersonLinkFacts.java.in src/PersonNote.java.in src/PersonNoteFacts.java.in src/Faults.java.in src/Commitments.java.in src/CommitmentFacts.java.in \
              ../pass1/src/Journal.java.in ../pass1/src/Json.java.in \
              ../pass1/src/Hlc.java.in ../pass1/src/Ids.java.in \
              ../pass1/tests/Harness.java.in tests/*.java.in; do
  name="$(basename "$source" .java.in)"
  sed -e "s/@PKG@/$PKG/g" "$source" > "$OUT/src/$PKG_PATH/$name.java"
done

javac -Xlint:all -cp "$BRAIN_CLASSES" -d "$OUT/classes" ../pass1/tests/shim/android/content/Context.java "$OUT/src/$PKG_PATH"/*.java
java -Dorb.root="$PWD" -cp "$OUT/classes:$BRAIN_CLASSES:$BRAIN/lib/kotlin-stdlib.jar" "$PKG.Tests"
