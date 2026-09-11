# `@orb/executor-app`

The runtime host for the Hyperliquid trade executor.

Owns configuration, the production safety interlock, the authenticated signal
API, and the adapters that bind `@orb/trade-executor`'s ports to Hyperliquid —
or to a simulated exchange in paper and dry-run modes.

## Modes

| Mode | Reads | Writes | Can reach mainnet |
| --- | --- | --- | --- |
| `dry_run` (default) | real exchange | refused at the port, logged | **no** |
| `paper` | real exchange | simulated locally | **no** |
| `live` | real exchange | real orders | only with the full interlock |

`dry_run` and `paper` construct exchange ports with **no signing key at all**, so
they are structurally incapable of placing an order even if every other control
failed.

## The mainnet interlock

Reaching mainnet requires **three independent settings**, each of which has to
be wrong on purpose:

```bash
ORB_HL_ENV=mainnet
ORB_HL_MODE=live
ORB_HL_CONFIRM_MAINNET=I-UNDERSTAND-THIS-TRADES-REAL-FUNDS
```

Missing any one of them and the process **refuses to start** rather than quietly
downgrading. A test configuration cannot reach production by omission.

## API surface

```
POST /signal    submit an entry intent          (signal secret)
GET  /health    liveness, no detail             (unauthenticated)
GET  /status    full executor state             (operator secret)
POST /kill      engage the kill switch          (operator secret)
POST /release   release the kill switch         (operator secret)
POST /close     close a position by hand        (operator secret)
```

**There is no endpoint that submits an order.** A caller can express an entry
intent and nothing else — it cannot choose a price, request an exit, defer one,
change a threshold, or reach the exchange.

The two secrets are separate and **must differ**, so a compromised signal
provider cannot touch the kill switch.

### Signing a request

```
signature = HMAC-SHA256(secret, "{timestamp}.{nonce}.{body}")

x-orb-timestamp: 1700000000000
x-orb-nonce:     <unique, 8-128 chars>
x-orb-signature: <hex>
```

A captured request cannot be replayed: the timestamp bounds the window and the
nonce cache covers it. Changing the timestamp invalidates the signature.

`signRequest()` is exported so a provider integration and the tests use the same
code path.

## Running

```bash
npm run build
npm run executor
```

See the repository [`README`](../../README.md#running-the-executor) for the full
environment variable reference and a dry-run recipe.

## Documents

- [`DESIGN.md`](DESIGN.md) · [`API.md`](API.md) · [`TESTS.md`](TESTS.md)
