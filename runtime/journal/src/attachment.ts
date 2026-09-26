/**
 * Attachments — `contracts/Attachment.md`.
 *
 * The raw matter of reality: the bytes a photo, a recording or a fetched message
 * is made of, held immutably and by reference so that history stays small,
 * uniform and replayable while the heavy content lives beside it.
 *
 * Three invariants shape this module more than the rest, and two of them are
 * operator rulings:
 *
 * - **inv. 7, the blinded address.** Identity is the content hash; the storage
 *   address is not. A store addressed by identity is *a list of identities*, so
 *   anyone reading it can test any file they already hold against it —
 *   encrypting the bytes hides the content and never *which* content.
 * - **inv. 8, erasable with its last reader.** An Attachment is encrypted under
 *   its own key, destroyed when no *readable* event references it any more.
 * - **inv. 6, absence carries a reason**, and the three reasons are not
 *   interchangeable: *"a peer that confuses the last with the first helpfully
 *   restores content its owner erased."*
 */
import { createHash, createHmac } from "node:crypto";
import type { AttachmentKeyring, SealedAttachment } from "./attachment-keyring.js";
import { hasPayload } from "./types.js";
import type { AbsenceReason, StoredEvent } from "./types.js";

/**
 * The scheme tag on every identity.
 *
 * §5 makes a new hashing scheme an **addition**: new Attachments may carry a new
 * tag while existing ones keep their identity and stay valid for ever. Untagged
 * identities would make that impossible to do without guessing, so the tag is
 * present from the first one rather than added when it is first needed.
 */
export const IDENTITY_SCHEME = "sha256";

/** The identity of some bytes: their content hash, scheme-tagged. inv. 1, inv. 2. */
export function attachmentIdentity(bytes: Buffer): string {
  return `${IDENTITY_SCHEME}:${createHash("sha256").update(bytes).digest("hex")}`;
}

/**
 * Where those bytes are stored: `HMAC(addressSecret, identity)`. inv. 7.
 *
 * Unguessable without the secret, recomputable from the identity so nothing
 * extra is persisted, and **rotatable** — which is the point rather than a
 * concession. Rotation voids every address an adversary has collected, and it
 * breaks nothing, because the address is referenced by the local store alone
 * while identity is referenced by history.
 *
 * This secret is derived-by-design and is **not** an erasure key. Destroying it
 * hides where bytes are; inv. 8's key is what makes them unreadable.
 */
export function blindedAddress(addressSecret: Buffer, identity: string): string {
  return createHmac("sha256", addressSecret).update(identity).digest("hex");
}

/** What a store hands back: the sealed bytes, or why they are not here. */
export type StoredAttachment =
  | { readonly state: "held"; readonly sealed: SealedAttachment }
  | { readonly state: "absent"; readonly reason: AbsenceReason };

/**
 * Where sealed Attachment bytes live, keyed by blinded address.
 *
 * A port, injected like `JournalStore`. It never sees an identity: that is what
 * inv. 7 buys, and handing one in here would spend it.
 */
export interface AttachmentStore {
  put(address: string, sealed: SealedAttachment): Promise<void>;
  get(address: string): Promise<StoredAttachment>;
  /** Removes the bytes, recording why. inv. 6 — absence always carries a reason. */
  drop(address: string, reason: AbsenceReason): Promise<boolean>;
  /** Every address currently held, for re-addressing after a rotation. */
  addresses(): Promise<readonly string[]>;
}

/** Sealed bytes in memory. For tests and ephemeral runtimes. */
export class MemoryAttachmentStore implements AttachmentStore {
  readonly #held = new Map<string, SealedAttachment>();
  readonly #gone = new Map<string, AbsenceReason>();

  async put(address: string, sealed: SealedAttachment): Promise<void> {
    this.#held.set(address, sealed);
    this.#gone.delete(address);
  }

  async get(address: string): Promise<StoredAttachment> {
    const sealed = this.#held.get(address);
    if (sealed) return { state: "held", sealed };
    // Never fetched and dropped for space are different facts, and the store is
    // the only place that knows which. Defaulting to one would make the other
    // unsayable.
    return { state: "absent", reason: this.#gone.get(address) ?? "unfetched" };
  }

  async drop(address: string, reason: AbsenceReason): Promise<boolean> {
    const had = this.#held.delete(address);
    this.#gone.set(address, reason);
    return had;
  }

  async addresses(): Promise<readonly string[]> {
    return [...this.#held.keys()].sort();
  }
}

export interface AttachmentPorts {
  readonly store: AttachmentStore;
  readonly keyring: AttachmentKeyring;
  readonly addressSecret: Buffer;
}

/**
 * Stores bytes and returns their identity.
 *
 * **Idempotent by content** (inv. 2): the same bytes are the same Attachment, so
 * a second `put` of identical content finds the existing entry and stops. That
 * is not an optimisation — resealing would mint a second key for one identity
 * and leave the first ciphertext unreadable but undestroyed, and inv. 8 counts
 * keys rather than copies.
 */
export async function putAttachment(
  ports: AttachmentPorts,
  bytes: Buffer,
): Promise<string> {
  const identity = attachmentIdentity(bytes);
  const address = blindedAddress(ports.addressSecret, identity);

  const existing = await ports.store.get(address);
  if (existing.state === "held" && (await ports.keyring.state(identity)) === "held") {
    return identity;
  }

  await ports.store.put(address, await ports.keyring.seal(identity, bytes));
  return identity;
}

/** Resolved bytes, or why they are not available here. */
export type ResolvedAttachment =
  | { readonly state: "held"; readonly bytes: Buffer }
  | { readonly state: "absent"; readonly reason: AbsenceReason };

/** Thrown when resolved bytes do not hash to the identity they were asked for. */
export class AttachmentCorrupt extends Error {
  override readonly name = "AttachmentCorrupt";
  constructor(readonly identity: string) {
    super(`attachment content does not match its identity: ${identity}`);
  }
}

/**
 * Fetches and verifies the bytes behind an identity.
 *
 * **The key is checked before the store**, and that order is inv. 8 made
 * observable: once the key is destroyed the answer is `erased` whether or not
 * the ciphertext is still sitting on the disk. Reporting `unfetched` for bytes
 * whose key is gone would invite a peer to helpfully restore content its owner
 * destroyed, which inv. 6 names as the confusion to avoid.
 *
 * Verification is inv. 5: resolved content is re-hashed against its identity, so
 * bytes fetched from anywhere — a peer, a relay, a stranger — are checked before
 * they are trusted. That check is what makes the source not matter.
 */
export async function resolveAttachment(
  ports: AttachmentPorts,
  identity: string,
): Promise<ResolvedAttachment> {
  const key = await ports.keyring.state(identity);
  // Destroyed beats everything: the bytes may still be on this disk, on a peer's
  // disk and in a backup, and they decode nowhere. Reporting anything else here
  // would invite a peer to helpfully restore content its owner erased (inv. 6).
  if (key === "destroyed") return { state: "absent", reason: "erased" };
  // Never held is **not** an erasure. A device the key has not reached yet is
  // missing something it can still be sent, and telling its owner their photo
  // was destroyed would be the same confusion facing the other way.
  if (key === "absent") return { state: "absent", reason: "unfetched" };

  const stored = await ports.store.get(blindedAddress(ports.addressSecret, identity));
  if (stored.state === "absent") return stored;

  const bytes = await ports.keyring.open(identity, stored.sealed);
  // A race: the key was there a moment ago and is gone now. Still `erased`.
  if (bytes === null) return { state: "absent", reason: "erased" };

  if (attachmentIdentity(bytes) !== identity) throw new AttachmentCorrupt(identity);
  return { state: "held", bytes };
}

/**
 * Re-addresses every held Attachment under a new secret. inv. 7's rotation.
 *
 * Takes the identities it is re-addressing, because an address cannot be
 * reversed to one — which is exactly the property being relied on. History holds
 * the identities; this walks them.
 *
 * Addresses not covered by `identities` are left alone rather than deleted: an
 * address this caller cannot name is not evidence that nothing is there, and
 * dropping it would turn a rotation into data loss.
 */
export async function rotateAddresses(
  ports: AttachmentPorts,
  next: Buffer,
  identities: Iterable<string>,
): Promise<number> {
  let moved = 0;
  for (const identity of identities) {
    const from = blindedAddress(ports.addressSecret, identity);
    const stored = await ports.store.get(from);
    if (stored.state !== "held") continue;

    const to = blindedAddress(next, identity);
    if (to === from) continue;
    await ports.store.put(to, stored.sealed);
    await ports.store.drop(from, "pruned");
    moved += 1;
  }
  return moved;
}

/**
 * Which Attachment identities a readable event's payload cites.
 *
 * Injected, because the journal does not know payload shapes — the same reason
 * `indexLineage` takes a `derived` predicate. A caller that cannot say returns
 * nothing, and an event it returns nothing for is treated as not referencing,
 * which is why this must be the real extractor rather than a convenience.
 */
export type AttachmentReferences = (event: StoredEvent) => readonly string[];

/**
 * Whether an Attachment's key may be destroyed. inv. 8.
 *
 * Three answers, and the third is the one that makes this honest:
 *
 * - `referenced` — a readable event cites it. Keep.
 * - `unreferenced` — nothing readable cites it, and nothing unreadable might.
 * - `unknown` — nothing readable cites it, but an event whose payload is
 *   *unfetched or pruned* could. inv. 8: such an event is **unknown, not
 *   absent**, and blocks destruction until it can be read.
 *
 * An **erased** event never blocks: its payload is gone, so the reference is
 * gone with it, and it can never resolve the content again. That asymmetry is
 * the contract's, and it is what stops an erasure from pinning the bytes it was
 * meant to release.
 */
export type DestructionVerdict =
  | { readonly state: "referenced"; readonly by: readonly string[] }
  | { readonly state: "unreferenced" }
  | { readonly state: "unknown"; readonly blockedBy: readonly string[] }
  /**
   * Still referenced, and every reference is older than the window.
   *
   * The **second ground** for destruction — operator ruling 2026-09-26,
   * `DECISIONS.md` DR-7. inv. 8 as written destroys a key when nothing readable
   * references it, which a seven-day window never reaches: after seven days the
   * Observation still cites the Attachment. So a window that only dropped local
   * bytes would leave the content recoverable from any peer that kept them, and
   * the seven days would buy nothing.
   */
  | {
      readonly state: "expired";
      readonly by: readonly string[];
      /** Wall clock of the newest event referencing it. */
      readonly newestAt: number;
    };

/** A window after which a still-referenced Attachment may be destroyed. */
export interface ExpiryWindow {
  readonly windowMs: number;
  readonly now: number;
}

export function evaluateDestruction(
  events: readonly StoredEvent[],
  identity: string,
  references: AttachmentReferences,
  expiry?: ExpiryWindow,
): DestructionVerdict {
  const by: string[] = [];
  const blockedBy: string[] = [];
  let newestAt = Number.NEGATIVE_INFINITY;

  for (const event of events) {
    if (hasPayload(event)) {
      if (references(event).includes(identity)) {
        by.push(event.id);
        newestAt = Math.max(newestAt, event.wallClock);
      }
      continue;
    }
    // Erased: the reference died with the payload and does not keep this alive.
    if (event.absence === "erased") continue;
    // Unfetched or pruned: we cannot read what it cited, so we cannot say.
    //
    // Under a window, that is only a problem when the event is *recent*: an
    // unreadable event older than the window could not be a recent reference
    // whatever it cites. Its wall clock is on the envelope, which every device
    // holds, so this stays answerable on a partial replica.
    if (expiry !== undefined && event.wallClock <= expiry.now - expiry.windowMs) continue;
    blockedBy.push(event.id);
  }

  if (blockedBy.length > 0 && by.length === 0) return { state: "unknown", blockedBy };
  if (blockedBy.length > 0) return { state: "referenced", by };
  if (by.length === 0) return { state: "unreferenced" };

  // Referenced, and the operator's rule is the **newest** reference: one recent
  // citation holds the whole Attachment, however old the others are. Anything
  // else would release content something still points at from last week.
  if (expiry !== undefined && newestAt <= expiry.now - expiry.windowMs) {
    return { state: "expired", by, newestAt };
  }
  return { state: "referenced", by };
}

export interface DestructionResult {
  readonly destroyed: boolean;
  readonly verdict: DestructionVerdict;
}

/** The two grounds on which a key may be destroyed. */
export type DestructionGround = "unreferenced" | "expired";

/**
 * Destroys an Attachment's key on one of its two grounds, and refuses otherwise.
 *
 * **Ground one, inv. 8:** nothing readable cites it any more.
 * **Ground two, DR-7:** everything that cites it is older than `expiry.windowMs`
 * — the *newest* reference, so one recent citation holds the whole Attachment
 * however old the others are. Reachable only when a caller passes a window, so a
 * destruction while a live reference exists is always asked for by name.
 *
 * The verdict is computed here rather than accepted as an argument, so the guard
 * cannot be stepped around — the same reason `Journal.detach` runs
 * `evaluatePrune` itself. Destruction is irreversible and silent when wrong: the
 * bytes stay on every disk that has them and decode nowhere, and no later fetch
 * can undo it.
 *
 * The ciphertext is dropped too, marked `erased`. That is belt and braces: the
 * key going is what makes the copy on a peer's disk inert, and dropping the local
 * bytes is merely tidy.
 */
export async function destroyAttachment(
  ports: AttachmentPorts,
  identity: string,
  events: readonly StoredEvent[],
  references: AttachmentReferences,
  expiry?: ExpiryWindow,
): Promise<DestructionResult> {
  const verdict = evaluateDestruction(events, identity, references, expiry);
  const permitted: readonly DestructionGround[] = ["unreferenced", "expired"];
  // `expired` is only reachable when a caller passed a window, so the second
  // ground can never fire by default. Destruction while a live reference exists
  // is the more dangerous of the two and has to be asked for by name.
  if (!permitted.includes(verdict.state as DestructionGround)) {
    return { destroyed: false, verdict };
  }

  const destroyed = await ports.keyring.destroy(identity);
  await ports.store.drop(blindedAddress(ports.addressSecret, identity), "erased");
  return { destroyed, verdict };
}
