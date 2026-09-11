# `@orb/hyperliquid`

A thin, auditable Hyperliquid adapter.

Deliberately **not** a vendor SDK (Constitution Art. VIII §31 — no vendor
lock-in). It owns exactly what Orb needs and nothing more:

- exact decimal arithmetic and the exchange's tick/lot rules,
- L1 action signing (msgpack → keccak → EIP-712 → secp256k1),
- the `/info` and `/exchange` endpoints,
- a WebSocket feed that reports its own health.

**It decides nothing about trading.** No risk logic, no position management, no
retries on orders. Those belong to `@orb/trade-executor`.

## Verification

The signing path is pinned against **30 golden vectors** generated from the
reference Hyperliquid implementation, covering order/cancel/updateLeverage
actions × plain/vault/expiring variants × testnet/mainnet. All 30 action hashes
and all 30 signatures reproduce exactly. See
[`tests/fixtures/l1-signing-vectors.json`](tests/fixtures/l1-signing-vectors.json).

## Quick start

```ts
import {
  Wallet, InfoClient, ExchangeClient, HyperliquidSocket, fetchTransport, withRetry,
} from "@orb/hyperliquid";

const info = new InfoClient({
  network: "testnet",
  transport: withRetry(fetchTransport()),
});
const directory = await info.assetDirectory();

const exchange = new ExchangeClient({
  network: "testnet",
  transport: fetchTransport(),   // never retried — a repeated order doubles a position
  wallet: Wallet.fromPrivateKey(process.env.KEY!),
});
```

## Dependencies

`@noble/curves` and `@noble/hashes` — audited primitives, nothing else. msgpack,
EIP-712 and address derivation are implemented here so the security-critical
path is small enough to read.

## Documents

- [`DESIGN.md`](DESIGN.md) · [`API.md`](API.md) · [`TESTS.md`](TESTS.md)
