# API — `@orb/executor-app`

## HTTP surface

All request bodies are JSON. All authenticated requests carry:

| Header | Meaning |
| --- | --- |
| `x-orb-timestamp` | ms since epoch; must be within `ORB_HL_API_MAX_SKEW_MS` |
| `x-orb-nonce` | unique per request, 8–128 chars |
| `x-orb-signature` | `HMAC-SHA256(secret, "{timestamp}.{nonce}.{body}")`, hex |

### `POST /signal` — signal secret

```jsonc
{
  "signalId": "sig-0001",          // required, unique, 1-128 of [A-Za-z0-9._:-]
  "timestamp": 1700000000000,      // required, ms since epoch
  "symbol": "ETH",                 // required, uppercase
  "side": "LONG",                  // LONG | SHORT (BUY/SELL accepted)
  "entry": { "kind": "MARKET" },   // or { "kind": "LIMIT", "price": "1999.5" }
  "sizing": { "kind": "BASE_SIZE", "size": "1.5" },
  "setupId": "breakout-v2",        // required
  "leverage": 5,                   // optional integer
  "strategy": { "model": "v3" },   // optional flat scalars; recorded, never read
  "stop": "1950",                  // optional; ADVISORY ONLY
  "target": "2100"                 // optional; ADVISORY ONLY
}
```

| Status | Meaning |
| --- | --- |
| `202` | accepted — `{ accepted: true, tradeId, signalId }` |
| `200` | duplicate — `{ accepted: false, duplicate: true, reason: "DUPLICATE_SIGNAL" }` |
| `422` | rejected — `{ accepted: false, reason, detail, signalId }` |
| `400` | body is not JSON |
| `401` | signature, timestamp or headers invalid |
| `409` | nonce already used |
| `413` | body too large |
| `429` | rate limited |

`stop` and `target` are recorded for analysis and **never** used to decide an
exit. Unknown fields are ignored and never read.

### `GET /health` — unauthenticated

```json
{ "ok": true, "degraded": false, "killSwitch": false }
```

`503` when the executor is not running. Carries no other detail.

### `GET /status` — operator secret

The full `ExecutorStatus`: mode, feed health and staleness, kill-switch state,
every position with its state and discrepancy count, the last reconciliation,
and the active hard-exit configuration. Never contains a secret.

### `POST /kill` · `POST /release` — operator secret

```json
{ "reason": "why" }
```

Engaging applies the configured `killSwitchPolicy` (`CLOSE_ALL` by default).
The signal secret cannot reach either endpoint.

### `POST /close` — operator secret

```json
{ "symbol": "ETH", "reason": "operator decision" }
```

`200` when the exchange confirms flat; `409` when there is nothing to close or
the close did not reach flat. Recorded as `MANUAL_EXIT`.

## Library exports

```ts
loadConfig(env: Environment): ExecutorConfig        // throws ConfigError
describeConfig(config): Record<string, unknown>     // redacted, safe to log
toRiskConfig(config): RiskConfig

class SignalApiServer {
  constructor(options: ServerOptions)
  listen(): Promise<{ host: string; port: number }>
  close(): Promise<void>
}
signRequest(secret, body, timestamp, nonce): Record<string, string>

wireExecutor(config, log?): Promise<WiredExecutor>
wireSimulatedExecutor(options): { executor, exchange, feed, audit, killSwitch, setPrice }
class FileKillSwitchStore implements KillSwitchStore {}

class HyperliquidExchangePort implements ExchangePort {}
class PaperExchangePort implements ExchangePort {}
class DryRunExchangePort implements ExchangePort {}
class HyperliquidMarketDataFeed implements MarketDataPort {}
class ScriptedMarketDataFeed implements MarketDataPort {}

main(env?, log?): Promise<() => Promise<void>>      // returns a shutdown function
```

## Environment variables

See the repository [`README`](../../README.md#environment-variables).
