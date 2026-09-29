/**
 * The loop, closed.
 *
 * ```
 * Journal → Observation → projection → rule → alert → answer → Journal
 *    ▲                        │
 *    └────────────────────────┘   the projection reads the answers too
 * ```
 *
 * The return arrow is the part that makes this a loop rather than a line that
 * ends near where it started, and its job is concrete: **do not tell the person
 * the same thing twice.** The answers are also read, and recorded, and — by
 * DR-8 — used for nothing else yet.
 */
import { derivation, hasPayload, unwrapPayload, type Journal, type OrbEvent } from "@orb/journal";
import {
  ALERT_ANSWERED_SCHEMA,
  ALERT_ANSWERED_TYPE,
  ALERT_RAISED_SCHEMA,
  ALERT_RAISED_TYPE,
  type AlertAnswer,
  deriveAlertId,
  type AlertAnswered,
  type AlertRaised,
} from "./alert.js";
import { project } from "./projection.js";
import { alertsFor } from "./rules.js";

/**
 * Projects the journal, raises what the rule asks for, and returns the alerts.
 *
 * Idempotent: running it twice raises nothing the second time, because the
 * projection folds in the alerts the first run appended. That is the loop doing
 * its one job, and it is why the alerts are journaled rather than held in
 * memory — a process that restarted would otherwise re-raise everything it had
 * ever said.
 */
export async function raiseAlerts(journal: Journal): Promise<readonly OrbEvent<AlertRaised>[]> {
  const state = project(await journal.readAll());
  const pending = alertsFor(state);
  if (pending.length === 0) return [];

  const raised: OrbEvent<AlertRaised>[] = [];
  for (const { rule, change } of pending) {
    const payload: AlertRaised = {
      // Derived, so this alert has the same identity in every journal that
      // ever folds this lane (`deriveAlertId`, `DEVICE_LOOP.md` §7b28).
      alertId: deriveAlertId(rule, change.reading || change.observation, change.kind),
      // What the identity was derived from, so a reader can recompute it.
      reading: change.reading,
      rule,
      kind: change.kind,
      gained: change.gained,
      lost: change.lost,
      observation: change.observation,
    };
    // The alert is derived from the reading, and says so in the journal's own
    // lineage rather than only in its payload. Declared a derivation, so the
    // journal refuses it if that lineage is ever missing.
    const event = await journal.appendOne(
      derivation({
        type: ALERT_RAISED_TYPE,
        schema: ALERT_RAISED_SCHEMA,
        payload,
        causes: [change.observation],
      }),
    );
    raised.push(event as OrbEvent<AlertRaised>);
  }
  return raised;
}

/**
 * Records how a person answered an alert.
 *
 * `acknowledged` and `dismissed` take the same path on purpose. The difference
 * is kept for whoever reads the journal later — including a future decision
 * about whether rules should learn from it — and does nothing today.
 */
export async function answerAlert(
  journal: Journal,
  alertId: string,
  answer: AlertAnswer,
): Promise<OrbEvent<AlertAnswered>> {
  // The raising event in *this* journal, if it has one. Absent is legitimate
  // now: an alert raised on another device can be answered here, and before
  // §7b28 that was impossible because the citation was a local event id.
  const raising = (await journal.readAll()).find(
    (event) =>
      event.type === ALERT_RAISED_TYPE &&
      hasPayload(event) &&
      (unwrapPayload((event as OrbEvent).payload) as AlertRaised)?.alertId === alertId,
  );

  const payload: AlertAnswered = raising
    ? { alert: alertId, answer, alertEvent: raising.id }
    : { alert: alertId, answer };

  const event = await journal.appendOne({
    type: ALERT_ANSWERED_TYPE,
    schema: ALERT_ANSWERED_SCHEMA,
    payload,
    // Lineage only where there is lineage to state. An answer to an alert this
    // journal never held has no local cause, and inventing one would be a claim
    // about history rather than a record of it.
    causes: raising ? [raising.id] : [],
  });
  return event as OrbEvent<AlertAnswered>;
}
