/**
 * The first closed loop — `docs/DECISIONS.md` DR-8.
 *
 * Three properties carry the weight, and each is a mistake this would make if
 * nobody checked: a projection that stopped being disposable, a rule that
 * treated a first look as news, and an answer that quietly changed what the rule
 * does next.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { Journal, MemoryJournalStore } from "@orb/journal";
import { observationDraft } from "@orb/observation";
import {
  ALERT_RAISED_TYPE,
  CHANGE_RULE,
  alertsFor,
  answerAlert,
  changeKey,
  project,
  raiseAlerts,
  type AlertRaised,
  type DeviceAuthorityReading,
} from "../src/index.js";

const GUARD = "app.orb/app.actionlock.guard.PayGuardService";
const SPY = "com.unknown/.Watcher";

function reading(
  kinds: DeviceAuthorityReading["kinds"],
  because = "process.start",
): DeviceAuthorityReading {
  return { kinds, because };
}

const observe = (data: DeviceAuthorityReading) =>
  observationDraft({ source: "sensor.device.grants", confidencePercent: 100, data });

async function journal() {
  return Journal.open({ lane: "pixel", device: "pixel-01", store: new MemoryJournalStore() });
}

describe("the projection is derived, never written", () => {
  test("rebuilding from the same events gives the same answer", async () => {
    // The one-line test that keeps the journal authoritative. If this ever
    // needed state from somewhere else, that somewhere else would be a second
    // source of truth outliving an erasure of the events describing it.
    const j = await journal();
    await j.append([
      observe(reading([{ kind: "accessibility", readable: true, holding: [], baseline: true }])),
      observe(reading([{ kind: "accessibility", readable: true, holding: [GUARD], baseline: false, gained: [GUARD], lost: [] }])),
    ]);

    const once = project(await j.readAll());
    const twice = project(await j.readAll());
    assert.deepEqual(twice.holdings, once.holdings);
    assert.deepEqual(twice.changes, once.changes);
  });

  test("the newest reading wins, and an unreadable one is not an empty one", async () => {
    const j = await journal();
    await j.append([
      observe(reading([{ kind: "accessibility", readable: true, holding: [GUARD], baseline: true }])),
      observe(reading([{ kind: "accessibility", readable: false, baseline: false }])),
    ]);

    const [holding] = project(await j.readAll()).holdings;
    assert.equal(holding?.unreadable, true);
    // Not `holding: []`. A failed read would otherwise look like every grant
    // being revoked at once — loud, and wrong.
    assert.equal(holding?.holding, undefined);
  });
});

describe("one rule, and what it refuses to be", () => {
  test("a first look is never news, even if it names what it found", async () => {
    // §5j on the real phone: a self-test reporting a pre-existing state as a new
    // failure said FAILED for ever and meant nothing.
    //
    // `gained` is populated here on purpose. Pass 2 never emits both, so a
    // baseline test without it passes whether or not the guard exists — which it
    // did, until this was checked. The guard is for the *next* producer: an
    // importer or a second sensor that fills `gained` on a first look would
    // otherwise announce the whole device as newly granted.
    const j = await journal();
    await j.append([
      observe(reading([{
        kind: "accessibility",
        readable: true,
        holding: [GUARD, SPY],
        baseline: true,
        gained: [GUARD, SPY],
        lost: [],
      }])),
    ]);

    const state = project(await j.readAll());
    assert.equal(state.changes.length, 0, "a baseline is not a change");
    assert.equal(alertsFor(state).length, 0);
  });

  test("an unreadable kind raises nothing", async () => {
    const j = await journal();
    await j.append([
      observe(reading([{ kind: "deviceAdmin", readable: false, baseline: false, gained: [SPY] }])),
    ]);

    assert.equal(alertsFor(project(await j.readAll())).length, 0);
  });

  test("a grant appearing is surfaced, whoever published it", async () => {
    // No judgement by publisher. "A non-Google name appeared" was the obvious
    // heuristic and is the wrong one — it bakes in an opinion about who is safe.
    const j = await journal();
    await j.append([
      observe(reading([{ kind: "accessibility", readable: true, holding: [SPY], baseline: false, gained: [SPY], lost: [] }])),
    ]);

    const [pending] = alertsFor(project(await j.readAll()));
    assert.equal(pending?.rule, CHANGE_RULE);
    assert.deepEqual(pending?.change.gained, [SPY]);
  });

  test("a revocation is a change too", async () => {
    // `MOBILE_SENSING.md` §4.4 — your own app's permissions being revoked is
    // itself evidence. Observed on the device: five listeners, then four.
    const j = await journal();
    await j.append([
      observe(reading([{ kind: "notificationListener", readable: true, holding: [], baseline: false, gained: [], lost: [GUARD] }])),
    ]);

    const [pending] = alertsFor(project(await j.readAll()));
    assert.deepEqual(pending?.change.lost, [GUARD]);
  });

  test("an unchanged reading says nothing", async () => {
    const j = await journal();
    await j.append([
      observe(reading([{ kind: "accessibility", readable: true, holding: [GUARD], baseline: false, gained: [], lost: [] }])),
    ]);
    assert.equal(alertsFor(project(await j.readAll())).length, 0);
  });
});

describe("the loop closes, and does not tell you twice", () => {
  test("running the watch twice raises the alert once", async () => {
    // Idempotence is the return arrow's job. It works across restarts because
    // the alerts are journaled rather than held in memory.
    const j = await journal();
    await j.append([
      observe(reading([{ kind: "accessibility", readable: true, holding: [SPY], baseline: false, gained: [SPY], lost: [] }])),
    ]);

    const first = await raiseAlerts(j);
    const second = await raiseAlerts(j);
    assert.equal(first.length, 1);
    assert.equal(second.length, 0);

    const raised = (await j.readAll()).filter((e) => e.type === ALERT_RAISED_TYPE);
    assert.equal(raised.length, 1, "and only one is in history");
  });

  test("an alert cites the reading it came from", async () => {
    const j = await journal();
    const [observation] = await j.append([
      observe(reading([{ kind: "accessibility", readable: true, holding: [SPY], baseline: false, gained: [SPY], lost: [] }])),
    ]);
    assert.ok(observation);

    const [alert] = await raiseAlerts(j);
    assert.ok(alert);
    assert.deepEqual(alert.causes, [observation.id]);
    assert.equal((alert.payload as AlertRaised).observation, observation.id);
  });

  test("a later, different change still raises", async () => {
    // Answering one alert must not silence the device.
    const j = await journal();
    await j.append([
      observe(reading([{ kind: "accessibility", readable: true, holding: [SPY], baseline: false, gained: [SPY], lost: [] }])),
    ]);
    const [first] = await raiseAlerts(j);
    assert.ok(first);
    await answerAlert(j, first.id, "dismissed");

    await j.append([
      observe(reading([{ kind: "deviceAdmin", readable: true, holding: [SPY], baseline: false, gained: [SPY], lost: [] }])),
    ]);
    const second = await raiseAlerts(j);
    assert.equal(second.length, 1);
    assert.equal((second[0]?.payload as AlertRaised).kind, "deviceAdmin");
  });

  test("the answer is recorded, and cites the alert", async () => {
    const j = await journal();
    await j.append([
      observe(reading([{ kind: "accessibility", readable: true, holding: [SPY], baseline: false, gained: [SPY], lost: [] }])),
    ]);
    const [alert] = await raiseAlerts(j);
    assert.ok(alert);

    const answered = await answerAlert(j, alert.id, "dismissed");
    assert.deepEqual(answered.causes, [alert.id]);

    const state = project(await j.readAll());
    assert.equal(state.answers.get(alert.id), "dismissed");
    assert.equal(state.raised.has(changeKey(state.changes[0]!.observation, "accessibility")), true);
  });
});

describe("DR-8 — recorded, not taught", () => {
  test("acknowledged and dismissed leave the system in the same state", async () => {
    // The test that makes the decision real rather than stated. If a dismissal
    // ever started changing what the rule does, these two runs would diverge —
    // and that divergence is the moment Orb starts having opinions nobody wrote
    // down, which is a decision to take deliberately rather than to discover.
    async function run(answer: "acknowledged" | "dismissed") {
      const j = await journal();
      await j.append([
        observe(reading([{ kind: "accessibility", readable: true, holding: [SPY], baseline: false, gained: [SPY], lost: [] }])),
      ]);
      const [alert] = await raiseAlerts(j);
      assert.ok(alert);
      await answerAlert(j, alert.id, answer);

      await j.append([
        observe(reading([{ kind: "accessibility", readable: true, holding: [SPY, GUARD], baseline: false, gained: [GUARD], lost: [] }])),
      ]);
      const next = await raiseAlerts(j);
      return next.map((event) => {
        const payload = event.payload as AlertRaised;
        return { kind: payload.kind, gained: payload.gained, lost: payload.lost, rule: payload.rule };
      });
    }

    assert.deepEqual(await run("dismissed"), await run("acknowledged"));
    assert.equal((await run("dismissed")).length, 1, "and both still raise the new one");
  });

  test("the difference is kept for a reader, even though nothing uses it", async () => {
    const j = await journal();
    await j.append([
      observe(reading([{ kind: "accessibility", readable: true, holding: [SPY], baseline: false, gained: [SPY], lost: [] }])),
    ]);
    const [alert] = await raiseAlerts(j);
    assert.ok(alert);
    await answerAlert(j, alert.id, "acknowledged");

    assert.equal(project(await j.readAll()).answers.get(alert.id), "acknowledged");
  });
});
