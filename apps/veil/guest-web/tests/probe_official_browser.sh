#!/usr/bin/env bash
# Compatibility probe only, no production dependency installation or crypto fallback.
set -euo pipefail
probe_dir=$(mktemp -d)
trap 'rm -rf "$probe_dir"' EXIT
npm install --prefix "$probe_dir" --ignore-scripts --no-audit --no-fund --save-exact @signalapp/libsignal-client@0.105.0 esbuild@0.25.11 > "$probe_dir/install.log" 2>&1 || { echo 'BLOCKED: compatibility probe could not install pinned packages'; exit 1; }
printf '%s\n' 'import { IdentityKeyPair } from "@signalapp/libsignal-client"; globalThis.fixture = IdentityKeyPair;' > "$probe_dir/input.mjs"
if "$probe_dir/node_modules/.bin/esbuild" "$probe_dir/input.mjs" --bundle --platform=browser --outfile="$probe_dir/output.js" > "$probe_dir/bundle.log" 2>&1; then
  echo 'Browser bundle now builds; manual review and interoperability gate must be reassessed.'
  exit 1
fi
if ! grep -Eq 'built into node|node:|platform=node|Could not resolve "(fs|os|path)"' "$probe_dir/bundle.log"; then
  echo 'Unexpected bundler failure; not evidence of the documented Node-native incompatibility.'
  cat "$probe_dir/bundle.log"
  exit 1
fi
echo 'OBSERVED BLOCKER: official @signalapp/libsignal-client 0.105.0 cannot bundle for browser because it imports Node-native dependencies.'
echo 'NOT TESTED: browser-to-Android Signal message interoperability. No native code has been moved to a plaintext server.'
