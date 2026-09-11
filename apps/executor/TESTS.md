# Tests — `@orb/executor-app`

`npm test --workspace @orb/executor-app` — 52 tests across 10 suites.

## Configuration and the interlock (26 tests)

The interlock is the control that stops "I meant to be on testnet" from becoming
a real loss, so these tests actively try to get to mainnet by accident:

- Mainnet without the confirmation phrase is refused.
- **The phrase must match exactly** — `yes`, `true`, `I UNDERSTAND` and the
  lowercase spelling are all refused.
- **`dry_run` can never reach mainnet**; nor can `paper`, even with the phrase.
- All three settings together are accepted; testnet live needs no phrase.

Also: safest defaults (`dry_run`/`testnet`); **the hard exit threshold is
required** — there is no safe default; **the allowlist is required** — the
executor trades nothing by default; allowlist normalisation; every problem
reported at once; malformed numbers refused rather than silently defaulted; the
produced `RiskConfig` is itself valid.

Wallet: live requires a key; malformed keys and addresses refused; read-only
modes require an account to watch.

Secrets: both required; short secrets refused; **the operator secret must differ
from the signal secret**; `_FILE` supported and preferred; an empty or unreadable
secret file is a configuration error.

Redaction: **the describable view contains no key and no secret**, and its shape
is closed so a future field cannot leak by being forgotten.

## The signal API (26 tests)

Written as attempts to get through.

**Authentication** — a correctly signed signal is accepted; unsigned, forged,
and signed-over-a-different-body requests are refused; each missing header is
refused individually; stale and future timestamps refused; a non-numeric
timestamp refused.

**Replay protection** — a byte-identical captured request is refused (409); **a
replay with a fresh timestamp does not verify**, because the signature covers
the timestamp; short nonces refused. A retried signal returns **200 with
`duplicate: true`**, not an error.

**Request validation** — deterministic rejection reasons; non-JSON refused;
oversized bodies refused before parsing; unknown endpoints are a plain 404.

**Rate limiting** — a flood of correctly authenticated requests is throttled.

**Authority separation**
- The signal secret **cannot reach** `/kill`, `/release`, `/close` or `/status`,
  and nothing is changed by trying.
- The operator secret can engage and release the kill switch, and with it
  engaged signals are refused.
- The status view exposes state without secrets.
- **There is no order endpoint** — `/order`, `/orders`, `/execute`, `/trade`,
  `/exchange`, `/submit` and `/exit` all 404.
- **A signal cannot request an exit**: with a position open, every phrasing of
  "close it" through `/signal` leaves `exitReason` undefined.
- A manual close requires the operator secret and records `MANUAL_EXIT`.

## Not covered here

The end-to-end lifecycle — entry, threshold crossing, close, verification,
restart recovery, concurrent triggers and audit reconstruction — lives in
[`/tests/acceptance`](../../tests/acceptance), which drives the real executor
through these same adapters.

## Not covered, deliberately

- **TLS termination.** The API binds to `127.0.0.1` by default and expects a
  reverse proxy for transport security. Adding TLS here would duplicate a
  well-solved problem badly.
- **Live network integration.** No test contacts Hyperliquid. Wire correctness is
  established by golden vectors in `@orb/hyperliquid`; live behaviour is
  established by a testnet run, which is a human step.
- **Nonce persistence across restarts.** The timestamp window bounds the
  exposure; persisting nonces would add a failure mode to the request path.
- **`main()` end to end.** Signal handling and process exit are not exercised in
  a test runner; `wireExecutor` and `SignalApiServer` are tested directly.
