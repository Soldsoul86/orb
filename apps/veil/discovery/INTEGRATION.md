# Discovery and guest integration — implementation record

Status: implementation in progress; public Send remains unconditionally disabled.
No public deployment or APK release is authorized by this change.
Stacked draft: [PR #11](https://github.com/Soldsoul86/orb/pull/11).

## Implemented increment

Android now has a private-by-default form with public name, purpose, category,
services and remote-work scope. Review shows the disclosure and existing purpose
rules. Editing the form clears consent. Publish signs with the existing purpose
controller and sends directly to a configured HTTPS directory. A matching
receipt enables a real profile link and QR; an ambiguous failure retains the
exact encrypted-vault command for retry. Advanced signed exports remain available.
This preview still requires an existing purpose and a configured directory;
the two-minute onboarding target and live HTTPS publication are not demonstrated.

The directory supports transactional compare-and-set, including independent
concurrent workers, exact retries and hosting refusal. Explicit recovery advances
the local counter only from a verified current public owner signature. Restored
devices still need authenticated migration; deleted, blocked, expired and private
records do not expose a recovery baseline. The full backup-recovery requirement
therefore remains partially open.

The browser experiment now uses the public standalone Matrix crypto API, with
SDK device-key lookup, trust, Olm encryption and authenticated decryption
provenance behind a serialized adapter. It no longer imports Matrix JS or reaches
into its private fields. The actual Android guest product adapter/inbox is still
missing: the native interop test remains PR #9's separate test app.

## Provenance and reuse

- Discovery parent: PR #10, `42c9c58e85eeeb3ac62a916b842902e983932bc1`.
- Matrix parent: PR #9, `d94c5d0ee85284d468bc98f673c5d18402550393`.
- Audited conflict-free merge: `6b5ac75`; common foundation PR #8,
  `53eee234b03fb731b434662f2bd041d3755ca843`. Neither source branch changed.
- Existing `PortableSession`, encrypted `Vault`, controller signatures,
  `DiscoveryPublication`, PostgreSQL directory and four-category search remain
  the owner/publication foundation. Signal sessions are a separate channel.
- PR #9 supplies the Unix-only Synapse boundary, actual Olm SDK exchange,
  signed endpoint/policy contracts and negative direct-API harness.
  Its isolated Android test application is not product acceptance evidence.

## Implementation sequence

1. Replace required JSON handoffs with an Android form, disclosure review and
   direct publication; preserve advanced signed exports. Persist the exact
   signed pending command before HTTP, retry it unchanged, and display success
   only after a matching receipt. Do not silently overwrite concurrent edits.
2. Reconcile restored publication counters only from controller-authenticated
   current public content. Never trust an unsigned server counter. Compare
   revisions and exact signed content; preserve terminal deletion and operator
   refusal. New-device/provider migration still needs explicit owner action.
3. Move SDK transport behind separate owner/guest adapters; use actual owner
   vault/controller and SDK device keys, not a test-generated owner identity.
4. Add signed owner enrollment and durable guest claim at the exclusive gateway;
   connect discovery contact to a private staging guest UI and owner inbox.
5. Persist endpoint crypto/outbox/dedup state; test refresh, simultaneous tabs,
   ambiguous retries, pending approval, decline, expiry and revocation.
6. Run existing regressions plus the combined Android/browser demonstration in
   disposable CI; record evidence and blockers in the stacked draft PR.

## Trust boundaries and release constraints

The browser host can deliver malicious JavaScript. Directory signatures bind
controller-owned content, not real-world credentials or global freshness. Device
keys must match the signed controller binding before SDK trust or encryption.
Server metadata is never owner approval. The provider receives ciphertext and
routing metadata, not message keys or plaintext; it cannot enforce the semantic
topic of encrypted text. Revocation cannot recall delivered content.

Current SDK pins: standalone crypto WASM 18.9.0; official Kotlin/JNI
crypto bindings from Matrix Rust commit
`56bc59112822e7eb25943a95e02502855cdeef2d`; Signal stays at 0.105.0.
The private-interface dependency has a working public-API replacement in the
isolated experiment. Product lifecycle and security review remain gates.
The gateway explicitly rejects a second worker with an OS lock and rejects
optimized Python (which would remove its assertion checks). Distributed gateway
enforcement is not claimed. Supply-chain review, independent security review,
real-phone upgrade/Signal/recovery tests, production operations and explicit
public-release authorization remain gates.

## Acceptance ledger

| Acceptance case | Current integration status |
|---|---|
| Preserve both branches and provenance | PASS: conflict-free merge above |
| Direct owner publication and revision recovery | PASS unit/HTTP/CAS tests; live Android-to-HTTPS publication and private/deleted recovery BLOCKED |
| Combined Android owner / browser E2EE journey | NOT TESTED; not yet connected |
| Exclusive boundary, signed decisions, direct bypass | PASS 14 isolated browser checks with public SDK; production enrollment/rate/abuse controls BLOCKED |
| Reload, network retry, competing tabs, erased storage | NOT TESTED |
| Wire/DB/WAL/log/push plaintext inspection | PASS isolated wire/DB/WAL/log sentinels; product and push NOT TESTED |
| Android Signal/media/unlock/keys regressions | PASS 19 native tests on final code commit; separate CI attempts exposed intermittent QR/focus failures, recorded below; physical upgrade DEVICE REQUIRED |
| Held-out search and browser accessibility | 15/16 exact query sets, zero wrong inclusions; one false-negative FAIL. Mobile Chromium keyboard/200%/offline PASS |
| Physical Android/mobile browser/upgrade/TalkBack | DEVICE REQUIRED |
| Public Send and release | BLOCKED |

Existing PR evidence is historical, not a claim that this integration passed.
Root Orb's reported Hard-exit failure after 666 tests is unrelated; do not modify
trading/runtime code to hide it.

## Reproduction and evidence

- [Public SDK local result](evidence/integration-matrix-browser.json): 14 checks,
  source hashes and actual Chromium version; isolated test only.
- [Real mobile public profile](evidence/integration-mobile-profile.png) and
  [disabled contact](evidence/integration-mobile-contact-disabled.png), captured
  from Chromium against disposable PostgreSQL; TEST supply only.
- [Actual Android disclosure/consent screen](evidence/integration-android-owner-review.png),
  captured from the running Veil preview app in
  [run 39602345217](https://github.com/Soldsoul86/orb/actions/runs/39602345217),
  commit `53ba5f7`. The downloaded XML records 19 tests, zero failures/errors/skips.
  This capture shows the reviewed form with consent unchecked and Publish disabled;
  it is not evidence of a completed publication or chat.
- Public SDK [browser](evidence/integration-ci-matrix-browser.json) and
  [native interop](evidence/integration-ci-matrix-android.json) evidence from
  [run 39601869470](https://github.com/Soldsoul86/orb/actions/runs/39601869470),
  commit `eacad99`, both jobs PASS. This demonstrates SDK/browser/isolated Android
  interoperability after removal of private Matrix JS APIs, not the product flow.
  Downloaded artifact SHA-256 hashes were verified:
  Android UI `2b00ff197a24f7b5677030131f6824e3a50a001c1e0fc9697a2ce5eaebd8bb80`,
  Matrix Android `2d6b1d18a2a8f4f3bcad099d02e1d5e413d872b15708b7366c6573ce4a373713`,
  Matrix browser `db74d3cb86826a44ab169e4598fffac5be2b2270681a6949780d9ea7394f6d19`.
- Run `python -m unittest discover -s apps/veil/discovery/tests -v` with
  `DISCOVERY_TEST_DATABASE_URL` pointing to a disposable loopback
  `veil_discovery_test`. This resets that guarded discovery schema.
- Matrix clean-room setup is in [its runbook](../guest-web/matrix/integration/README.md).
  `npm ci` checks the committed integrity lock. Never upload `runtime/`, accounts,
  SDK stores, raw traffic, database files or APKs as evidence.
- Local result: 22 Discovery tests; 2 gateway startup tests; 10 guest Node passes
  plus one missing Nimbus fixture skip; 4 guest Python tests. Release gate exit
  code 2 is the expected BLOCKED result, not an enabled feature.
- First Android/JVM/browser CI:
  [39600726208](https://github.com/Soldsoul86/orb/actions/runs/39600726208),
  commit `d4c1226`, both jobs PASS. A separate PR-triggered run of that code
  failed `PurposeQrTest.fullSignedPortableCardQrIsTheSameInvitation` with
  ZXing `NotFoundException`; this intermittent regression is not hidden.
- Final executable commit `d2c72be`:
  [Discovery run 39603406339](https://github.com/Soldsoul86/orb/actions/runs/39603406339)
  passed both jobs: JVM identity/app/Signal/recovery tests and lint, PostgreSQL
  publication/provider/relay tests, browser checks, and 19 Android instrumentation
  tests. The parallel PR-triggered run
  [39603414976](https://github.com/Soldsoul86/orb/actions/runs/39603414976)
  passed verification but failed the unchanged native protection test's real
  window-focus precondition. Its recovery/discovery tests passed. No privacy
  assertion was removed or weakened to obtain a green result. Emulator stability
  and physical verification remain gates; one passing run is not a device audit.
- Root Orb CI reproduced 666 passing tests followed by
  `event.risk.measured.toFixed is not a function` at `simulate-hard-exit.mjs:201`.
  No trading/runtime code changed.

## Dependency and package impact

The Android application ID, signing configuration, manifest, Signal version,
vault format and native dependencies are unchanged. Production APK size and
original-certificate upgrade installation are NOT TESTED; no release APK exists
from this task. The browser experiment removed Matrix JS 44.0.0 and its
transitives; its locked direct dependencies are crypto WASM 18.9.0 (Apache-2.0),
JOSE 6.1.0 (MIT), esbuild 0.25.11 (MIT), and Playwright 1.56.0 (Apache-2.0).
The lock also records esbuild platform binaries, Playwright core and optional
fsevents. Python transitives and Rust transitive/license review remain release
gates; pinning a top-level package is not an audit.

## Remaining implementation and launch gates

Connect owner-controlled enrollment and guest claims to the exclusive boundary;
build the actual Android guest inbox/approval/reply adapter and browser UI;
persist browser crypto/outbox/dedup and test crash/reload/competing tabs; complete
private/deleted recovery; demonstrate the combined signed Discovery → encrypted
request → real owner reply journey. Then require independent security review,
physical-device upgrade/Signal/recovery/accessibility evidence, production HTTPS
and abuse/operations readiness, and explicit public-release authorization.
