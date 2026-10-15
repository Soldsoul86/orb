# Design

One bounded threaded HTTP service and locked SQLite connection per operator. Public controller-signed state, per-device nonce proofs, controller-signed grants and Signal key bindings. Nonce consumption and state checks are serialized; failed requests consume used nonces. Replay-safe exact-envelope receipts allow retries without advancing a Signal ratchet twice. The client persists ratchet/outbox before network and receives before ack. There is no upstream identity authority.

Service clocks enforce expiry; local clients also check signed policy and grant constraints. Highest observed state/grant revisions prevent known rollback, not unseen old-backup rollback. See OPEN_PROTOCOL and the threat model for honest freshness and metadata limits.
