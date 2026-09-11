/**
 * Wallet key handling.
 *
 * The private key never leaves this module: it is held as bytes behind a class
 * whose `toString`, `toJSON` and inspect hooks are all redacted, so it cannot
 * reach a log line, an error message, or a journal payload by accident.
 *
 * Constitution Art. VIII §30: the user is the root of trust. The key is that
 * trust, in bytes.
 */
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";

/** A checksummed or lowercase `0x`-prefixed 20-byte address. */
export type Address = `0x${string}`;

const REDACTED = "[redacted private key]";

function hexToBytes(hex: string): Uint8Array {
  const body = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (body.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(body)) {
    throw new TypeError("not a hex string");
  }
  const out = new Uint8Array(body.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(body.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(bytes: Uint8Array): `0x${string}` {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return `0x${out}`;
}

/** EIP-55 checksummed rendering of a 20-byte address. */
export function toChecksumAddress(address: string): Address {
  const lower = address.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{40}$/.test(lower)) throw new TypeError(`not an address: ${address}`);
  const hash = keccak_256(new TextEncoder().encode(lower));

  let out = "0x";
  for (const [index, char] of [...lower].entries()) {
    const nibble = index % 2 === 0 ? (hash[index >> 1]! >> 4) : (hash[index >> 1]! & 0x0f);
    out += nibble >= 8 ? char.toUpperCase() : char;
  }
  return out as Address;
}

export function isAddress(value: string): value is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

/** An ECDSA signature in the shape Hyperliquid expects on the wire. */
export interface Signature {
  readonly r: `0x${string}`;
  readonly s: `0x${string}`;
  readonly v: 27 | 28;
}

/**
 * A secp256k1 signing key.
 *
 * Instances are deliberately hostile to serialisation. Anything that would
 * print an object graph — `console.log`, `JSON.stringify`, a template literal,
 * an error's `cause` chain — sees only {@link REDACTED}.
 */
export class Wallet {
  readonly #privateKey: Uint8Array;
  readonly address: Address;

  private constructor(privateKey: Uint8Array) {
    this.#privateKey = privateKey;
    const publicKey = secp256k1.getPublicKey(privateKey, false).subarray(1);
    this.address = toChecksumAddress(bytesToHex(keccak_256(publicKey).subarray(-20)));
  }

  /** @param privateKey 32-byte hex, with or without a `0x` prefix. */
  static fromPrivateKey(privateKey: string): Wallet {
    const bytes = hexToBytes(privateKey.trim());
    if (bytes.length !== 32) throw new TypeError("private key must be 32 bytes");
    if (!secp256k1.utils.isValidPrivateKey(bytes)) throw new TypeError("private key is out of range");
    return new Wallet(bytes);
  }

  /** Signs a 32-byte digest, returning `(r, s, v)` with a low `s` per EIP-2. */
  signDigest(digest: Uint8Array): Signature {
    if (digest.length !== 32) throw new TypeError("digest must be 32 bytes");
    const signature = secp256k1.sign(digest, this.#privateKey, { lowS: true, prehash: false });
    const recovery = signature.recovery;
    if (recovery !== 0 && recovery !== 1) throw new Error("unexpected recovery id");
    return {
      r: `0x${signature.r.toString(16).padStart(64, "0")}`,
      s: `0x${signature.s.toString(16).padStart(64, "0")}`,
      v: (27 + recovery) as 27 | 28,
    };
  }

  toString(): string {
    return `Wallet(${this.address})`;
  }

  toJSON(): string {
    return `Wallet(${this.address})`;
  }

  /** Redacts the key under `console.log` / `util.inspect`. */
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return `Wallet(${this.address}) ${REDACTED}`;
  }
}
