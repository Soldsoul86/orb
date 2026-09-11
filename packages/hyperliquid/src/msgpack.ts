/**
 * MessagePack encoder — the subset Hyperliquid action hashing requires.
 *
 * The exchange hashes the msgpack encoding of the action object, so this must
 * match the reference encoder byte for byte or every signature is rejected.
 * `tests/msgpack.test.ts` pins the output against vectors generated from the
 * reference implementation.
 *
 * Two details are load-bearing and easy to get wrong:
 *
 * 1. **Map key order is insertion order, not sorted order.** The hash depends
 *    on it, which is why callers build actions through `canonicalAction`.
 * 2. **Integers outside `[-2^31, 2^32)` must be passed as `bigint`.** A plain
 *    `number` in that range encodes as float64, producing a different hash.
 *    {@link widenIntegers} applies this before encoding.
 */

/** Values this encoder accepts. */
export type MsgPackValue =
  | null
  | boolean
  | number
  | bigint
  | string
  | readonly MsgPackValue[]
  | { readonly [key: string]: MsgPackValue | undefined };

const INT_MIN = -0x8000_0000;
const INT_MAX = 0xffff_ffff;

class Writer {
  #bytes = new Uint8Array(256);
  #length = 0;

  #reserve(extra: number): void {
    if (this.#length + extra <= this.#bytes.length) return;
    let capacity = this.#bytes.length * 2;
    while (capacity < this.#length + extra) capacity *= 2;
    const grown = new Uint8Array(capacity);
    grown.set(this.#bytes.subarray(0, this.#length));
    this.#bytes = grown;
  }

  u8(value: number): void {
    this.#reserve(1);
    this.#bytes[this.#length++] = value;
  }

  bytes(value: Uint8Array): void {
    this.#reserve(value.length);
    this.#bytes.set(value, this.#length);
    this.#length += value.length;
  }

  big(value: bigint, byteLength: number): void {
    this.#reserve(byteLength);
    for (let shift = (byteLength - 1) * 8; shift >= 0; shift -= 8) {
      this.#bytes[this.#length++] = Number((value >> BigInt(shift)) & 0xffn);
    }
  }

  float64(value: number): void {
    this.#reserve(8);
    new DataView(this.#bytes.buffer, this.#bytes.byteOffset).setFloat64(this.#length, value);
    this.#length += 8;
  }

  finish(): Uint8Array {
    return this.#bytes.slice(0, this.#length);
  }
}

const utf8 = new TextEncoder();

function encodeInteger(writer: Writer, value: bigint): void {
  if (value >= 0n) {
    if (value < 0x80n) writer.u8(Number(value));
    else if (value <= 0xffn) (writer.u8(0xcc), writer.big(value, 1));
    else if (value <= 0xffffn) (writer.u8(0xcd), writer.big(value, 2));
    else if (value <= 0xffff_ffffn) (writer.u8(0xce), writer.big(value, 4));
    else if (value <= 0xffff_ffff_ffff_ffffn) (writer.u8(0xcf), writer.big(value, 8));
    else throw new RangeError(`integer out of msgpack range: ${value}`);
    return;
  }
  const twos = (bits: number) => (value + (1n << BigInt(bits))) & ((1n << BigInt(bits)) - 1n);
  if (value >= -0x20n) writer.u8(Number(twos(8)));
  else if (value >= -0x80n) (writer.u8(0xd0), writer.big(twos(8), 1));
  else if (value >= -0x8000n) (writer.u8(0xd1), writer.big(twos(16), 2));
  else if (value >= -0x8000_0000n) (writer.u8(0xd2), writer.big(twos(32), 4));
  else if (value >= -0x8000_0000_0000_0000n) (writer.u8(0xd3), writer.big(twos(64), 8));
  else throw new RangeError(`integer out of msgpack range: ${value}`);
}

function encodeString(writer: Writer, value: string): void {
  const bytes = utf8.encode(value);
  if (bytes.length < 32) writer.u8(0xa0 | bytes.length);
  else if (bytes.length <= 0xff) (writer.u8(0xd9), writer.big(BigInt(bytes.length), 1));
  else if (bytes.length <= 0xffff) (writer.u8(0xda), writer.big(BigInt(bytes.length), 2));
  else if (bytes.length <= 0xffff_ffff) (writer.u8(0xdb), writer.big(BigInt(bytes.length), 4));
  else throw new RangeError("string too long for msgpack");
  writer.bytes(bytes);
}

function encodeValue(writer: Writer, value: MsgPackValue): void {
  if (value === null) return writer.u8(0xc0);
  if (typeof value === "boolean") return writer.u8(value ? 0xc3 : 0xc2);
  if (typeof value === "bigint") return encodeInteger(writer, value);

  if (typeof value === "number") {
    // Matches the reference encoder: only int32-ranged integers take an integer
    // encoding; everything else is float64.
    if (Number.isInteger(value) && value >= INT_MIN && value <= INT_MAX) {
      return encodeInteger(writer, BigInt(value));
    }
    if (!Number.isFinite(value)) throw new RangeError(`cannot encode ${value}`);
    writer.u8(0xcb);
    return writer.float64(value);
  }

  if (typeof value === "string") return encodeString(writer, value);

  if (Array.isArray(value)) {
    const items = value as readonly MsgPackValue[];
    if (items.length < 16) writer.u8(0x90 | items.length);
    else if (items.length <= 0xffff) (writer.u8(0xdc), writer.big(BigInt(items.length), 2));
    else (writer.u8(0xdd), writer.big(BigInt(items.length), 4));
    for (const item of items) encodeValue(writer, item);
    return;
  }

  if (typeof value === "object") {
    // `undefined` properties are dropped rather than encoded, matching how the
    // exchange's clients build optional action fields.
    const entries = Object.entries(value).filter(([, v]) => v !== undefined) as [string, MsgPackValue][];
    if (entries.length < 16) writer.u8(0x80 | entries.length);
    else if (entries.length <= 0xffff) (writer.u8(0xde), writer.big(BigInt(entries.length), 2));
    else (writer.u8(0xdf), writer.big(BigInt(entries.length), 4));
    for (const [key, item] of entries) {
      encodeString(writer, key);
      encodeValue(writer, item);
    }
    return;
  }

  throw new TypeError(`cannot encode ${typeof value} in msgpack`);
}

/** Encodes `value` to MessagePack bytes. */
export function encodeMsgPack(value: MsgPackValue): Uint8Array {
  const writer = new Writer();
  encodeValue(writer, value);
  return writer.finish();
}

/**
 * Widens integers outside the int32 range to `bigint`, so they encode as
 * fixed-width integers rather than float64, and strips `undefined` properties.
 */
export function widenIntegers(value: MsgPackValue): MsgPackValue {
  if (Array.isArray(value)) return (value as readonly MsgPackValue[]).map(widenIntegers);
  if (typeof value === "number" && Number.isInteger(value) && (value > INT_MAX || value < INT_MIN)) {
    return BigInt(value);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, MsgPackValue> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) out[key] = widenIntegers(item);
    }
    return out;
  }
  return value;
}
