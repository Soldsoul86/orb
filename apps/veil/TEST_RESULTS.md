# Portability verification — 2026-10-15

Status: **working isolated-provider proof; deployment/physical validation remains PARTIAL**. No production-federation or independent security-audit claim. Provider A and B are separate processes/databases/origins on the same CI host, not separate human operators. Actual Android instances are API35 AOSP x86_64 emulators, not physical phones.

## Evidence already executed

- Baseline before edits: local Python relay suite, 32 collected, **30 PASS / 2 SKIP** (PostgreSQL reconnect requires Postgres; real-HTTP test cannot bind sockets in this managed workspace). Repeated after changes with the same result. The HTTP path is exercised separately in CI.
- [Core-only CI 38769186735](https://github.com/Soldsoul86/orb/actions/runs/38769186735): **PASS**, Nimbus10.9 core compiled and 2 tests.
- [JVM CI 38772173919](https://github.com/Soldsoul86/orb/actions/runs/38772173919), commit `52c66fdd20c9c90c44250381ae9b0815af7fedc1`: **2 core +18 app JVM tests PASS**, 0 failures/ignored, and6 provider tests PASS. Report artifact11991812832 was downloaded and inspected. Native libsignal migration test output:

```
PASS: independent Python verifier, A process stopped and DB removed, fresh JWE restore,
same controller, NEW Signal message/reply through B, revocation.
JVM processes; not physical devices.
```

- [Android CI 38772595248](https://github.com/Soldsoul86/orb/actions/runs/38772595248), commit `f08db937eda52d2335e8fb77999b5a93cdf22e5f`: **PASS** build/unit/lint, real two-emulator TLS migration plus existing12 Android crypto/privacy/editor/QR regressions. Decisive log:

```
16:57:59 PASS Android stage: owner
16:58:00 PASS Android stage: peer
16:58:01 PASS Android stage: approve
16:58:02 PASS Android stage: send-original
16:58:03 PASS Android stage: export
16:58:03 PASS Provider A offline: process stopped, database removed, TCP port refused
16:58:05 PASS Android stage: restore
16:58:05 PASS: independently verified pinned controller and signed state, revision 2
16:58:05 PASS Android stage: accept
16:58:07 PASS Android stage: receive-new
16:58:07 PASS Android stage: receive-reply
16:58:08 PASS Android stage: revoke
16:58:08 PASS Android stage: revoked
PASS two Android emulators, separate TLS providers/databases, independent verifier,
fresh restore, new Signal message and reply with A offline. NOT physical-device verification.
```

- Expanded local provider suite: **9 tests PASS** (real P-256 signatures, synthetic ciphertext, not an E2EE claim). Includes DST repeated/skipped hours, bounded TTL, terminal retries, grant expiry and modified signatures. Local Python cryptography50.0.0/PyJWT2.13.0; CI pins/tests PyJWT2.15.1. Final revision validation is recorded below when available.
- Initial full CI38771572849 **FAIL** at setup-android's removed legacy `tools` package, before application compile. Fixed explicit SDK packages; subsequent builds above passed.
- Unrelated root Orb `verify` workflow **FAIL** in pre-existing trading test `event.risk.measured.toFixed is not a function`. This is outside Veil and was not disguised as a passing repository-wide test.

## Gate scope

| Gate | Result | Evidence / boundary |
|---|---|---|
| G1 Independent control | PASS | Two Android-created wallets/facets, no phone/email/account; JOSE and independent verifier; offline creation tests. |
| G2 Explicit programmable purpose | PASS | Signed typed state, manual approval, review/consent editor test, deterministic hours/DST tests. |
| G3 Approved real encrypted communication | PASS | Two Android libsignal instances over TLS; pre-approval send denied; approved message decrypted; revocation denies later send. |
| G4 Encrypted portable recovery | PASS for demonstrated owner relationships | JWE wrong key rejected; fresh Android vault imports same ownership/purpose keys and approved grant; old history absent by design. Outgoing-only peer recovery not automated. |
| G5 A offline, independent B route | PASS for isolated-stack proof | A process stopped/DB removed/port refused; no-A transport assertion; independent Python verifier; NEW Android Signal message and reply through separate B DB/TLS origin. Independent production operators NOT TESTED. |
| G6 Honest reproducible evidence | PASS | Source harnesses, logs, reports, open protocol, threat model and explicit limits. |

These gates establish the **narrow reproducible technical proof**, not a production-ready globally deployed product. Full external deployment and physical UX remain PARTIAL. Existing two-phone reports from the founder applied to the earlier messenger, not this new identity feature.

## Still required / not inferred

| Check | Status |
|---|---|
| Two independently administered public HTTPS hosts/accounts | NOT TESTED; deployment/config templates provided |
| Two physical phones performing new portable backup/import/route flow | PHYSICAL DEVICE REQUIRED |
| Android SAF file-picker recovery UX under rotation/process death/OEM providers | PHYSICAL DEVICE REQUIRED; core restore is tested, manual UI not claimed |
| OEM screen recording, third-party screen sharing/casting, accessibility differences | PHYSICAL DEVICE REQUIRED |
| Photograph watermark with another camera and assess attribution | PHYSICAL DEVICE REQUIRED; never fabricated |
| Independent protocol/security audit, robust controller compromise recovery, global freshness | NOT TESTED / not implemented |
| Cross-vendor independent Android wallet implementation | NOT TESTED; Python verifier is independent verification, not a second full wallet |

Runnable commands and manual two-phone procedure: PROVIDER_MIGRATION_DEMO.md. No keys, recovery material, private message bodies or raw fixture backups are published in evidence artifacts.
