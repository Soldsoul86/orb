# Matrix-native guest channel: isolated integration experiment

The executable [integration harness](integration/README.md) runs a disposable
private Matrix homeserver, real Chromium SDK clients and a separate Android
instrumentation application in GitHub Actions. It tests SDK encryption, signed
purpose/device bindings and provider-boundary policy enforcement. See
[current evidence](evidence/integration-runs.md) for actual PASS/FAIL/BLOCKED/
NOT TESTED outcomes. This is not a released guest feature; Send remains disabled.

This branch starts at draft [PR #8](https://github.com/Soldsoul86/orb/pull/8),
`53eee234b03fb731b434662f2bd041d3755ca843`, preserving its history and disabled
browser foundation. No cherry-pick or duplicate foundation. Review this delta
against `codex/veil-guest-gate`, not `main`.

- [DESIGN.md](DESIGN.md): decision, exact upstream candidates and alternatives.
- [API.md](API.md): proposed identity/session and permission contracts; not wire support.
- [THREAT_MODEL.md](THREAT_MODEL.md): trust boundaries and outstanding security gates.
- [integration/README.md](integration/README.md): executable scope and reproduction.
- [TESTS.md](TESTS.md): historical Phase 0 baseline and wider product acceptance gates.
- [evidence/](evidence/): actual local command results, not simulated chat evidence.

Run from the repository root:

```sh
python3 apps/veil/guest-web/matrix/preflight.py --network
```

The probe is read-only apart from an ephemeral loopback listener. It performs
no account registration, sends no messages, deploys nothing, and reads no secrets.
It returns 2 if a local experiment prerequisite is missing. Even a successful
preflight is **not E2EE evidence or release authorization**.

Public Send and the unconditional release gate remain closed. Existing personal
Signal conversations, purpose identities/recovery, application ID, signing
configuration, production APKs and live services are unchanged. The experiment
uses a separate disposable test application ID and debug signer. No
automatic browser-to-sideloaded-APK conversation transfer is claimed.
