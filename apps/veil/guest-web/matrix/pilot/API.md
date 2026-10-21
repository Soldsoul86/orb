# Private pilot API

All traffic stays behind the loopback gateway. JSON and JOSE domains are strict.

- `POST /pilot/challenge`: bounded, expiring one-use nonce.
- `POST /pilot/bootstrap`: guest controller and signed `pi-matrix-bootstrap+jws`
  (issuer, invitation, nonce); returns its durable technical Matrix account.
- `POST /pilot/enroll`: authenticated owner endpoint and controller-signed
  `pi-matrix-enrollment+jws` (owner card, invitation, revision, issued, expires).
- `GET /pilot/invite/{invite}`: public signed enrollment only. Verify using the
  controller pin from the shared URL, not a pin supplied by this response.
- `POST /pilot/claim`: authenticated guest endpoint and guest-signed
  `pi-matrix-claim+jws`; creates one pending conversation idempotently.
- `GET /pilot/inbox`: owner-authenticated public claim/decision metadata.
- `GET /pilot/conversation/{id}`: only its bound owner/guest; returns enrollment,
  claim and owner-signed decision. Unsigned counters do not confer permission.
- `POST /veil/policy`: monotonically revised owner-signed approval, decline,
  block or revocation. Exact retries are idempotent.

The existing narrow Matrix `/keys/*`, `/sync`, `/login`, and encrypted
`/sendToDevice` routes are reused. There is no general proxy or plaintext send API.
