/**
 * @orb/journal — the Event Journal.
 *
 * Orb's single source of truth: append-only, hash-chained, HLC-ordered.
 * Everything else in the runtime is a projection of what passes through here.
 */
export { HybridLogicalClock, HLC_ZERO, compareHlc, encodeHlc, decodeHlc } from "./hlc.js";
export type { Hlc, PhysicalClock } from "./hlc.js";

export { newEventId, isEventId } from "./ids.js";

export type {
  OrbEvent,
  EventEnvelope,
  DetachedEvent,
  StoredEvent,
  EventDraft,
  LaneId,
  SchemaRef,
  Integrity,
  AbsenceReason,
} from "./types.js";
export { hasPayload, isErased, JournalIntegrityError, RetentionError } from "./types.js";

export {
  canonicalJson,
  eventPreimage,
  hashEvent,
  hashPayload,
  verifyEnvelope,
  verifyPayload,
  verifiablePayload,
  verifyEvent,
  verifyLane,
} from "./integrity.js";
export { envelopeVersion, ENVELOPE_VERSION } from "./integrity.js";
export type { EnvelopePreimageInput, EnvelopeVersion } from "./integrity.js";

export {
  CUSTODY_RECEIPT_TYPE,
  CUSTODY_RECEIPT_SCHEMA,
  custodyReceiptFor,
  custodyReceiptDraft,
  isCustodyReceipt,
  latestCustody,
} from "./custody.js";
export type { CustodyReceipt, HeldCustody } from "./custody.js";

export {
  ERASURE_TYPE,
  ERASURE_SCHEMA,
  erasureDraft,
  isErasureDeclaration,
  erasedHashes,
  isDeclaredErased,
} from "./erasure.js";
export type { ErasureRecord } from "./erasure.js";

export { MemoryPayloadKeyring, isSealed } from "./keyring.js";
export type { PayloadKeyring, SealedPayload } from "./keyring.js";
export { sealedStore } from "./sealed-store.js";

export {
  planErasure,
  decisionsRequired,
  planDigest,
  grantFor,
  grantCovers,
} from "./erasure-plan.js";
export type {
  ErasurePlan,
  DecisionPoint,
  Unavailable,
  EnvelopeResidue,
  ErasureGrant,
  GrantCheck,
} from "./erasure-plan.js";

export { wrapPayload, unwrapPayload, isWrapped, storedPayload, newNonce } from "./payload.js";
export type { WrappedPayload } from "./payload.js";

export {
  CONTENT_TYPE,
  CONTENT_SCHEMA,
  isBookkeepingType,
  coarseType,
  coarseSchema,
} from "./vocabulary.js";

export { indexLineage, descendantsOf, ancestorsOf } from "./lineage.js";
export type { LineageIndex, Traversal } from "./lineage.js";

export { evaluatePrune } from "./retention.js";
export type { RetentionPolicy, PruneDecision, PruneRequest } from "./retention.js";

export {
  SYNC_POLICY_TYPE,
  SYNC_POLICY_SCHEMA,
  pullFrom,
  exchange,
  LocalSyncPeer,
  holdEverything,
  holdNothing,
  holdSince,
  holdTypes,
  holdContent,
} from "./sync.js";
export type {
  SyncPeer,
  LaneWatermark,
  PayloadPolicy,
  SyncRound,
  SyncResult,
  SyncPolicyRecord,
} from "./sync.js";

export type { JournalStore, PayloadRecord } from "./store.js";
export { MemoryJournalStore } from "./store.js";
export { FileJournalStore } from "./file-store.js";

export { Journal } from "./journal.js";
export type { JournalOptions, JournalListener, Horizon, LaneHorizon } from "./journal.js";

export { compareEventOrder, orderEvents, fold, replay } from "./replay.js";
export type { Projection, BoundedFold } from "./replay.js";
