# Matrix-native guest channel: decision checkpoint

Status: **BLOCKED / NOT IMPLEMENTED**, 2026-10-21. This is a Phase 0 decision and
reproducible environment-blocker package, not a delivered guest conversation.
Matrix remains the preferred candidate for an isolated guest channel. There is
no browser-to-Android Matrix message proof, SDK adapter, homeserver, account
provisioner, new owner UI or new signed-policy issuer in this change.

This branch starts at draft [PR #8](https://github.com/Soldsoul86/orb/pull/8),
`53eee234b03fb731b434662f2bd041d3755ca843`, preserving its history and disabled
browser foundation. No cherry-pick or duplicate foundation. Review this delta
against `codex/veil-guest-gate`, not `main`.

- [DESIGN.md](DESIGN.md): decision, exact upstream candidates and alternatives.
- [API.md](API.md): proposed identity/session and permission contracts; not wire support.
- [THREAT_MODEL.md](THREAT_MODEL.md): trust boundaries and outstanding security gates.
- [TESTS.md](TESTS.md): baseline, acceptance matrix and run instructions.
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
configuration, APKs and live services are unchanged. No APK was built. No
automatic browser-to-sideloaded-APK conversation transfer is claimed.
