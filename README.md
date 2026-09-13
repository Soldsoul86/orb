# Orb

**A personal runtime that continuously learns, reasons and acts alongside its user.**

Orb is a long-lived personal intelligence that grows with its user over years rather
than conversations. It transforms observations into knowledge, knowledge into
understanding, understanding into decisions, and decisions into action — while
preserving the complete, replayable history of how every conclusion was reached.

Its intelligence comes from continuity, not from any single model.
Its foundation is evidence.
Its architecture is local-first, model-independent and built to evolve for decades.

---

## Status

**Phase 3 — Contracts (current), with the first executable components landed.**
Phases 0–2 complete: repository foundation, the architecture documents in
[`docs/`](docs/), and the ratified [`CONSTITUTION.md`](CONSTITUTION.md).

Now executable:

| Package | What it is |
| --- | --- |
| [`runtime/journal`](runtime/journal) | The **Event Journal** — append-only, hash-chained, HLC-ordered. Phase 4's first component. |
| [`packages/hyperliquid`](packages/hyperliquid) | A thin, auditable Hyperliquid adapter. No vendor SDK. |
| [`packages/trade-executor`](packages/trade-executor) | A signal-agnostic trade executor that owns risk, position and **exit** authority. |
| [`apps/executor`](apps/executor) | The runtime host: config, safety interlock, authenticated signal API. |

See [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Governing Documents

| Document | Purpose |
| --- | --- |
| [`MASTER.md`](MASTER.md) | Vision, design principles, and the canonical architecture. |
| [`CONSTITUTION.md`](CONSTITUTION.md) | The immutable laws of Orb. Everything else follows them. |
| [`CLAUDE.md`](CLAUDE.md) | Engineering rules, standards, and workflow for contributors. |
| [`docs/`](docs/) | Architectural specifications, reviewed before implementation. |

## Repository Layout

```
orb/
├── apps/            Device-native applications
│   ├── executor/    Hyperliquid trade executor runtime host
│   ├── mac/         macOS runtime host
│   └── pixel/       Android/Pixel runtime host
├── runtime/         Core runtime
│   └── journal/     The Event Journal — the single source of truth
├── platform/        Cross-cutting platform services
├── packages/        Independent, composable packages
│   ├── hyperliquid/     Exchange adapter (signing, REST, WebSocket)
│   └── trade-executor/  Risk, position and exit authority
├── contracts/       Per-contract kernel specifications
├── docs/            Architecture documents
├── tests/           Cross-package and acceptance tests
├── scripts/         Repository automation
├── tools/           Developer tooling
└── .github/         CI and repository configuration
```

Every package carries `README.md`, `DESIGN.md`, `API.md` and `TESTS.md`.

## Principles

- **Local-first always.** Data stays under the user's control; cloud is replication, never authority.
- **Event-first always.** Everything begins as an immutable event. History is never mutated.
- **Evidence-first always.** Every belief references its evidence. Every decision is explainable.
- **Model-independent always.** Reasoning engines are interchangeable; models never define the architecture.

---

## The Hyperliquid trade executor

> **Entry may come from the signal provider. Exit authority belongs to the executor.**

A signal is an *entry intent*, and that is the whole of its power. Once a
position is open the executor never depends on the provider to tell it when to
get out — a provider cannot request an exit, defer one, raise a threshold, or
reach the exchange.

```
Signal API → Signal Adapter → Signal Validator → Risk / Entry Validator
  → Order Manager → Hyperliquid → Actual Position
  → Position Monitor → Hard Exit Sentinel → Reduce-Only Close
  → Exchange Verification → Trade Record
```

This maps onto Orb's kernel rather than sitting beside it: the signal API and
the exchange feed are **Sensors** producing **Observations**, order submission
is a **Capability** producing **Actions**, the risk rules are **Policy**, and
position state is a **projection** over the Event Journal. Constitution
Art. XI §42 — *Orb never assumes an Action changed reality; the loop closes only
when a Sensor confirms* — is precisely the rule that the exchange, not an API
response, decides whether a position is closed.

### See it work

```bash
npm install
npm run build
node scripts/simulate-hard-exit.mjs
```

A complete lifecycle against a paper exchange, with no network and nothing at
risk: a position opens, the provider insists on holding, the threshold crosses,
the executor closes it anyway, the exchange confirms flat, and the whole
lifecycle is read back from the hash-chained journal.

### Running the executor

```bash
npm run verify          # lint, build, and the full test suite
npm run executor        # starts in dry-run mode against testnet by default
```

Dry run is the default and cannot place an order. A minimal testnet dry-run:

```bash
export ORB_HL_MODE=dry_run
export ORB_HL_ENV=testnet
export ORB_HL_WATCH_ADDRESS=0xYourAddress
export ORB_HL_SIGNAL_SECRET=$(openssl rand -hex 32)
export ORB_HL_OPERATOR_SECRET=$(openssl rand -hex 32)
export ORB_HL_SYMBOL_ALLOWLIST=ETH
export ORB_HL_MAX_LOSS_FRACTION=0.1
npm run executor
```

Sending a signal (see [`apps/executor/API.md`](apps/executor/API.md) for the
signing scheme):

```bash
BODY='{"signalId":"s-1","timestamp":'$(date +%s000)',"symbol":"ETH","side":"LONG","entry":{"kind":"MARKET"},"sizing":{"kind":"BASE_SIZE","size":"0.01"},"setupId":"manual"}'
TS=$(date +%s000); NONCE=$(openssl rand -hex 16)
SIG=$(printf '%s' "$TS.$NONCE.$BODY" | openssl dgst -sha256 -hmac "$ORB_HL_SIGNAL_SECRET" -r | cut -d" " -f1)
curl -sS localhost:8787/signal -H "x-orb-timestamp: $TS" -H "x-orb-nonce: $NONCE" \
     -H "x-orb-signature: $SIG" -H 'content-type: application/json' -d "$BODY"
```

### Reaching mainnet

Three independent settings, each of which has to be wrong on purpose:

```bash
ORB_HL_ENV=mainnet
ORB_HL_MODE=live
ORB_HL_CONFIRM_MAINNET=I-UNDERSTAND-THIS-TRADES-REAL-FUNDS
```

Missing any one and the process **refuses to start**. `dry_run` and `paper`
build exchange ports with no signing key at all, so they are structurally
incapable of placing an order.

### Collecting market data

The executor is local-first by design (Constitution Art. VIII §31), and the
market-data path lives in the executor process, not anywhere else:
`HyperliquidMarketDataFeed` for live prices and fills, `HyperliquidExchangePort`
for account state, and `InfoClient.candleSnapshot` for history.

To assemble a dataset for analysis, run the collector somewhere with network
access to the exchange. It needs no key and no account — `/info` is public and
read-only:

```bash
node scripts/collect-candles.mjs ETH 1m 7          # 7 days of 1m candles
node scripts/collect-candles.mjs BTC 5m 30 --testnet
```

Output lands in `data/candles/<SYMBOL>-<INTERVAL>.jsonl`, oldest first, with a
coverage and gap report. The gap report is not decoration: a dataset with silent
holes produces a backtest that overstates its edge, because the missing candles
are usually the violent ones.

### Environment variables

**Never commit secrets.** Every `*_SECRET` and `*_PRIVATE_KEY` also accepts a
`_FILE` suffix pointing at a file, which keeps the value out of the process
environment.

| Variable | Default | Meaning |
| --- | --- | --- |
| `ORB_HL_MODE` | `dry_run` | `dry_run` · `paper` · `live` |
| `ORB_HL_ENV` | `testnet` | `testnet` · `mainnet` |
| `ORB_HL_CONFIRM_MAINNET` | — | Required phrase for mainnet |
| `ORB_HL_PRIVATE_KEY` | — | Signing key. Required for `live`. Never logged |
| `ORB_HL_WATCH_ADDRESS` | — | Account to observe in `dry_run`/`paper` |
| `ORB_HL_VAULT_ADDRESS` | — | Trade on behalf of a vault or sub-account |
| `ORB_HL_SIGNAL_SECRET` | — | **Required.** HMAC secret for `/signal`. ≥32 chars |
| `ORB_HL_OPERATOR_SECRET` | — | **Required.** Operator secret. Must differ from the above |
| `ORB_HL_API_HOST` | `127.0.0.1` | API bind address |
| `ORB_HL_API_PORT` | `8787` | API port |
| `ORB_HL_API_MAX_SKEW_MS` | `30000` | Timestamp tolerance |
| `ORB_HL_API_RATE_LIMIT_PER_MINUTE` | `120` | Requests per minute |
| `ORB_HL_API_MAX_BODY_BYTES` | `16384` | Largest accepted body |
| **`ORB_HL_MAX_LOSS_FRACTION`** | — | **Required.** The hard exit threshold. No safe default exists |
| `ORB_HL_LOSS_BASIS` | `MARGIN` | `MARGIN` · `NOTIONAL` · `ACCOUNT_EQUITY` |
| `ORB_HL_MAX_LOSS_USD` | — | Optional absolute cap |
| `ORB_HL_MIN_LIQUIDATION_DISTANCE_FRACTION` | — | Optional liquidation-proximity guard |
| `ORB_HL_EXCHANGE_PROTECTIVE_STOP` | `true` | Also rest a reduce-only stop on the exchange |
| `ORB_HL_PROTECTIVE_STOP_SLACK` | `0.15` | How much wider than the local threshold |
| **`ORB_HL_SYMBOL_ALLOWLIST`** | — | **Required.** Comma-separated. Empty trades nothing |
| `ORB_HL_MAX_POSITION_NOTIONAL_USD` | `1000` | Largest single position |
| `ORB_HL_MAX_LEVERAGE` | `3` | Ceiling, whatever a signal asks |
| `ORB_HL_MAX_CONCURRENT_POSITIONS` | `1` | |
| `ORB_HL_MIN_NOTIONAL_USD` | `10` | Exchange minimum |
| `ORB_HL_MIN_FREE_MARGIN_FRACTION` | `0.2` | Free margin floor after entry |
| `ORB_HL_MAX_SIGNAL_AGE_MS` | `30000` | Signal freshness |
| `ORB_HL_MAX_CLOCK_SKEW_MS` | `5000` | Provider clock tolerance |
| `ORB_HL_MAX_ENTRY_SLIPPAGE` | `0.005` | Entry slippage bound |
| `ORB_HL_ENTRY_TIMEOUT_MS` | `15000` | |
| `ORB_HL_EXIT_TIMEOUT_MS` | `30000` | |
| `ORB_HL_MAX_CLOSE_ATTEMPTS` | `5` | Before `EXIT_FAILED` |
| `ORB_HL_CLOSE_RETRY_DELAY_MS` | `400` | |
| `ORB_HL_CLOSE_AGGRESSION` | `0.02` | How far through the book a close may sweep |
| `ORB_HL_RECONCILIATION_INTERVAL_MS` | `15000` | |
| `ORB_HL_FEED_STALENESS_LIMIT_MS` | `30000` | Silence beyond this loses monitoring |
| `ORB_HL_KILL_SWITCH_POLICY` | `CLOSE_ALL` | `CLOSE_ALL` · `HOLD_AND_ALERT` |
| `ORB_HL_DEGRADED_POLICY` | `CLOSE_ALL` | `CLOSE_ALL` · `HOLD_AND_ALERT` |
| `ORB_HL_DATA_DIR` | `.orb-local/hyperliquid-executor` | Journal and kill-switch state |
| `ORB_HL_LANE` | `executor` | This device's journal lane |
| `ORB_HL_DEVICE` | `hyperliquid-executor` | Device identity |

---

## Development

```bash
npm install
npm run build        # tsc -b across every package
npm run typecheck    # also proves each package compiles independently
npm run lint         # repository invariants from CLAUDE.md and CONSTITUTION.md
npm test             # the full suite
npm run verify       # all of the above
```

TypeScript strict mode throughout, with `exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess` and `verbatimModuleSyntax`. Tests use the Node
built-in runner; there is no test framework dependency.

## License

See [`LICENSE`](LICENSE). _(License selection pending — see Phase 0 review notes.)_
