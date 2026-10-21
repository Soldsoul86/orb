# Isolated executable Matrix interoperability experiment

The dedicated [Actions workflow](../../../../../.github/workflows/veil-matrix-interop.yml)
starts a fresh private Synapse on each job. The browser job must pass before the
Android job runs. Nothing is deployed, published or connected to live Veil services.
PR #9 remains draft. See the checked-in evidence record for actual run outcomes;
the presence of this harness is not itself a successful test result.

## What runs

1. Two separate Chromium browser contexts initialize `matrix-js-sdk` 44.0.0 with
   Rust/WASM crypto 18.9.0, publish device keys and establish an Olm session.
2. Each endpoint signs its actual SDK Ed25519/Curve25519 device keys using its
   locally generated Veil purpose controller. The other endpoint independently
   pins the purpose identifier, verifies the binding, queries SDK device keys,
   compares both keys and only then marks that exact device trusted.
3. The owner registers a signed pending policy. The browser sends an encrypted
   introduction; the recipient SDK decrypts it locally and the application
   verifies the inner purpose-controller signature and invitation context.
4. Approval permits an encrypted reply. Direct API tests bypass the application
   and exercise second-introduction denial, premature reply, room/plaintext/
   legacy/wildcard writes, impersonated policy update, expiry, revocation,
   rollback, device substitution and closed contact hours.
5. A second job builds the maintained upstream Matrix Rust SDK's **official
   crypto SDK Kotlin/JNI bindings**, pinned to
   `56bc59112822e7eb25943a95e02502855cdeef2d`, with upstream `cargo xtask`.
   An isolated Android API 35 x86_64 test app uses those bindings, OkHttp for
   transport and the unchanged Veil `identity-core` for purpose signatures.
   It decrypts the browser request, approves, encrypts a reply and revokes.
   Chromium must decrypt and authenticate the Android reply before the native
   test completes. This is not an Android mock or a JVM replacement for Android.

The protocol-native channel is **Olm encrypted to-device messages**, not rooms or
Megolm room history. There is no custom encryption implementation. ES256/JWS
bindings and application signatures use existing Veil identity-core, JOSE and
WebCrypto; they provide identity/context authentication, not encryption.

Matrix JS 44's public lookup downloads untracked users' keys without inserting
them into its crypto store. This roomless spike calls its pinned internal
`olmMachine.queryKeysForUsers` and `outgoingRequestProcessor.makeOutgoingRequest`
path before public device verification/encryption. This is the SDK's actual
cryptographic processing, not a mock. Depending on these JS internals is a
specific production integration gate: obtain a supported upstream API or use
the public standalone crypto SDK before shipping this adapter.

## Provider boundary

Synapse listens **only on a Unix socket**. Its only network ingress is an aiohttp
gateway on runner loopback. The Android emulator uses its host alias `10.0.2.2`.
There is no public registration, federation listener, public DNS or hosted site.
The gateway uses Synapse `whoami` to authenticate both user and device. It allows
only startup/sync/key APIs and its signed policy API. Rooms, arbitrary account
data, registration, federation and unrecognized send paths are denied.

Every send must contain one `m.room.encrypted` payload for the exact authorized
recipient device and match the bound sender and recipient Curve25519 keys.
Server-time expiry, signed purpose schedule, approval and terminal revocation
are checked for direct API calls as well as SDK calls. A single-process lock and
SQLite durable reservation serialize policy transitions and introductions.
An unknown upstream result consumes the introduction reservation; only the same
sender/transaction/body hash may retry. Revocation/expiry also deny retries.
This experiment does not claim multi-worker or distributed enforcement.

An endpoint controller signs `pi-matrix-binding+jws` over its `pi-state+jws`
hash and SDK endpoint. The owner signs `pi-matrix-policy+jws` over both complete
public cards, invitation, revision, issue/expiry time and status. Endpoints sign
`pi-matrix-message+jws` inside SDK ciphertext with sender, recipient, invitation,
message ID and expiry. These experiment types are not a deployed pi/1 extension.
The browser checks SDK encryption provenance and detects message-ID replay;
the native test checks the incoming ciphertext's bound sender key and validates
the decrypted purpose signature. Neither trusts a Matrix username as an identity.

The runtime fixture provisions random technical accounts. These are disposable
transport credentials, separate from user-owned purpose identities. Purpose
private keys and SDK crypto stores stay inside their endpoint. The public pin
exchange uses browser evaluation and `adb run-as`, independently of the provider.
This is an explicit test fixture; real QR/link enrollment is still a product gate.

## Reproduce

Use the workflow's Run workflow action on the feature branch, or push changes to
this directory. Required runner capabilities are Node 24, Python 3.12, loopback
sockets and outbound package downloads; Android additionally needs JDK 21,
Gradle 8.13, SDK/NDK, Rust 1.96 and an x86_64 KVM emulator.

For the browser stage on an equivalent disposable Linux host:

```sh
cd apps/veil/guest-web/matrix/integration
python -m pip install -r requirements.txt
npm install --ignore-scripts --no-audit --no-fund
npx playwright install --with-deps chromium
python start.py
node run.mjs browser
```

`runtime/` contains private disposable credentials/stores; never upload it.
The workflow terminates its processes and deletes it in cleanup. Only the
sanitized `evidence/*.json` results are artifacts. No HAR, trace, screenshot,
logcat, APK, test assets, browser profile or raw database is published.

## Limits and release gates

This is a dedicated integration experiment, not an enabled guest product.
The existing guest Send gate is unchanged and unconditional. The live Android
application ID, signing setup, Signal SDK, conversations, user identities,
recovery and existing provider/relay code are unchanged. The separate Android
test application cannot upgrade or overwrite an installed Veil application.

Not demonstrated here: physical-phone installation or live Signal regression;
browser reload/lost storage/outbox recovery; production enrollment and UI;
multi-device recovery, room history, attachments, push notifications, federation,
two-provider migration; distributed quota enforcement and denial-of-service
resistance; independent security review. Direct dependency versions and the Rust
source are pinned; full npm/Python transitive supply-chain locking remains a
release gate. The gateway cannot inspect encrypted content type and cannot stop
a compromised sender from encrypting arbitrary bytes. Endpoints enforce the
application message format. The server still sees transport metadata and timing.

Wire/database sentinel absence is a limited observation, not a cryptographic
proof of a non-malicious browser host. A compromised endpoint, signing controller
or browser code host can read messages. Revocation blocks future provider writes;
it cannot erase plaintext or ciphertext already delivered to a recipient.
