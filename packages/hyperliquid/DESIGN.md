# Design — `@orb/hyperliquid`

## 1. Why not an SDK

Constitution Art. VIII §31: remote services are optional extensions and never
introduce vendor lock-in. A trading SDK is the deepest lock-in available — it
owns the signing key, the wire format and the retry policy all at once.

There is a second reason, specific to this package. The signing path is where a
bug costs money, and a small implementation you have read is safer than a large
one you have not. What is here is roughly 400 lines across `msgpack.ts`,
`eip712.ts`, `keys.ts` and `signing.ts`, pinned by golden vectors taken from the
reference implementation.

## 2. Exact decimals, everywhere money appears

`Decimal` holds a BigInt mantissa and a base-10 exponent. Binary floating point
cannot represent `0.1`, and the failure that matters is not cosmetic: a price
that round-trips to a value the exchange rejects, or a size that leaves dust on
a position we believe is flat.

**Rounding is always toward zero.** For a close order that is the conservative
direction — we never round a size *up* past what we actually hold.

## 3. Tick and lot rules are enforced at the edge

Price: at most 5 significant figures, and at most `MAX_DECIMALS - szDecimals`
decimal places (6 for perps, 8 for spot). Integer prices are exempt from the
significant-figure cap — `123456` is valid where `12345.6` is not.
Size: truncated to the asset's `szDecimals`.

Formatting happens once, at the boundary, and never in the risk layer. A size
that truncates to zero **throws** rather than being sent: a zero-size close
would report success while leaving the position open.

## 4. The signing path

```
actionHash = keccak256(msgpack(action) ‖ uint64(nonce)
                       ‖ vaultMarker ‖ vaultAddress?
                       ‖ expiresMarker? ‖ uint64(expiresAfter)?)
digest     = EIP-712(Exchange domain, chainId 1337,
                     Agent{ source: "a" | "b", connectionId: actionHash })
```

Three details are load-bearing and easy to get wrong:

1. **Map key order is insertion order**, not sorted order. The hash depends on
   it, so action objects are constructed in wire order and never rebuilt.
2. **Integers outside `[-2³¹, 2³²)` must be `bigint`.** A plain `number` there
   encodes as float64 and produces a different hash. `widenIntegers` handles it.
3. **`source` is the only thing separating testnet from mainnet.** That is why
   network is a *signing input*, not merely a base URL — and why a testnet
   signature is structurally incapable of authorising a mainnet action.

## 5. The key never leaves `keys.ts`

`Wallet` holds the key in a private field and redacts `toString`, `toJSON` and
the Node inspect hook. A test asserts that no serialisation path — template
literal, `JSON.stringify`, nested `util.inspect` — reveals it.

## 6. Failure is classified, not thrown raw

`TransportError.kind` distinguishes `unreachable`, `rejected`, `server_error`
and `malformed`, because the executor's failure policy depends on it:

> A timeout might mean the order **was** placed. A 400 means it certainly was not.

`definitelyNotApplied` is true only for `rejected`. Everything else must be
reconciled against the exchange before anything is concluded.

`withRetry` exists for reads. **`ExchangeClient` never retries an order**: a
duplicate position is far worse than a failed one, and the ambiguity is resolved
by reconciliation, not by guessing.

## 7. `status: "ok"` is not a filled order

`parseOrderResponse` returns a structural union — `resting`, `filled`,
`waiting`, `rejected` — so a caller cannot mistake an accepted *request* for an
executed *trade*. This is Constitution Art. XI §42 at the wire level: Orb never
assumes an action changed reality.

## 8. The socket assumes it will fail

A WebSocket is exactly the thing that dies quietly, so `HyperliquidSocket` is
built around that: a keep-alive ping detects a half-open connection, a stall
timeout catches a socket that is "connected" but silent, reconnects use
exponential backoff with **full jitter**, and every subscription is
re-established automatically.

The `health` signal is the important output. It lets the executor know its
reaction time has dropped from milliseconds to seconds, so it can fall back to
REST or enter its degraded state — rather than sit quietly on an unmonitored
position.

A listener that throws cannot take the feed down. The hard-exit path is one of
those listeners.

## 9. Trade-offs

| Decision | Cost | Why |
| --- | --- | --- |
| Hand-rolled msgpack | Must track the encoder's behaviour | Auditable, and pinned by golden vectors |
| No order retries | A failed order needs a human or a reconcile | A duplicate position is unrecoverable |
| Abbreviated wire field names kept as-is | Less readable | A rename would hide a wire change behind a local name |
| `fetch` behind a port | An indirection | Tests drive the whole adapter with no network |
