#!/usr/bin/env bash
# Compiles the phone's reasoning layers (Kotlin, no Android) to a directory of classes.
# The compiler comes from `scripts/fetch-kotlin.sh`'s cache and is never fetched here
# (DR-16, AD-14): if it is missing, this says how to get it and stops.
#
#   runtime/brain/build.sh            -> runtime/brain/build/classes
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(cd ../.. && pwd)"

KOTLIN_HOME="${KOTLIN_HOME:-${ORB_TOOLS:-$HOME/.cache/orb-tools}/kotlinc-2.0.21}"
if [ ! -x "$KOTLIN_HOME/bin/kotlinc" ]; then
  echo "Kotlin compiler not found at $KOTLIN_HOME. Run: scripts/fetch-kotlin.sh" >&2
  exit 1
fi
# The cache is checked each time, not trusted: a replaced library would be shipped in the APK.
"$ROOT/scripts/fetch-kotlin.sh" >/dev/null

rm -rf build/classes && mkdir -p build/classes
"$KOTLIN_HOME/bin/kotlinc" -jvm-target 17 -nowarn -d build/classes $(find src -name '*.kt') 2>&1 | grep -v 'JAVA_TOOL_OPTIONS' || true
[ -d build/classes/dev ] || { echo "Kotlin compile failed" >&2; exit 1; }
echo "$KOTLIN_HOME"
