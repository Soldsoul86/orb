# Signed discovery extension of pi/1

Identity remains the existing independently generated per-purpose RFC 9278 JWK thumbprint, public P-256 JWK, ES256 compact JWS and `pi-state+jws` route card. This extension describes a public listing; it is not another identity, messaging protocol, grant, credential or certification.

## Publication

Compact JWS protected header has exactly `alg: ES256`, `typ: pi-discovery+jws`, `jwk: <existing public purpose controller JWK>`. A verifier must supply the expected controller; merely trusting an arbitrary self-supplied header is insufficient. Signature is 64-byte ES256 JOSE form. Private JWK members and key-fetch URLs are rejected by the existing verifier.

Payload has exactly these fields:

| Field | Contract |
|---|---|
| `v` | Integer `1` |
| `controller` | Existing purpose's public thumbprint identifier; never the ownership/wallet identifier |
| `revision` | Integer 1..1,000,000; increments per publication mutation |
| `created`, `issued` | Integer Unix seconds, creation fixed for this listing, issued no more than 60 seconds ahead |
| `expires` | Integer Unix seconds, future, no more than 30 days after issued, no later than purpose expiry |
| `visibility` | `PRIVATE`, `LINK_ONLY`, `PUBLIC`, `DELETED` |
| `consent` | Boolean true exactly for `PUBLIC`; part of signed content |
| `profile` | Required alias/purpose/category/tags plus only the optional approved fields below; empty for private/deleted |
| `state` | Full existing controller-signed `pi-state+jws`; null for private/deleted |

Payload UTF-8 must exactly equal canonical integer-only JSON: recursively sort object member names, compact separators, no escaped non-ASCII characters, normal JSON escapes, ordered arrays, no duplicate members, no floats, NaN or Infinity. Allowed member names are ASCII. Human text is NFC, bounded, trimmed, without controls/format characters. This is a narrowly specified encoding, not a claim of general RFC 8785 conformance. Header encoding follows existing JOSE; the signed payload bytes are checked for canonical form.

`profile` required fields: `alias` (1..60 characters), `purpose` (1..240), `category` (one of exactly the four labels), `tags` (1..8 unique reviewed service keys within that category). Optional fields are omitted when unknown:

- `languages`: up to seven supported language names; `locations`: up to five public city/region strings, not tracked position or private street address.
- `remote`, `accepting`: explicit booleans only. An absent value means unknown. Accepting cannot be true when signed purpose status is paused or request mode disabled.
- `evidence`: up to three `{title, url}` objects; HTTPS only, no credentials. Rendered as text and noreferrer links. The service never fetches these URLs.
- `budget`: `{currency: USD|EUR|GBP|INR, min: integer, max: integer, unit: project|hour}`. It is an owner statement, not a quote or a guaranteed price.
- `lead_days`: 0..365, owner-declared starting timeframe, not a booking or commitment.

The route card's full existing policy (including its display name and description) is part of disclosure. Android and the final browser preview show these rules before authorization. Public publication requires `PUBLIC_SEARCHABLE`, link-only export requires `LINK_ONLY`; revoked/expired purposes fail closed. The directory enforces highest seen state revision and policy version independently of the discovery revision. Equal revisions may repeat only identical semantic content; alternate ECDSA encodings do not permit changed content.

## HTTP surface (loopback preview only)

All responses: `no-store`, `no-referrer`, `nosniff`, same-origin resource policy, noindex, restrictive CSP. Body/access logs are disabled. No CORS, cookies or account tokens. POST JSON capped at 33,000 bytes; queries capped at 240 characters. Global and per-connection-IP rolling limits are ephemeral, bounded, and never store raw search text. Forwarded IP headers are not trusted.

| Route | Behavior |
|---|---|
| `GET /api/config` | Public taxonomy/synonyms and `guestMessaging:false`; no listings |
| `POST /api/search` | `{query, category?}` → parsed intent/unknowns, up to five verified public active results with signed publication and match reasons |
| `POST /api/publish` | `{controller, publication}` → authenticated revision/visibility receipt; applies signed removal too |
| `GET /api/profile/<thumbprint>` | One current, public, nonexpired, nonblocked signed publication; otherwise generic 404 |
| `GET /api/qr/<thumbprint>` | QR for the contact address reconstructed only from the verified current public route |
| `POST /api/report` | `{controller, reason: misleading|abuse|privacy}`; bounded aggregate count, 30-day retention, no free-text or message content |
| `/guest/send`, `/api/send`, `/v3/command` | Always 503, without parsing a message body |
| `GET /sitemap.xml` | Empty in this unreleased preview; all pages noindex |

No enumeration, offset pagination, autocomplete, private-profile fetch or search-history API exists. Candidate work is capped at 200 public full-text matches per category; a response flags the cap. SQL is parameterized, and only controlled tag lexemes enter `to_tsquery`. Endpoint-free offline verification uses `python profile.py exported.json '<independently pinned controller>'`.

## Import, export and removal

Export envelope: `{"publication":"<compact JWS>"}`. Any operator can verify it offline and import the exact signed public content through the same publication contract. No Veil authorization, private key, company identity lookup or fixed directory domain is needed. The signed route origin remains necessary for that provider. Migration/rotation and updating each directory are manual; global freshness consensus is not claimed.

Unpublish is a newer `PRIVATE` command; delete is a newer terminal `DELETED` command, both signed by the same controller with empty profile/null state. They discard hosted text, token and FTS entries. Only controller, creation/revision/digests and highest state/policy counters remain to prevent resurrection. A `LINK_ONLY` update also discards public content; its signed export is held by the owner, not retrievable from this directory. Already exported/cached copies cannot be recalled. Expired hosted tokens are scrubbed lazily on access; all reads filter expiry first. For an idle production service, a periodic scrub would be required before launch.

Directory refusal (`Directory.block`, local operator only) removes a profile from reads, without revoking its identity or issuing contact policy. Owner pause updates the existing provider policy, then requires the owner to apply the new signed export at each directory. Revoke contact access through the existing Veil controls; directory removal alone never revokes a grant.

Initial directory discovery is trust on first use, not independent real-world identity verification. Once a profile address is pinned, a substituted controller or destination cannot verify. Signed state can be stale until a newer state reaches a directory or expiry; an actual messaging adapter must check current provider policy and signed approvals at send/delivery time. That adapter remains disabled here.
