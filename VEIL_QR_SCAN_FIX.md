# Veil v9 QR visibility fix

The sender's invitation page in v8 placed the full-width QR beneath a heading and several paragraphs inside a scrolling column. On compact screens the code could extend below the visible viewport. The previous live test scrolled to the QR before decoding, so it did not establish that a friend could scan the initial screen.

v9 gives the invitation QR a dedicated layout inside the same secured Activity. The complete square and its white quiet zone fit the available area. Landscape places the controls beside the code; portrait places them above and below. Text details, expiry, sharing and cancellation remain accessible through Details & other ways. Pixel filtering is disabled to preserve sharp module edges. No separate window, capture exemption, camera permission, crypto or pairing-protocol change is introduced.

The user reports that Google Lens never recognizes the QR, rather than showing a warning after recognizing a URL. The clipping defect is established from the layout. Its role in this particular physical scanning failure is not yet confirmed.

Verification scope:
- Render/decode the entire QR without any scrolling on compact portrait and landscape layouts, at 1x and 2x font scales, in light and dark themes.
- Create a real invitation on emulator A, decode its initial Activity rendering with FLAG_SECURE still enabled, and use the decoded link on emulator B for approval, encrypted text and revocation.
- Upgrade actual distributed v5 → v6 → v7 → v8 → v9 APKs without uninstalling, preserving keys, encrypted vaults and a continuing Signal ratchet.
- Physical phone camera / Google Lens scanning: DEVICE REQUIRED. Automated rendering is not a camera test.

Install over Veil Purposes Preview; do not uninstall or clear data. The phone displaying the QR needs the update. Open Reach me and the existing valid invitation, or New contact → Temporary → Create QR invitation. The receiving phone scans with its normal camera. After installing from the invitation page, return to the browser tab and tap Continue in Veil. Automatic post-install continuation remains unimplemented.

If a complete, well-lit QR still cannot be recognized, record the phone/camera model and app version and test the same QR with another camera. Do not post the invitation token or a readable active QR publicly.

## Observed results — 2026-10-21

- PASS signed build, lint, JVM/native privacy suites and v5→v6→v7→v8→v9 upgrades: https://github.com/Soldsoul86/orb/actions/runs/39527110605
- PASS 18 Android regression tests (two isolated privacy tests plus 16 combined tests). The new layout test exercised and decoded all eight size/font/theme combinations without scrolling the QR.
- PASS live two-emulator invitation, QR decoding without scrolling, acceptance, encrypted text both ways, and revocation: https://github.com/Soldsoul86/orb/actions/runs/39527113050
- PASS local provider/invitation tests: 14 passed; 6 PostgreSQL tests skipped because no disposable local PostgreSQL was configured. Relay CI checks run separately.
- PASS artifact integrity and compiled manifest: package `chat.veil.purposes.preview`, versionCode 9, versionName `0.3.4-qr-preview`.
- APK SHA-256: `cd8da545bf8ab8bcb461a6aecd79ff23a49d0982b15a4774a5b6520c0db8b56e`.
- Preserved signer SHA-256 verified by CI apksigner: `e241ad4e30de7812469e70f72065960eafd5ee3f2fab089ac40a89783647f6a4`.
- Tested Android source: `ef2535c1eaf35bc9a35baece00343477e6d1e96f`.
- DEVICE REQUIRED: physical Google Lens/phone camera scanning. The exact reported red indicator was not reproduced with a physical phone.
- Existing unrelated Orb verification failure remains outside this Android change; do not report all repository CI as green.

- PASS signed public release: https://github.com/Soldsoul86/orb/actions/runs/39527936665
- APK: https://github.com/Soldsoul86/orb/releases/download/veil-qr-v9/veil-qr-preview.apk
- PASS landing-page browser checks: https://github.com/Soldsoul86/orb/actions/runs/39527802403
- PASS relay suite: https://github.com/Soldsoul86/orb/actions/runs/39527802414 (32 checks with one skipped for the first backend, all 32 for PostgreSQL).
- LIVE Render deployment `dep-dbc1dapsrm7s739adlt0`, source `17e5a630e397ee9104450d9e415766bf76f314e8`, updated invitation page to v9.
- PASS post-deploy public APK checksum, live invitation browser behavior and HTTPS encrypted-envelope relay smoke: https://github.com/Soldsoul86/orb/actions/runs/39528280794
