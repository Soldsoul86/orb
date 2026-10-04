#!/usr/bin/env bash
# Runs the fit probe on a message backup: counts only, no text. See tools/fit/README.md.
#   tools/fit/probe.sh <messages-backup.json|xml>
# Compiles the phone app's own sources (through apps/pixel/orb/tests/run.sh, so there is one source list) plus FitProbe, then runs it.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
[ $# -eq 1 ] || { echo "usage: probe.sh <messages-backup.json|xml>" >&2; exit 64; }
[ -f "$1" ] || { echo "probe.sh: no such file" >&2; exit 66; }
file="$(realpath "$1")"

ORB_EXTRA_SOURCES="$here/FitProbe.java.in" ORB_MAIN=FitProbe \
  bash "$here/../../apps/pixel/orb/tests/run.sh" "$file"
