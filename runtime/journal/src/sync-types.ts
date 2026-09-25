/**
 * The sync layer's event types, alone in their own module.
 *
 * Only so that `vocabulary.ts` can name them as bookkeeping without importing
 * `sync.ts`, which imports `vocabulary.ts` in turn. A constant that two modules
 * need and neither owns belongs to neither of them.
 */
export const SYNC_POLICY_TYPE = "orb.sync.policy";
export const SYNC_POLICY_SCHEMA = { id: "orb.sync.policy", version: 1 } as const;
