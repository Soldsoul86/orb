/**
 * Custody receipts — the evidence that makes dropping a payload safe.
 *
 * `docs/PARTIAL_REPLICATION.md` §4. A device appends to its own lane a
 * watermark saying "I hold payloads for lane L through envelope H". Receipts
 * are ordinary Events, so durability stops being an assumption and becomes a
 * question the journal can answer: how many readable copies of this payload
 * exist, and where?
 *
 * Deliberately coarse — one receipt per lane per sync round, not one per event —
 * because envelopes already grow linearly and receipts must not double that.
 */
import type { EventDraft, LaneId, OrbEvent, SchemaRef, StoredEvent } from "./types.js";
import { hasPayload } from "./types.js";

export const CUSTODY_RECEIPT_TYPE = "orb.custody.receipt";
export const CUSTODY_RECEIPT_SCHEMA: SchemaRef = { id: "orb.custody.receipt", version: 1 };

/**
 * A claim of custody over one lane's payloads, up to a point in that lane.
 *
 * The holder is deliberately **not** a field: a receipt is an Event on the
 * holder's own lane, so the holder is `event.device`. Repeating it would be a
 * second source of truth for the same fact (Art. IX §33) and could disagree
 * with the envelope.
 */
export interface CustodyReceipt {
  /** The lane whose payloads are held. */
  readonly lane: LaneId;
  /** Payloads are held for every event in `lane` up to and including this envelope hash. */
  readonly throughHash: string;
  /** How many events that covers, so a reader can sanity-check the claim. */
  readonly count: number;
}

/** A receipt together with the device that asserted it. */
export interface HeldCustody {
  readonly holder: string;
  readonly receipt: CustodyReceipt;
}

/**
 * Builds the receipt this device can honestly assert for `lane`.
 *
 * Honestly means: the watermark stops at the last event whose payload is
 * actually held. A gap ends the claim — custody of a prefix is a claim the
 * prune guard can reason about, whereas custody of a sieve is not.
 */
export function custodyReceiptFor(
  lane: LaneId,
  events: readonly StoredEvent[],
): CustodyReceipt | null {
  let throughHash: string | null = null;
  let count = 0;

  for (const event of events) {
    if (!hasPayload(event)) break;
    throughHash = event.integrity.hash;
    count += 1;
  }

  return throughHash === null ? null : { lane, throughHash, count };
}

/** Wraps a receipt as a draft for appending to this device's own lane. */
export function custodyReceiptDraft(receipt: CustodyReceipt): EventDraft<CustodyReceipt> {
  return { type: CUSTODY_RECEIPT_TYPE, schema: CUSTODY_RECEIPT_SCHEMA, payload: receipt };
}

/** Whether an event is a custody receipt this build understands. */
export function isCustodyReceipt(event: StoredEvent): event is OrbEvent<CustodyReceipt> {
  return (
    event.type === CUSTODY_RECEIPT_TYPE &&
    event.schema.id === CUSTODY_RECEIPT_SCHEMA.id &&
    event.schema.version === CUSTODY_RECEIPT_SCHEMA.version &&
    hasPayload(event)
  );
}

/**
 * Collects the latest receipt each device has asserted for `lane`.
 *
 * Later receipts supersede earlier ones from the same holder, by position in
 * that holder's lane — never by wall clock, which is not an ordering.
 */
export function latestCustody(
  events: readonly StoredEvent[],
  lane: LaneId,
): readonly HeldCustody[] {
  const byHolder = new Map<string, CustodyReceipt>();

  for (const event of events) {
    if (!isCustodyReceipt(event)) continue;
    const receipt = event.payload;
    if (receipt.lane !== lane) continue;
    const seen = byHolder.get(event.device);
    if (!seen || receipt.count >= seen.count) byHolder.set(event.device, receipt);
  }

  return [...byHolder.entries()]
    .map(([holder, receipt]) => ({ holder, receipt }))
    .sort((a, b) => (a.holder < b.holder ? -1 : a.holder > b.holder ? 1 : 0));
}
