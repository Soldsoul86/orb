/**
 * Hyperliquid L1 action signing.
 *
 * An L1 action is authorised by signing a "phantom agent": the action is
 * msgpack-encoded, hashed together with the nonce (and optional vault address
 * and expiry) into a `connectionId`, and that is signed as an EIP-712 `Agent`
 * struct under a fixed `Exchange` domain on chain id 1337.
 *
 *   actionHash  = keccak256(msgpack(action) ‖ uint64(nonce)
 *                           ‖ vaultMarker ‖ vaultAddress?
 *                           ‖ expiresMarker? ‖ uint64(expiresAfter)?)
 *   digest      = EIP-712(Exchange domain, Agent{source, connectionId=actionHash})
 *
 * `source` is `"a"` on mainnet and `"b"` on testnet — which is the only thing
 * separating a testnet signature from a mainnet one, and why environment is a
 * signing input rather than merely a URL.
 *
 * Every branch here is pinned by golden vectors generated from the reference
 * implementation; see `tests/signing.test.ts`.
 */
import { keccak_256 } from "@noble/hashes/sha3";
import { encodeMsgPack, widenIntegers, type MsgPackValue } from "./msgpack.js";
import { typedDataDigest, type Eip712Domain, type TypedField } from "./eip712.js";
import type { Address, Signature, Wallet } from "./keys.js";

export type HyperliquidNetwork = "mainnet" | "testnet";

/** An exchange action, as the object that gets msgpack-encoded and hashed. */
export type L1Action = { readonly [key: string]: MsgPackValue | undefined };

export const EXCHANGE_DOMAIN: Eip712Domain = Object.freeze({
  name: "Exchange",
  version: "1",
  chainId: 1337,
  verifyingContract: "0x0000000000000000000000000000000000000000",
});

const AGENT_FIELDS: readonly TypedField[] = Object.freeze([
  { name: "source", type: "string" },
  { name: "connectionId", type: "bytes32" },
] as const);

export interface L1SigningInput {
  readonly action: L1Action;
  /** Milliseconds since the epoch. Doubles as the exchange's replay guard. */
  readonly nonce: number;
  readonly vaultAddress?: Address;
  /** Milliseconds since the epoch, after which the exchange rejects the action. */
  readonly expiresAfter?: number;
}

function uint64(value: number): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(value));
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const body = hex.replace(/^0x/i, "");
  const out = new Uint8Array(body.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(body.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** The `connectionId` the phantom agent commits to. */
export function createL1ActionHash(input: L1SigningInput): `0x${string}` {
  const { action, nonce, vaultAddress, expiresAfter } = input;

  const chunks: Uint8Array[] = [
    encodeMsgPack(widenIntegers(action as MsgPackValue)),
    uint64(nonce),
    // A one-byte presence marker, then the address if present.
    vaultAddress ? new Uint8Array([1]) : new Uint8Array([0]),
  ];
  if (vaultAddress) chunks.push(hexToBytes(vaultAddress));
  // The expiry marker is a zero byte — present only when an expiry is set.
  if (expiresAfter !== undefined) chunks.push(new Uint8Array([0]), uint64(expiresAfter));

  const digest = keccak_256(concat(chunks));
  let hex = "";
  for (const byte of digest) hex += byte.toString(16).padStart(2, "0");
  return `0x${hex}`;
}

/** The 32-byte EIP-712 digest an L1 action is signed over. */
export function l1ActionDigest(input: L1SigningInput, network: HyperliquidNetwork): Uint8Array {
  return typedDataDigest(EXCHANGE_DOMAIN, "Agent", AGENT_FIELDS, {
    source: network === "testnet" ? "b" : "a",
    connectionId: createL1ActionHash(input),
  });
}

/** Signs an L1 action for the given network. */
export function signL1Action(
  wallet: Wallet,
  input: L1SigningInput,
  network: HyperliquidNetwork,
): Signature {
  return wallet.signDigest(l1ActionDigest(input, network));
}

/**
 * Monotonic nonce source.
 *
 * The exchange treats the nonce as a replay guard and expects it to increase,
 * so two actions sent within the same millisecond must not collide.
 */
export function createNonceSource(now: () => number = () => Date.now()): () => number {
  let last = 0;
  return () => {
    const candidate = Math.max(now(), last + 1);
    last = candidate;
    return candidate;
  };
}
