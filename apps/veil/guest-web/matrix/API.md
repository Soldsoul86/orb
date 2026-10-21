# Proposed contact contract — review input, NOT implemented

This remains the wider product proposal. The isolated executable experiment uses
the narrower signed bindings and Olm to-device protocol documented in
[integration/README.md](integration/README.md); it does not claim this entire API.

This document specifies the integration boundary to test. It does not change
pi/1, register a new wire format, or make the existing browser/server accept these
statements. No method below is a working messaging adapter.

## Signed purpose and contact

Use the existing `pi-state+jws` and independently pinned purpose controller from
`OPEN_PROTOCOL.md`. JOSE ES256 signs the exact compact protected-header/payload
bytes; do not invent JSON canonicalization or verify a reserialized payload.
Reject duplicate JSON keys, unsupported fields/versions/algorithms, private JWK
members, external key URLs, noncanonical base64url and out-of-range integers.
An authentic QR or independently shared card pins the controller; a fully
replaced malicious QR cannot be detected from its own self-consistent signature.

A proposed **separately typed** `pi-matrix-contact+jws` carries:

| Field | Meaning and checks |
|---|---|
| `v` | Exactly 1 for this proposed profile. |
| `iss` | Existing purpose controller RFC9278 identifier, equal to the independent pin. |
| `invitation` | Random 32-byte base64url request capability; generated on owner device. Treat as confidential link metadata; no analytics or access-log capture. |
| `revision` | Monotone 1..1,000,000 contact revision; persist highest revision and exact payload hash. Different payload at same revision fails. |
| `issued`, `expires` | Integer UTC seconds; issued <= now < expires; default expires = issued + 604800. Client and provider both enforce. |
| `state_hash` | SHA-256 of exact current owner-signed pi-state JWS, canonical base64url. State must be verified against the same controller and retained alongside this token. |
| `status` | ACTIVE or terminal REVOKED. Reopening requires a new invitation ID. |
| `first_request` | LINK_HOLDER; exactly one successfully claimed guest and one intro. Link possession is not approval. |
| `approval_required`, `channel` | Exactly true and `matrix-encrypted-text`; no plaintext/media fallback. |
| `route` | Validated provider HTTPS origin, Matrix homeserver HTTPS origin, route revision and fresh session epoch. No implicit redirects or arbitrary homeserver discovery. |
| `owner_endpoint` | Exact Matrix user ID, device ID, device Ed25519 key and Curve25519 key. Standard Matrix key encoding; reject invalid lengths/canonical forms. |
| `room_id` | Pinned invite-only encrypted room; one owner and one guest. No third members, aliases or public history. |

Stable contact reference: `(iss, invitation)`. Route/MXID are replaceable
attributes, not identity. Purpose label and rules come from the verified state,
not unsigned route responses or Matrix profile names. The initial issuer UI
should offer Temporary contact, with the summary: “One person can send a first
message; I approve before chatting. Contact access ends after 7 days.” Name,
duration and delivery hours belong behind Change rules.

The current pi/1 typed policy already covers label, approval, encrypted-text
scope, schedule/time zone, expiry and revocation. Reuse its Python/Kotlin
evaluator and tests. Do not duplicate that evaluator in a new service. For this
narrow profile, default to all-day availability and require REJECT outside
configured hours. Start inclusive/end exclusive; evaluate actual UTC instants
in the named IANA zone. Both repeated autumn hours obey the same local rule;
nonexistent spring times never occur. Future queue support needs a separate
decision. Do not silently inherit pi/1's outside-hours intro exception.

Approved access ends at the minimum of the signed contact expiry, current
purpose-policy expiry (unless zero) and owner grant expiry. This differs from
the **existing** pi/1 invitation lifecycle, in which invitation expiry does not
shorten an accepted grant. Leave that behavior intact; use an explicitly
separate contact profile and distinct tests.

## Guest identity, verification and approval

Guest creates a fresh purpose-local controller/device identity and Matrix device
keys locally. It signs a domain-separated peer-binding statement covering the
owner, invitation, exact contact-token hash, route revision, room ID, its Matrix
endpoint keys and stable random request ID. Prove possession via the existing
nonce-bound request profile, adapted explicitly to this conversation type.
Do not accept unsigned `authenticated: true` flags from UI state helpers.

Before any encryption/key sharing, compare the SDK's downloaded device record
and verified key signatures against the signed endpoint binding. Configure the
SDK to share only with that pinned device. On receipt require the SDK's actual
authenticated Olm/Megolm sender provenance to match the binding; a claimed
`device_id` inside application JSON or an MXID on the outer event is insufficient.
Imported/forwarded/unverified room keys, replacement devices, extra recipients
and missing provenance must fail closed. Exact APIs and behavior remain an
integration gate on **both** selected SDK versions.

Application payload is inside `m.room.encrypted`, including text, optional
guest name, invitation, purpose, request/message ID, contact revision, room,
expiry and message kind. SDK decryption success alone does not authorize display.
Validate context, current signed rules and sender binding before rendering.
Do not place a name/text in room names, topic, profile, receipt, typing events,
push body, error response or plaintext request metadata.

Owner approval is a domain-separated ES256 grant tied to the exact invitation,
guest controller, guest endpoint binding hash, room, epoch, policy/contact
revision, approval revision and expiry. REJECTED/BLOCKED/REVOKED are terminal.
An unsigned server status or Matrix membership event is never owner approval.
Permission changes and revocation are owner-signed; append them to local state,
persist terminal decisions and enforce at both clients and the provider.

## Transport and atomic enforcement

Future minimal adapter boundary:

- Prepare an isolated SDK store/device; export only public binding material.
- Establish a verified two-endpoint encrypted room from signed metadata.
- Persist SDK crypto state and a stable transaction/outbox ID before send.
- Send text only after current policy/grant evaluation; reject plaintext SDK paths.
- Receive/decrypt, verify authenticated sender/context, persist deduplication,
  then acknowledge. Return structured failures without plaintext/key logging.
- Close access and stop key sharing on signed revocation or expiry.

Provider transitions must be durable transactions:

| Current state | Operation | Allowed result |
|---|---|---|
| OPEN | Authenticated claim for valid invite | RESERVED for exactly one guest; random request ID bound immutably. Competing guests refused. |
| RESERVED | Exact encrypted intro | PENDING; one ciphertext digest/transaction ID committed. Retry of identical bytes returns the original result; different bytes or another request ID rejected. |
| PENDING | Another message | Rejected until verified owner approval; UI disables Send too. |
| PENDING | Owner decision | APPROVED or terminal rejection/block/revocation. |
| APPROVED | Encrypted text | Current verified policy/grant, two-party room and quota required. |
| Any nonterminal | Expiry or owner revocation | Terminal; refuse future messages/claims and stop future key sharing. |
| Terminal | Retry/new send/old approval | No reopening; terminal outcome retained. |

One durable claim cannot be implemented with a UI check or a read-then-write
counter. Reuse existing provider nonce replay protection and rate/size-limit
patterns; proposed starting limits are 10 claims per actor/day, 30 per purpose/day,
30 sends/minute/party/contact, plus bounded network-source and global capacity
limits. These do not solve Sybil attacks. Final limits and abuse storage retention
need a measured test. A private first-party homeserver enforcement hook must
cover **every** Matrix client-server send path, including direct requests that
bypass the guest webpage/gateway. Raw Matrix tokens are not per-invite capabilities.
General room power levels cannot atomically implement a one-message quota.

The provider need not decrypt ciphertext to enforce actor, invitation, transaction,
expiry, revision and room limits. It cannot prove ciphertext contains text only;
the recipient must reject other decrypted types. No plaintext purpose classifier.
After a revocation transaction commits, subsequent provider writes fail; clients
also reject late-arriving messages against their latest known state. An in-flight
write accepted earlier may exist, and messages already viewed cannot be recalled.

## Failures and migration

Explicit failure categories: INVALID_SIGNATURE, KEY_MISMATCH, INVALID_ROUTE,
STALE_REVISION, CONFLICTING_REVISION, INVITE_EXPIRED, INVITE_REVOKED, SLOT_TAKEN,
REQUEST_ALREADY_PENDING, APPROVAL_REQUIRED, WINDOW_CLOSED, RATE_LIMITED,
SENDER_BLOCKED, DECRYPT_FAILED, HOMESERVER_UNAVAILABLE, FEDERATION_FAILED and
LOCAL_SESSION_LOST. Errors never trigger another crypto stack or plaintext fallback.
Public responses should avoid distinguishing guessed invitations or leaking names.

Persist pending transaction IDs and ciphertext before network; do not generate
a second intro after reload or uncertain network outcome. Without local storage,
fail before claiming the invitation. Never infer session recovery from the link.

Migration requires a newer state/contact revision signed by the same purpose
controller, a new epoch, newly bound endpoint keys and explicit independent route
sharing. Preserve anti-rollback/terminal state locally. A fresh device/old backup
cannot prove universal freshness without additional evidence; document that limit.
Matrix history, accounts and crypto sessions do not migrate under this contract.
