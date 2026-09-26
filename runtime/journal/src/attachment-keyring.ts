/**
 * Per-Attachment keys, over bytes.
 *
 * `contracts/Attachment.md` inv. 8, an operator ruling: *"An Attachment is
 * encrypted under its own key, and that key is destroyed when no readable event
 * references it any more."* Same mechanism as `PayloadKeyring` and the same
 * reasoning (`ERASURE.md` §2a) — destroying a key reaches the copy on a peer's
 * disk and the residue in flash, which deleting bytes does not.
 *
 * **Why this is not `PayloadKeyring` with a different name.** That one seals
 * text, because an event payload is canonical JSON. An Attachment is a photo. A
 * shared string interface would mean base64 on the way in and out, adding a third
 * of every photo to memory to reuse thirty lines of AES-GCM. The interfaces are
 * the same shape on purpose; the payload type is the difference that matters.
 *
 * **Keys are stored, never derived**, for the reason the payload keyring gives:
 * anything derivable is re-derivable, so destroying a derived key destroys
 * nothing. The address secret in inv. 7 is the opposite — derived by design, and
 * explicitly *not* an erasure key.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** Opaque sealed bytes. The layout is the cipher's business. */
export interface SealedAttachment {
  readonly sealed: Buffer;
}

/**
 * Holds one key per Attachment identity, and destroys them on request.
 *
 * A port, injected exactly as `JournalStore` is. On a device the keyring itself
 * sits behind hardware (`THREAT_MODEL.md` §7a); nothing here depends on that.
 */
/**
 * Whether a key is here, was destroyed, or was never here.
 *
 * Three states, because the middle one is a **fact about an act** and the last
 * is the absence of one, and a resolver that merged them would report an erasure
 * on any device the key has simply not reached yet. inv. 6 names the cost in the
 * other direction — *"a peer that confuses the last with the first helpfully
 * restores content its owner erased"* — and this is the same confusion facing
 * the other way, where a device would tell its owner their photo was destroyed
 * when it is only somewhere else.
 */
export type KeyState = "held" | "destroyed" | "absent";

export interface AttachmentKeyring {
  /**
   * Generates a key for `identity` and seals `bytes` under it.
   *
   * **Refuses for a destroyed identity.** Erasure is irreversible, and a keyring
   * that re-minted a key on the next `put` would make it reversible by accident:
   * anyone holding the original ciphertext could not read it, but the same bytes
   * arriving again would become readable, which is the erasure quietly undone.
   */
  seal(identity: string, bytes: Buffer): Promise<SealedAttachment>;
  /** Whether the key is here, was destroyed, or was never here. */
  state(identity: string): Promise<KeyState>;
  /**
   * Opens a sealed Attachment, or returns null when the key is gone.
   *
   * Null is the erasure having worked, not a failure: the holder has ciphertext
   * it can no longer read, which is the entire point of inv. 8.
   */
  open(identity: string, sealed: SealedAttachment): Promise<Buffer | null>;
  /** Destroys the key. Irreversible. @returns whether one was there to destroy. */
  destroy(identity: string): Promise<boolean>;
  /** Whether a key still exists. False means any ciphertext for it is inert. */
  holds(identity: string): Promise<boolean>;
}

/** Keys in memory, AES-256-GCM. Real encryption, so tests show the real property. */
export class MemoryAttachmentKeyring implements AttachmentKeyring {
  readonly #keys = new Map<string, Buffer>();
  /**
   * Identities whose keys were destroyed.
   *
   * A tombstone, not bookkeeping: it is what makes `destroyed` distinguishable
   * from `absent`, and what stops a later `seal` from undoing an erasure.
   */
  readonly #destroyed = new Set<string>();

  async seal(identity: string, bytes: Buffer): Promise<SealedAttachment> {
    if (this.#destroyed.has(identity)) {
      throw new Error(`attachment key was destroyed and cannot be re-minted: ${identity}`);
    }
    // Reuses an existing key rather than minting a second one. Two keys for one
    // identity would leave the first ciphertext unreadable-but-undestroyed, and
    // inv. 8 counts keys, not copies.
    const key = this.#keys.get(identity) ?? randomBytes(32);
    this.#keys.set(identity, key);

    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const body = Buffer.concat([cipher.update(bytes), cipher.final()]);
    return { sealed: Buffer.concat([iv, cipher.getAuthTag(), body]) };
  }

  async open(identity: string, sealed: SealedAttachment): Promise<Buffer | null> {
    const key = this.#keys.get(identity);
    if (!key) return null;

    const iv = sealed.sealed.subarray(0, 12);
    const tag = sealed.sealed.subarray(12, 28);
    const body = sealed.sealed.subarray(28);

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]);
  }

  async destroy(identity: string): Promise<boolean> {
    // Tombstoned whether or not a key was here. A device asked to erase
    // something whose key it never held has still been told the content is gone,
    // and must not mint one later for bytes that arrive afterwards.
    this.#destroyed.add(identity);
    const key = this.#keys.get(identity);
    if (!key) return false;
    // Overwrite before dropping the reference. It does not defeat a heap dump
    // taken beforehand; it does remove the one copy this process controls.
    key.fill(0);
    return this.#keys.delete(identity);
  }

  async state(identity: string): Promise<KeyState> {
    if (this.#keys.has(identity)) return "held";
    return this.#destroyed.has(identity) ? "destroyed" : "absent";
  }

  async holds(identity: string): Promise<boolean> {
    return this.#keys.has(identity);
  }
}
