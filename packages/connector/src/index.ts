/**
 * Connector Sensors — `contracts/Sensor.md` §6a, `docs/DECISIONS.md` DR-7.
 *
 * DR-7 sets three tiers. **Only the first is here**, and the other two are
 * blocked rather than skipped:
 *
 * 1. **The call is journaled, content or not.** `recordCall`. Done.
 * 2. **The synthesis is an Observation.** Blocked: `contracts/Observation.md`
 *    inv. 5 — *"References, never copies. Raw content is referenced as
 *    Attachments by content hash, never inlined mutably"* — so an Observation
 *    over fetched content cannot be written until Attachments exist.
 * 3. **The raw is an Attachment held for seven days.** Blocked on the same
 *    thing: `contracts/Attachment.md` has two operator rulings (inv. 7's blinded
 *    address, inv. 8's per-Attachment key) and no implementation.
 *
 * So the order is not the one DR-7 lists: Attachment comes before tiers 2 and 3,
 * and this package stops at the boundary rather than inlining content into an
 * Observation to get moving.
 */
export { CONNECTOR_CALL_TYPE, CONNECTOR_CALL_SCHEMA, recordCall } from "./call.js";
export type { ConnectorCall, CallOutcome } from "./call.js";
export { ConnectorDenied } from "./driver.js";
export type { ConnectorDriver, FetchResult, FetchScope } from "./driver.js";
export { answered, unknown, outcomeOf } from "./outcome.js";
export type { ReadOutcome } from "./outcome.js";
