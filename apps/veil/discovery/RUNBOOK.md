# Reproducible local preview

Use Python 3.12+, PostgreSQL 15+, Node 24+, Chromium/Playwright. JDK 21, Gradle 8.13 and Android SDK 35/build-tools 35.0.0 are needed for Android JVM/lint checks. No Android device or production service is required for discovery testing.

From repository root:

```sh
python -m venv .venv-veil-discovery
. .venv-veil-discovery/bin/activate
pip install -r apps/veil/discovery/requirements.txt playwright==1.56.0
python -m playwright install chromium
```

Create a dedicated local PostgreSQL database `veil_discovery_test` with a non-production user. Supply its URL as `DISCOVERY_TEST_DATABASE_URL`, for example `postgresql://your_local_test_user@localhost/veil_discovery_test`. Keep real credentials in your shell/secret manager, never repository files. Tests reject non-loopback databases and other DB names because they reset the test schema. If no PostgreSQL is installed, `pgserver==0.1.4` is an optional Python-3.12 Linux development dependency that bundles a disposable local PostgreSQL; it is not a runtime dependency or a deployment recommendation.

The first `Directory` startup executes [001_discovery.sql](migrations/001_discovery.sql), creating only `veil_discovery`. No live relay DB is needed. CI provisions PostgreSQL 17 and separate `veil_test` and `veil_discovery_test` databases.

```sh
python -m unittest discover -s apps/veil/discovery/tests -v
python apps/veil/discovery/tests/browser.py
python apps/veil/discovery/tests/evaluate.py
```

`browser.py` and `evaluate.py` each reset only the guarded disposable discovery schema. If using system Chromium rather than Playwright's download, set `CHROMIUM_EXECUTABLE` to its actual executable. Do not run these scripts against a shared staging/production database. A missing DB causes PostgreSQL unit tests to skip; it is **not** a database PASS. Browser/evaluation commands require the DB and fail if absent.

For a visible TEST-only demo, use a fresh test database (or the evaluation's seeded one):

```sh
# On a fresh database only; re-seeding over higher signed revisions is correctly rejected.
python apps/veil/discovery/tests/seed.py --i-understand-test-fixtures
export DISCOVERY_DATABASE_URL="$DISCOVERY_TEST_DATABASE_URL"
python apps/veil/discovery/serve.py --test-mode --port 8766
```

Open `http://127.0.0.1:8766`. The server binds only loopback and labels TEST supply. It rejects foreign Host/Origin, disables caching and indexing, and has no send transport. Without the explicit seed command there are no invented profiles. Use “Android app redesign,” “Build a website under $500,” or “Plumber near me.” The last must show no supported match. Local HTTP uses the browser's loopback secure-context allowance; no claims about public HTTPS deployment are made.

## Existing-owner handoff

1. In the web preview choose **I want to be found**. Describe the purpose, review the locally suggested category/tags, choose optional public details. Private is the default; category suggestion never transmits draft text.
2. Choose Public or Link-only and review the draft. Copy it using **Copy draft for Veil**. Download is an optional transport of the same JSON, not an automatic Android import.
3. In an appropriately reviewed build of the existing Veil app, open **Reach me → Be found**, select the existing purpose, paste the draft, and review every field plus the existing signed policy, route and purpose address. Nothing asks for a recovery secret or private key. Do not install an incompatible build over an existing installation.
4. Authorize the signed export. The existing provider receives any authorized visibility/pause change through its existing device-authenticated API. Failed operations do not claim success. The signed export is retained inside the same encrypted vault for retry, accessible through **Recover last signed export**. Share/copy this *public* export back to the browser.
5. **Verify & preview signed export** authenticates it locally. Review the full signed contact rules and route, explicitly approve the displayed fields, then **Publish approved profile**. Only a successful directory response announces publication.
6. Search, inspect, export, copy the purpose contact link or show its QR. **Secure messaging is not available yet** remains visible. The QR has the existing signed-controller `/g/<thumbprint>` address shape; whether a remote provider hosts that guest page is not asserted by this preview.

Edit produces a new draft and requires signing again. Pause prepares `pause:true` and false accepting, updates the provider's signed paused policy, and then requires importing the new signed export to update the directory. To resume, restore the purpose's active state in the existing controls and sign a fresh listing. Unpublish changes provider visibility to private and sends a minimal signed directory tombstone; delete is terminal for this listing/controller at this directory. These operations do not erase downloaded copies. **Delete local draft** clears this tab's draft, not downloaded files or clipboard copies. Revoke purpose/grant access through existing Veil controls; removal alone is not revocation.

All directories require manual updates. If the provider update succeeds and directory submission fails, retry the stored export; do not assume both services changed atomically. Existing identity recovery packages omit the new local discovery counter: restoring an old package may require publication-counter reconciliation before a subsequent update can be accepted. No automatic counter-reset bypass exists.

## Baselines and cross-language proof

```sh
# Both must refer to a disposable local DB named veil_test, separate from discovery tests.
export VEIL_TEST_POSTGRES_URL='postgresql://your_local_test_user@localhost/veil_test'
export TEST_DATABASE_URL="$VEIL_TEST_POSTGRES_URL"
python -m unittest discover -s apps/veil/portable-provider -v
python -m unittest discover -s apps/veil/relay -v

export VEIL_PUBLIC_FIXTURE=/tmp/veil-guest-public.json
export VEIL_DISCOVERY_FIXTURE=/tmp/veil-discovery-nimbus.json
export VEIL_DISCOVERY_OWNER_FIXTURE=/tmp/veil-discovery-owner.json
gradle -p apps/veil --no-daemon -PveilPurposePreview=true :identity-core:test :app:testDebugUnitTest :app:lintDebug
python apps/veil/discovery/tests/independent.py
python apps/veil/discovery/tests/browser.py
node apps/veil/guest-web/tests/core.test.mjs
python -m unittest discover -s apps/veil/guest-web/tests -v
python apps/veil/guest-web/tests/browser.py
python apps/veil/guest-web/release_gate.py  # Expected BLOCKED, exit 2
```

The fixture paths contain public test statements only, freshly signed by Kotlin/Nimbus and the actual `PortableSession` owner operation. No signing keys enter artifacts. The discovery CI workflow repeats these commands and uploads test reports/screenshots. It does not deploy, publish an APK, mark a PR ready, or override the guest gate. Emulator/physical upgrade, TalkBack and end-user usability evidence remain separate release work; JVM tests are not represented as on-device tests.

## Operator actions and cleanup

Public reports retain only controller/reason/day counts for 30 days, not reporter identities or text. A trusted local operator may invoke `Directory.block(controller, reason)` to refuse directory hosting after review; there is deliberately no remote admin endpoint or identity revocation authority. No automatic report-count-based takedown.

Do not expose this single-process loopback HTTP preview as a production service. Production needs reviewed HTTPS delivery, connection/Sybil limits, an operational abuse/opt-out process, periodic expired-content cleanup, independent security review, and the separately reviewed guest channel. To remove the local demo, stop its process and drop **only the disposable test database**. No live cleanup or production deploy is authorized by this runbook.
