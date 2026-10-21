# Browser cryptography gate — primary-source research, 2026-10-21

No browser encryption adapter is enabled, selected as release-ready, or shipped in this directory. This is not proof that browser E2EE is impossible. It is a finding that none of the candidates examined has yet met this project's combined review, exact-wire-compatibility and deployment requirements.

| Candidate | Maintenance / license evidence | Browser and actual Veil compatibility | Decision |
|---|---|---|---|
| Official Signal libsignal | Latest release observed v0.105.2, 2026-10-20; Veil pins 0.105.0. AGPL-3.0-only. | Current TS package publishes native `.node` addons for desktop Node. No supported browser artifact documented. Veil requires Kyber1024 bundle fields and serialized Signal types, not merely an X25519 cipher. | Keep Android implementation; reproduce browser bundling failure separately. A Node server holding guest private keys would violate E2EE and is rejected. |
| Official legacy libsignal-protocol-javascript | Archived 2021-08-05, GPL-3.0. | Old browser implementation predates PQXDH. No current 0.105.0 compatibility established. | Reject as release dependency. |
| theju/libsignal-wasm | Manifest 0.1.0, AGPL-3.0-only, publish=false; README bases wrapper on 0.102.3. | Browser WASM adapter, but README explicitly labels it AI-generated and experimental pending review/audit. | Candidate for isolated research only; no verified independent audit or Veil proof. |
| getmaapp/signal-wasm | Current manifest 0.6.6; upstream libsignal revision b056faa6dd02961cff24064c54c089c52e1a0753 (0.101.0); AGPL-3.0-only. | Browser API exists. Checked repository audit document covers wrapper 0.1.1/upstream 0.86.11, dated 2026-02-02. It does not identify an independent reviewer or establish review of the current bridge/integration. | Do not inherit its “production-ready” claim. Exact current review evidence and 0.105.0 Android interoperability remain missing. |
| vodozemac + matrix-sdk-crypto-wasm | vodozemac 0.11.1 released 2026-09-30; WASM 18.9.0 released 2026-09-21. Apache-2.0. vodozemac links a Least Authority audit. | Maintained browser WASM for Olm/Megolm, not Signal's wire protocol. Requires a distinct Android guest protocol and reviewed identity binding/integration. | Viable separately designed alternative; do not splice into existing Signal sessions or replace the owner's identity. |
| OpenMLS | RFC9420 implementation, browser WASM support documented; project reports independent SRLabs audit. MIT. | MLS is a different protocol. Android binding, two-party lifecycle, credential binding and gatewayless routing require a separate versioned design and proof. | Standards-based alternative for a separate decision, not implemented here. |

Primary evidence:
- https://github.com/signalapp/libsignal/blob/main/README.md (Node/native distribution, external use unsupported, AGPL)
- https://github.com/signalapp/libsignal/blob/main/node/package.json (0.105.2, native prebuild files)
- https://github.com/signalapp/libsignal/releases/tag/v0.105.2
- https://signal.org/docs/specifications/pqxdh/ (protocol provenance and linked formal analysis; not an audit of this app)
- https://github.com/signalapp/libsignal-protocol-javascript (archival/maintenance notice)
- https://github.com/theju/libsignal-wasm/blob/main/README.md
- https://github.com/theju/libsignal-wasm/blob/main/Cargo.toml
- https://github.com/getmaapp/signal-wasm/blob/main/Cargo.toml
- https://github.com/getmaapp/signal-wasm/blob/main/SECURITY_AUDIT_REPORT.md
- https://github.com/matrix-org/vodozemac/blob/main/README.md
- https://matrix.org/media/Least%20Authority%20-%20Matrix%20vodozemac%20Final%20Audit%20Report.pdf (linked by project; audit scope/version must be reassessed before adoption)
- https://github.com/matrix-org/matrix-sdk-crypto-wasm/blob/main/README.md
- https://latest.openmls.tech/book/
- https://blog.phnx.im/openmls-independent-security-audit/

Required proof before enabling: actual browser generates and persists guest keys → validates independently pinned controller/state/channel → encrypts exact Veil context → opaque relay → unchanged Veil decrypts → authenticated owner grant/reply → browser decrypts. Include wrong keys, forged grants, tampering, prekey reuse, replay, out-of-order delivery, reload/outbox transactions, concurrent tabs, expired and revoked grants. No such message proof has passed in this milestone. The Nimbus→Web Crypto public-signature fixture is deliberately a separate test and cannot satisfy T03/T04.

Software/audit maintenance matters independently of protocol review. Do not assume compiling upstream Rust to WASM preserves safe RNG, persistence, lifetime, key pinning or error behavior. Third-party dependency scan grades and automated reviews are not an independent integration audit.
