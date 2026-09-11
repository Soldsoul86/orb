/**
 * Signing conformance.
 *
 * Every assertion here is pinned against `fixtures/l1-signing-vectors.json`,
 * generated from the reference Hyperliquid implementation. A wrong byte
 * anywhere in msgpack, the action hash, EIP-712 or secp256k1 changes the
 * signature, and the exchange would reject every order we send — so these
 * vectors are the contract, not an illustration.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inspect } from "node:util";

import { Wallet, toChecksumAddress, isAddress, bytesToHex } from "../src/keys.js";
import { encodeMsgPack, widenIntegers } from "../src/msgpack.js";
import { createL1ActionHash, signL1Action, createNonceSource, l1ActionDigest } from "../src/signing.js";
import { encodeType, typedDataDigest } from "../src/eip712.js";
import type { L1Action, HyperliquidNetwork } from "../src/signing.js";
import type { Address } from "../src/keys.js";

interface Vector {
  name: string;
  label: string;
  isTestnet: boolean;
  action: L1Action;
  nonce: number;
  vaultAddress?: Address;
  expiresAfter?: number;
  actionHash: string;
  signature: { r: string; s: string; v: 27 | 28 };
}

interface Fixture {
  privateKey: string;
  address: string;
  vectors: Vector[];
  msgpack: Record<string, string>;
  msgpackPrimitives: Record<string, string>;
}

const fixture: Fixture = JSON.parse(
  readFileSync(new URL("../../tests/fixtures/l1-signing-vectors.json", import.meta.url), "utf8"),
);

const wallet = Wallet.fromPrivateKey(fixture.privateKey);
const hex = (bytes: Uint8Array) => bytesToHex(bytes);

describe("wallet", () => {
  test("derives the expected address from the private key", () => {
    assert.equal(wallet.address, toChecksumAddress(fixture.address));
    assert.ok(isAddress(wallet.address));
  });

  test("accepts a key with or without the 0x prefix", () => {
    const bare = Wallet.fromPrivateKey(fixture.privateKey.slice(2));
    assert.equal(bare.address, wallet.address);
  });

  test("rejects malformed and out-of-range keys", () => {
    assert.throws(() => Wallet.fromPrivateKey("0x00"), TypeError);
    assert.throws(() => Wallet.fromPrivateKey("0x" + "zz".repeat(32)), TypeError);
    assert.throws(() => Wallet.fromPrivateKey("0x" + "00".repeat(32)), TypeError);
    assert.throws(() => Wallet.fromPrivateKey("0x" + "ff".repeat(32)), TypeError);
  });

  test("never exposes the private key through any serialisation path", () => {
    const key = fixture.privateKey.slice(2);
    const renderings = [
      String(wallet),
      `${wallet}`,
      JSON.stringify(wallet),
      JSON.stringify({ wallet }),
      inspect(wallet, { depth: 10 }),
      inspect({ nested: { wallet } }, { depth: 10 }),
    ];
    for (const rendering of renderings) {
      assert.ok(!rendering.toLowerCase().includes(key.toLowerCase()), `leaked in: ${rendering}`);
    }
  });

  test("signatures are deterministic and use a low s (EIP-2)", () => {
    const digest = new Uint8Array(32).fill(7);
    const first = wallet.signDigest(digest);
    assert.deepEqual(first, wallet.signDigest(digest));

    const halfOrder = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n;
    assert.ok(BigInt(first.s) <= halfOrder);
    assert.ok(first.v === 27 || first.v === 28);
  });

  test("refuses a digest that is not 32 bytes", () => {
    assert.throws(() => wallet.signDigest(new Uint8Array(31)), TypeError);
  });
});

describe("msgpack", () => {
  test("encodes every reference action byte for byte", () => {
    for (const [name, expected] of Object.entries(fixture.msgpack)) {
      const vector = fixture.vectors.find((v) => v.name === name);
      assert.ok(vector, `no action for ${name}`);
      assert.equal(hex(encodeMsgPack(widenIntegers(vector.action))), expected, name);
    }
  });

  test("encodes primitives and every length-prefix boundary", () => {
    const p = fixture.msgpackPrimitives;
    assert.equal(hex(encodeMsgPack({})), p["emptyMap"]);
    assert.equal(hex(encodeMsgPack([])), p["emptyArr"]);
    assert.equal(hex(encodeMsgPack({ n: 1700000000000n })), p["bigint"]);
    assert.equal(hex(encodeMsgPack({ f: 1.5 })), p["floats"]);
    assert.equal(hex(encodeMsgPack("a".repeat(31))), p["str31"]);
    assert.equal(hex(encodeMsgPack("a".repeat(32))), p["str32"]);
    assert.equal(hex(encodeMsgPack(Array(15).fill(1))), p["arr15"]);
    assert.equal(hex(encodeMsgPack(Array(16).fill(1))), p["arr16"]);
    assert.equal(
      hex(encodeMsgPack(Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`k${i}`, i])))),
      p["map15"],
    );
    assert.equal(
      hex(encodeMsgPack(Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`k${i}`, i])))),
      p["map16"],
    );
    assert.equal(
      hex(
        encodeMsgPack({
          a: 1, b: [true, false, null], c: "hé", d: -1, e: 127,
          f: 128, g: 65535, h: 65536, i: -32, j: -33,
        }),
      ),
      p["nested"],
    );
  });

  test("map key order is insertion order, because the hash depends on it", () => {
    assert.notEqual(hex(encodeMsgPack({ a: 1, b: 2 })), hex(encodeMsgPack({ b: 2, a: 1 })));
  });

  test("drops undefined properties rather than encoding them", () => {
    assert.equal(hex(encodeMsgPack({ a: 1, b: undefined })), hex(encodeMsgPack({ a: 1 })));
  });

  test("widens integers beyond int32 so they are not encoded as float64", () => {
    // 2**32 is outside the int range the reference encoder uses for `number`.
    assert.equal(widenIntegers(4_294_967_296), 4_294_967_296n);
    assert.equal(widenIntegers(-2_147_483_649), -2_147_483_649n);
    assert.equal(widenIntegers(4_294_967_295), 4_294_967_295);
    assert.equal(widenIntegers(-2_147_483_648), -2_147_483_648);
  });
});

describe("EIP-712", () => {
  test("encodes the Agent type signature exactly", () => {
    assert.equal(
      encodeType("Agent", [
        { name: "source", type: "string" },
        { name: "connectionId", type: "bytes32" },
      ]),
      "Agent(string source,bytes32 connectionId)",
    );
  });

  test("a different domain produces a different digest", () => {
    const fields = [{ name: "source", type: "string" }] as const;
    const message = { source: "a" };
    const a = typedDataDigest(
      { name: "Exchange", version: "1", chainId: 1337, verifyingContract: "0x0000000000000000000000000000000000000000" },
      "Agent", fields, message,
    );
    const b = typedDataDigest(
      { name: "Exchange", version: "1", chainId: 1338, verifyingContract: "0x0000000000000000000000000000000000000000" },
      "Agent", fields, message,
    );
    assert.notEqual(hex(a), hex(b));
  });
});

describe("L1 action signing", () => {
  test(`reproduces all ${fixture.vectors.length} reference action hashes`, () => {
    for (const vector of fixture.vectors) {
      const input = {
        action: vector.action,
        nonce: vector.nonce,
        ...(vector.vaultAddress ? { vaultAddress: vector.vaultAddress } : {}),
        ...(vector.expiresAfter !== undefined ? { expiresAfter: vector.expiresAfter } : {}),
      };
      assert.equal(
        createL1ActionHash(input),
        vector.actionHash,
        `${vector.name}/${vector.label}`,
      );
    }
  });

  test(`reproduces all ${fixture.vectors.length} reference signatures`, () => {
    for (const vector of fixture.vectors) {
      const network: HyperliquidNetwork = vector.isTestnet ? "testnet" : "mainnet";
      const input = {
        action: vector.action,
        nonce: vector.nonce,
        ...(vector.vaultAddress ? { vaultAddress: vector.vaultAddress } : {}),
        ...(vector.expiresAfter !== undefined ? { expiresAfter: vector.expiresAfter } : {}),
      };
      assert.deepEqual(
        signL1Action(wallet, input, network),
        vector.signature,
        `${vector.name}/${vector.label}/${network}`,
      );
    }
  });

  test("testnet and mainnet signatures differ for an identical action", () => {
    const vector = fixture.vectors[0]!;
    const input = { action: vector.action, nonce: vector.nonce };
    assert.notDeepEqual(
      signL1Action(wallet, input, "testnet"),
      signL1Action(wallet, input, "mainnet"),
    );
    // The action hash is network-independent; only `source` differs.
    assert.equal(hex(l1ActionDigest(input, "testnet")).length, 66);
    assert.notEqual(hex(l1ActionDigest(input, "testnet")), hex(l1ActionDigest(input, "mainnet")));
  });

  test("the nonce is bound into the hash", () => {
    const action = fixture.vectors[0]!.action;
    assert.notEqual(
      createL1ActionHash({ action, nonce: 1 }),
      createL1ActionHash({ action, nonce: 2 }),
    );
  });
});

describe("nonce source", () => {
  test("is strictly increasing even within one millisecond", () => {
    const nonce = createNonceSource(() => 1_700_000_000_000);
    const values = Array.from({ length: 100 }, () => nonce());
    for (let i = 1; i < values.length; i++) assert.ok(values[i]! > values[i - 1]!);
  });

  test("never goes backwards when the wall clock does", () => {
    let t = 1_700_000_000_000;
    const nonce = createNonceSource(() => t);
    const first = nonce();
    t -= 10_000; // clock stepped back (NTP correction)
    assert.ok(nonce() > first);
  });
});
