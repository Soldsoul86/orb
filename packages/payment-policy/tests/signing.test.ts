/**
 * Attribution.
 *
 * The test that carries this file is the authorised-key one. A correct
 * signature from the wrong key is the failure real systems ship: the
 * cryptography is perfect, the maths checks out, and the payload is still
 * signed by somebody with no right to speak for the name on it.
 */
import { ok, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import { generateKeyPairSync } from "node:crypto";

import type { PublicKeyRecord, Quote, Signed } from "../src/index.js";
import {
  MemoryKeyDirectory,
  countersign,
  ed25519Signer,
  sign,
  signQuote,
  verifySignatures,
  verifySignedQuote,
} from "../src/index.js";

const T0 = Date.UTC(2026, 8, 16, 4, 0, 0);
const VENDOR = "vendor:messages-api";

function keypair(keyId: string, speaksFor: readonly string[], overrides: Partial<PublicKeyRecord> = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const record: PublicKeyRecord = {
    keyId,
    algorithm: "ed25519",
    publicKeyPem: publicKey,
    speaksFor,
    notBefore: T0 - 86_400_000,
    notAfter: null,
    revoked: false,
    ...overrides,
  };
  return { record, signer: ed25519Signer(keyId, privateKey) };
}

const quote: Quote = {
  quoteId: "q-1",
  issuer: VENDOR,
  subject: { kind: "api.call", digest: "a".repeat(64) },
  asset: "anthropic:tokens",
  maxAmount: 4_000n,
  payTo: "vendor:messages-api/pay",
  issuedAt: T0 - 1_000,
  expiresAt: T0 + 60_000,
  audience: null,
  requestId: null,
};

describe("a signed quote", () => {
  it("attributes to the issuer it names", () => {
    const { record, signer } = keypair("vendor-key-1", [VENDOR]);
    const signed = signQuote(quote, signer, T0);
    const result = verifySignedQuote(signed, new MemoryKeyDirectory([record]));

    strictEqual(result.attributed, true);
    strictEqual(result.identity, VENDOR);
    strictEqual(result.checks[0]?.valid, true);
  });

  it("survives a round trip through the wire", () => {
    const { record, signer } = keypair("vendor-key-1", [VENDOR]);
    const signed = signQuote(quote, signer, T0);

    // Amounts are bigints; the canonical encoder is what both sides agree on.
    const revived = JSON.parse(
      JSON.stringify(signed, (_k, v) => (typeof v === "bigint" ? `${v}n` : v)),
    ) as { payload: Record<string, unknown>; signatures: Signed<Quote>["signatures"] };
    const rebuilt: Signed<Quote> = {
      payload: { ...quote, maxAmount: BigInt(String(revived.payload["maxAmount"]).replace("n", "")) },
      signatures: revived.signatures,
    };

    strictEqual(verifySignedQuote(rebuilt, new MemoryKeyDirectory([record])).attributed, true);
  });
});

describe("the check everyone forgets", () => {
  it("refuses a perfect signature from a key with no right to the name", () => {
    // The cryptography is flawless. The signer simply is not this vendor.
    const { record, signer } = keypair("someone-else-key", ["vendor:unrelated"]);
    const signed = signQuote(quote, signer, T0);
    const result = verifySignedQuote(signed, new MemoryKeyDirectory([record]));

    strictEqual(result.attributed, false);
    strictEqual(result.checks[0]?.reason, "KEY_NOT_AUTHORIZED");
    ok(result.checks[0].detail.includes("vendor:unrelated"));
  });

  it("a key that speaks for nobody attributes nothing", () => {
    const { record, signer } = keypair("mute-key", []);
    const signed = signQuote(quote, signer, T0);
    strictEqual(verifySignedQuote(signed, new MemoryKeyDirectory([record])).attributed, false);
  });

  it("separates a forgery from an unauthorised signer", () => {
    const { record, signer } = keypair("vendor-key-1", [VENDOR]);
    const signed = signQuote(quote, signer, T0);
    const tampered: Signed<Quote> = {
      ...signed,
      payload: { ...quote, maxAmount: 400_000n },
    };
    const forged = verifySignedQuote(tampered, new MemoryKeyDirectory([record]));

    // Deliberately a different reason from KEY_NOT_AUTHORIZED: one is a
    // forgery, the other a real party signing outside its remit. The compiler
    // will not even let those two be compared, which is the point.
    strictEqual(forged.checks[0]?.reason, "BAD_SIGNATURE");
    strictEqual(forged.attributed, false);
  });
});

describe("keys over time", () => {
  it("rotating a key does not invalidate what it already signed", () => {
    const { record, signer } = keypair("old-key", [VENDOR], { notAfter: T0 + 1_000 });
    const signed = signQuote(quote, signer, T0);
    const directory = new MemoryKeyDirectory([record]);

    // Signed while in service; still attributable long after it left.
    strictEqual(verifySignedQuote(signed, directory).attributed, true);
  });

  it("refuses a signature made after the key left service", () => {
    const { record, signer } = keypair("old-key", [VENDOR], { notAfter: T0 - 1 });
    const result = verifySignedQuote(signQuote(quote, signer, T0), new MemoryKeyDirectory([record]));
    strictEqual(result.checks[0]?.reason, "KEY_EXPIRED");
  });

  it("refuses a signature made before the key came into service", () => {
    const { record, signer } = keypair("future-key", [VENDOR], { notBefore: T0 + 1 });
    const result = verifySignedQuote(signQuote(quote, signer, T0), new MemoryKeyDirectory([record]));
    strictEqual(result.checks[0]?.reason, "KEY_NOT_YET_VALID");
  });

  it("a revoked key fails whenever it signed, and says so distinctly", () => {
    const { record, signer } = keypair("burned-key", [VENDOR], { revoked: true });
    const result = verifySignedQuote(signQuote(quote, signer, T0), new MemoryKeyDirectory([record]));

    strictEqual(result.attributed, false);
    // Not BAD_SIGNATURE: this was genuine, by a key no longer trusted.
    strictEqual(result.checks[0]?.reason, "KEY_REVOKED");
  });
});

describe("malformed input never crashes the decision", () => {
  it("an unknown key id", () => {
    const { signer } = keypair("ghost", [VENDOR]);
    const result = verifySignedQuote(signQuote(quote, signer, T0), new MemoryKeyDirectory([]));
    strictEqual(result.checks[0]?.reason, "UNKNOWN_KEY");
  });

  it("an empty signature", () => {
    const { record } = keypair("vendor-key-1", [VENDOR]);
    const result = verifySignedQuote(
      {
        payload: quote,
        signatures: [{ keyId: "vendor-key-1", algorithm: "ed25519", value: "", signedAt: T0 }],
      },
      new MemoryKeyDirectory([record]),
    );
    strictEqual(result.checks[0]?.reason, "MALFORMED");
  });

  it("signature bytes that are not a signature", () => {
    const { record } = keypair("vendor-key-1", [VENDOR]);
    const result = verifySignedQuote(
      {
        payload: quote,
        signatures: [
          { keyId: "vendor-key-1", algorithm: "ed25519", value: "bm90LWEtc2ln", signedAt: T0 },
        ],
      },
      new MemoryKeyDirectory([record]),
    );
    strictEqual(result.attributed, false);
    ok(result.checks[0]?.reason === "MALFORMED" || result.checks[0]?.reason === "BAD_SIGNATURE");
  });

  it("no signatures at all", () => {
    const result = verifySignedQuote({ payload: quote, signatures: [] }, new MemoryKeyDirectory([]));
    strictEqual(result.attributed, false);
    strictEqual(result.checks[0]?.reason, "MALFORMED");
  });
});

describe("more than one signer", () => {
  it("both parties can vouch for the same payload", () => {
    const vendor = keypair("vendor-key", [VENDOR]);
    const buyer = keypair("buyer-key", ["acct:research-agent"]);
    const directory = new MemoryKeyDirectory([vendor.record, buyer.record]);

    const both = countersign(signQuote(quote, vendor.signer, T0), buyer.signer, T0 + 10);

    strictEqual(both.signatures.length, 2);
    strictEqual(verifySignatures(both, directory, VENDOR).attributed, true);
    strictEqual(verifySignatures(both, directory, "acct:research-agent").attributed, true);
  });

  it("one bad signature does not sink a good one", () => {
    const good = keypair("good-key", [VENDOR]);
    const stranger = keypair("stranger-key", ["vendor:other"]);
    const directory = new MemoryKeyDirectory([good.record, stranger.record]);

    const mixed = countersign(signQuote(quote, good.signer, T0), stranger.signer, T0);
    const result = verifySignatures(mixed, directory, VENDOR);

    strictEqual(result.attributed, true);
    strictEqual(result.checks.filter((c) => c.valid).length, 1);
    strictEqual(result.checks.filter((c) => !c.valid).length, 1);
  });
});

describe("custody", () => {
  it("a signer does not carry its private key on the object", () => {
    const { signer } = keypair("k", [VENDOR]);
    const exposed = JSON.stringify(signer);
    ok(!exposed.includes("PRIVATE"), "private key must not be reachable through the signer");
    strictEqual(Object.values(signer).some((v) => typeof v === "string" && v.includes("BEGIN")), false);
  });

  it("signs deterministically over canonical bytes", () => {
    const { signer } = keypair("k", [VENDOR]);
    // Ed25519 is deterministic, and the encoding is canonical, so the same
    // payload always produces the same signature.
    strictEqual(sign(quote, signer, T0).signatures[0]?.value, sign(quote, signer, T0).signatures[0]?.value);
  });
});
