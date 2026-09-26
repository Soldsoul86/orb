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
import type { Journal, OrbEvent } from "@orb/journal";
import {
  ALERT_ANSWERED_SCHEMA,
  ALERT_ANSWERED_TYPE,
  ALERT_RAISED_SCHEMA,
  ALERT_RAISED_TYPE,
  type AlertAnswer,
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
      rule,
      kind: change.kind,
      gained: change.gained,
      lost: change.lost,
      observation: change.observation,
    };
    const event = await journal.appendOne({
      type: ALERT_RAISED_TYPE,
      schema: ALERT_RAISED_SCHEMA,
      payload,
      // The alert is derived from the reading, and says so in the journal's own
      // lineage rather than only in its payload.
      causes: [change.observation],
    });
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
  alertEventId: string,
  answer: AlertAnswer,
): Promise<OrbEvent<AlertAnswered>> {
  const event = await journal.appendOne({
    type: ALERT_ANSWERED_TYPE,
    schema: ALERT_ANSWERED_SCHEMA,
    payload: { alert: alertEventId, answer } satisfies AlertAnswered,
    causes: [alertEventId],
  });
  return event as OrbEvent<AlertAnswered>;
}
