# Threat model and release gates

All controls below are **requirements for the unimplemented Matrix channel**
unless explicitly called existing. This is not a cryptographic audit.

| Threat / boundary | Required control and residual risk |
|---|---|
| Passive homeserver/database operator | Endpoint-only SDK encryption; no device, cross-signing, backup, store-encryption or recovery private secrets at provider. Inspect raw stored events and network traffic for the exact test text/name. Authentication tokens and server TLS/federation keys are transport secrets, not E2EE secrets. |
| Active homeserver substitutes device keys | Independently pinned purpose controller signs endpoint bindings; verify SDK-authenticated sender provenance and refuse key sharing to replacements/unbound devices. Do not auto-verify a homeserver-provided device. Server can still suppress messages, deny service and replay stale signed state to a fresh client. |
| Malicious website host/dependency/update | First-load JS can steal plaintext or use browser keys even if nonextractable. Dedicated origin, no third-party scripts/analytics, bundled pinned dependencies, integrity/reproducible build review, restrictive CSP and no logs reduce risk but do not eliminate malicious code delivery. SRI/CSP delivered by the compromised host do not establish an independent trust root. |
| Other scripts / XSS / framing | Render text via textContent; block inline/eval scripts, framing and arbitrary connect destinations. A future WASM CSP exception must be narrowly reviewed. Existing disabled server uses `connect-src 'none'`; don't weaken it before the proof. Test URL/referrer/log leakage and same-origin storage boundaries. |
| Link substitution / forwarding / guessing | Real QR/link must authentically convey the controller pin. Forging an entire first-contact link can fool a user lacking independent provenance. A forwarded real link permits one request, never approval. Use 256-bit random invitation capability, no enumeration, bounded claim rates. |
| Many guests / replay / reload | Persistent atomic single claimant, nonce replay consumption, exact request/ciphertext hash and stable Matrix transaction ID. Parallel-tab crypto-store lock and retry tests. No counter enforced only by client code. |
| Permission bypass through native Matrix APIs | Provider enforcement at the homeserver boundary, not merely webpage/gateway; test direct sends, alternative event types and to-device abuse. Pinned clients also enforce signatures, time, membership and terminal decisions. A malicious unrelated server is not constrained by Veil's UI or policy. |
| Malicious participant / copied messages | Text-only parsing and size limits after authenticated decryption. No protection against copying, physical screenshots or filming. Expiry/revocation prevents authorized future contact; it cannot erase received messages or already shared session keys. |
| Metadata / purpose correlation | Homeservers see MXIDs/device keys, room membership, IPs, timing, event types, lengths, auth/claim activity and public state required for policy. Use different purpose-local identities and technical accounts where needed; never publish root identity or purpose mappings. Same IP/device behavior, repeated labels and shared accounts can still correlate purposes. |
| Storage loss / browser restrictions | Local keys and outbox must be durably stored before claim/send. Storage denial fails closed. Clearing/private browsing can lose access permanently; third-party storage/cookies must not be required. No automatic restoration from URL or push notification promises. |
| Android integration / recovery | Separate SDK store and adapter; preserve Signal DB, keys, package ID and signer. No silent key/session migrations. Existing pi/1 backup contains identity/relationship material, not Matrix message history; any backup extension needs a separately versioned contract and tests. |
| Clock / rollback / migration | Signed integer times, monotone revisions, exact same-revision payload checks and retained terminal decisions. Provider and client recheck authorization at send/delivery. Fresh clients and stale backups have freshness limits; no global consensus claim. |
| Operational compromise | No admin credential in browser/APK, no plaintext push payloads, disable HTTP body/debug SDK logging. Technical account expiry and cleanup are explicit. Native guest availability, rate limits, backups, TLS, disk use and federation are real operating costs. |

Public deployment requires all of: genuine browser↔Veil Android encrypted
intro/reply proof with authenticated purpose binding; server plaintext/key
inspection; policy-bypass/adversarial tests; real physical-phone UX and existing
installation/Signal regression; independent security assessment of the integration
and browser delivery. None is waived by a green dependency scan, SDK audit,
unit-test count, Chromium screenshot or this document.

No homeserver or hosting resource was created in this session: new hosting cost
is zero. Production compute, bandwidth, storage, monitoring and abuse costs
are not estimated because no workload was measured. An SDK's open-source license
does not make its operation free.
