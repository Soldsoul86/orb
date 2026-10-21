# Controlled pilot acceptance — in progress, not accepted

Public Send stays disabled. Draft PR #11 remains draft. Independent security
review and explicit release authorization are required before release. This file
records actual evidence, not a declaration that all requested work is complete.

## Final executable source and evidence

Tested source: `0c3a7a2f0e564dc2d1f4e47abdddd432a5160732`.
[Run 39620149498](https://github.com/Soldsoul86/orb/actions/runs/39620149498):
browser, actual Android 16/API 36 and ARM64 APK jobs all PASS.
The subsequent handoff commit changes documentation/sanitized evidence only.

- Chromium 141.0.7390.37: all 15 browser/adversarial checks PASS; 7 admission tests PASS.
- Actual Veil inbox, UI approve/reply, browser restart, Android force-stop/restart,
  continuation and UI revoke PASS on API 36. Page usable 307 ms; service receipt
  1,668 ms; request arrival observed 6,773 ms (file polling adds up to 500 ms);
  request through automated reply 13,501 ms. These are loopback/emulator timings.
- Native evidence ZIP SHA-256: `9e5adef93bb4943259ca031b2ef178cb707a8696a57421b3070a5c913a54fe7d`.
- Browser evidence ZIP SHA-256: `f6341838c2053a89cdcd71cdbad0fb98fbb39f27f558a990139100b537cf4a1b`.
- [Sanitized native result](../../../discovery/evidence/pilot-api36.json),
  [browser result](../../../discovery/evidence/pilot-browser.json),
  [native screenshot](../../../discovery/evidence/pilot-android-reply.png),
  [browser screenshot](../../../discovery/evidence/pilot-browser-reply.png).
- Local Chromium 154.0.8037.57 repeats all 15 checks successfully on this source
  with only handoff documentation/evidence uncommitted.
- Locked Docker image builds and starts with external networking disabled;
  restart returns HTTP 200 and preserves the exact operator-account file hash.
  A Caddy HTTPS probe verifies its specific CA and returns 200 without TLS bypass.
  This is cloud loopback evidence, not deployment on the user’s Mac.

The ordinary Discovery verify job at this source passes identity/Android JVM/Signal/
portability and lint, 20 relay + 32 provider PostgreSQL tests, 22 Discovery tests,
independent signature verification and the real browser publishing/search journey.
The two native regression runs FAIL: run 39620149790 has 18/19 passes with
`ProtectionTest.nativeRevealReleaseCancelAndFocusLoss` unable to obtain real
window focus; run 39620158707 fails `PurposeQrTest.fullSignedPortableCardQrIsTheSameInvitation`
with ZXing `NotFoundException`. Neither assertion was removed or weakened.
The earlier same-native-source `f6c420e` Discovery runs both passed. These
intermittent failures still need resolution; the overall PR is not green.
The separate Matrix interop workflow passed at `8e8cc7a` (run 39616809080),
the last change to its shared adapter. Root Orb verify still fails at the
pre-existing `event.risk.measured.toFixed` hard-exit demonstration.

## Pixel test APK

[Download the ARM64 artifact ZIP](https://github.com/Soldsoul86/orb/actions/runs/39620149498/artifacts/12355960948)
(requires repository access). It contains the APK and CI provenance files.
[Verified package/signing/alignment record](../../../discovery/evidence/pilot-phone-apk.json).

- Package: `chat.veil.guest.pilot`; name: **Veil Guest Pilot**.
- APK SHA-256: `067292ebc0aaa30d10f0da761e82f856f7aed0f94ef2a15acb3b9fbefa72d81a`.
- Debug certificate SHA-256: `67af6ed0130981c8812de55369c3ba9641a825a43390e826b2cd65505f424098`.
- Artifact ZIP SHA-256: `b661886a8d5519ee6e7dc9880a61d8abe371c1e8950ec0aa341f7a33f204c941`.
- All four ARM64 native libraries have 16 KiB-aligned ELF load segments and
  uncompressed APK offsets. This packaging check does not replace a Pixel install.
- Disposable CI debug signing is not the installed preview’s signing continuity.
  Future CI runs may generate a different debug certificate. Preserve the existing
  preview and never uninstall it to resolve a pilot signature mismatch.
- Builds are reproducible from pinned source/dependencies; a fresh debug certificate
  and APK timestamps mean a rebuild need not have the same APK checksum.

## Earlier evidence and failures retained

- Commit `1c5d2d40fc6ade1d383bb3d4aa9accfaef10f076`,
  [run 39613687684](https://github.com/Soldsoul86/orb/actions/runs/39613687684):
  actual Veil Android activity/inbox, UI approval/reply, Chromium browser restart,
  Android force-stop/restart, continuation and UI revocation PASS. Android API 35;
  Chromium 141.0.7390.37, mobile viewport. This historical build used the existing
  preview package; **do not install that artifact over the user's preview**.
- That run measured page usable 308 ms, request accepted 1,625 ms, request through
  automated owner UI reply 14,326 ms on loopback/emulator. These are not camera
  scan times, human comprehension scores or ordinary mobile-data measurements.
- Sanitized native ZIP SHA-256:
  `c073d621f1fb4369183bb0e9809a4c1731c4a1557c3b97b4b6aa1501a4d3bc5e`.
  Sanitized browser ZIP:
  `1c77f00c0c75f2031c94d2d17cc4a74eda5e0e327309e24f60c2aeae41d14d2d`.
- Local Chromium 154.0.8037.57: 15 browser checks PASS, including an injected app
  storage interruption after real SDK decryption. Seven permission/admission unit
  tests PASS. Local results identify their source commit and worktree state.
- Android 16 (API 36) also passed at `84cc55e`, [run 39617819091](https://github.com/Soldsoul86/orb/actions/runs/39617819091), using the separate `chat.veil.guest.pilot` package. ARM64 build also passed; use the final source artifact above for the handoff.
- Follow-up Android runs at `0e2085e` and `62c10c4` timed out awaiting the browser
  reply. They are FAIL, not erased by the earlier passing test. Native test failure
  propagation and safe code-location diagnostics were added. The subsequent API 36
  pass does not erase those timeouts; physical and repeated-run stability remain gates.
- Private Docker image builds, valid local HTTPS returns 200 with its specific
  CA, and a service restart preserves the private database/accounts. Upstream
  Synapse has only a Unix listener and account material has mode 0600.

## Manual acceptance checklist

Use PASS / FAIL / NOT TESTED / DEVICE REQUIRED. Record commit, APK SHA-256,
certificate digest, package ID, exact OS/browser version and network per session.
Do not place credentials, keys, raw profiles, traffic or actual private messages
in the evidence. Use disposable canaries only.

| Case | Current status | Evidence / remaining step |
|---|---|---|
| Browser → actual Veil inbox → UI approve → browser reply | PASS API 36 at final source | Run 39620149498; earlier timeouts retained below |
| Persistent browser restart and Android process restart | PASS API 36 at final source | Native product harness, separate instrumentation processes |
| Private guest claims, own-device verification, one introduction | PASS | Real SDK test plus admission tests |
| Duplicate retry after service accepted but response lost | PASS | Exact saved ciphertext/transaction, one displayed message |
| Extra first message, modified retry, rooms/plaintext bypass | PASS | Direct APIs reject, independent of UI |
| Signed decline, block, revocation, expiry, newer pause | PASS unit / partial UI | Native approve/revoke and browser block; physical decline/block still required |
| Wrong controller, changed endpoint | PASS | Pin checks and claim substitution tests; native SDK device checks |
| Cleared whole storage / cleared SDK storage | PASS | Explicit failure; no replacement identity |
| Browser storage denied; competing tabs | PASS | Actionable refusal; exclusive Web Lock |
| Browser death between SDK commit and inbox commit | FAIL recovery / PASS fail-closed | Durable marker locks session; automatic recovery is not implemented |
| Network interruption before acceptance | NOT TESTED explicitly | After-acceptance loss is covered; run before/after cuts on final staging |
| Modified ciphertext never displayed | NOT TESTED as a product fault case | Changed retry body denied; SDK/signature protections remain; inject a new corrupt admitted packet |
| Server wire, DB, WAL, logs plaintext canaries | PASS final product run | Disposable canaries checked in runtime files and captured server wire |
| Existing Signal/recovery/provider portability | PASS JVM/provider; FAIL native suite | Final verify job passes; focus/QR failures above retained |
| Original certificate upgrade / old preview identity intact | DEVICE REQUIRED | Side-by-side package avoids upgrade; do not uninstall old preview |
| Pixel 10a Android 16 + exact Chrome version | DEVICE REQUIRED | User supplied hardware/OS; Chrome version and physical test pending |
| Ordinary camera QR → usable page cold | DEVICE REQUIRED | Run on phone, not an automated DOM timing |
| First visitor explains value within 5 seconds | DEVICE REQUIRED | Ask “What can you do here?” without coaching; record exact response/time |
| First successful request within 20 seconds | DEVICE REQUIRED | Start at usable page, include typing; record failures/duplicates |
| Owner request arrival / reply latency | NOT TESTED on physical network | Separate timestamps; owner foreground versus background must be distinguished |
| Completion without coaching | DEVICE REQUIRED | Separate participant; the operator's setup is not the visitor test |
| Mobile data / cold DNS/TLS/WASM / browser reopening later | DEVICE REQUIRED | Wi-Fi-only host cannot serve cellular without a private VPN |
| TalkBack, large text, keyboard, denial and slow/offline retry | DEVICE REQUIRED | Automated mobile viewport is not physical accessibility acceptance |
| Android background limits / closed browser reply discovery | NOT TESTED physically | No push. Reopen/unlock inbox and revisit saved browser URL |
| Independent security review | NOT TESTED | Separate reviewer required; this implementation is not its own review |

## Operational limits and rollback

The current pilot is single-worker, single SDK device per owner, one hour per
invitation, at most 20 browser identities, text only, and foreground inbox only.
Blocks apply to a browser identity; a person can create another identity. Current
purpose rules and signed decisions are checked for new sends and retries. This
pilot refuses out-of-hours sends; full accept-and-queue scheduling is not yet
implemented. Do not present that narrower behavior as complete parity with Signal.

Identity backup/recovery and provider migration preserve the existing Signal
contract. Matrix guest transcripts/SDK sessions are not included in those identity
backups and cannot be silently adopted by a new device. A new provider/device
requires a new explicitly shared guest invitation; transparent migration is not
claimed. Invitation renewal on the same configured owner is not yet exposed.

[Mac staging and rollback](MAC-PILOT.md) keeps the installed Veil Purposes Preview
untouched. The pilot debug APK trusts user-installed CAs for local development
HTTPS; regular Veil does not acquire that exception. A substituted initial QR/link
and malicious browser-delivered code remain residual risks. Signatures prove key
control, not a name or real-world credential. Neither browser nor recipient device
can be claimed to prevent copying or screenshots.
