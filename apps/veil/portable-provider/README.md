# Portable identity reference provider (pi/1 beta)

This standalone service is separate from the working v1/v2 messenger relay. It uses its own origin and SQLite database. It has no root identity issuer, account password, master recovery key, or upstream provider lookup. The provider can deny service but cannot sign a user's identity or route.

Python 3.12+, `pip install -r requirements.txt`. Set `IDENTITY_DB`, `PUBLIC_ORIGIN`, `BIND`, `PORT` from one of `deploy/*.env.example`; run `python provider.py` behind TLS. The process needs exclusive access to its own DB directory; set directory mode 0700. The examples are configuration templates, **not deployed public services**. Use separate hosts/accounts, database volumes and TLS credentials for real operator independence. There are no application-level operator API secrets because there is no operator administration API. Secure host access separately; add reverse-proxy connection/rate limits before exposure to the public internet.

`fixture.py` runs disposable isolated test instances; its optional localhost HTTP mode is for local CI only. Production Android always uses HTTPS with normal platform trust and redirect refusal. Android instrumentation uses a separately generated, test-only TLS CA; it does not change release trust.

Run `python -m unittest discover -s . -v`. See [protocol](../OPEN_PROTOCOL.md), [migration demonstration](../PROVIDER_MIGRATION_DEMO.md), and [limits](../LIMITATIONS.md). Native Signal E2EE is verified by the client integration tests; Python unit-test envelopes are explicitly synthetic.
