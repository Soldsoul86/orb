# Hosted relay

The existing 0.1.1 Android APK accepts this relay without an update. Both people enter the same HTTPS origin, then exchange invitations and compare full identity codes. Distance is not a protocol restriction; both phones need internet access. No push notifications exist in this version: keep Veil open and unlocked to receive messages.

## Render trial

- Workspace: confirmed by the user, My Workspace.
- Region: Singapore.
- Native Python 3.12 web service on free compute; `VEIL_BIND=0.0.0.0` and Render supplies `PORT`.
- Build: `pip install -r apps/veil/relay/requirements.txt`.
- Start: `python apps/veil/relay/server.py`.
- Dedicated PostgreSQL 17 database, free 1 GB tier. `DATABASE_URL` must be the database's INTERNAL connection URL, stored only as a Render service environment variable. Never put it in Git or in the Android app.
- The Render connector can create databases but does not expose their connection URLs or support `fromDatabase` references in service creation. The operator must copy the Internal Database URL from the database's Connect menu into the web service's `DATABASE_URL` setting in Render. No secret needs to be posted in chat.
- The server refuses to start on Render without `DATABASE_URL`, instead of silently placing mailboxes on an ephemeral disk.
- `/healthz` and `/` return status only after a working DB transaction. No mailbox IDs, counts or tokens are exposed.

Render's free web service sleeps after 15 idle minutes and can take about a minute to wake. Open the relay URL in a browser and wait for the status response before creating an inbox. A first app request can time out during wake-up; retry once the service is awake. Do not use polling services to circumvent the free-tier idle policy.

The free database expires 30 days after creation. Upgrade before its expiry to keep using these inboxes; no automatic paid upgrade is configured. Free plan bandwidth/build usage still consumes workspace allowances and can incur overages under the account's billing settings. See https://render.com/docs/free .

## Data boundaries

PostgreSQL holds opaque Signal ciphertext, mailbox IDs, capability hashes and expirations. Android keeps identity/session secrets. The transport contract and encryption are unchanged. `psycopg[binary]==3.3.6` is the only added server dependency. SQL stays parameterized; a transaction-level advisory lock serializes quota/idempotency checks across overlapping deploy instances. Disconnected database connections are reopened on the next request; message IDs make sender retries idempotent. Local SQLite remains available outside Render.

Application request logging is disabled. Render and its TLS proxy still observe IPs, request paths/timing and other transport metadata. PostgreSQL WAL, retained storage and provider backups may contain expired ciphertext after logical deletion; no secure erasure claim. No Android private keys are uploaded. A compromised or modified client can retain plaintext.

## Reproduce verification

Run `python -m unittest discover -s apps/veil/relay -v` from the Orb repository root. For the PostgreSQL suite, install relay/requirements.txt and point `TEST_DATABASE_URL` at a **disposable test database only**; the suite clears its tables between tests. GitHub Actions `.github/workflows/veil-relay.yml` provisions a disposable PostgreSQL 17 instance and tests both backends, including restart persistence, transaction rollback, capability separation, idempotency, quotas, expiry and real HTTP transport.

Live verification results and the final public address are recorded separately after configuration/deployment. A server test is not evidence of two physical phones communicating.
