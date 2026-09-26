/**
 * The sync payload policy, read back — `docs/PARTIAL_REPLICATION.md` §9 inv. 6
 * and the reason §6 gives for it:
 *
 * > A retention change alters what a device can answer. If that is not in
 * > history, *"why doesn't my phone know this?"* is unanswerable, and the
 * > horizon in §5 becomes unexplainable.
 *
 * Recording the policy satisfied the first half. These tests are the second:
 * that a horizon can say **why** it is bounded, not only that it is.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  Journal,
  LocalSyncPeer,
  MemoryJournalStore,
  holdEverything,
  holdNothing,
  pullFrom,
  syncPolicyHistory,
  syncPolicyInForce,
  type DetachedEvent,
  type OrbEvent,
  type StoredEvent,
} from "../src/index.js";

const NOTE_SCHEMA = { id: "test.note", version: 1 } as const;
const note = (text: string) => ({ type: "note", schema: NOTE_SCHEMA, payload: { text } });

/** Strips a payload the way a store does: absence always carries a reason. */
function detach(event: StoredEvent): DetachedEvent {
  const { payload: _payload, ...envelope } = event as OrbEvent;
  return { ...envelope, absence: "pruned" };
}

async function pixelAndMac() {
  const pixel = await Journal.open({
    lane: "pixel",
    device: "pixel-01",
    store: new MemoryJournalStore(),
  });
  const mac = await Journal.open({
    lane: "mac",
    device: "mac-01",
    store: new MemoryJournalStore(),
  });
  return { pixel, mac };
}

describe("what policy a device has been running", () => {
  test("a device that never synced has none — which is not a fault", async () => {
    const { mac } = await pixelAndMac();
    assert.deepEqual(syncPolicyInForce(await mac.readLane("mac"), "mac-01"), { state: "none" });
  });

  test("after a sync, the policy it ran under is readable, and says since when", async () => {
    const { pixel, mac } = await pixelAndMac();
    await pixel.append([note("p1")]);
    await pullFrom(mac, new LocalSyncPeer(pixel), holdEverything());

    const found = syncPolicyInForce(await mac.readLane("mac"), "mac-01");
    assert.equal(found.state, "policy");
    if (found.state !== "policy") return;
    assert.equal(found.policy, "hold:everything");
    assert.ok(found.at.length > 0, "cites the event it came from");
    assert.ok(found.since > 0, "and when it took effect");
  });

  test("the newest policy governs", async () => {
    const { pixel, mac } = await pixelAndMac();
    await pixel.append([note("p1")]);
    await pullFrom(mac, new LocalSyncPeer(pixel), holdEverything());
    await pixel.append([note("p2")]);
    await pullFrom(mac, new LocalSyncPeer(pixel), holdNothing());

    const found = syncPolicyInForce(await mac.readLane("mac"), "mac-01");
    assert.equal(found.state, "policy");
    if (found.state !== "policy") return;
    assert.equal(found.policy, "hold:nothing");
  });

  test("a policy whose payload is gone is unreadable, never the one before it", async () => {
    // An earlier readable policy is a *superseded* rule. Reporting it would
    // explain the horizon with something the device has already replaced.
    const { pixel, mac } = await pixelAndMac();
    await pixel.append([note("p1")]);
    await pullFrom(mac, new LocalSyncPeer(pixel), holdEverything());
    await pixel.append([note("p2")]);
    await pullFrom(mac, new LocalSyncPeer(pixel), holdNothing());

    const own = await mac.readLane("mac");
    const policies = syncPolicyHistory(own, "mac-01");
    assert.equal(policies.length, 2, "two policy records, not one");

    const latest = policies[1]!;
    assert.equal(latest.state, "policy");
    if (latest.state !== "policy") return;
    const withLatestGone = own.map((event) => (event.id === latest.at ? detach(event) : event));

    const found = syncPolicyInForce(withLatestGone, "mac-01");
    assert.equal(found.state, "unreadable");
    if (found.state !== "unreadable") return;
    assert.equal(found.at, latest.at);
  });

  test("another device's policy is not this device's policy", async () => {
    // Inv. 7 — no device decides what another may hold. Pulling replicates the
    // peer's lane, policy records and all, so the filter is load-bearing here
    // rather than theoretical.
    const { pixel, mac } = await pixelAndMac();
    await pixel.append([note("p1")]);
    await pullFrom(mac, new LocalSyncPeer(pixel), holdEverything());
    await pullFrom(pixel, new LocalSyncPeer(mac), holdNothing());

    // pixel now holds mac's lane, including mac's "hold:everything" record.
    const all = [...(await pixel.readLane("pixel")), ...(await pixel.readLane("mac"))];
    assert.ok(
      all.some((event) => event.device === "mac-01"),
      "the scene needs mac's records present, or the filter proves nothing",
    );

    const mine = syncPolicyInForce(all, "pixel-01");
    assert.equal(mine.state, "policy");
    if (mine.state !== "policy") return;
    assert.equal(mine.policy, "hold:nothing", "pixel's own, not mac's");
  });

  test("history keeps an unreadable entry in place rather than dropping it", async () => {
    // A gap in the sequence and a policy nobody can read are different facts,
    // and the second is the one that needs saying.
    const { pixel, mac } = await pixelAndMac();
    await pixel.append([note("p1")]);
    await pullFrom(mac, new LocalSyncPeer(pixel), holdEverything());
    await pixel.append([note("p2")]);
    await pullFrom(mac, new LocalSyncPeer(pixel), holdNothing());

    const own = await mac.readLane("mac");
    const first = syncPolicyHistory(own, "mac-01")[0]!;
    assert.equal(first.state, "policy");
    if (first.state !== "policy") return;

    const gone = own.map((event) => (event.id === first.at ? detach(event) : event));
    const history = syncPolicyHistory(gone, "mac-01");

    assert.equal(history.length, 2, "the entry stays in the sequence");
    assert.equal(history[0]?.state, "unreadable");
    assert.equal(history[1]?.state, "policy");
  });
});

describe("a horizon that explains itself", () => {
  test("a device that never synced is complete, and says it has no policy", async () => {
    const { pixel } = await pixelAndMac();
    await pixel.append([note("mine")]);
    const horizon = await pixel.horizon();

    assert.equal(horizon.complete, true);
    // Not a fault: a device that has never synced has never recorded a policy,
    // and everything it holds is its own.
    assert.deepEqual(horizon.policy, { state: "none" });
  });

  test("a bounded horizon names the policy that bounded it", async () => {
    // This is §6's sentence made answerable. Before this, a horizon could say
    // "84 payloads missing" and nothing in history said why.
    const { pixel, mac } = await pixelAndMac();
    await pixel.append([note("p1"), note("p2")]);
    await pullFrom(mac, new LocalSyncPeer(pixel), holdNothing());

    const horizon = await mac.horizon();
    assert.equal(horizon.complete, false);
    assert.ok(horizon.missing > 0, "envelopes arrived without payloads");
    assert.equal(horizon.policy.state, "policy");
    if (horizon.policy.state !== "policy") return;
    assert.equal(horizon.policy.policy, "hold:nothing");
  });

  test("the explanation is this device's, never the peer it pulled from", async () => {
    const { pixel, mac } = await pixelAndMac();
    await pixel.append([note("p1")]);
    await pullFrom(mac, new LocalSyncPeer(pixel), holdEverything());
    await pullFrom(pixel, new LocalSyncPeer(mac), holdNothing());

    const macHorizon = await mac.horizon();
    const pixelHorizon = await pixel.horizon();

    assert.equal(macHorizon.policy.state, "policy");
    assert.equal(pixelHorizon.policy.state, "policy");
    if (macHorizon.policy.state !== "policy") return;
    if (pixelHorizon.policy.state !== "policy") return;
    assert.equal(macHorizon.policy.policy, "hold:everything");
    assert.equal(pixelHorizon.policy.policy, "hold:nothing");
  });
});
