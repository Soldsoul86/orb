# Pilot boundaries

Reuse the existing controller-signed pi/1 state, Matrix device binding and Olm
SDK adapter. Add domain-separated enrollment and claim statements: the owner
allows one introduction under their current purpose policy; the guest proves
control of its browser-generated identity and actual SDK endpoint. The existing
owner-signed decision admits subsequent messages. Provider responses cannot
approve a guest or change a pinned device. The service stores routing credentials,
public signatures, ciphertext and admission counters; not message plaintext or
private E2EE/signing keys.

The exclusive gateway checks current signed enrollment and the exact matched
conversation on every send, including retransmission. Rejected, blocked and
revoked conversations are terminal. Durable reservation before forwarding stops
an ambiguous response from resetting the first-message quota. An exact transaction
may retry; a changed body cannot reuse its ID. No delivery acknowledgement is
inferred from the service accepting ciphertext.

Android serializes guest work under the same process mutex as vault access.
A closed crypto-store generation is copied before each operation; the encrypted
vault atomically commits its reference alongside inbox/dedup/cursor state.
The prior store remains available until that commit. Outbound ciphertext and
ratchet are committed before transmission. A pending signed decision is saved
before network access and becomes locally effective immediately.

The browser holds a Web Lock for the invitation, uses the official SDK's persistent
IndexedDB store, and persists the exact outbox before HTTP. Conversation URLs
contain a local recovery ID, never private keys. App storage and SDK IndexedDB
currently have separate transactions: abrupt browser death between SDK decryption
and app inbox persistence remains a critical crash-consistency test/review gate.
Do not equate ordinary reload/reopen success with arbitrary crash safety.
