# Veil browser guest foundation — RELEASE BLOCKED

This adds real contact-address parsing, existing pi/1 public-signature verification and a tested, disabled browser entry surface. It does **not** deliver browser messaging. There is no approved browser Signal adapter, key/session store, encrypted send path, live guest API, app handoff, new APK or production deployment.

See [the final status report](STATUS.md), [DESIGN.md](DESIGN.md), [crypto research](CRYPTO_COMPATIBILITY.md), [API.md](API.md), [TESTS.md](TESTS.md) and [RUNBOOK.md](RUNBOOK.md).

Quick checks (Node 24, Python 3.12):

```
node apps/veil/guest-web/tests/core.test.mjs
python -m unittest discover -s apps/veil/guest-web/tests -v
python apps/veil/guest-web/release_gate.py
```

The last command MUST exit 2 and print BLOCKED. The Node fixture interoperability check skips locally unless `VEIL_PUBLIC_FIXTURE` points to public output produced by `GuestPublicFixtureTest` in the existing Kotlin identity module. CI supplies it; no private keys are exported.

UI on an isolated development machine:

```
python apps/veil/guest-web/serve.py --port 8765
```

Open http://127.0.0.1:8765. Every message input is disabled, every mutation endpoint is denied, and submission cannot fall back to plaintext even if HTML disabled attributes are removed. There are no third-party assets, cookies, analytics, persistent state or live provider connections. Do not change existing Android QR destinations to this development server.

The CI screenshots are explicitly synthetic UI-state evidence. They do not depict a real encrypted owner/guest journey. Public launch remains prohibited by the supplied brief's hard security gate until an appropriate independent review and browser/Android interoperability proof pass.
