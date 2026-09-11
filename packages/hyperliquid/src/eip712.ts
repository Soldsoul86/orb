/**
 * The slice of EIP-712 typed-data hashing that Hyperliquid's L1 signing needs.
 *
 * Only the field types actually used by the `Agent` struct and the standard
 * domain are supported — `string`, `bytes32`, `uint256`, `address`. Anything
 * else throws rather than silently hashing the wrong bytes.
 */
import { keccak_256 } from "@noble/hashes/sha3";

export interface Eip712Domain {
  readonly name: string;
  readonly version: string;
  readonly chainId: number;
  readonly verifyingContract: `0x${string}`;
}

export interface TypedField {
  readonly name: string;
  readonly type: "string" | "bytes32" | "uint256" | "address";
}

const utf8 = new TextEncoder();

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function word(value: bigint): Uint8Array {
  if (value < 0n) throw new RangeError("negative values are not encodable as uint256");
  const out = new Uint8Array(32);
  let remaining = value;
  for (let i = 31; i >= 0 && remaining > 0n; i--) {
    out[i] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return out;
}

function hexWord(hex: string, byteLength: number): Uint8Array {
  const body = hex.replace(/^0x/i, "");
  if (body.length !== byteLength * 2 || !/^[0-9a-fA-F]*$/.test(body)) {
    throw new TypeError(`expected ${byteLength} hex bytes, got ${hex}`);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < byteLength; i++) {
    // `bytes32` is left-aligned; `address` is right-aligned in its word.
    const slot = byteLength === 32 ? i : 32 - byteLength + i;
    out[slot] = Number.parseInt(body.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** `Name(type1 field1,type2 field2)` — the EIP-712 type signature. */
export function encodeType(primaryType: string, fields: readonly TypedField[]): string {
  return `${primaryType}(${fields.map((f) => `${f.type} ${f.name}`).join(",")})`;
}

export function typeHash(primaryType: string, fields: readonly TypedField[]): Uint8Array {
  return keccak_256(utf8.encode(encodeType(primaryType, fields)));
}

function encodeField(field: TypedField, value: unknown): Uint8Array {
  switch (field.type) {
    case "string":
      if (typeof value !== "string") throw new TypeError(`${field.name} must be a string`);
      return keccak_256(utf8.encode(value));
    case "bytes32":
      if (typeof value !== "string") throw new TypeError(`${field.name} must be hex`);
      return hexWord(value, 32);
    case "address":
      if (typeof value !== "string") throw new TypeError(`${field.name} must be an address`);
      return hexWord(value, 20);
    case "uint256":
      if (typeof value !== "number" && typeof value !== "bigint") {
        throw new TypeError(`${field.name} must be numeric`);
      }
      return word(BigInt(value));
  }
}

export function hashStruct(
  primaryType: string,
  fields: readonly TypedField[],
  message: Readonly<Record<string, unknown>>,
): Uint8Array {
  return keccak_256(
    concat([typeHash(primaryType, fields), ...fields.map((f) => encodeField(f, message[f.name]))]),
  );
}

const DOMAIN_FIELDS: readonly TypedField[] = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
];

export function domainSeparator(domain: Eip712Domain): Uint8Array {
  return hashStruct("EIP712Domain", DOMAIN_FIELDS, domain as unknown as Record<string, unknown>);
}

/** `keccak256(0x1901 ‖ domainSeparator ‖ hashStruct(message))`. */
export function typedDataDigest(
  domain: Eip712Domain,
  primaryType: string,
  fields: readonly TypedField[],
  message: Readonly<Record<string, unknown>>,
): Uint8Array {
  return keccak_256(
    concat([
      new Uint8Array([0x19, 0x01]),
      domainSeparator(domain),
      hashStruct(primaryType, fields, message),
    ]),
  );
}
