#!/usr/bin/env node
/**
 * Imports a pass-2 export into this machine's journal, and runs the loop.
 *
 *   node scripts/device-import.mjs ~/Downloads/orb-pass2-20260928-071608.txt
 *   node scripts/device-import.mjs status
 *   node scripts/device-import.mjs answer 01M3JV6F8MVXKKG2GHKGBS0Y3M dismissed
 *
 * **The journal is yours and lives outside this repository** — `~/.orb/journal`
 * by default, `ORB_JOURNAL` to move it. It is never committed: it is a record of
 * one person's device, and Local First means it stays on the machine that made
 * it. `ORB_DEVICE` names the lane this machine appends to; the default is the
 * hostname, which keeps two machines from ever writing the same lane.
 *
 * This script decides nothing. `importExport`, `project`, `alertsFor`,
 * `raiseAlerts` and `answerAlert` do the work and are tested; what is here is
 * argument parsing, a path, and printing — the imperative shell around a
 * functional core.
 */
import { readFile } from "node:fs/promises";
import { hostname } from "node:os";
import { homedir } from "node:os";
import { join } from "node:path";

import { Journal, FileJournalStore, hasPayload, unwrapPayload } from "@orb/journal";
import {
  ALERT_RAISED_TYPE,
  alertsFor,
  answerAlert,
  importExport,
  project,
  raiseAlerts,
} from "@orb/device-watch";

const ANSWERS = ["acknowledged", "dismissed"];

const directory = process.env.ORB_JOURNAL ?? join(homedir(), ".orb", "journal");
const device = process.env.ORB_DEVICE ?? hostname().replace(/\..*$/, "");

const usage = () => {
  console.error("usage: device-import.mjs <export-file> | status | answer <alertId> <acknowledged|dismissed>");
  process.exit(2);
};

async function open() {
  const store = await FileJournalStore.open(directory);
  return Journal.open({ lane: device, device, store });
}

/** Above this many entries a set prints as a count. Matches the phone's screen. */
const LIST_IN_FULL = 25;

/** What holds power now, and what is waiting on a person. */
async function report(journal) {
  const state = project(await journal.readLane(device));

  console.log(`\njournal: ${directory}   lane: ${device}`);
  for (const holding of state.holdings) {
    // An unreadable kind is not an empty one, and must not print as one.
    const held = holding.unreadable ? "unreadable" : `${holding.holding.length}`;
    // The scope is printed beside the count, never omitted: a `visible` set is an
    // answer to a different question than an `all` set, and a reader handed the
    // number alone would take the narrower one for the whole.
    const scope = holding.scope === undefined ? "" : `  (${holding.scope})`;
    console.log(`  ${holding.kind.padEnd(22)} ${held}${scope}`);
    if (holding.unreadable) continue;
    if (holding.holding.length > LIST_IN_FULL) {
      // The package set runs to hundreds. The set is in the journal whole; this
      // is a terminal, and burying the three grant sets under it would defeat the
      // one thing this output is for.
      console.log(`    too many to list — read the lane for the set itself`);
      continue;
    }
    for (const entry of holding.holding) console.log(`    ${entry}`);
  }

  // Three different counts, because they answer three different questions and
  // collapsing them would let a reader think a raised alert had been dealt with.
  // `alertsFor` returns what has *not been raised yet* — never what is unanswered.
  const raised = (await journal.readLane(device)).filter(
    (event) => event.type === ALERT_RAISED_TYPE && hasPayload(event),
  );
  // Keyed by the alert's **derived** id, not the event's — DEVICE_LOOP.md §7b28.
  // An answer given in any journal is an answer here.
  const alertIdOf = (event) => unwrapPayload(event.payload)?.alertId ?? event.id;
  const unanswered = raised.filter((event) => !state.answers.has(alertIdOf(event)));
  console.log(
    `\nchanges seen: ${state.changes.length}   alerts: ${raised.length} raised, ` +
      `${unanswered.length} unanswered, ${alertsFor(state).length} waiting to be raised`,
  );
  for (const event of raised) {
    const { rule, kind, gained, lost } = event.payload;
    const answer = state.answers.get(alertIdOf(event));
    console.log(`  ${alertIdOf(event)}  ${kind}  ${answer ?? "UNANSWERED"}  (${rule})`);
    for (const entry of gained) console.log(`    + ${entry}`);
    for (const entry of lost) console.log(`    - ${entry}`);
  }
}

const [command, ...rest] = process.argv.slice(2);
if (!command) usage();

const journal = await open();

if (command === "status") {
  await report(journal);
} else if (command === "answer") {
  const [alertId, answer] = rest;
  if (!alertId || !ANSWERS.includes(answer)) usage();

  // Refuse to answer an alert that is not here. A citation to an event this
  // journal does not hold is a dangling one, and reads later as if a person
  // answered something nobody ever raised.
  const held = (await journal.readLane(device)).some(
    (event) =>
      event.type === ALERT_RAISED_TYPE &&
      hasPayload(event) &&
      (unwrapPayload(event.payload)?.alertId ?? event.id) === alertId,
  );
  if (!held) {
    console.error(`no alert ${alertId} in lane ${device} — nothing answered`);
    process.exit(1);
  }

  const event = await answerAlert(journal, alertId, answer);
  console.log(`answered ${alertId}: ${answer}  (${event.id})`);
  await report(journal);
} else {
  const text = await readFile(command, "utf8");
  const result = await importExport(journal, text);
  console.log(
    `imported ${command}\n  lanes: ${result.lanes.join(", ") || "none"}` +
      `\n  replicated: ${result.replicated}   new observations: ${result.observed}`,
  );

  const raised = await raiseAlerts(journal);
  console.log(`  alerts raised: ${raised.length}`);
  await report(journal);
}
