# Executable Matrix experiment: actual results

Date: 2026-10-21. PR #9 remains draft. No public deployment and no guest Send enablement.

**Final isolated workflow: PASS**, [run 39576585395](https://github.com/Soldsoul86/orb/actions/runs/39576585395).
Tested executable commit: `e3790cb585a536edf07d66430448398513b4ea4f`.
Browser job `119143492698` and Android job `119144149082` both completed with
`success`, including cleanup. Selected actual logs and artifact digests:
[interop-actions.txt](interop-actions.txt). The later evidence-only commit changes
no executable files. Earlier failed attempts are retained below.

The run used private Synapse 1.163.0, Matrix JS SDK 44.0.0, crypto WASM 18.9.0,
Chromium through Playwright 1.56.0, and Android API 35 x86_64. Android used the
official Matrix Rust crypto SDK Kotlin/JNI bindings built from upstream commit
`56bc59112822e7eb25943a95e02502855cdeef2d`, with the unchanged Veil identity-core.
The protocol is real SDK **Olm to-device encryption**, not room/Megolm history.

Sanitized results: [browser artifact](https://github.com/Soldsoul86/orb/actions/runs/39576585395/artifacts/12334492787),
[Android artifact](https://github.com/Soldsoul86/orb/actions/runs/39576585395/artifacts/12334029174).
Runtime credentials, endpoint stores, APKs, raw databases and traffic were not
uploaded. These are executed integration results, not a cryptographic audit or
authorization to enable public guest Send.

| Area | Status | Evidence/limit |
|---|---|---|
| Browser SDK encrypted request and reply | PASS | Two independent Chromium contexts, real Olm SDK session, local decryption and purpose-signature verification. |
| Purpose/device binding | PASS | Independent wrong pin and validly signed mismatched SDK key both refused. |
| Approval and initial quota | PASS | Owner reply and concurrent second introductions refused before signed approval; approved encrypted reply succeeds. |
| Expiration and revocation | PASS | Server-time expiry, both-direction revocation and signed-policy rollback tested through raw API calls. |
| Direct API alternatives | PASS | Room send/create, plaintext to-device, legacy route, wildcard recipient and guest policy update refused. |
| Concurrent first claim / retry | PASS | One of two concurrent introductions accepted, exact transaction retry accepted, changed body refused. |
| Purpose schedule | PASS | Signed closed weekday blocks direct encrypted submission. |
| Server plaintext inspection | PASS (limited observation) | Actual wire ciphertext observed; known request/reply canaries absent from provider/Synapse DB, WAL and logs. No server E2EE decryption code or endpoint secrets. |
| Android SDK request/reply | PASS | Native instrumentation decrypted and authenticated the browser request, signed approval, encrypted a reply, and revoked. Chromium authenticated the reply; result collection and Gradle test completion succeeded. |
| Android-owner revocation boundary | PASS | After native revocation, a fresh genuine SDK ciphertext submitted by browser raw API was refused. |
| Existing guest release gate | BLOCKED as required | Unchanged unconditional refusal; exit 2. This is not a feature release PASS. |
| Root Orb CI | FAIL (pre-existing) | Run 39576585644 at the tested commit: lint/build/independent compilation and 666 tests PASS; unchanged hard-exit demonstration throws at line 201. |
| Physical phone, live Signal, persistence/recovery, two Matrix providers | NOT TESTED | Source preservation does not prove a device/runtime regression result. |
| Independent security review / supported production adapter | BLOCKED release gates | Version-pinned roomless browser adapter uses two SDK internals; experimental code is not enabled in production. |

## Completed attempts

| Run | Actual outcome |
|---|---|
| [39570894838](https://github.com/Soldsoul86/orb/actions/runs/39570894838) | FAIL browser login. PASS private Unix-listener Synapse provisioning. No encryption test reached. |
| [39571138855](https://github.com/Soldsoul86/orb/actions/runs/39571138855) | FAIL with Synapse `M_UNKNOWN` login error. Fixed Unix upstream's missing client address using gateway-generated forwarded headers. |
| [39571628335](https://github.com/Soldsoul86/orb/actions/runs/39571628335) | FAIL browser WASM asset URL. Login reached. Android NOT TESTED (dependency skipped). |
| [39571987992](https://github.com/Soldsoul86/orb/actions/runs/39571987992) | FAIL initial sync timeout. Added narrowly scoped authenticated own-account sync-filter API required by SDK startup. |
| [39572181801](https://github.com/Soldsoul86/orb/actions/runs/39572181801) | FAIL unknown crypto-store device. Public SDK lookup did not populate untracked user keys. Added documented version-pinned SDK key-query adapter. |
| [39572691554](https://github.com/Soldsoul86/orb/actions/runs/39572691554) | PASS two Chromium SDK crypto contexts, purpose-pin rejection, signed mismatched-device rejection, modified policy rejection, preapproval reply denial. FAIL introduction submission: gateway rejected SDK's standard optional `org.matrix.msgid`; added bounded acceptance. Android NOT TESTED (dependency skipped). |
| [39573013917](https://github.com/Soldsoul86/orb/actions/runs/39573013917) | PASS genuine encrypted browser introduction and reply, signed approval, revocation both directions, rollback denial, direct API bypass tests, atomic introduction race, exact retry, changed-body rejection and server-time expiry. FAIL later schedule fixture setup because initial SDK key upload was still asynchronous; initialization now waits for observed publication. Android NOT TESTED (dependency skipped). |
| [39573339196](https://github.com/Soldsoul86/orb/actions/runs/39573339196) | Browser job PASS, including closed-hours enforcement, SDK ciphertext inspection and no plaintext canaries in provider/Synapse databases, WAL or logs. Android native build and emulator boot PASS; Kotlin compile FAIL (missing `RequiresApi` annotation dependency), Android message exchange NOT TESTED. |
| [39574887852](https://github.com/Soldsoul86/orb/actions/runs/39574887852) | Browser suite PASS. Android native instrumentation test and authenticated encrypted reply PASS. Overall job FAIL on result-file collection after Gradle uninstalled the completed test app; post-test boundary/storage checks NOT TESTED. Added explicit result collection handshake. |
| [39576585395](https://github.com/Soldsoul86/orb/actions/runs/39576585395) | Complete browser and Android jobs PASS. Real SDK encrypted request/reply, signed purpose/device binding, provider policy/bypass tests, Android-owner revocation, result collection and server DB/WAL/log sentinel checks all completed successfully. |

The local sandbox cannot create a socket (`EPERM`) and has no Android toolchain.
These are local limitations, not evidence that GitHub Actions cannot run Matrix.
GitHub Actions successfully ran the private homeserver, browser SDK, native SDK
build, KVM emulator and actual Android instrumentation. No alternative runner was
needed. Transient Playwright mirror DNS failures recovered through its download
fallback; they did not prevent the completed tests.

Existing disabled guest gate regression rerun locally: Node 10 PASS / 1 Nimbus
fixture skipped; Python 4 PASS. Skips remain NOT TESTED. No production Android,
Signal, identity/recovery, provider or relay source was changed by this experiment.

Remaining product gates are listed in [integration/README.md](../integration/README.md).
The root Orb verification failure in `simulate-hard-exit.mjs` is pre-existing,
as recorded in [ci-excerpts.txt](ci-excerpts.txt); it is not a Matrix PASS or a
reason to change unrelated trading code.
