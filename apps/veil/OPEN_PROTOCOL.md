# Portable Identity application profile pi/1 (beta)

This is an openly implementable **application profile of existing JOSE and Signal protocols**, not a new cryptographic algorithm, DID method, OAuth authentication standard or W3C DID conformance claim. No company namespace, registry lookup, account API permission or company-issued key is required. Version 1 is intentionally narrow: single-device purpose identities, explicit grants and text only. Unknown protocol versions and algorithms must fail closed.

## Keys and identifiers

P-256 ECDSA keys in RFC 7517 JWK form. Public JWK has exactly `kty:"EC", crv:"P-256", x, y`; x and y are canonical unpadded base64url 32-byte coordinates of a valid curve point. Reject private scalar `d` in public input. Compute RFC 7638 SHA-256 JWK thumbprint using the canonical required members, then prefix `urn:ietf:params:oauth:jwk-thumbprint:sha-256:` (RFC 9278). This is a **key identifier**, not a mutable person identifier.

Private ownership key stays in the wallet and is never a public grouping ID. Each purpose has an independently random controller key and independent operational device key. Each contact has its own Signal identity/prekeys/ratchet. Purpose keys are not publicly derived from the wallet key. The encrypted backup groups them privately. Reusing one purpose with multiple people links those interactions; IP, timing, names and shared recovery exports can also correlate purposes.

All public statements are compact JWS, RFC 7515, ES256 only. Protected header has exactly `alg:"ES256", typ:<below>, jwk:<controller or device public JWK>`. No `jku`, x5u, kid lookup, `crit`, alternate algorithms or unprotected headers. `v:1` is mandatory. Verify a known expected key identifier, not merely the self-supplied header. On first contact an independently exchanged card pins the key; directory-only contact is TOFU and not a verified legal name. Compare the full libsignal safety number through a trusted channel.

## Signed state and route cards

`pi-state+jws` payload has exactly:

```
{v:1, id:<controller ID>, device:<public operational JWK>, revision:<1..1000000>,
 issued:<Unix seconds>, epoch:<32 lowercase hex>, route:<HTTPS origin>, policy:<below>}
```

Controller signs. Revision increases on policy/device/route changes. Reject lower revisions and different payload at the same revision. Epoch changes when replacing Signal sessions during migration; ordinary policy/device rotation preserves it. Route origin has no credentials, path, query or fragment. A public card is `{ "v":1, "state":"<compact JWS>" }`. Share it as text/file or the same payload in a QR when small enough. It includes only that purpose's disclosed information. No private root, other facets or contact list.

A recipient accepts a new route only against the already pinned controller, a newer state revision and a different epoch, after explicit user confirmation. The card travels through **an independent channel** (in person, file, another messenger); Provider A is not queried. No global resolver or automatic discovery of moves exists. Provider-specific directory URLs/handles do not migrate. The stable cryptographic address is the RFC 9278 identifier plus user-signed current route card.

## Canonical typed policy

Same deterministic evaluator as the existing purpose pilot; see `relay/purpose_policy.py` and `PurposePolicy.kt`. Fields:

```
display_name (1..60), description (0..240),
discovery_mode: UNLISTED | LINK_ONLY | PUBLIC_SEARCHABLE,
contact_request_mode: REQUEST_APPROVAL | DISABLED,
allowed_content_types: ["text"], first_contact_message_limit: 1,
schedule: {timezone:<IANA zone>, weekdays:[1..7, unique], start:<0..1439>, end:<1..1440>},
outside_hours_behavior: REJECT | ACCEPT_AND_QUEUE,
inactivity_days:<1..90>, expires_at:<Unix seconds or 0>,
notification_behavior:SILENT_IN_APP, status:ACTIVE | PAUSED | REVOKED,
policy_version:<1..1000000>
```

The enclosing signed state supplies facet_id. Start inclusive, end exclusive, same-day windows only. Evaluate actual instants in the specified IANA zone: both repeated autumn local hours follow the same local rule; nonexistent spring hours never occur. Device time zone is the global UI default and the user confirms it. Unknown wording, files, holidays and overnight intervals are rejected by the bounded parser; manual form is authoritative only after review. No runtime LLM authorization.

One encrypted introduction can be submitted outside hours but fetched only within hours. Further text requires the owner's signed approval. Queue retains only ciphertext, at most 7 days including closed time, with per-grant/global limits. REJECT denies new authorized sends outside hours; retrieval remains closed. Policy pause blocks delivery; revocation is terminal and removes queued ciphertext at the service that receives it. Previously received data cannot be recalled. Local client checks do not constrain a modified recipient's display/export behavior.

## Device-authenticated requests

HTTPS `POST /v3/nonce` with `{}` returns `{nonce:<43-character random base64url>, expires:<now+120>, aud:<this exact origin>}`. Public, rate limited; no account creation prerequisite.

HTTPS `POST /v3/command` body:

```
{state:<controller-signed state>, proof:<device-signed pi-proof+jws>,
 request:<base64url exact UTF-8 operation JSON bytes>}
```

Proof payload: `{v:1,iss:<facet controller ID>,aud:<exact service origin>,nonce,iat,exp,request_hash,state_hash}`. SHA-256 hashes encoded canonical base64url; state_hash covers exact compact JWS bytes. Verify state, pin authorized device JWK, ES256 signature, request hash, audience, single-use stored nonce, iat in now−60..now+5, now < exp ≤ min(nonce expiry,iat+60). Consume nonce atomically, including rejected authorization attempts. Never replay a captured proof to retry; obtain a fresh nonce but reuse persisted ciphertext. Check stored highest state revision. No bearer account token or provider key defines identity.

Responses: 200 JSON; 400 invalid, 401 invalid proof, 403 disallowed, 404 unavailable, 409 revision/slot conflict, 429 quota, 503 capacity. Errors contain no private details. Clients fail closed and preserve encrypted local state on network errors. `GET /healthz` is public. Providers must enforce bounded requests and disable body/access logging. The reference limits are conservative beta quotas, not adequate Sybil resistance by themselves.

Operations in decoded request:

| op | Fields / behavior |
|---|---|
| publish | consent:true required for public listing; state route must equal provider. UNLISTED never searched. |
| search | query ≤80; returns `states:[compactJws]`, opted-in active listings only. |
| lookup | target ID, invitation optional; private lookup requires exact current signed state as invitation capability. |
| slots | slots:[owner-signed channel token], 1–4; upload unused Signal prekeys once. |
| reserve | id:32hex client-chosen grant ID, target, invitation for UNLISTED; one grant per peer/facet, allocates one unused slot; reserved 10 min. |
| bind | id, channel:peer-signed binding; exact same binding may retry, substitutions fail. |
| intro | id, envelope; one only, changes RESERVED to PENDING for 30 days. |
| decision | id, grant:controller-signed token; explicit approve/reject/block/revoke; exact retry safe. |
| list | returns contacts bound to authenticated facet, max32. |
| contact | id; returns one authorized contact description. |
| send | id,envelope; valid unexpired approved grant + current active policy. |
| messages | id; returns at most oldest incoming envelope; outside hours returns empty with closed availability. |
| ack | id,message:<envelope ID>; only receiver can remove incoming ciphertext. |
| restore | grant,peer_state; unchanged controller reintroduces its approved unexpired grant to its new route; allocates fresh slot. No A query. |

Contact description: `{id,owner,peer,epoch,slot:<owner channel JWS>,channel:<peer JWS or null>,grant:<JWS or null>,status,owner_state,peer_state}`. Never trust unsigned `status` as approval; verify the signed grant. Validate matching peer, owner, grant, slot and epoch before installing Signal keys. Pin subsequent revisions and bindings. Terminal decisions cannot be reopened in place.

`pi-channel+jws`: owner payload `{v,iss,role:"owner",epoch,slot,bundle}`; peer payload `{v,iss,role:"peer",epoch,slot,grant,bundle}`. Signed by the respective facet controller. Bundle fields `identity,registration,prekey,signed,signature,kyber,kyberSignature` are libsignal public records, base64 except numeric registration. Per-contact key exchange and messages use **libsignal 0.105.0 PQXDH/Signal ratchet**, not JOSE message encryption.

`pi-grant+jws`: `{v:1,iss:<owner ID>,aud:<peer ID>,id:<grant ID>,status:APPROVED|REVOKED|REJECTED|BLOCKED,revision:<positive integer>,expires:<Unix seconds ≤90 days ahead>}` signed by owner controller. Grants survive a route/session change because they bind stable purpose/peer IDs rather than old provider or ratchet. At new provider, restore only current approved/unexpired grants. Retain terminal grants locally to prevent accidental resurrection from the **current** backup. An older backup can lack later revocation; no global freshness consensus is claimed.

Envelope: `{id:32hex,kind:"text",body:<standard base64 Signal bytes>,expires:<Unix seconds>}`. Signal bytes start with one libsignal ciphertext type byte followed by its serialized message. Authenticated plaintext JSON is `{v:1,id,facet:<owner ID>,grant:<grant ID>,kind:"text",text:<1..4000 chars>,expires}`. Context must match pinned conversation and envelope; never log it. Persist Signal state/outbox atomically before send; persist receive/seen ID before ack. Exact retry envelope hashes prevent overwrite. Reference quotas: 30 sends/minute/party/grant, 50 queued/grant, 64 MiB global queued bytes, 10 intros/actor/day, 30/facet/day. No media is accepted in pi/1; existing personal chat media is preserved separately.

## Backup and recovery

Compact JWE RFC 7516, protected header exactly `alg:"dir", enc:"A256GCM", typ:"pi-backup+jwe"`; no compression. Recovery key is randomly generated **32 bytes**, canonical base64url, kept separately by user. Not a password; there is no password reset or weak-password KDF. Nimbus creates the authenticated encryption IV/tag. Wrong key or altered package must fail before import.

Encrypted JSON v1 profile `pi/1`: private wallet JWK, created seconds, facets array `{id,controller:<private JWK>,state:<JWS>,consent:<boolean>}`, contacts array `{id,local,owner,peer,owner_state,peer_state,grant}`. Max8 facets and256 contacts, ≤4MiB decoded, ≤6MiB compact. Device keys, Signal secrets/ratchets, messages and outbox are excluded. This exports only the user's control and authorized relationship metadata. Backup itself reveals those relationships to anyone holding both ciphertext and recovery key.

Fresh import requires empty portable wallet; never overwrites earlier messenger vaults. Validate signatures/controller ownership and references. Generate new operational device keys. Do not publish any imported purpose automatically. Explicit migration picks new route, new epoch and revision; creates fresh Signal prekeys, restores approved grants. Peer explicitly accepts updated controller-signed route and rebinds a new Signal session. Old history is absent; changed safety number is shown, not silently declared verified. Prototype migration currently restores **owner-controlled grants**; recovery of an outgoing-only peer's session requires owner reissue and is not automated.

Device-key rotation is authorized by a newer state signed by the unchanged controller; providers/contacts with latest state reject old state. No permanent fingerprint-preserving controller rotation is supported. On controller compromise create a new identity and independently re-enroll contacts. Stolen controller/recovery material cannot be undone by a company administrator. Backups require refresh after policy/grant changes. If all keys/backups are lost, identity is lost.

## Independent implementation

`identity-core` is Android/network/provider neutral (Nimbus JOSE+JWT 10.9). `open_verifier.py` uses PyJWT 2.15.1/cryptography 50.0.0, with no app or network dependency; it reads a public card and an independently pinned ID. Reference provider shares only the open deterministic policy evaluator and bounded HTTP server with the relay, not a database or identity authority. Run it with its own SQLite path/origin; there is no upstream A URL to configure. Public-key verification proves control, not legal identity or current universal freshness. See ADR-001 for standards sources and lifecycle tradeoffs.
