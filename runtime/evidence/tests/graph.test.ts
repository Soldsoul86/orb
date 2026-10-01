/**
 * The Evidence Graph: provenance as a typed view over lineage.
 *
 * What matters most here is what the graph **refuses to claim**: an answer over partial history is a
 * lower bound and says so, "when" means when the thing happened rather than when it was written down,
 * and nothing about what an Observation says — let alone a sealed screen — can come out.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { Journal, type StoredEvent } from "@orb/journal";
import { observationDraft } from "@orb/observation";
import { buildGraph, sourceMatches, type GraphNode } from "../src/index.js";

const WEEK = 7 * 24 * 3600 * 1000;
const IDENTITY_A = "sha256:" + "aa".repeat(32);
const IDENTITY_B = "sha256:" + "bb".repeat(32);

/** A journal whose clock the test sets, so "when it happened" and "when it was written" can differ. */
async function journalAt() {
  let now = 1_000_000;
  const journal = await Journal.open({ lane: "pixel", device: "pixel-01", now: () => now });
  return { journal, at: (t: number) => { now = t; } };
}

const device = (type: string, payload: unknown) => ({ type, schema: { id: type, version: 1 }, payload });

async function observe(journal: Journal, source: string, cause: string, attachment?: string, data: unknown = { because: "x" }) {
  return journal.appendOne(
    observationDraft(
      { source, confidencePercent: 100, data, ...(attachment === undefined ? {} : { attachments: [attachment] }) },
      [cause],
    ),
  );
}

/** A small history: two captures (one screen twice), a share, their Observations written weeks later, a conclusion, a bookkeeping event. */
async function history() {
  const { journal, at } = await journalAt();
  at(1_000_000);
  const capA1 = await journal.appendOne(device("orb.assist.captured", { because: "r", package: "com.chat", attachment: IDENTITY_A }));
  at(2_000_000);
  const capA2 = await journal.appendOne(device("orb.assist.captured", { because: "r", package: "com.chat", attachment: IDENTITY_A }));
  at(3_000_000);
  const share = await journal.appendOne(device("orb.shared", { because: "s", references: "https://example.test/x" }));
  at(4_000_000);
  const bookkeeping = await journal.appendOne(device("orb.export", { because: "operator export" }));
  at(1_000_000 + 3 * WEEK); // back-filled long after
  const obsA1 = await observe(journal, "orb.sensor.assist@orb-1", capA1.id, IDENTITY_A);
  const obsA2 = await observe(journal, "orb.sensor.assist@orb-1", capA2.id, IDENTITY_A);
  const obsS = await observe(journal, "orb.sensor.share@orb-1", share.id);
  at(1_000_000 + 3 * WEEK + 1000);
  const conclusion = await journal.appendOne({ type: "note", schema: { id: "note", version: 1 }, payload: { text: "c" }, causes: [obsA1.id, obsS.id] });
  const events = await journal.readLane("pixel");
  return { journal, events, capA1, capA2, share, bookkeeping, obsA1, obsA2, obsS, conclusion };
}

describe("what a node is", () => {
  test("an Observation, the event it observed, or neither", async () => {
    const h = await history();
    const g = buildGraph(h.events);
    assert.equal(g.node(h.obsA1.id)!.kind, "observation");
    assert.equal(g.node(h.capA1.id)!.kind, "device-event");
    assert.equal(g.node(h.share.id)!.kind, "device-event");
    assert.equal(g.node(h.bookkeeping.id)!.kind, "other");
    assert.equal(g.node(h.conclusion.id)!.kind, "other");
    assert.equal(g.nodes().length, h.events.length, "one node per event");
  });

  test("an Observation carries its source, confidence and attachment identity", async () => {
    const h = await history();
    const n = buildGraph(h.events).node(h.obsA1.id)!;
    assert.equal(n.source, "orb.sensor.assist@orb-1");
    assert.equal(n.confidencePercent, 100);
    assert.deepEqual(n.attachments, [IDENTITY_A]);
  });
});

describe("where did this come from", () => {
  test("an Observation rests on the event it observed, and the chain is closed", async () => {
    const h = await history();
    const a = buildGraph(h.events).provenance(h.obsA1.id);
    assert.deepEqual(a.value.map((n) => n.id), [h.capA1.id]);
    assert.equal(a.closed, true);
  });

  test("a conclusion rests on Observations and, through them, on what was observed", async () => {
    const h = await history();
    const a = buildGraph(h.events).provenance(h.conclusion.id);
    assert.deepEqual(new Set(a.value.map((n) => n.id)), new Set([h.obsA1.id, h.obsS.id, h.capA1.id, h.share.id]));
    assert.deepEqual(a.value.map((n) => n.kind).sort(), ["device-event", "device-event", "observation", "observation"]);
    assert.equal(a.closed, true);
  });

  test("an event that rests on nothing says so, closed", async () => {
    const h = await history();
    const a = buildGraph(h.events).provenance(h.capA1.id);
    assert.deepEqual(a.value, []);
    assert.equal(a.closed, true, "a real root is a real answer");
  });

  test("an id not held is not an empty answer — it is named, and the answer is not closed", async () => {
    const h = await history();
    const a = buildGraph(h.events).provenance("01NOSUCHEVENT");
    assert.equal(a.closed, false);
    assert.deepEqual(a.unresolved, ["01NOSUCHEVENT"]);
  });

  test("a cause this history does not hold is named", async () => {
    const h = await history();
    const partial = h.events.filter((e) => e.id !== h.capA1.id);
    const a = buildGraph(partial).provenance(h.obsA1.id);
    assert.equal(a.closed, false);
    assert.deepEqual(a.unresolved, [h.capA1.id]);
  });
});

describe("was it observed", () => {
  test("the Observations that cite a device event", async () => {
    const h = await history();
    const a = buildGraph(h.events).observationsOf(h.capA1.id);
    assert.deepEqual(a.value.map((n) => n.id), [h.obsA1.id]);
    assert.equal(a.closed, true);
  });

  test("an event nobody observed is a true empty, closed", async () => {
    const h = await history();
    const a = buildGraph(h.events).observationsOf(h.bookkeeping.id);
    assert.deepEqual(a.value, []);
    assert.equal(a.closed, true);
  });

  test("what an Observation is not is not an answer: a conclusion citing it is not an observation of it", async () => {
    const h = await history();
    const a = buildGraph(h.events).observationsOf(h.obsA1.id);
    assert.deepEqual(a.value, []);
  });
});

describe("what depended on this", () => {
  test("everything built on a device event, through any chain, typed", async () => {
    const h = await history();
    const a = buildGraph(h.events).dependentsOf(h.capA1.id);
    assert.deepEqual(a.value.map((n) => [n.id, n.kind]), [[h.obsA1.id, "observation"], [h.conclusion.id, "other"]]);
    assert.equal(a.closed, true);
  });

  test("a root that is not held is named, never an empty list that reads as 'nothing depends on it'", async () => {
    const h = await history();
    const a = buildGraph(h.events).dependentsOf("01GONE");
    assert.deepEqual(a.value, []);
    assert.equal(a.closed, false);
    assert.deepEqual(a.unresolved, ["01GONE"]);
  });

  test("an event that cannot say what it cites might be a dependent, and the answer is a lower bound", async () => {
    const h = await history();
    // The conclusion's envelope only: its stated lineage is not readable here.
    const { payload: _p, causes: _c, ...envelope } = h.events.find((e) => e.id === h.conclusion.id) as StoredEvent & { payload?: unknown };
    const events = h.events.map((e) => (e.id === h.conclusion.id ? (envelope as StoredEvent) : e));
    const a = buildGraph(events).dependentsOf(h.capA1.id);
    assert.equal(a.closed, false);
    assert.deepEqual(a.unresolved, [h.conclusion.id]);
    assert.deepEqual(a.value.map((n) => n.id), [h.obsA1.id], "what it can see, it still says");
  });
});

describe("what came from a sensor, and when", () => {
  test("matches the sensor by name, at any install — and not a sensor that merely starts the same", async () => {
    assert.equal(sourceMatches("orb.sensor.assist@orb-1", "orb.sensor.assist"), true);
    assert.equal(sourceMatches("orb.sensor.assist", "orb.sensor.assist"), true);
    assert.equal(sourceMatches("orb.sensor.assist2@orb-1", "orb.sensor.assist"), false);
    assert.equal(sourceMatches("orb.sensor.assist@orb-1", "orb.sensor.assist@orb-2"), false);
    const h = await history();
    const a = buildGraph(h.events).fromSource("orb.sensor.assist");
    assert.deepEqual(a.value.map((o) => o.node.id), [h.obsA1.id, h.obsA2.id]);
  });

  test("when means when it happened: the capture's time, not the day the Observation was written", async () => {
    const h = await history();
    const g = buildGraph(h.events);
    const [first] = g.fromSource("orb.sensor.assist").value;
    assert.equal(first!.occurredAt, 1_000_000, "the capture's clock");
    assert.equal(first!.node.recordedAt, 1_000_000 + 3 * WEEK, "written three weeks later");
    assert.equal(first!.occurredAtKnown, true);
  });

  test("a window is judged on occurrence — last month's capture is not in this week's window", async () => {
    const h = await history();
    const g = buildGraph(h.events);
    const writtenWindow = { from: 1_000_000 + 3 * WEEK - 1000, to: 1_000_000 + 3 * WEEK + 5000 };
    assert.deepEqual(g.fromSource("orb.sensor.assist", writtenWindow).value, [], "by recording time it would match");
    const happenedWindow = { from: 900_000, to: 1_500_000 };
    assert.deepEqual(g.fromSource("orb.sensor.assist", happenedWindow).value.map((o) => o.node.id), [h.obsA1.id]);
    assert.deepEqual(g.fromSource("orb.sensor.assist", { from: 1_000_000, to: 1_000_000 }).value.length, 1, "inclusive");
  });

  test("an Observation whose cause is not held is placed by its own time, and flagged", async () => {
    const h = await history();
    const partial = h.events.filter((e) => e.id !== h.capA1.id);
    const g = buildGraph(partial);
    const o = g.fromSource("orb.sensor.assist").value.find((x) => x.node.id === h.obsA1.id)!;
    assert.equal(o.occurredAtKnown, false);
    assert.equal(o.occurredAt, o.node.recordedAt);
  });

  test("results are ordered by when they happened, ties by id", async () => {
    const h = await history();
    const times = buildGraph(h.events).fromSource("orb.sensor.assist").value.map((o) => o.occurredAt);
    assert.deepEqual(times, [...times].sort((a, b) => a - b));
  });

  test("an Observation whose payload is not held cannot be matched, and the answer says so", async () => {
    const h = await history();
    const { payload: _p, ...envelope } = h.events.find((e) => e.id === h.obsA1.id) as StoredEvent & { payload?: unknown };
    const events = h.events.map((e) => (e.id === h.obsA1.id ? (envelope as StoredEvent) : e));
    const a = buildGraph(events).fromSource("orb.sensor.assist");
    assert.deepEqual(a.value.map((o) => o.node.id), [h.obsA2.id]);
    assert.equal(a.closed, false);
    assert.deepEqual(a.unresolved, [h.obsA1.id]);
  });
});

describe("what holds this sealed content", () => {
  test("two captures of one screen are two Observations over one attachment", async () => {
    const h = await history();
    const a = buildGraph(h.events).holding(IDENTITY_A);
    assert.deepEqual(a.value.map((n) => n.id), [h.obsA1.id, h.obsA2.id]);
    assert.equal(a.closed, true);
  });

  test("an identity nothing holds is a true empty", async () => {
    const h = await history();
    const a = buildGraph(h.events).holding(IDENTITY_B);
    assert.deepEqual(a.value, []);
    assert.equal(a.closed, true);
  });
});

describe("it carries no content", () => {
  test("nothing an Observation says, and nothing of a sealed screen, comes out", async () => {
    const { journal, at } = await journalAt();
    at(5);
    const cap = await journal.appendOne(device("orb.assist.captured", { because: "r", package: "com.chat", textChars: 99, note: "the secret words" }));
    await observe(journal, "orb.sensor.assist@orb-1", cap.id, IDENTITY_A, { because: "r", package: "com.chat", text: "the secret words" });
    const g = buildGraph(await journal.readLane("pixel"));
    const everything = JSON.stringify([g.nodes(), g.provenance(cap.id), g.dependentsOf(cap.id), g.fromSource("orb.sensor.assist"), g.holding(IDENTITY_A)]);
    assert.ok(!everything.includes("secret"), "no word of any payload");
    assert.ok(!everything.includes("com.chat"), "not even the app: that is data, and this view has no field for it");
  });

  test("a node has only the fields it is allowed", async () => {
    const h = await history();
    const allowed = new Set(["id", "kind", "type", "lane", "device", "hlc", "recordedAt", "causes", "source", "confidencePercent", "attachments"]);
    for (const n of buildGraph(h.events).nodes()) {
      for (const key of Object.keys(n)) assert.ok(allowed.has(key), `${key} is not an allowed node field`);
    }
  });
});

describe("it is a value, and it is safe", () => {
  test("the same events give the same answers", async () => {
    const h = await history();
    const a = buildGraph(h.events);
    const b = buildGraph([...h.events]);
    assert.deepEqual(a.nodes(), b.nodes());
    assert.deepEqual(a.provenance(h.conclusion.id), b.provenance(h.conclusion.id));
    assert.deepEqual(a.fromSource("orb.sensor.share"), b.fromSource("orb.sensor.share"));
  });

  test("asking changes nothing: the events are not touched", async () => {
    const h = await history();
    const before = JSON.stringify(h.events);
    const g = buildGraph(h.events);
    g.provenance(h.conclusion.id); g.dependentsOf(h.capA1.id); g.fromSource("orb.sensor.assist"); g.holding(IDENTITY_A);
    assert.equal(JSON.stringify(h.events), before);
  });

  test("a cycle — which only a malformed or hostile journal can hold — does not hang a walk", async () => {
    const h = await history();
    const events = h.events.map((e) =>
      e.id === h.capA1.id ? ({ ...e, causes: [h.obsA1.id] } as StoredEvent) : e,
    );
    const g = buildGraph(events);
    assert.doesNotThrow(() => g.provenance(h.obsA1.id));
    assert.doesNotThrow(() => g.dependentsOf(h.capA1.id));
    assert.ok(g.provenance(h.obsA1.id).value.length <= events.length);
  });

  test("the empty history answers, and closed — there is nothing to be missing", async () => {
    const g = buildGraph([]);
    assert.deepEqual(g.nodes(), []);
    assert.deepEqual(g.fromSource("orb.sensor.assist").value, []);
    assert.equal(g.fromSource("orb.sensor.assist").closed, true);
    assert.equal(g.provenance("x").closed, false);
  });
});

describe("node kinds are read from the events alone", () => {
  test("a node is a GraphNode with a stable shape", async () => {
    const h = await history();
    const n: GraphNode = buildGraph(h.events).node(h.share.id)!;
    assert.equal(n.type, "orb.shared");
    assert.equal(n.source, undefined, "only Observations have a source");
  });
});
