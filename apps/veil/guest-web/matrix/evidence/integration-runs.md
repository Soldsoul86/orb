# Executable Matrix experiment: actual results

Date: 2026-10-21. PR #9 remains draft. No public deployment and no guest Send enablement.

This record is being updated from completed Actions jobs. The executable workflow
is `Veil isolated Matrix interoperability`, not the unrelated root `verify` job.
Results below do not infer PASS from source code or from historical pi/1 tests.

**Browser job PASS**, [run 39573339196](https://github.com/Soldsoul86/orb/actions/runs/39573339196),
commit `f338bb16f758b7584536a7cab987a7c71ae59c5d`. Completed job
`119132686251` passed the entire real browser exchange and hostile API suite.
Selected actual output: [browser-actions.txt](browser-actions.txt). Android job
`119133310906` FAILED during Kotlin compilation: generated SDK bindings required
the missing AndroidX annotation dependency. Native Rust/JNI build, binding
generation, KVM and emulator boot passed; message exchange was NOT TESTED in that
attempt. The annotation dependency is now added and compilation precedes boot.

In [run 39574887852](https://github.com/Soldsoul86/orb/actions/runs/39574887852),
the browser suite passed again. Android Kotlin compilation, emulator boot and
the real instrumentation test **passed** (`BUILD SUCCESSFUL`; one test completed).
Chromium authenticated the native Android encrypted reply. The overall job then
**failed** collecting `result.json`: Gradle's automatic test-app uninstall raced
the harness. An explicit collection acknowledgment is added before test return;
the whole job is being rerun. Post-test direct revocation/storage checks were
**NOT TESTED in that failed harness attempt**.

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
| Android SDK request/reply | PASS in 39574887852 | Native instrumentation completed and browser decrypted/authenticated its reply. Overall job FAIL on subsequent result-file collection; final checks pending rerun. |
| Existing guest release gate | BLOCKED as required | Unchanged unconditional refusal; exit 2. This is not a feature release PASS. |
| Root Orb CI | FAIL (pre-existing) | Run 39573339179: lint/build/independent compilation and 666 tests PASS; unchanged hard-exit demonstration throws at line 201. |
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

The local sandbox cannot create a socket (`EPERM`) and has no Android toolchain.
These are local limitations, not evidence that GitHub Actions cannot run Matrix.
Actions has already run the private homeserver and genuine browser SDK crypto.

Existing disabled guest gate regression rerun locally: Node 10 PASS / 1 Nimbus
fixture skipped; Python 4 PASS. Skips remain NOT TESTED. No production Android,
Signal, identity/recovery, provider or relay source was changed by this experiment.

Remaining product gates are listed in [integration/README.md](../integration/README.md).
The root Orb verification failure in `simulate-hard-exit.mjs` is pre-existing,
as recorded in [ci-excerpts.txt](ci-excerpts.txt); it is not a Matrix PASS or a
reason to change unrelated trading code.
