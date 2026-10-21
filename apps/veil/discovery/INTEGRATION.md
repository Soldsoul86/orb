# Discovery and guest integration — implementation record

Status: implementation in progress; public Send remains unconditionally disabled.
No public deployment or APK release is authorized by this change.

## Provenance and reuse

- Discovery parent: PR #10, `42c9c58e85eeeb3ac62a916b842902e983932bc1`.
- Matrix parent: PR #9, `d94c5d0ee85284d468bc98f673c5d18402550393`.
- Audited conflict-free merge: `6b5ac75`; common foundation PR #8,
  `53eee234b03fb731b434662f2bd041d3755ca843`. Neither source branch changed.
- Existing `PortableSession`, encrypted `Vault`, controller signatures,
  `DiscoveryPublication`, PostgreSQL directory and four-category search remain
  the owner/publication foundation. Signal sessions are a separate channel.
- PR #9 supplies the Unix-only Synapse boundary, actual Olm SDK exchange,
  signed endpoint/policy contracts and negative direct-API harness.
  Its isolated Android test application is not product acceptance evidence.

## Implementation sequence

1. Replace required JSON handoffs with an Android form, disclosure review and
   direct publication; preserve advanced signed exports. Persist the exact
   signed pending command before HTTP, retry it unchanged, and display success
   only after a matching receipt. Do not silently overwrite concurrent edits.
2. Reconcile restored publication counters only from controller-authenticated
   current public content. Never trust an unsigned server counter. Compare
   revisions and exact signed content; preserve terminal deletion and operator
   refusal. New-device/provider migration still needs explicit owner action.
3. Move SDK transport behind separate owner/guest adapters; use actual owner
   vault/controller and SDK device keys, not a test-generated owner identity.
4. Add signed owner enrollment and durable guest claim at the exclusive gateway;
   connect discovery contact to a private staging guest UI and owner inbox.
5. Persist endpoint crypto/outbox/dedup state; test refresh, simultaneous tabs,
   ambiguous retries, pending approval, decline, expiry and revocation.
6. Run existing regressions plus the combined Android/browser demonstration in
   disposable CI; record evidence and blockers in the stacked draft PR.

## Trust boundaries and release constraints

The browser host can deliver malicious JavaScript. Directory signatures bind
controller-owned content, not real-world credentials or global freshness. Device
keys must match the signed controller binding before SDK trust or encryption.
Server metadata is never owner approval. The provider receives ciphertext and
routing metadata, not message keys or plaintext; it cannot enforce the semantic
topic of encrypted text. Revocation cannot recall delivered content.

Current SDK pins: Matrix JS 44.0.0, crypto WASM 18.9.0; official Kotlin/JNI
crypto bindings from Matrix Rust commit
`56bc59112822e7eb25943a95e02502855cdeef2d`; Signal stays at 0.105.0.
The two browser SDK internals in PR #9 remain a hard release blocker until a
supported alternative is proven. Multi-worker gateway enforcement, supply-chain
review, independent security review, real-phone upgrade/Signal/recovery tests,
production operations and explicit public-release authorization are also gates.

## Acceptance ledger

| Acceptance case | Current integration status |
|---|---|
| Preserve both branches and provenance | PASS: conflict-free merge above |
| Direct owner publication and revision recovery | IN PROGRESS |
| Combined Android owner / browser E2EE journey | NOT TESTED; not yet connected |
| Exclusive boundary, signed decisions, direct bypass | PR #9 evidence only; integration NOT TESTED |
| Reload, network retry, competing tabs, erased storage | NOT TESTED |
| Wire/DB/WAL/log/push plaintext inspection | PR #9 evidence only; integration NOT TESTED |
| Android Signal/media/unlock/keys regressions | NOT TESTED on integration commit |
| Held-out search and browser accessibility | NOT TESTED on integration commit |
| Physical Android/mobile browser/upgrade/TalkBack | DEVICE REQUIRED |
| Public Send and release | BLOCKED |

Existing PR evidence is historical, not a claim that this integration passed.
Root Orb's reported Hard-exit failure after 666 tests is unrelated; do not modify
trading/runtime code to hide it.
