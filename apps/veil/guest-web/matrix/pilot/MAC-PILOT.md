# Private Mac + Pixel 10a setup

Device supplied by the owner: Pixel 10a, Android 16; **Veil Purposes Preview is
already installed**. Preserve it. This task builds the actual Veil app with the
optional guest adapter as **Veil Guest Pilot**, package `chat.veil.guest.pilot`.
It has a separate vault and disposable pilot identity. It does not migrate or
upgrade the installed preview, or prove original signing continuity.

This environment cannot reach your Mac merely because your phone shares its
Wi-Fi. These commands run on the Mac. No public deployment, router port forwarding,
public tunnel or public Send is needed or authorized.

Tested build: `0c3a7a2f0e564dc2d1f4e47abdddd432a5160732`.
[Download the Pixel ARM64 artifact](https://github.com/Soldsoul86/orb/actions/runs/39620149498/artifacts/12355960948);
[checksums and signing status](ACCEPTANCE.md#pixel-test-apk).

1. Use a separate clone/worktree at that exact tested commit. In Terminal run
   `apps/veil/guest-web/matrix/pilot/mac-start.sh` from the repository. If the
   Wi-Fi interface is not en0, pass the Mac's private IPv4 address explicitly.
   Docker publishes only port 8443 on that address. Keep the Mac firewall restricted
   to the pilot network; do not expose the service via a router or public address.
2. The script creates a local development CA. Transfer only
   `.pilot-private/veil-pilot-ca.crt` to the Pixel through a trusted local/USB path.
   Install it as a CA certificate in Android Settings → Security & privacy → More
   security settings → Encryption & credentials → Install a certificate. Android
   will warn about this user-installed trust root. It is for this private pilot;
   remove it after testing. Never transfer the CA private key or the entire volume.
3. Install the arm64 **Veil Guest Pilot** test APK from the tested workflow artifact.
   Verify its SHA-256 with `shasum -a 256 /path/to/app-debug.apk` against
   ACCEPTANCE.md and that artifact’s provenance. Do not uninstall either
   existing Veil app. This debug-only pilot explicitly trusts user-installed CAs
   for local HTTPS; regular Veil builds retain their original trust configuration.
   Do not use this APK with sensitive real conversations.
4. On the Pixel, open the printed `https://MAC_PRIVATE_IP:8443` address in Chrome.
   Resolve certificate errors before continuing; never use a bypass flag or disable
   TLS validation. Record the exact Chrome and Android build versions.
5. In Veil Guest Pilot, open Reach me → Browser messages · private pilot. Set both
   service and browser origin to that HTTPS address (no trailing slash). Enter a
   chosen name and purpose, and create a disposable pilot purpose. Read the first
   technical account from `.pilot-private/operator-accounts.json` on the Mac and
   enter its username/password in the owner setup only. Do not paste credentials
   into chat, reports, URLs or QR codes. Visitors never enter these credentials.
6. Enable the pilot and show its QR. A second supported phone/browser on that
   private Wi-Fi can scan it. For a one-phone setup, copy its browser contact link
   and switch to Chrome; reopen and unlock the owner inbox to approve/reply, then
   return to the browser. One-phone switching does not measure owner arrival while
   the app is backgrounded, and is not a two-person comprehension test.
7. Use only the acceptance checklist and disposable messages. The invitation lasts
   one hour. Browser notifications and Android background delivery are not claimed.
   Cellular data cannot reach a private Wi-Fi-only address: that acceptance case
   needs a separately configured private VPN and remains DEVICE REQUIRED.

To stop without deleting state, in this directory run
`docker compose --env-file .pilot-private/settings.env down`.
Start the same volumes with `up -d --wait`; this preserves routing state, signing
configuration and browser origin. Do not use `down -v` as a troubleshooting step.

Rollback: stop the pilot, retain its volume and app evidence for diagnosis, return
to the untouched existing Veil app. The guest adapter is optional and public Send
stays disabled. A code rollback must use a compatible schema/SDK; do not downgrade
live crypto stores in place. Never restore an old ratchet checkpoint over a newer
active device. For a new disposable pilot, provision a separate environment and
explicitly share a new invitation. Original browser URLs must fail clearly if their
storage/identity is gone. Remove the pilot CA after the test session.
