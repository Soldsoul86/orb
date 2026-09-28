/**
 * An answer given once is never asked for again.
 *
 * `DEVICE_LOOP.md` §7b28. Alerts used to be identified by the journal's minted
 * event id, so folding the same export into a second journal produced the same
 * changes under different identities and an answer given in one was invisible
 * in the other. The loop's single job is *do not tell the person the same thing
 * twice*, and it was failing at it the moment there was more than one journal.
 *
 * The test that matters is the last one: two journals that never meet, the same
 * device lane, and an answer that crosses between them. Everything before it
 * exists to make that one interpretable.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { Journal, MemoryJournalStore, hasPayload, unwrapPayload } from "@orb/journal";
import {
  ALERT_RAISED_TYPE,
  answerAlert,
  deriveAlertId,
  importExport,
  project,
  raiseAlerts,
  type AlertRaised,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = () => readFile(join(here, "../../tests/fixtures/pass2-export.txt"), "utf8");

/** A journal that shares nothing with any other — a separate device. */
async function freshJournal(lane: string, device: string) {
  return Journal.open({ lane, device, store: new MemoryJournalStore() });
}

/** Fold the phone's export in and raise whatever the rule asks for. */
async function foldAndRaise(lane: string, device: string) {
  const journal = await freshJournal(lane, device);
  await importExport(journal, await fixture());
  const raised = await raiseAlerts(journal);
  return { journal, raised };
}

/** Every alert identity in a journal, as its payload states it. */
function alertIds(events: readonly { type: string; payload?: unknown }[]): string[] {
  return events
    .filter((event) => event.type === ALERT_RAISED_TYPE && hasPayload(event as never))
    .map((event) => (unwrapPayload(event.payload as never) as AlertRaised).alertId);
}

describe("an alert's identity is about the change, not about the recording", () => {
  test("the derivation is stable, and separates what should be separate", () => {
    const a = deriveAlertId("rule-x", "obs-1", "accessibility");
    assert.equal(a, deriveAlertId("rule-x", "obs-1", "accessibility"), "same triple, same id");

    assert.notEqual(a, deriveAlertId("rule-y", "obs-1", "accessibility"), "rule matters");
    assert.notEqual(a, deriveAlertId("rule-x", "obs-2", "accessibility"), "observation matters");
    assert.notEqual(a, deriveAlertId("rule-x", "obs-1", "deviceAdmin"), "kind matters");
  });

  test("no separator can be forged across the parts", () => {
    // Without length prefixes, ("a:b", "c", "d") and ("a", "b:c", "d") would
    // concatenate identically and two different alerts would share one identity.
    assert.notEqual(
      deriveAlertId("a:b", "c", "d"),
      deriveAlertId("a", "b:c", "d"),
      "a colon in a part must not become a boundary",
    );
  });

  test("two journals that never meet agree on the identity", async () => {
    const first = await foldAndRaise("mac", "mac-01");
    const second = await foldAndRaise("phone", "phone-01");

    assert.ok(first.raised.length > 0, "the fixture raises something to compare");
    assert.deepEqual(
      alertIds(first.raised as never),
      alertIds(second.raised as never),
      "same lane folded twice, same alert identities",
    );

    // The event ids must still differ — they identify the *recording*, and two
    // journals genuinely did append two events. Conflating those two things is
    // what the defect was.
    assert.notDeepEqual(
      first.raised.map((event) => event.id),
      second.raised.map((event) => event.id),
      "the events are distinct even though the alerts are one",
    );
  });

  test("an answer given in one journal is an answer in the other", async () => {
    const first = await foldAndRaise("mac", "mac-01");
    const second = await foldAndRaise("phone", "phone-01");

    const [id] = alertIds(first.raised as never);
    assert.ok(id, "an alert to answer");

    await answerAlert(first.journal, id, "dismissed");
    await answerAlert(second.journal, id, "dismissed");

    // The point: the second journal accepted an identity it did not mint, and
    // its projection reads the answer back under the same key.
    for (const j of [first.journal, second.journal]) {
      const state = project(await j.readAll());
      assert.equal(state.answers.get(id), "dismissed");
    }
  });

  test("answering an alert this journal never raised is recorded, with no invented lineage", async () => {
    // The case that was impossible before: an alert raised on another device.
    const journal = await freshJournal("mac", "mac-01");
    const orphan = deriveAlertId("device-watch.authority-changed", "obs-elsewhere", "accessibility");

    const event = await answerAlert(journal, orphan, "acknowledged");
    const payload = unwrapPayload(event.payload as never) as { alert: string; alertEvent?: string };

    assert.equal(payload.alert, orphan);
    assert.equal(payload.alertEvent, undefined, "no local raising event to name");
    assert.deepEqual(event.causes ?? [], [], "and no lineage invented to fill the gap");
  });

  test("re-raising still does not happen, which the derivation must not break", async () => {
    const { journal, raised } = await foldAndRaise("mac", "mac-01");
    const again = await raiseAlerts(journal);
    assert.equal(again.length, 0, "the projection folds in what was already raised");
    assert.ok(raised.length > 0);
  });
});
