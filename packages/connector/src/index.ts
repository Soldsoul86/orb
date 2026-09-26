/**
 * Connector Sensors — `contracts/Sensor.md` §6a, `docs/DECISIONS.md` DR-7.
 *
 * DR-7 sets three tiers. **Only the first is here**, and the other two are
 * blocked rather than skipped:
 *
 * 1. **The call is journaled, content or not.** `recordCall`. Done.
 * 2. **The synthesis is an Observation.** `recordSynthesis`. Done — it keeps the
 *    raw as Attachments, cites them by identity, and cites the call event in
 *    `causes`, so a conclusion always leads back to the moment Orb asked.
 * 3. **The raw is released after seven days.** **Open**, and not for want of
 *    machinery: DR-7 and `contracts/Attachment.md` inv. 8 disagree about what
 *    releasing means. inv. 8 destroys a key when *no readable event references
 *    it*, and after seven days the Observation still does. So an expiry either
 *    drops the local bytes only — leaving the content recoverable from any peer
 *    that kept them — or it destroys a key while a live reference exists, which
 *    is a second ground for destruction that inv. 8 does not name. That is a
 *    ruling, not an implementation detail.
 */
export { CONNECTOR_CALL_TYPE, CONNECTOR_CALL_SCHEMA, recordCall } from "./call.js";
export type { ConnectorCall, CallOutcome } from "./call.js";
export { ConnectorDenied } from "./driver.js";
export type { ConnectorDriver, FetchResult, FetchScope } from "./driver.js";
export { recordSynthesis } from "./synthesis.js";
export type { Synthesis, SynthesisRecord } from "./synthesis.js";
export { answered, unknown, outcomeOf } from "./outcome.js";
export type { ReadOutcome } from "./outcome.js";
