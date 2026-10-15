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

## Provisioned resources — 2026-10-15

- Public origin (pending database binding): `https://veil-relay-soldsoul86.onrender.com`.
- [Web service](https://dashboard.render.com/web/srv-db89jmfavr4c73anffe0), free, Singapore, manual deploys.
- [Database](https://dashboard.render.com/d/dpg-db89dt5g1s2s739hft8g-a), PostgreSQL 17, free; expires **2026-11-14 09:03 UTC**.
- Source deployed: `3583d3cf1f02463e1916aa37cd0d4c4f4d313633`.
- [Database/HTTP CI run](https://github.com/Soldsoul86/orb/actions/runs/38710815081): PostgreSQL **14 PASS**; SQLite **13 PASS / 1 skipped** (PostgreSQL-only reconnect). Both include real HTTP requests. Local sockets remain unavailable.
- Initial web deployment built successfully, then refused startup with the documented missing `DATABASE_URL` error. This is an explicit configuration blocker, not a live relay. The user has been shown how to set the Internal Database URL privately in Render.
- Live smoke test script: `python apps/veil/relay/smoke_https.py https://veil-relay-soldsoul86.onrender.com`. Uses disposable mailboxes and synthetic opaque bytes, deletes them afterward, and prints no capabilities or payloads. Not yet run against the hosted endpoint.

The APK rebuild triggered by relay changes exposed a pre-existing test startup race: native-view assertions ran before the emulator window had focus. App compilation and both unlock tests passed. Instrumentation now waits for real focus, and the emulator is explicitly woken; the [repeat run](https://github.com/Soldsoul86/orb/actions/runs/38711967584) passed all four Android 15 emulator instrumentation tests, compilation, JVM tests and lint. No Android production behavior was changed for hosting. Existing 0.1.1 APK remains usable.
