# Programmable purposes: additive milestone

## Repository inventory (2026-10-15)

| Area | Evidence | State |
|---|---|---|
| Private text/photo/video chat | Messenger.kt, SignalSession.kt; user-reported two-phone use | WORKING, detailed physical matrix incomplete |
| E2EE | libsignal 0.105.0 native integration tests | WORKING; integration not independently audited |
| Unlock / secure viewer | MainActivity, SecureMediaView; emulator reports | PARTIAL verification; intermittent focus fixture failure |
| HTTPS relay | /v1/boxes, SQLite/Postgres; live relay smoke test | WORKING |
| Background push / WSS | No implementation | ABSENT |
| Contact model | One peer in encrypted vault.v1 | WORKING, one conversation only |
| Purpose policy / directory / grants | No implementation before this change | ABSENT |
| Link / QR | Manual veil1 invitation only | ABSENT |
| Recovery | No backup; Keystore wrapping, backup disabled | ABSENT; loss of device means loss of secrets |
| Safe update signing | Original debug key not saved; certificate pin now blocks incompatible publication | BLOCKED |

The standalone app boundary in apps/veil/DESIGN.md applies. No Orb runtime journal, account or permanent history is changed. Root AGENTS.md is absent; CLAUDE.md, MASTER.md, CONSTITUTION.md and docs/SETTLED.md were read. The requested additive work is authorized by the uploaded implementation prompt.

## Design decisions

Keep the existing /v1 relay and existing Messenger/SignalSession cryptography. Add /v2 purpose APIs and additive, idempotent database tables. Keep purpose client state in a separate Keystore-wrapped AtomicFile so the old single-conversation vault is not migrated or overwritten. Each reserved contact consumes one independently generated Signal bundle and isolated session state. Do not reuse the existing one-peer prekey state across strangers. Public bundles are never private decryption keys.

The server stores private account routing IDs, hashed device-held capabilities, opted-in listing fields, policies, grant state and ciphertext. Accounts need no phone/email; capability authentication is possession of a random 256-bit device-generated secret wrapped by Android Keystore, not a claim of hardware-backed asymmetric account authentication. Purpose identifiers and aliases are independently random. Public responses never expose the internal account ID or an account-global key.

Discovery keys are trust-on-first-use via the selected HTTPS directory. The server could substitute first-contact bundles; new contacts must be labeled unverified and may compare the existing libsignal safety numbers. Directory discovery does not authenticate a real-world person. Existing manually verified chat is unaffected. No custom key agreement or encryption protocol is introduced.

Runtime enforcement uses validated structured policy, server UTC time and IANA timezone conversion, with half-open local-time intervals. Content-type metadata permits routing checks but cannot prove the content of E2EE payloads; recipients must validate the authenticated payload type too. Requests are one encrypted introduction, never an unlimited messaging capability. Schedule gates delivery even for ciphertext accepted earlier. Revocation, blocking, expiry and content-policy edits delete undelivered ciphertext; pause retains it until resume or expiry. Sender message TTL can expire before the next opening.

Only templates/forms and a deliberately narrow deterministic sentence grammar are supported. Unknown free text must be corrected, never interpreted permissively. No external model or paid parsing service. No analytics. Browser entry is an install/open-in-app handoff only, never a plaintext message form.

## Explicit limits

This is a bounded pilot: one device per account, small purpose/contact/queue quotas, no anonymity against the operator, no Sybil-proof abuse defense, no production signing recovery, no server master decryption key. New endpoints are not live until deployment is verified. Physical international, QR and under-60-second usability claims require real tests. Recovery and document viewing must remain visibly unavailable until safely implemented and tested.
