# Build, security gate and future deployment

## Baseline

Repository Soldsoul86/orb; Android baseline f3d07102f08b16ee635e9971395212f7bec53b00 (v9 source ef2535c1eaf35bc9a35baece00343477e6d1e96f).
Package chat.veil.purposes.preview, versionCode 9, 0.3.4-qr-preview. Preserved signer SHA256 e241ad4e30de7812469e70f72065960eafd5ee3f2fab089ac40a89783647f6a4. Baseline signed/upgrade test run 39527110605; live two-emulator run 39527113050. Existing unrelated Orb verification failure is separate. Local repository is a partial checkout; connected GitHub supplies full-tree CI.

No AGENTS.md found in local workspace or repository tree. Read CLAUDE.md, CONSTITUTION.md, MASTER.md, docs/SETTLED.md and Veil's standalone application boundary. This change does not alter Orb journal architecture or existing app identity/runtime.

Local execution has Node/Python but no Android SDK, Gradle or Rust. Loopback sockets return EPERM, so browser and build tests run in GitHub Actions. Existing Render deployment/workspace is authorized, but guest release is prohibited by the brief until the crypto and independent review gates pass. No Render mutation is required/performed. The preserved preview key is restored inside existing signed-build CI; it is not exported here.

## Reproduce CI

See `.github/workflows/veil-guest-gate.yml` on `codex/veil-guest-gate`. JDK21, Gradle8.13, Android35, Node24, Python3.12, Playwright1.56.0, PostgreSQL17.

```
export VEIL_PUBLIC_FIXTURE=/tmp/veil-public-state.json
python -m pip install -r apps/veil/portable-provider/requirements.txt -r apps/veil/relay/requirements.txt
gradle -p apps/veil --no-daemon --rerun-tasks -PveilPurposePreview=true :identity-core:test :app:testDebugUnitTest :app:lintDebug
node apps/veil/guest-web/tests/core.test.mjs
python -m unittest discover -s apps/veil/guest-web/tests -v
bash apps/veil/guest-web/tests/probe_official_browser.sh
python -m pip install playwright==1.56.0
python -m playwright install --with-deps chromium
python apps/veil/guest-web/tests/browser.py
```

Only disposable public state is written to VEIL_PUBLIC_FIXTURE. Do not upload private keys, real invite URLs or personal conversations. Runtime production dependency additions: none. Native dependencies remain libsignal0.105.0 (AGPL), Nimbus10.9 (Apache2). Browser verification uses standard Web Crypto, no custom message crypto. Compatibility-probe-only dependencies: libsignal-client0.105.0 (AGPL) and esbuild0.25.11 (MIT); installed in disposable temp directory with lifecycle scripts disabled. CI browser tool Playwright1.56.0 (Apache2). Existing Veil code license is AGPL3; external candidate licensing is recorded separately, none incorporated.

## Local HTTPS UI, no production keys

On a development machine with loopback support, create a local certificate with SAN localhost/127.0.0.1 using your development CA (for example mkcert); trust only that CA on your test browser. Never use a production TLS private key. Run:

```
python apps/veil/guest-web/serve.py --port 8765 --cert /tmp/localhost.pem --key /tmp/localhost-key.pem
```

This server is loopback-only and rejects all sends. Do not expose it via a tunnel or substitute it for the live `/i` page. CI uses Chromium's secure loopback context, not a production HTTPS-domain test. User-installed certificate trust and physical camera scanning remain untested.

## Production prerequisites, not deployment instructions for an enabled feature

1. Select a maintained browser-compatible protocol implementation with verified review scope. Build the exact browser/native encrypted-message proof, pin versions and hashes, review persisted key/state handling.
2. Independently review key binding, malicious web-code delivery, Origin/CORS/CSRF, XSS, replay/races, signed revocation, per-invitation and aggregate abuse limits, stale state and recovery. CSP is not protection from an operator replacing its own application JS.
3. Implement/version guest routes and scoped storage in isolated staging. Add dedicated HTTPS origin and ownership verification, minimum TLS1.2, HSTS, strict same-origin CSP, no third-party scripts, no-store, generic content-free logs, bounded request parsing, no global visitor fingerprint. Verify all T01–T18 before authorization to release.
4. Reuse owner-controlled keys, not company-issued guest credentials. Publish any database migration and rollback plan only after actual schema exists. Do not introduce migrations for a disabled prototype. Provider moves still need manual signed route cards.
5. New APK only for real Android changes: same application ID/signer, apksigner verification and install -r test preserving encrypted vaults and Signal ratchets. Do not uninstall/clear data.

No additional hosting costs incurred. Future guest hosting needs browser-asset bandwidth and persistent ciphertext queue/storage; costs depend on traffic and abuse. Existing free Render cold starts are unsuitable for a promise of immediate delivery. Metrics may count status/error/latency/queue sizes only, without content, names, raw invitation paths or stable anonymous-visitor identifiers. IP retention at platform/proxy level requires explicit operational review.
