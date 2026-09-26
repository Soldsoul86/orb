/**
 * `@orb/device-watch` — the first closed loop.
 *
 * Journal → Observation → a small state projection → one rule → a person →
 * their answer → back into the journal, where the next projection reads it.
 *
 * It stands in for five layers `MASTER.md` names and does not pretend to be
 * them: the Evidence Graph is collapsed into `causes`, the Knowledge Engine into
 * a projection small enough to read in one sitting, the Reasoning Pipeline into
 * a single rule, and the Digital Twin and Agent Runtime are absent. Every one of
 * those can be inserted later without rewriting what is below it, which is the
 * only reason the shortcut is allowed.
 */
export {
  ALERT_ANSWERED_SCHEMA,
  ALERT_ANSWERED_TYPE,
  ALERT_RAISED_SCHEMA,
  ALERT_RAISED_TYPE,
} from "./alert.js";
export type { AlertAnswer, AlertAnswered, AlertRaised } from "./alert.js";
export { changeKey, project } from "./projection.js";
export type { AuthorityChange, DeviceAuthority, Holding } from "./projection.js";
export { CHANGE_RULE, alertsFor } from "./rules.js";
export type { PendingAlert } from "./rules.js";
export { answerAlert, raiseAlerts } from "./watch.js";
export type { DeviceAuthorityReading, KindReading } from "./reading.js";
