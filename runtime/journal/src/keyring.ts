/**
 * Per-payload keys, and the destruction of them.
 *
 * `docs/ERASURE.md` §2a. The operator ruled that erasure means content is
 * **destroyed**, not merely deleted, and that two properties of deletion make it
 * the weaker reading: flash does not overwrite where it is told, so removed
 * bytes may persist in cells the filesystem no longer references; and deleting
 * locally cannot reach a copy held by a peer.
 *
 * Destroying a key answers both. The ciphertext may survive anywhere — in
 * unreferenced flash, on a peer's disk, in a backup — and decodes nowhere.
 *
 * **Why keys are stored and not derived.** Deriving a per-event key from a root
 * would be far cheaper, and would make erasure impossible: anything derivable is
 * re-derivable, so destroying a derived key destroys nothing. Each key is
 * therefore independent, random, and separately destroyable. The cost is honest
 * and worth stating — around 32 bytes per event, and a keyring that is now the
 * single most sensitive object on the device.
 *
 * **A backed-up key is an un-erased payload** (§2a). Key backup policy is part
 * of erasure semantics, not an operational detail beside it.
 */
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

/** Opaque sealed bytes. The shape is the cipher's business, not the journal's. */
export interface SealedPayload {
  readonly sealed: string;
}

/**
 * Holds one key per payload, and destroys them on request.
 *
 * A port, injected exactly as `JournalStore` is. The real implementation on a
 * device puts the keyring itself behind hardware (`THREAT_MODEL.md` §7a, device
 * prediction P11); nothing here depends on which.
 */
export interface PayloadKeyring {
  /** Generates a key for `eventId` and seals `plaintext` under it. */
  seal(eventId: string, plaintext: string): Promise<SealedPayload>;
  /**
   * Opens a sealed payload, or returns null when the key is gone.
   *
   * Null is the erasure having worked, not an error: the caller holds ciphertext
   * it can no longer read, which is the whole point.
   */
  open(eventId: string, sealed: SealedPayload): Promise<string | null>;
  /**
   * Destroys the key for `eventId`. Irreversible, and the act erasure consists
   * of.
   *
   * @returns whether a key was there to destroy.
   */
  destroy(eventId: string): Promise<boolean>;
  /** Whether a key still exists. False means any ciphertext for it is inert. */
  holds(eventId: string): Promise<boolean>;
}

/**
 * Keys in memory, AES-256-GCM. For tests and ephemeral runtimes.
 *
 * Real encryption rather than a stub, so that the tests demonstrate the actual
 * property — that a destroyed key leaves ciphertext nobody can open — instead of
 * demonstrating that a flag was flipped.
 */
export class MemoryPayloadKeyring implements PayloadKeyring {
  readonly #keys = new Map<string, Buffer>();

  async seal(eventId: string, plaintext: string): Promise<SealedPayload> {
    const key = randomBytes(32);
    this.#keys.set(eventId, key);

    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return { sealed: Buffer.concat([iv, tag, body]).toString("base64") };
  }

  async open(eventId: string, sealed: SealedPayload): Promise<string | null> {
    const key = this.#keys.get(eventId);
    if (!key) return null;

    const raw = Buffer.from(sealed.sealed, "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const body = raw.subarray(28);

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  }

  async destroy(eventId: string): Promise<boolean> {
    const key = this.#keys.get(eventId);
    if (!key) return false;
    // Overwrite before dropping the reference. It does not defeat a heap dump
    // taken beforehand, and it does remove the one copy this process controls.
    key.fill(0);
    return this.#keys.delete(eventId);
  }

  async holds(eventId: string): Promise<boolean> {
    return this.#keys.has(eventId);
  }
}

/** True when a stored payload is sealed rather than plain. */
export function isSealed(value: unknown): value is SealedPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as SealedPayload).sealed === "string"
  );
}

/** Constant-time comparison, exported so adapters need not reach for their own. */
export function equalBytes(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}
