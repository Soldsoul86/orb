# Executable Matrix experiment: actual results

Date: 2026-10-21. PR #9 remains draft. No public deployment and no guest Send enablement.

This record is being updated from completed Actions jobs. The executable workflow
is `Veil isolated Matrix interoperability`, not the unrelated root `verify` job.
Results below do not infer PASS from source code or from historical pi/1 tests.

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
