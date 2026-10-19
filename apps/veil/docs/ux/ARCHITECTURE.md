# UX extension, not a new identity or encryption profile

The v0.3.1 contact preview preserves package `chat.veil.purposes.preview`, the pinned preview signing certificate, the Android Keystore alias, all three encrypted vault names, Signal sessions, identity-core JWS/JWE formats and recovery key derivation. Personal text/photo/video and Eyes-Only remain in Personal media chat. Portable contacts remain text-only; no unsupported attachment button is shown.

## Invitation vs relationship

A 256-bit random capability forms `https://service/i#capability`. The server stores its SHA-256 digest, not the capability. The URL contains no stable identity identifier. The fragment is not sent in the browser's HTTP request; the Android app sends it only to the selected HTTPS service in POST bodies. No analytics, external assets or automatic claim request run on the landing page. The explicit request action uses the same proven channel/signature code and native Signal implementation as the earlier app.

Invitation metadata is a service-side capability policy, not a new cryptographic protocol. The signed controller state authenticates the identity and contact rules. Invitation duration displayed before approval is advisory service metadata; the signed relationship grant is authoritative. The owner clamps accepted access to its saved duration. Temporary links accept requests for seven days, while each approval grants at most seven days from acceptance. Expiring/canceling a link invalidates pending requests but does not shorten previously approved access. Revocation is a separate signed owner action. A pending local cancellation or revocation is explicitly labelled until acknowledged.

No one-use or one-person guarantee: anyone receiving the link may ask. Every recipient still needs approval. Four published channel slots and existing quotas bound requests; the app does not pretend a link can handle unlimited requests. Each purpose remains capped by the existing eight-purpose wallet limit. Expired contacts and copied content cannot be erased from an adversarial recipient's phone.

## Compatibility and service

Old signed-card requests remain valid for old purposes that never created an invitation. Once a purpose has a capability invitation, the legacy reserve path also requires an active capability, closing the old exact-state bypass. Identity migration and backup formats stay unchanged: UX invitation capability data is intentionally absent from portable recovery packages; old links do not migrate or magically redirect. Approved signed grants retain their actual expiry. After moving, users explicitly send a new signed contact address out-of-band; the contact accepts a new Signal session.

The deployed relay may load v3 alongside v1/v2 using the existing DATABASE_URL. V3 owns a separate PostgreSQL connection, transaction advisory lock and `veil_portable` schema. It never renames or migrates existing inbox tables. On local SQLite development it uses a separate `.portable` database. `RENDER_EXTERNAL_URL` supplies the hosted origin; local deployments set VEIL_PUBLIC_ORIGIN. TLS termination remains Render's responsibility. Dependencies added to the relay are the same pinned PyJWT/cryptography versions used by the existing portable service, plus existing psycopg.

## UI and state

Chats / Reach me / Settings replace the universal directory tab. New contact creates local identity automatically when sharing. A random draft ID persists only navigation state and maps to encrypted local creation state, allowing normal retry to reuse the same identity, token and absolute expiry. A crash in the narrow gap between identity creation and draft-map persistence may leave an unused local purpose; it does not publish a second active invitation automatically. Changing rules after a failed first publication requires starting a new draft; retries retain the saved rules.

Incoming links preview only after unlocking; no approval is inferred from viewing, scanning or elapsed time. No user text, recovery secret or invitation capability is written into saved-instance bundles. Background/focus loss retains the existing immediate native curtain and discards UI snapshots. Clipboard access is an explicit Copy invitation action, marks content sensitive on supported Android versions and attempts to clear the identical clip after 60 seconds. Other apps may retain copied links. Encryption keys and message text have no copy/export controls.

Work uses the device IANA timezone, with visible time zone and editable 24-hour hours. Submission, delivery and notifications are distinct: introductions can be submitted any time, content reveals during hours, later messages queue or reject according to the signed policy, notifications are silent in-app. Background push is not implemented. The free hosted relay may need time to wake up; errors permit retry without claiming completion.

## Trust and release limits

The opaque URL is resolved by a service; it does not carry an authenticated expected controller key. A compromised resolver can substitute a different self-signed identity before the recipient has pinned/compared it. Signature validation alone does not prove the displayed person's identity. This preview preserves the earlier directory/contact trust model: compare the entire safety number out-of-band before relying on a contact, especially before sending sensitive text. Once both ends verify the intended identities, the relay does not hold their Signal plaintext keys. Do not advertise opaque lookup as protection against an actively malicious first-contact directory.

The preserved distribution certificate is a development-preview signer recovered from the existing branch-scoped Actions cache. This is not an appropriate production key-management design. A production release needs a protected signing workflow and a documented transition; this change does not silently replace the existing certificate or claim compatibility with the separate original `chat.veil` signer.
