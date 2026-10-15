# Purpose API v2 (schema version 1)

All application requests use HTTPS and no redirects. Local integration tests use loopback HTTP only. `/v1` contracts are unchanged. Bodies/responses are JSON, except the static `/p/p-{32 hex}` landing page. `/v2` request bodies are capped at 128 KiB; ciphertext is at most 64 KiB. Tokens are 256-bit, generated on the client, wrapped in Android Keystore storage and supplied as `Authorization: Bearer ...`. Only their SHA-256 hashes are stored. This is device-held capability authentication, not asymmetric challenge/response or a hardware identity attestation.

| Endpoint | Authorization / effect |
|---|---|
| GET `/v2/capabilities` | Public feature negotiation; no identifiers |
| POST `/v2/accounts` | Register/idempotently recover same device capability; returns internal ID only to its holder |
| POST `/v2/directory` `{query}` | Registered device; up to 20 PUBLIC_SEARCHABLE, active, unexpired listings; query in body, never URL |
| POST `/v2/lookup` `{alias,invite?}` | Exact alias. UNLISTED requires the private invitation capability (or owner). LINK_ONLY permits known-alias lookup |
| GET/POST `/v2/facets` | Own listings / create with client-generated opaque `id`, `invite`, structured `policy`, `publish_confirmed` |
| PUT `/v2/facets/{id}` | Owner only, exact next policy version. Public listing requires explicit publication consent |
| POST `/v2/facets/{id}/slots` | Owner uploads unique public Signal bundles. Private halves stay in the device vault |
| POST `/v2/facets/{id}/reserve` | Registered requester, optional private invite, stable request `id`, requester `bundle`. Atomically consumes one bundle; returns grant/slot/public recipient bundle |
| PUT `/v2/grants/{id}/introduction` | Bound requester only, once. `{id,kind,body,expires}`; body is base64 of Signal ciphertext |
| GET `/v2/grants` | Bound requester / owning account only. No account IDs returned. Metadata includes purpose, status, slot, policy/version and public requester bundle for owner |
| POST `/v2/grants/{id}/decision` | Owner only: APPROVED, REJECTED, BLOCKED, REVOKED. Closed grants cannot reopen |
| PUT `/v2/grants/{id}/messages/{message}` | Bound parties, APPROVED live grant and active purpose; content metadata/schedule/quota checked on every request |
| GET `/v2/grants/{id}/messages` | Bound parties; returns oldest incoming ciphertext only while policy window is open. Empty + `availability:closed` otherwise |
| DELETE `/v2/grants/{id}/messages/{message}` | Receiver acknowledgement, after durable client commit |
| POST `/v2/facets/{id}/report` | Registered device; reason enum SPAM/IMPERSONATION/ABUSE; recorded for operator review, not an automatic moderation claim |

## Typed policy

Exact fields: `display_name`, `description`, `discovery_mode` (UNLISTED/LINK_ONLY/PUBLIC_SEARCHABLE), `contact_request_mode` (DISABLED/REQUEST_APPROVAL/AUTO_ACCEPT_WITH_LIMITS), `allowed_content_types`, `schedule`, `outside_hours_behavior` (REJECT/ACCEPT_AND_QUEUE), `first_contact_message_limit`, `inactivity_days`, `expires_at`, `notification_behavior`, `status`, `policy_version`.

This pilot only accepts `allowed_content_types:["text"]`, `first_contact_message_limit:1`, `notification_behavior:SILENT_IN_APP`. Unsupported types, keys, malformed enum values and invalid configurations return 400. Document/image/video purpose permissions are visibly unavailable; original chat media is unchanged. `schedule` contains IANA `timezone`, ISO weekdays 1–7, integer start/end minutes (0≤start<end≤1440). Overnight windows, holidays and urgent exceptions are not implemented. End is exclusive. The server converts UTC time into local time using zoneinfo, so repeated DST hours are each evaluated and nonexistent hours never occur. The UI supports weekday/every-day forms and the exact documented English sentence; other prose requires explicit correction or discarding in favor of the form.

`facet_id`, internal `account_id`, random alias, `created_at` and `updated_at` are independent metadata, not user-editable policy fields. Policy timestamps and grants are authoritative on the server; client clock changes cannot open a closed server window. Grant expiry is the earlier of 90 days from reservation, inactivity timeout under the current policy, or purpose expiry. Approval resets inactivity. No account-wide public identifier is returned in directory/lookup responses.

## Transactions and transitions

New tables have `p_` prefix and an idempotent `purpose_schema` version marker. No old rows/columns are rewritten. SQLite writes in Relay.clean acquire the transaction's write lock before policy checks; PostgresStore's existing transaction-level advisory lock serializes checks across overlapping instances. All reservations, quota increments, grant mutations, message acceptance and acknowledgements run in that transaction. Two-connection races are covered by tests.

RESERVED → PENDING (or APPROVED only if owner explicitly selected auto-approval) → APPROVED → REVOKED/BLOCKED/REJECTED/EXPIRED. A reservation expires after ten minutes. Its prekey is never reissued. One account can make only one request to a given facet in this pilot, including after rejection; a fresh account can evade this, so this is not Sybil-proof blocking.

Introductions are accepted at any hour but are not exposed as plaintext/ciphertext to the owner before its delivery window. Further messages with REJECT are refused outside hours before storage. ACCEPT_AND_QUEUE durably stores ciphertext while closed. Both directions follow the purpose's window. Queued data is reevaluated against current policy at fetch; an old acceptance is not a delivery entitlement. Pause retains undelivered ciphertext up to its seven-day TTL. Revocation, rejection, block, grant/purpose expiry delete undelivered ciphertext. Previously downloaded content cannot be recalled. Receipt retries return success for an identical envelope only, after checking live grant/purpose status; message IDs cannot overwrite ciphertext.

Authenticated inner payload contains version, grant ID, facet ID, message ID, text type, expiry and text. Recipient rejects mismatched context/type and expired messages. A malicious sender can encode arbitrary information inside allowed text; E2EE prevents the server from proving semantic content type. Do not claim server content inspection.

## Bounds and operator responsibilities

8 purposes/account, 1000 purposes globally, 1000 accounts, 60 registrations/hour globally, 10 new contacts/account/day, 30 introductions/facet/day, 180 API calls/account/minute, 30 directory queries/account/minute, 30 messages/grant/party/minute, 50 queued messages/grant, 64 MiB global queued ciphertext, 50,000 receipt records, 10,000 grants, 64 lifetime bundles/facet. Android initially issues four slots/facet and retains at most 16 local contacts; replenishment UI is not implemented. Capacity exhaustion returns an explicit error. A lost or abandoned reservation consumes its slot to prevent prekey reuse.

Ciphertext/receipts expire in at most seven days and are pruned on v2 requests. Rate buckets expire at their window boundary; abuse reports after 30 days. Listing/account/grant/block metadata currently persists until operator removal, bounded by the pilot caps; there is no automatic account-deletion/recovery UX. This is a known retention/availability limitation, not zero metadata. Operator reports require direct database review with appropriate access controls. No growth analytics, request/body logs, search-history table or contact uploads are implemented. Hosting-provider ingress may retain IP/timing/path metadata; the Python handler suppresses access logs.
