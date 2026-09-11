# API — `@orb/hyperliquid`

## Decimals and formatting

```ts
class Decimal {
  static parse(value: string | number | Decimal): Decimal
  toDecimalPlaces(places: number): Decimal      // truncates toward zero
  toSignificantDigits(count: number): Decimal   // truncates toward zero
  compare(other: Decimal): number
  toFixed(): string        // plain notation, no trailing zeros
  toNumber(): number       // lossy; for ratios and reporting only
  get isZero(): boolean
  get isInteger(): boolean
  get isNegative(): boolean
}

formatPrice(price, szDecimals, kind?: "perp" | "spot"): string
formatSize(size, szDecimals): string
isRepresentableSize(size, szDecimals): boolean
```

`formatPrice` and `formatSize` throw `FormatError` for a non-decimal, a
negative, or a value that truncates to zero.

## Wallet and signing

```ts
class Wallet {
  static fromPrivateKey(privateKey: string): Wallet   // 32 hex bytes, 0x optional
  readonly address: Address                            // EIP-55 checksummed
  signDigest(digest: Uint8Array): Signature            // low-s, v ∈ {27, 28}
}

toChecksumAddress(address: string): Address
isAddress(value: string): value is Address
bytesToHex(bytes: Uint8Array): `0x${string}`

createL1ActionHash(input: L1SigningInput): `0x${string}`
l1ActionDigest(input: L1SigningInput, network: HyperliquidNetwork): Uint8Array
signL1Action(wallet: Wallet, input: L1SigningInput, network: HyperliquidNetwork): Signature
createNonceSource(now?: () => number): () => number    // strictly increasing
```

```ts
interface L1SigningInput {
  readonly action: L1Action;          // key order is significant
  readonly nonce: number;             // ms since epoch; the replay guard
  readonly vaultAddress?: Address;
  readonly expiresAfter?: number;
}
```

## Transport

```ts
type HttpTransport = (request: HttpRequest) => Promise<unknown>;

fetchTransport(): HttpTransport
withRetry(transport, { attempts?, baseDelayMs?, sleep? }): HttpTransport

class TransportError extends Error {
  readonly kind: "unreachable" | "rejected" | "server_error" | "malformed";
  readonly status?: number;
  get definitelyNotApplied(): boolean;   // true only for "rejected"
}
```

`withRetry` retries `unreachable` and `server_error` only.

## Info client (read)

```ts
class InfoClient {
  constructor(options: InfoClientOptions)
  meta(signal?): Promise<MetaResponse>
  assetDirectory(signal?): Promise<AssetDirectory>
  clearinghouseState(user: Address, signal?): Promise<ClearinghouseState>
  openOrders(user: Address, signal?): Promise<readonly OpenOrder[]>
  userFills(user: Address, signal?): Promise<readonly UserFill[]>
  userFillsByTime(user: Address, startTime: number, signal?): Promise<readonly UserFill[]>
  orderStatus(user: Address, oid: number | `0x${string}`, signal?): Promise<OrderStatusResponse>
  metaAndAssetCtxs(signal?): Promise<{ meta: MetaResponse; contexts: readonly PerpAssetCtx[] }>
  allMids(signal?): Promise<Readonly<Record<string, string>>>
}

class AssetDirectory {
  has(symbol: string): boolean
  resolve(symbol: string): { index: number; meta: AssetMeta }   // throws RangeError
  get symbols(): readonly string[]
  get tradableSymbols(): readonly string[]   // excludes delisted
}
```

## Exchange client (write)

```ts
class ExchangeClient {
  constructor(options: ExchangeClientOptions)
  get address(): `0x${string}`
  get tradingAccount(): `0x${string}`        // the vault, when trading one

  placeOrders(orders: readonly OrderWire[], grouping?, signal?): Promise<readonly OrderOutcome[]>
  cancelOrders(cancels: readonly { asset: number; oid: number }[], signal?): Promise<void>
  cancelOrdersByCloid(cancels: readonly { asset: number; cloid: `0x${string}` }[], signal?): Promise<void>
  updateLeverage(asset: number, leverage: number, isCross: boolean, signal?): Promise<void>
}

type OrderOutcome =
  | { kind: "resting"; orderId: number; clientOrderId?: `0x${string}` }
  | { kind: "filled"; orderId: number; totalSz: string; avgPx: string; cloid?: `0x${string}` }
  | { kind: "waiting"; detail: "waitingForFill" | "waitingForTrigger" }
  | { kind: "rejected"; reason: string };
```

**Orders are never retried internally.** A `TransportError` from `placeOrders`
means *unknown*, not *not placed*, unless `definitelyNotApplied` says otherwise.

## WebSocket

```ts
class HyperliquidSocket {
  constructor(options: HyperliquidSocketOptions)
  start(): void
  stop(): void
  get health(): FeedHealth
  get connected(): boolean
  msSinceLastMessage(): number

  subscribeAssetContext(coin: string): void
  subscribeUserFills(user: Address): void
  subscribeOrderUpdates(user: Address): void
  subscribeAccount(user: Address): void

  on("activeAssetCtx" | "userFills" | "orderUpdates" | "webData2" | "health", listener): () => void
}

type FeedHealth =
  | { state: "connected"; since: number }
  | { state: "connecting"; attempt: number }
  | { state: "disconnected"; since: number; reason: string };
```

Subscriptions are declarative: they are re-established on every reconnect, and
a subscription added while disconnected is applied when the socket returns.
`socketFactory`, `now`, `setTimer`, `clearTimer` and `random` are injectable so
reconnection is deterministic under test.

## Wire types

`OrderWire`, `OrderType`, `Tif`, `OrderGrouping`, `ClearinghouseState`,
`ExchangePosition`, `AssetMeta`, `PerpAssetCtx`, `UserFill`, `OpenOrder`,
`OrderProcessingStatus`, plus `isTerminalOrderStatus(status)`.

Abbreviated field names (`a`, `b`, `p`, `s`, `r`, `t`, `c`) are the exchange's
and are kept verbatim.
