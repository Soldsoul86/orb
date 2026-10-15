#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Generate the standard wrapper from a trusted Gradle 8.13 installation.
command -v gradle >/dev/null || { echo 'Install Gradle 8.13 and Android SDK 35 first; see README.md.'; exit 1; }
gradle wrapper --gradle-version 8.13 --distribution-type bin
./gradlew :app:assembleDebug :app:testDebugUnitTest
