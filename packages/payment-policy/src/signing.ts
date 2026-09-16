/**
 * Attribution: proving *who*, not just *what*.
 *
 * A quote and a receipt are already verifiable — their contents recompute and
 * tampering is caught. Neither is *attributable*: anyone can mint a `Quote`
 * claiming to be `vendor:messages-api`, and nothing in it objects. An
 * unsigned quote crossing a real network is worse than no quote, because it
 * looks like a commitment and binds nobody.
 *
 * ## The check almost everyone forgets
 *
 * A valid signature proves a key signed these bytes. It does **not** prove the
 * signer was entitled to speak for the identity the payload claims. If a quote
 * says `issuer: "vendor:messages-api"`, a correct signature from *some* key is
 * worthless unless that key is authorised for that issuer.
 *
 * So a key in the directory declares what it `speaksFor`, and
 * {@link verifySignatures} refuses a technically perfect signature from a key
 * that is not authorised. `KEY_NOT_AUTHORIZED` is a distinct outcome from
 * `BAD_SIGNATURE` because they mean completely different things: one is a
 * forgery, the other is a real party signing outside its remit.
 *
 * ## Time is the signature's, not the verifier's
 *
 * A key's validity is checked against `signedAt`, not against now. Rotating a
 * key must not invalidate everything it ever signed, or every historical
 * receipt breaks the day you rotate.
 *
 * Compromise is different, and gets its own switch: a `revoked` key fails
 * regardless of when it signed, and reports `KEY_REVOKED` rather than a
 * generic failure — the reader needs to know the difference between "this was
 * forged" and "this was genuine, by a key we no longer trust".
 *
 * ## Keys
 *
 * This package holds none. {@link Signer} is a port; the reference Ed25519
 * implementation takes a private key the caller supplies and keeps it in a
 * closure so it cannot be read back off the object. Generating, storing and
 * destroying key material belongs to whoever owns the identity — not to a
 * library that also decides whether payments are allowed.
 */
import { createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";

import { canonicalBytes } from "./wire.js";
import type { Quote } from "./quote.js";
import type { SpendReceipt } from "./receipt.js";

export type SignatureAlgorithm = "ed25519";

export interface Signature {
  /** Names the key, not the signer. The directory maps it to an identity. */
  readonly keyId: string;
  readonly algorithm: SignatureAlgorithm;
  /** Base64 of the raw signature over the payload's canonical bytes. */
  readonly value: string;
  /** When it was signed. Key validity is judged against this, not against now. */
  readonly signedAt: number;
}

/**
 * A payload with the signatures made over it.
 *
 * Plural, because a countersigned quote and a receipt attested by both parties
 * are both ordinary. A single-signature type would have to be widened later,
 * and widening a signed format is how signatures get skipped.
 */
export interface Signed<T> {
  readonly payload: T;
  readonly signatures: readonly Signature[];
}

/** Holds a private key and will sign bytes with it. Implementations own custody. */
export interface Signer {
  readonly keyId: string;
  readonly algorithm: SignatureAlgorithm;
  /** @param bytes canonical bytes of the payload */
  sign(bytes: Buffer, signedAt: number): string;
}

export interface PublicKeyRecord {
  readonly keyId: string;
  readonly algorithm: SignatureAlgorithm;
  /** SPKI PEM. A format the platform parses, rather than one we invent. */
  readonly publicKeyPem: string;
  /**
   * The identities this key may speak for.
   *
   * Without this a signature proves only that *somebody* signed. Empty means
   * the key speaks for nobody, and every attribution against it fails — which
   * is the right default for a key whose remit was never stated.
   */
  readonly speaksFor: readonly string[];
  readonly notBefore: number;
  /** `null` for no planned end. */
  readonly notAfter: number | null;
  /** Compromised. Fails regardless of when it signed. */
  readonly revoked: boolean;
}

/**
 * Resolves key ids. Synchronous on purpose.
 *
 * Verification must be replayable — the same receipt must verify the same way
 * a year later — so it cannot depend on a live lookup. A caller with a remote
 * directory resolves first and verifies against the snapshot it resolved.
 */
export interface KeyDirectory {
  publicKey(keyId: string): PublicKeyRecord | undefined;
}

export class MemoryKeyDirectory implements KeyDirectory {
  readonly #keys = new Map<string, PublicKeyRecord>();

  constructor(records: readonly PublicKeyRecord[] = []) {
    for (const record of records) this.add(record);
  }

  add(record: PublicKeyRecord): void {
    this.#keys.set(record.keyId, record);
  }

  publicKey(keyId: string): PublicKeyRecord | undefined {
    return this.#keys.get(keyId);
  }
}

/**
 * An Ed25519 signer over a private key the caller supplies.
 *
 * The key is captured in a closure and never stored on the object, so it
 * cannot be read back, serialised by accident, or printed by a debugger that
 * walks the signer. Custody, rotation and destruction remain the caller's.
 */
export function ed25519Signer(keyId: string, privateKeyPem: string): Signer {
  // Ed25519 takes `null` for the digest: the algorithm hashes internally.
  const signBytes = (bytes: Buffer): Buffer => cryptoSign(null, bytes, privateKeyPem);

  return {
    keyId,
    algorithm: "ed25519",
    sign(bytes: Buffer): string {
      return signBytes(bytes).toString("base64");
    },
  };
}

/** Signs a payload, returning it alongside the signature. */
export function sign<T>(payload: T, signer: Signer, signedAt: number): Signed<T> {
  return {
    payload,
    signatures: [
      {
        keyId: signer.keyId,
        algorithm: signer.algorithm,
        value: signer.sign(canonicalBytes(payload), signedAt),
        signedAt,
      },
    ],
  };
}

/** Adds another signature to something already signed, without disturbing the first. */
export function countersign<T>(signed: Signed<T>, signer: Signer, signedAt: number): Signed<T> {
  return {
    payload: signed.payload,
    signatures: [...signed.signatures, sign(signed.payload, signer, signedAt).signatures[0]!],
  };
}

export type SignatureRejection =
  | "UNKNOWN_KEY"
  | "ALGORITHM_MISMATCH"
  | "KEY_NOT_AUTHORIZED"
  | "KEY_NOT_YET_VALID"
  | "KEY_EXPIRED"
  | "KEY_REVOKED"
  | "BAD_SIGNATURE"
  | "MALFORMED";

export interface SignatureCheck {
  readonly keyId: string;
  readonly valid: boolean;
  readonly reason: SignatureRejection | null;
  readonly detail: string;
}

export interface SignatureVerification {
  /** The identity the payload claims. */
  readonly identity: string;
  /** True when at least one signature is valid *and* its key speaks for the identity. */
  readonly attributed: boolean;
  readonly checks: readonly SignatureCheck[];
}

function checkOne(
  payload: unknown,
  signature: Signature,
  directory: KeyDirectory,
  identity: string,
): SignatureCheck {
  const no = (reason: SignatureRejection, detail: string): SignatureCheck => ({
    keyId: signature.keyId,
    valid: false,
    reason,
    detail,
  });

  if (signature.value.length === 0) return no("MALFORMED", "signature is empty");

  const record = directory.publicKey(signature.keyId);
  if (record === undefined) return no("UNKNOWN_KEY", `${signature.keyId} is not in the directory`);
  if (record.algorithm !== signature.algorithm) {
    return no("ALGORITHM_MISMATCH", `key is ${record.algorithm}, signature claims ${signature.algorithm}`);
  }
  if (record.revoked) {
    // Distinct from a forgery on purpose: this was genuine, by a key we no
    // longer trust. A reader needs to be able to tell those apart.
    return no("KEY_REVOKED", `${signature.keyId} has been revoked`);
  }
  if (!record.speaksFor.includes(identity)) {
    return no(
      "KEY_NOT_AUTHORIZED",
      `${signature.keyId} may speak for [${record.speaksFor.join(", ")}], not ${identity}`,
    );
  }
  // Judged against when it signed, so rotating a key does not invalidate
  // everything it ever signed.
  if (signature.signedAt < record.notBefore) {
    return no("KEY_NOT_YET_VALID", `signed before the key came into service`);
  }
  if (record.notAfter !== null && signature.signedAt > record.notAfter) {
    return no("KEY_EXPIRED", `signed after the key left service`);
  }

  let ok: boolean;
  try {
    ok = cryptoVerify(
      null,
      canonicalBytes(payload),
      createPublicKey(record.publicKeyPem),
      Buffer.from(signature.value, "base64"),
    );
  } catch (error) {
    // A malformed key or signature must read as "not verified", never as a
    // crash in the middle of deciding whether to trust a payment.
    return no("MALFORMED", `could not be checked: ${(error as Error).message}`);
  }

  return ok
    ? { keyId: signature.keyId, valid: true, reason: null, detail: `speaks for ${identity}` }
    : no("BAD_SIGNATURE", "signature does not match the payload");
}

/**
 * Verifies every signature and reports whether the payload is attributable.
 *
 * `attributed` requires a signature that is both cryptographically sound and
 * made by a key entitled to the claimed identity. A correct signature from an
 * unauthorised key leaves `attributed` false while still being reported as
 * what it is.
 */
export function verifySignatures<T>(
  signed: Signed<T>,
  directory: KeyDirectory,
  identity: string,
): SignatureVerification {
  if (signed.signatures.length === 0) {
    return {
      identity,
      attributed: false,
      checks: [
        { keyId: "", valid: false, reason: "MALFORMED", detail: "payload carries no signatures" },
      ],
    };
  }

  const checks = signed.signatures.map((s) => checkOne(signed.payload, s, directory, identity));
  return { identity, attributed: checks.some((c) => c.valid), checks };
}

/** A short human-readable report. */
export function explainAttribution(result: SignatureVerification): string {
  const header = result.attributed
    ? `ATTRIBUTED to ${result.identity}`
    : `NOT ATTRIBUTED to ${result.identity}`;
  const body = result.checks
    .map(
      (c) =>
        `  ${c.valid ? "ok  " : "FAIL"}  ${c.keyId || "(no key)"}` +
        `${c.reason === null ? "" : `  [${c.reason}]`}\n        ${c.detail}`,
    )
    .join("\n");
  return `${header}\n${body}`;
}

/* -- Bound to the two things that travel ---------------------------------- */

/**
 * Signing a quote turns a claim into a commitment.
 *
 * The identity checked on the way back is `quote.issuer` — the field the quote
 * uses to say who is promising. Verifying against anything else would let a
 * key sign a quote in someone else's name and still pass.
 */
export function signQuote(quote: Quote, signer: Signer, signedAt: number): Signed<Quote> {
  return sign(quote, signer, signedAt);
}

export function verifySignedQuote(
  signed: Signed<Quote>,
  directory: KeyDirectory,
): SignatureVerification {
  return verifySignatures(signed, directory, signed.payload.issuer);
}

/**
 * Signing a receipt says who is vouching for it.
 *
 * By default that is the account the spend was made from — the party whose
 * policy produced the decision. A counterparty who countersigns is verified
 * against their own identity, which is why `identity` can be given explicitly.
 */
export function signReceipt(
  receipt: SpendReceipt,
  signer: Signer,
  signedAt: number,
): Signed<SpendReceipt> {
  return sign(receipt, signer, signedAt);
}

export function verifySignedReceipt(
  signed: Signed<SpendReceipt>,
  directory: KeyDirectory,
  identity?: string,
): SignatureVerification {
  return verifySignatures(signed, directory, identity ?? signed.payload.request.account);
}
