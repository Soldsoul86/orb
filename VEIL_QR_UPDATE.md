# Veil v8 QR invitation update

Version 0.3.3-qr-preview, versionCode 8, package `chat.veil.purposes.preview`.

New contact → Temporary → Create QR invitation publishes the invitation and displays its QR directly. Creating/resuming no longer starts Android's Sharesheet. Share link instead and Copy link are secondary actions. Existing invitations in Reach me show their QR immediately. No QR is shown for unconfirmed, expired or canceled invitations.

The previous generic retry message did not identify the user's specific failure. No application error logs established the cause. Inspection found an implicit 10-second OkHttp read timeout that could fail during a cold service start. The transport now reuses its connection pool, waits at most 60 seconds for a read, and has a 90-second call deadline. It still verifies HTTPS and rejects redirects. No cryptographic protocol or authorization check changes.

Errors now distinguish network, timeout, TLS, HTTP status, expired/canceled invitation and the existing eight-identity preview limit. Only fixed messages and numeric HTTP statuses appear; server response text, invitation URLs and secrets are never included. Existing retry uses the saved identity/token and remains covered by lost-response tests. No automatic deletion or quota expansion was added.

A two-emulator test creates an invitation through the UI, verifies no chooser opens, decodes the QR drawn by the actual protected Activity, passes that decoded URL to the recipient's ACTION_VIEW handler, requests/approves, exchanges encrypted text and ends access. This is instrumentation rendering under FLAG_SECURE, not a physical camera test or an OS screenshot bypass.

Upgrade testing installs actual v5, v6, v7 and v8 without uninstalling between transitions; the existing key/data/ratchet assertions run after each update. The signing workflow refuses to substitute the preserved preview signer.

The exact user-reported error is not conclusively reproduced from the words “retry the invitation.” Do not claim otherwise. The specific new error code is needed if it persists. A QR cannot work before server publication succeeds; an unfinished invitation offers Resume invitation.

This remains a debuggable development preview. Portable contacts support text. Physical QR scanning and browser/installer behavior still require testing. After installing from a QR page, the recipient must return to that browser tab and tap Continue in Veil; automatic post-install invitation opening remains unimplemented.

## Observed verification (2026-10-20)

- Signed build and preserved-signer upgrades: PASS, [run 39467021620](https://github.com/Soldsoul86/orb/actions/runs/39467021620).
- Two-emulator live HTTPS flow: PASS all 8 stages, [run 39467023676](https://github.com/Soldsoul86/orb/actions/runs/39467023676). The actual rendered QR decoded to the expected invitation; no chooser opened during creation. Measured 3 taps / 4.014 seconds from unlocked Chats to QR, including publication to an already warmed service. This is not a cold-start benchmark.
- Local invitation/provider suites: PASS 5 + 9 tests. These do not reproduce the user's exact network conditions.
- Downloaded APK checksum, actual certificate signing block, version/package manifest and ZIP integrity: PASS.
- APK SHA-256: `258e366bd00d9c3b88cf7618c7857e581bc5fa9a1c31d80c79aa78192f05d206`.
- Signer SHA-256 unchanged: `e241ad4e30de7812469e70f72065960eafd5ee3f2fab089ac40a89783647f6a4`.
- Production Android source: `134e0c2b243a293512e4e3263c49ce79227553c5`.
- Physical phone camera scan / user-specific creation error reproduction: NOT TESTED. Existing unrelated Orb verification failure remains outside this Android change.

Install the v8 update without uninstalling. On the sender: New contact → Temporary → Create QR invitation. Existing unfinished invitations can be resumed from Reach me. If creation still fails, record the displayed diagnostic code; do not reset identities or clear app data.
