#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT
kotlinc app/src/main/java/com/keep/local/CoreLogic.kt core-tests/VerifyCore.kt -include-runtime -d "$out/core-tests.jar"
java -jar "$out/core-tests.jar"
