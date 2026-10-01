#!/usr/bin/env bash
# Runs the phone brain's checks on a desktop JVM. The same sources the APK is built from.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(cd ../.. && pwd)"
KOTLIN_HOME="$(./build.sh | tail -1)"
rm -rf build/tests && mkdir -p build/tests
"$KOTLIN_HOME/bin/kotlinc" -jvm-target 17 -nowarn -cp build/classes -d build/tests $(find tests -name '*.kt') 2>&1 | grep -v 'JAVA_TOOL_OPTIONS' || true
java -cp "build/classes:build/tests:$KOTLIN_HOME/lib/kotlin-stdlib.jar" dev.orb.brain.MainKt "$ROOT" 2>&1 | grep -v 'JAVA_TOOL_OPTIONS'
exit "${PIPESTATUS[0]}"
