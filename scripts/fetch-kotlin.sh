#!/usr/bin/env bash
# Fetches the pinned Kotlin compiler once, into a cache outside the repository, and checks it.
#
# Why this exists: DR-16 puts the phone's reasoning layers in Kotlin, and the build has no
# Gradle and resolves nothing from a network. So the compiler is fetched here, *once*, by a
# script that pins the version and refuses a file whose hash differs — never during a build.
#
#   scripts/fetch-kotlin.sh        prints the compiler's home directory on success
#   KOTLIN_HOME=$(scripts/fetch-kotlin.sh) "$KOTLIN_HOME/bin/kotlinc" ...
set -euo pipefail

VERSION=2.0.21
ZIP_SHA256=0352c0a45bd22f80f6b26e485cd04da8047baa5de54865281fb9f89a4a7bcf2a
# The runtime library is the part that ships in the APK; its hash is the one Maven Central
# publishes, so it is checked against a source other than the one it was fetched from.
STDLIB_SHA1=618b539767b4899b4660a83006e052b63f1db551

CACHE="${ORB_TOOLS:-$HOME/.cache/orb-tools}"
HOME_DIR="$CACHE/kotlinc-$VERSION"

if [ ! -x "$HOME_DIR/bin/kotlinc" ]; then
  mkdir -p "$CACHE"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  curl -fsSL -o "$TMP/kotlin.zip" \
    "https://github.com/JetBrains/kotlin/releases/download/v$VERSION/kotlin-compiler-$VERSION.zip"
  echo "$ZIP_SHA256  $TMP/kotlin.zip" | sha256sum -c - >&2
  unzip -q "$TMP/kotlin.zip" -d "$TMP/out"
  rm -rf "$HOME_DIR"
  mv "$TMP/out/kotlinc" "$HOME_DIR"
fi

echo "$STDLIB_SHA1  $HOME_DIR/lib/kotlin-stdlib.jar" | sha1sum -c - >&2
echo "$HOME_DIR"
