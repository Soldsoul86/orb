# ADR: a separate Matrix-native guest conversation

Decision date: 2026-10-21. **Proposed integration, not proven or enabled.**
The user authorized evaluating this separate channel. It adds no authority to
Orb servers and does not amend the constitution or replace any existing session.
The repository tree at the base contains no `AGENTS.md`; `CLAUDE.md`, `MASTER.md`,
`CONSTITUTION.md`, `docs/SETTLED.md` and Veil's `OPEN_PROTOCOL.md` were read.

## Decision and evidence

Keep `org.signal:libsignal-android` and `libsignal-client` **0.105.0** for existing
Veil conversations. `app/build.gradle.kts` already pins them, and pi/1 binds its
Signal prekeys/ratchets to owner-controlled identities. This library does not
connect Veil to Signal accounts or the Signal network. Its supported JS
distribution uses Node-native addons; another browser port is not the narrowest
route. External libsignal use is explicitly unsupported upstream.

Prefer Matrix JS SDK with its Rust/WASM crypto and the maintained Matrix Rust
SDK Kotlin bindings for a **new** conversation type. Official SDK documentation
supports browsers and Android bindings, and Element uses these implementations.
Olm/Megolm keys, envelopes, session state and verification are not libsignal
PQXDH/Signal sessions. No conversion, shared ratchet or server decrypt/re-encrypt
bridge is permitted. Diagnostics must say which conversation type is in use.

The selected research candidates below are exact versions inspected, not a
dependency lockfile, tested compatibility set, or recommendation to ship without
checking security updates. No Matrix runtime dependencies are installed here.

| Component | Inspected version / license | Evidence and implications |
|---|---|---|
| Existing Signal | 0.105.0; AGPLv3 | [Pinned README](https://github.com/signalapp/libsignal/blob/v0.105.0/README.md); preserve Android sessions and support caveat. |
| Matrix JS SDK | 44.0.0; Apache-2.0 | [Manifest](https://github.com/matrix-org/matrix-js-sdk/blob/v44.0.0/package.json), [README](https://github.com/matrix-org/matrix-js-sdk/blob/v44.0.0/README.md); released Oct 13. Node >=22, browser bundler, `initRustCrypto()`, IndexedDB. Manifest ranges still require an integrity-locked dependency tree before use. |
| Rust browser crypto | 18.9.0; Apache-2.0 | [Release](https://github.com/matrix-org/matrix-sdk-crypto-wasm/releases/tag/v18.9.0), [README](https://github.com/matrix-org/matrix-sdk-crypto-wasm/blob/v18.9.0/README.md); released Sep 21; Rust SDK 0.19.1. Avoid deprecated libolm integration. |
| Matrix Rust SDK | 0.19.1; Apache-2.0 | [README](https://github.com/matrix-org/matrix-rust-sdk/blob/matrix-sdk-0.19.1/README.md), [release](https://github.com/matrix-org/matrix-rust-sdk/releases/tag/matrix-sdk-0.19.1); Sep 18. Handles sync, state and E2EE; direct crypto-only integration would add more lifecycle work. |
| Kotlin SDK distribution | sdk-v26.10.20; Apache-2.0 per [README](https://github.com/matrix-org/matrix-rust-components-kotlin/blob/sdk-v26.10.20/README.md) | [Release](https://github.com/matrix-org/matrix-rust-components-kotlin/releases/tag/sdk-v26.10.20) maps to Rust commit `56bc59112822e7eb25943a95e02502855cdeef2d`, **not assumed equal to Rust 0.19.1**. AAR 105,525,585 bytes, SHA-256 `6e99d46b6dc803474c8f9817c5e193507adc1c89949c1644ab84b3d21e23a935`. This is download size, not measured APK increase. |
| Synapse research server | 1.163.0; AGPL-3.0-or-later OR Element commercial license | [Manifest](https://github.com/element-hq/synapse/blob/v1.163.0/pyproject.toml), [release](https://github.com/element-hq/synapse/releases/tag/v1.163.0); Oct 14. Operational dependency, not an identity authority. |
| vodozemac review context | 0.11.1 README; prior Least Authority review | [README](https://github.com/matrix-org/vodozemac/blob/0.11.1/README.md) links its audit. That report is not a review of these SDK releases, bindings, policy enforcement or Veil. This change does not directly pin vodozemac. |

Kotlin [configuration](https://github.com/matrix-org/matrix-rust-components-kotlin/blob/sdk-v26.10.20/buildSrc/src/main/kotlin/ConfigurationData.kt)
declares minSdk 21 (Veil requires 28), group `org.matrix.rustcomponents`, artifact
`sdk-android`. Its [dependencies](https://github.com/matrix-org/matrix-rust-components-kotlin/blob/sdk-v26.10.20/buildSrc/src/main/kotlin/Dependencies.kt)
include JNA 5.18.1 and coroutines 1.7.3. Supported build targets include arm64,
ARMv7, x86 and x86_64 Android. Minimum SDK overlap does not prove Gradle, JNI,
ABI or dependency compatibility; compilation and device tests remain gates.
Browser bundle size, APK delta, runtime memory and full transitive license
inventory are **NOT MEASURED**. Release dates demonstrate recent activity, not a
maintenance SLA. License notices/source obligations must be handled before distribution.

## Anonymous experience, technical accounts

No phone, email, Google login, visible registration or app installation should
precede the first message. This does **not** mean there is no Matrix account.
The [Matrix v1.16 guest specification](https://spec.matrix.org/v1.16/client-server-api/#guest-access)
defines restricted technical guest accounts and leaves their availability to
homeservers. Federation does not communicate or universally enforce guest status.
Synapse [defaults guest access to false](https://element-hq.github.io/synapse/latest/usage/configuration/config_documentation.html#allow_guest_access).
Its [1.163.0 key endpoints](https://github.com/element-hq/synapse/blob/v1.163.0/synapse/rest/client/keys.py)
explicitly allow guests for upload/query/claim; do not claim guest E2EE is
categorically prohibited. Full guest SDK lifecycle still needs a running probe.

First try native guest registration on a disposable, private test homeserver.
If incomplete for either SDK, use short-lived pseudonymous technical accounts
with endpoint-generated random credentials and single-use registration
authorization after an atomic invitation claim. The account is transport state,
not the user's purpose identity. Do not send registration/admin secrets to the
browser. No provisioner, account TTL, revocation worker or scoped authorization
is implemented. Ordinary Matrix access tokens are not inherently scoped to one
invitation: this requires a provider enforcement integration and bypass tests.

Start with one invite-only, encrypted room per invitation, two pinned devices,
no aliases, no directory listing and no federation for the experiment. Do not
enable room history previews. Federation and separately operated providers are
later tests, not automatically safe because the protocol supports federation.

## Identity, storage and ownership

Reuse the existing per-purpose random P-256 controller and RFC7638/9278 identifier,
pi/1 ES256 compact JWS and user-held recovery. The independent root wallet key
must never appear in public contact metadata. Bind the Matrix account, device,
Ed25519 identity key and Curve25519 key to the purpose and invitation in an
owner-signed statement; require SDK-authenticated key provenance on every receive.
See [API.md](API.md). A self-signed homeserver key list is insufficient.

Use isolated SDK stores, separate from Signal keys and databases. Browser IndexedDB
needs one writer/tab lock: the SDK warns concurrent clients corrupt crypto state.
Private browsing/storage clearing loses the guest session; do not silently create
a new identity on retry. Android store encryption must use a locally generated
secret protected by Android Keystore, after verifying the chosen binding's storage
API. No plaintext logging or provider-held crypto-store passphrase. Cross-signing
and encrypted server backups are optional later lifecycle work; their signing,
backup and recovery secrets remain endpoint-owned. A server's ability to reset a
technical login does not let the replacement device pass Veil's signed-key pin.

## Portability and remaining work

The contact reference is a purpose-key identifier plus random invitation ID,
not a domain or MXID. A new owner-signed route can use a different provider and
new Matrix account/room/devices. Recipients explicitly receive and validate that
route independently. No automatic discovery, old-message/history/queue migration,
MXID migration or session migration is claimed. Existing pi/1 recovery tests are
evidence for that existing implementation only; two Matrix providers were not run.

The environment cannot create a loopback TCP socket, lacks Gradle/Android SDK
tools and Matrix JS, and shell package requests fail through the configured
proxy. [Evidence and reproduction](TESTS.md) establish a **local experiment
blocker**, not Matrix incompatibility. No new CI integration proof was authored
or run. A socket-enabled Android build/test runner with package access is needed.
After that, implement and verify authenticated binding on both SDKs, atomic
provider enforcement, persistence/retry, then the small owner/guest UI. Stop
before enabling Send if any of those fails.

Ranked alternatives if the Matrix experiment fails:

1. Matrix-native, full maintained SDKs: strongest fit for browser and Android;
   independent sessions and the provider permission hook remain work.
2. Maintained MLS/OpenMLS: different conversation protocol with additional Android,
   credential, delivery and lifecycle work; not an implemented fallback.
3. Community libsignal WASM: potential legacy-wire reuse, but exact-version and
   independent bridge review gaps recorded in [PR #8 research](../CRYPTO_COMPATIBILITY.md).
   Do not revive archived Signal JS, invent a port here or decrypt on a server.
