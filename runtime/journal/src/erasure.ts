/**
 * The erasure declaration: the durable statement that a payload was destroyed.
 *
 * `docs/ERASURE.md`. The operator ruled that deletion is a right, exercised
 * openly: *history may shrink, it may never shrink silently.* This module is the
 * "never silently" half. The local half — `AbsenceReason` on a `DetachedEvent` —
 * is this declaration's projection, and cannot replicate on its own.
 *
 * Two properties are load-bearing and easy to lose:
 *
 * **It is bookkeeping, so it is legible.** A peer must read it without
 * decrypting anything, in order to know it may never offer that payload again.
 * A witness holds no payloads at all and can never decrypt.
 *
 * **Being legible, it may say almost nothing.** It carries a reference and the
 * fact — which lane, which envelope hash — and never a type, a summary or a
 * reason in plain text. `ERASURE.md` §2b: a record of *what* was erased is an
 * oracle, turning coercion into "compel an erasure, then read what it removed".
 * The mechanism for forgetting would become the most efficient way to
 * interrogate. The same object, under another name, is the suppression list §5b
 * ruled unbuildable.
 */
import type { EventDraft, LaneId, StoredEvent } from "./types.js";

export const ERASURE_TYPE = "orb.erasure";
export const ERASURE_SCHEMA = { id: "orb.erasure", version: 1 } as const;

/**
 * A declaration that one payload was destroyed.
 *
 * Deliberately two fields. Anything that describes the subject rather than
 * naming it does not belong here, and review should treat an added field as a
 * defect until argued otherwise.
 *
 * The envelope hash, not the event id, because the hash is what the chain
 * commits to: a reader verifying this declaration against a lane it holds can
 * check the reference without trusting whoever sent it.
 */
export interface ErasureRecord {
  readonly lane: LaneId;
  readonly hash: string;
}

export function erasureDraft(record: ErasureRecord): EventDraft<ErasureRecord> {
  return { type: ERASURE_TYPE, schema: ERASURE_SCHEMA, payload: record };
}

export function isErasureDeclaration(event: StoredEvent): boolean {
  return event.type === ERASURE_TYPE;
}

/**
 * Every envelope hash declared erased, across the events supplied.
 *
 * A pure projection over history — the erased set is never stored, it is
 * derived, so a replica that receives a declaration late arrives at the same
 * answer as one that had it all along (Art. I §3).
 *
 * Declarations are read from wherever they appear rather than from one lane:
 * the owner declares on their own lane, and that declaration replicates to
 * devices holding the lane it refers to. Requiring them to be co-located would
 * mean a peer could only honour an erasure for a lane it already wrote to,
 * which is backwards.
 */
export function erasedHashes(events: Iterable<StoredEvent>): ReadonlySet<string> {
  const erased = new Set<string>();

  for (const event of events) {
    if (!isErasureDeclaration(event)) continue;
    // A declaration whose payload this device does not hold still counts as a
    // declaration, but cannot say which envelope it referred to. Skipping it is
    // the only honest option: acting on a guess would erase the wrong thing.
    const record = event.payload as ErasureRecord | undefined;
    if (record?.hash) erased.add(record.hash);
  }

  return erased;
}

/** Whether `hash` has been declared erased anywhere in `events`. */
export function isDeclaredErased(events: Iterable<StoredEvent>, hash: string): boolean {
  return erasedHashes(events).has(hash);
}
