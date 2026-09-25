/**
 * The Event contract.
 *
 * EVENT_MODEL.md §3 and `contracts/Event.md`. The journal treats `payload` as
 * opaque; meaning is assigned by projections. Nothing here may be mutated:
 * Constitution Art. I §2, "history is never mutated".
 *
 * An Event is split exactly where `contracts/Event.md` already splits it: the
 * **envelope** (identity, lane, device, HLC, predecessor commitment, integrity)
 * is frozen at v1, and the **payload** is opaque and uninterpreted. That split
 * carries a replication meaning — see `docs/PARTIAL_REPLICATION.md`: every
 * device holds every envelope, and may hold only a subset of payloads.
 */
import type { Hlc } from "./hlc.js";

/** Identifies the append-only lane owned by exactly one device. */
export type LaneId = string;

/** Identifies the payload shape, so readers can upcast forward-only. */
export interface SchemaRef {
  readonly id: string;
  readonly version: number;
}

/** Per-lane hash chaining, giving tamper-evidence (Constitution Art. I §5). */
export interface Integrity {
  /** Hash of the preceding event in this lane; `null` for the lane's first event. */
  readonly previous: string | null;
  /** SHA-256 over the envelope's canonical encoding, including `previous` and `payloadHash`. */
  readonly hash: string;
  /**
   * SHA-256 over the payload's canonical encoding.
   *
   * The envelope commits to the payload *by reference*, exactly as history
   * already commits to Attachments by content hash (`contracts/Attachment.md`
   * inv. 3). Two consequences, and both are the point: the chain verifies on a
   * device that holds no payloads at all, and a payload fetched back later from
   * anywhere — a peer, a relay, a stranger — is checked against history before
   * it is trusted.
   */
  readonly payloadHash: string;
}

/**
 * Everything about an Event except its payload.
 *
 * Replicated to every device, always (`PARTIAL_REPLICATION.md` §9 inv. 2). It
 * carries enough to verify the chain, derive `(hlc, lane)` order, and know that
 * an event exists — which is what lets a device say "I cannot answer that"
 * instead of guessing.
 */
export interface EventEnvelope {
  /**
   * Envelope format version. **Absent means 1** — see `envelopeVersion`.
   *
   * Inside the hash preimage, so it cannot be flipped to make a verifier apply
   * the wrong rule; in the envelope rather than the payload, so a device
   * holding no keys can still tell which rule to use.
   */
  readonly v?: 2;
  readonly id: string;
  readonly lane: LaneId;
  readonly device: string;
  readonly hlc: Hlc;
  /** Best-effort physical timestamp. Human-facing only; never used for ordering. */
  readonly wallClock: number;
  readonly type: string;
  /** Event ids this event was derived from or reacted to. */
  readonly causes: readonly string[];
  readonly schema: SchemaRef;
  readonly integrity: Integrity;
}

/** The immutable atomic unit of history, payload present. */
export interface OrbEvent<Payload = unknown> extends EventEnvelope {
  readonly payload: Payload;
}

/**
 * Why a payload is not here.
 *
 * Absence must carry a reason, because the two reasons mean opposite things to
 * a peer and are otherwise indistinguishable (`docs/ERASURE.md` §7):
 *
 * - `unfetched` — the envelope replicated here and the payload was never asked
 *   for, because this device's policy did not want it. It was never held. May
 *   be fetched at any time.
 * - `pruned` — held once, then dropped for space, with journaled proof that K
 *   others hold it. May be fetched back. `docs/PARTIAL_REPLICATION.md`.
 * - `erased` — destroyed by the owner, deliberately and irreversibly. **Never
 *   fetch it, never offer it, never restore it**, on any device, forever.
 *
 * Without the last distinction a peer would helpfully restore the payload its
 * owner had just destroyed — and would be behaving correctly.
 *
 * The first two are not interchangeable either, and the type system found that
 * rather than a reviewer: `unfetched` says *this device chose not to hold it*
 * and `pruned` says *this device held it and let it go*, which are different
 * answers to "why does my phone not know this?" — the question inv. 6 exists to
 * make answerable.
 *
 * This is **local storage state, never part of identity.** It is deliberately
 * not on `EventEnvelope`: the envelope is what the hash commits to, and an
 * Event's identity cannot depend on what one device happens to hold. The
 * durable, replicating statement is the erasure declaration in history
 * (`erasure.ts`); this field is that declaration's local projection, exactly as
 * Art. I §3 describes derived state.
 */
export type AbsenceReason = "unfetched" | "pruned" | "erased";

/**
 * An envelope whose payload this device no longer holds.
 *
 * The Event still exists, unchanged, in history; only its availability here has
 * changed (`contracts/Attachment.md` inv. 6, generalised to Events).
 */
export interface DetachedEvent extends EventEnvelope {
  readonly payload?: undefined;
  /** Why the payload is gone. Required: absence without a reason is the gap. */
  readonly absence: AbsenceReason;
}

/** What a store hands back: an event with its payload, or the envelope alone. */
export type StoredEvent<Payload = unknown> = OrbEvent<Payload> | DetachedEvent;

/**
 * Whether this device currently holds the payload.
 *
 * A payload can never legitimately be `undefined` — `canonicalJson` rejects it —
 * so absence is unambiguous. `null` is a value, and is present.
 */
export function hasPayload<Payload>(
  event: StoredEvent<Payload> | EventEnvelope,
): event is OrbEvent<Payload> {
  return (event as OrbEvent<Payload>).payload !== undefined;
}

/**
 * Whether this payload was destroyed by its owner rather than dropped for space.
 *
 * The one question every payload-moving path must ask before acting. An erased
 * payload is never fetched, never offered and never restored — see
 * `AbsenceReason`.
 */
export function isErased<Payload>(event: StoredEvent<Payload>): boolean {
  return !hasPayload(event) && event.absence === "erased";
}

/** What a caller supplies; the journal assigns identity, ordering and integrity. */
export interface EventDraft<Payload = unknown> {
  readonly type: string;
  readonly schema: SchemaRef;
  readonly payload: Payload;
  readonly causes?: readonly string[];
}

/** Raised when an append would violate an append-only or integrity invariant. */
export class JournalIntegrityError extends Error {
  override readonly name = "JournalIntegrityError";
  constructor(message: string, readonly detail: Readonly<Record<string, unknown>> = {}) {
    super(message);
  }
}

/**
 * Raised when dropping a payload would breach the durability rule.
 *
 * `PARTIAL_REPLICATION.md` §9 inv. 4: a payload is dropped only with journaled
 * custody receipts proving it survives elsewhere. This is the one failure in
 * that design that loses data, so the guard refuses rather than warns.
 */
export class RetentionError extends Error {
  override readonly name = "RetentionError";
  constructor(message: string, readonly detail: Readonly<Record<string, unknown>> = {}) {
    super(message);
  }
}
