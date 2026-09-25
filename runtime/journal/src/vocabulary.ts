/**
 * What an envelope is allowed to say about an event.
 *
 * **Ruled 2026-09-25** (`docs/ERASURE.md` §2b): *bookkeeping events keep their
 * real names; everything else gets one label.*
 *
 * The survey that produced it asked which code reads `event.type` **without the
 * key**, and found only bookkeeping on the list — `isBookkeeping` for sync
 * convergence, `latestCustody` needing receipts told from policy, and a witness
 * that holds no payloads ever and so can never decrypt to find out. Everything
 * else reads the type after decrypting, where the real one is available.
 *
 * **Why the minimum rather than a richer split.** Every label is permanent
 * under the E2/E3 ruling, so the choice is asymmetric: starting coarse stays
 * reversible, because finer labels can begin later while the old prefix stays
 * safely coarse; starting fine cannot be undone. A three-way
 * observation/activity split would have spent an irreversible privacy budget on
 * a distinction no current code consumes.
 *
 * **The cost, which the operator accepted and gave the deciding reason for.** An
 * erased event becomes completely uninterpretable — its type went into the
 * payload and died with it. Not even its owner can see what was erased. *"Else
 * someone will just try to erase and get the summary":* a record of what was
 * erased is an oracle, turning coercion into *compel an erasure, then read what
 * it removed*.
 */
import { CUSTODY_RECEIPT_TYPE } from "./custody.js";
import { SYNC_POLICY_TYPE } from "./sync-types.js";
import { ERASURE_TYPE } from "./erasure.js";
import type { SchemaRef } from "./types.js";

/**
 * The only type a content event's envelope carries.
 *
 * It says an event happened, and nothing about what kind. The real type is
 * inside the payload.
 */
export const CONTENT_TYPE = "orb.content";

/** The schema an envelope carries for content: one describing *an encrypted payload*. */
export const CONTENT_SCHEMA: SchemaRef = { id: CONTENT_TYPE, version: 1 };

/**
 * Types that stay legible, because machinery outside this device reads them.
 *
 * These are *about* the record rather than *of* a life. They disclose nothing
 * under compulsion and the sync layer cannot function without them: a witness
 * holds no payloads at all and can never decrypt to discover that an event was
 * a custody receipt.
 */
const BOOKKEEPING: ReadonlySet<string> = new Set([
  CUSTODY_RECEIPT_TYPE,
  SYNC_POLICY_TYPE,
  ERASURE_TYPE,
]);

export function isBookkeepingType(type: string): boolean {
  return BOOKKEEPING.has(type);
}

/** What the envelope says, given what the event actually is. */
export function coarseType(type: string): string {
  return isBookkeepingType(type) ? type : CONTENT_TYPE;
}

/** What the envelope's schema says, given the event's real schema. */
export function coarseSchema(type: string, schema: SchemaRef): SchemaRef {
  return isBookkeepingType(type) ? schema : CONTENT_SCHEMA;
}
