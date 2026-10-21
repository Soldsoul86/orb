#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
# Bind only an explicitly selected RFC1918 interface, never 0.0.0.0 or a public IP.
veil_ip="${1:-$(ipconfig getifaddr en0 || true)}"
if [[ ! "$veil_ip" =~ ^10\.([0-9]{1,3}\.){2}[0-9]{1,3}$ && ! "$veil_ip" =~ ^192\.168\.[0-9]{1,3}\.[0-9]{1,3}$ && ! "$veil_ip" =~ ^172\.(1[6-9]|2[0-9]|3[01])\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
  echo 'Supply this Mac’s private Wi-Fi IPv4 address: ./mac-start.sh 192.168.x.x' >&2; exit 1
fi
export VEIL_LAN_IP="$veil_ip"
umask 077
mkdir -p .pilot-private
printf 'VEIL_LAN_IP=%s\n' "$veil_ip" > .pilot-private/settings.env
docker compose --env-file .pilot-private/settings.env up --build -d --wait --wait-timeout 240
for attempt in {1..30}; do
  if docker compose cp tls:/data/caddy/pki/authorities/local/root.crt .pilot-private/veil-pilot-ca.crt 2>/dev/null; then break; fi
  sleep 1
done
docker compose cp pilot:/data/runtime/accounts.json .pilot-private/operator-accounts.json
chmod 600 .pilot-private/*
printf 'Private HTTPS: https://%s:8443\n' "$veil_ip"
echo 'Public CA certificate and private operator accounts saved in .pilot-private/. Do not upload that directory.'
echo 'Read MAC-PILOT.md before installing the CA or APK. Keep existing Veil apps installed.'
