/**
 * @orb/hyperliquid — a thin, auditable Hyperliquid adapter.
 *
 * Deliberately not a vendor SDK (Constitution Art. VIII §31). It owns exactly
 * what Orb needs: exact decimal handling, the tick/lot rules, L1 action
 * signing, the info and exchange endpoints, and a WebSocket feed that reports
 * its own health. It decides nothing about trading.
 */
export { Decimal } from "./decimal.js";
export { formatPrice, formatSize, isRepresentableSize, FormatError } from "./format.js";
export type { MarketKind } from "./format.js";

export { encodeMsgPack, widenIntegers } from "./msgpack.js";
export type { MsgPackValue } from "./msgpack.js";

export { Wallet, toChecksumAddress, isAddress, bytesToHex } from "./keys.js";
export type { Address, Signature } from "./keys.js";

export { encodeType, typeHash, hashStruct, domainSeparator, typedDataDigest } from "./eip712.js";
export type { Eip712Domain, TypedField } from "./eip712.js";

export {
  createL1ActionHash,
  l1ActionDigest,
  signL1Action,
  createNonceSource,
  EXCHANGE_DOMAIN,
} from "./signing.js";
export type { HyperliquidNetwork, L1Action, L1SigningInput } from "./signing.js";

export { fetchTransport, withRetry, TransportError } from "./transport.js";
export type { HttpTransport, HttpRequest, TransportFailureKind } from "./transport.js";

export { InfoClient, AssetDirectory } from "./info.js";
export type { InfoClientOptions } from "./info.js";

export { ExchangeClient, parseOrderResponse } from "./exchange.js";
export type { ExchangeClientOptions, OrderOutcome } from "./exchange.js";

export { HyperliquidSocket } from "./ws.js";
export type {
  HyperliquidSocketOptions,
  HyperliquidSocketEvents,
  SocketLike,
  SocketFactory,
  FeedHealth,
  ActiveAssetCtxEvent,
  UserFillsEvent,
  OrderUpdateEvent,
  WebData2Event,
} from "./ws.js";

export * from "./types.js";
