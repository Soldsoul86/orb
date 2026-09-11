# Tests — `@orb/hyperliquid`

`npm test --workspace @orb/hyperliquid`

63 tests across 15 suites.

## Golden-vector conformance

`tests/fixtures/l1-signing-vectors.json` was generated from the reference
Hyperliquid implementation and pins the entire signing path:

- **30 action hashes** and **30 signatures** — `order` (simple / reduce-only IOC
  with cloid / trigger stop-loss), `cancel`, `updateLeverage`, each in plain,
  vault-address and expiring variants, each for testnet and mainnet. **All 30
  reproduce exactly.**
- **msgpack bytes** for every reference action, plus every length-prefix
  boundary (fixstr/str8 at 31→32, fixarray/array16 at 15→16, fixmap/map16 at
  15→16, fixint/uint8 at 127→128, negative fixint/int8 at −32→−33, uint16/uint32
  boundaries, uint64 via bigint, float64).
- **Formatting vectors** for price and size, including the integer exemption
  from the five-significant-figure cap.

## Covered

**Wallet** — address derivation; keys with and without `0x`; malformed and
out-of-range keys refused; deterministic low-`s` signatures; **the private key
never appears through any serialisation path** (`String`, template literal,
`JSON.stringify`, nested `util.inspect`).

**msgpack** — map key order is insertion order (the hash depends on it);
`undefined` properties dropped; integer widening at both int32 boundaries.

**EIP-712** — exact `Agent` type signature; a different `chainId` produces a
different digest.

**L1 signing** — testnet and mainnet signatures differ for an identical action;
the nonce is bound into the hash; nonces are strictly increasing even within one
millisecond and never go backwards when the wall clock does.

**Decimal** — every accepted notation; exactness where floats fail; truncation
toward zero in both signs; ordering across signs and magnitudes; comparison
across differing exponents.

**Formatting** — all reference vectors; the integer exemption; the per-asset
decimal ceiling; refusal of zero, negative, and truncates-to-zero.

**Info client** — documented request shapes; testnet/mainnet host separation;
the empty-object form for no open orders; a malformed response rejected rather
than invented.

**Transport** — only `rejected` is `definitelyNotApplied`; `withRetry` retries
transient failures and never repeats a rejection.

**Order responses** — resting / filled / waiting / rejected distinguished; an
`ok` envelope with a per-order error is still a rejection; a top-level failure
rejects the whole batch; an unrecognised shape throws rather than assuming
success.

**Exchange client** — signs and posts with nonce and signature; **never retries
an order**; vault address reaches both the signature and the body; cancel and
updateLeverage send the documented actions; nonsensical leverage is refused
before the wire.

**Socket** (deterministic fake socket + manual timer queue) — subscribes on
connect; re-establishes every subscription after reconnect; a subscription added
while disconnected is applied on reconnect; **a half-open connection that stops
delivering is detected**; any message resets the stall clock; channels route
correctly; a throwing listener cannot take the feed down; malformed frames are
ignored; `stop()` ends reconnection.

## Not covered, deliberately

- **Live network calls.** Every test drives an injected transport or socket.
  Correctness against the real exchange is established by the golden vectors
  (for what we send) and by testnet runs (for what comes back).
- **Rate limit behaviour.** The exchange's limits are not modelled; the executor
  handles a `rejected` outcome the same way regardless of cause.
- **Spot markets.** `formatPrice` supports the spot `MAX_DECIMALS` of 8 and is
  vector-tested, but no spot trading path exists.
- **Multi-sig and agent wallets.** Not implemented. `vaultAddress` covers the
  sub-account case.
- **WebSocket `post` requests.** Only subscriptions are used; reads go over REST
  where failure classification is clearer.
