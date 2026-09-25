/**
 * Partial replication — `docs/PARTIAL_REPLICATION.md`.
 *
 * Two things are under test. First, that an envelope stands alone: the chain
 * verifies and order derives on a device holding no payloads at all. Second,
 * the prune guard, which is the one rule in the design whose failure is silent
 * and permanent, and so is tested against each refusal path separately rather
 * than through a happy path that happens to exercise them.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  Journal,
  FileJournalStore,
  MemoryJournalStore,
  RetentionError,
  custodyReceiptDraft,
  custodyReceiptFor,
  evaluatePrune,
  hasPayload,
  hashPayload,
  latestCustody,
  orderEvents,
  replay,
  verifyEnvelope,
  verifyLane,
  verifyPayload,
  type AbsenceReason,
  type CustodyReceipt,
  type DetachedEvent,
  type EventEnvelope,
  type HeldCustody,
  type OrbEvent,
  type RetentionPolicy,
  type StoredEvent,
} from "../src/index.js";

const NOTE_SCHEMA = { id: "test.note", version: 1 } as const;
const note = (text: string) => ({ type: "note", schema: NOTE_SCHEMA, payload: { text } });

/**
 * Strips payloads the way a store does, so envelopes can be tested alone.
 *
 * Produces `DetachedEvent`, not a bare envelope, because that is what a store
 * actually holds: absence always carries a reason. `pruned` by default, since
 * that is what these tests are about; pass `erased` to model destruction.
 */
function envelopesOf(
  events: readonly StoredEvent[],
  absence: AbsenceReason = "pruned",
): readonly DetachedEvent[] {
  return events.map((event) => {
    const { payload: _payload, ...envelope } = event as OrbEvent;
    return { ...envelope, absence };
  });
}

function custody(holder: string, receipt: CustodyReceipt): HeldCustody {
  return { holder, receipt };
}

const policy = (over: Partial<RetentionPolicy> = {}): RetentionPolicy => ({
  ownedDevices: ["mac-01", "home-01"],
  pruneOrder: ["pixel-01", "mac-01"],
  ...over,
});

describe("an envelope stands alone", () => {
  test("a lane verifies with every payload dropped", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    await journal.append([note("a"), note("b"), note("c")]);

    const full = await journal.readLane("pixel");
    verifyLane(full);
    // The same lane, payloads removed, must still verify end to end.
    verifyLane(envelopesOf(full));
    assert.ok(envelopesOf(full).every(verifyEnvelope));
  });

  test("tampering is still detectable on a device holding no payloads", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const [first] = await journal.append([note("a"), note("b")]);
    assert.ok(first);

    const envelopes = envelopesOf(await journal.readLane("pixel"));
    const [head, ...rest] = envelopes;
    assert.ok(head);
    const forged: EventEnvelope = { ...head, wallClock: head.wallClock + 1 };

    assert.equal(verifyEnvelope(forged), false);
    assert.throws(() => verifyLane([forged, ...rest]), /hash does not match/);
  });

  test("a payload that does not match its commitment is rejected", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const event = await journal.appendOne(note("a"));

    assert.ok(verifyPayload(event));
    const swapped = { ...event, payload: { text: "rewritten" } } as OrbEvent;
    assert.equal(verifyPayload(swapped), false);
    // The envelope is untouched, so only the payload check catches this.
    assert.ok(verifyEnvelope(swapped));
    assert.throws(() => verifyLane([swapped]), /payload does not match/);
  });

  test("the envelope commits to the payload by hash, not by value", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const event = await journal.appendOne(note("a"));
    assert.equal(event.integrity.payloadHash, hashPayload({ text: "a" }));
  });

  test("order derives identically with and without payloads", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    await journal.append([note("a"), note("b"), note("c")]);

    const full = await journal.readLane("pixel");
    const withPayloads = orderEvents(full).map((event) => event.id);
    const withoutPayloads = orderEvents(envelopesOf(full)).map((event) => event.id);
    assert.deepEqual(withoutPayloads, withPayloads);
  });
});

describe("custody receipts", () => {
  test("a receipt watermarks the contiguous prefix this device holds", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    await journal.append([note("a"), note("b"), note("c")]);
    const events = await journal.readLane("pixel");
    const last = events.at(-1);
    assert.ok(last);

    const receipt = custodyReceiptFor("pixel", events);
    assert.deepEqual(receipt, { lane: "pixel", throughHash: last.integrity.hash, count: 3 });
  });

  test("a gap ends the claim rather than skipping over it", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    await journal.append([note("a"), note("b"), note("c")]);
    const events = [...(await journal.readLane("pixel"))];
    const second = events[1];
    assert.ok(second);
    events[1] = envelopesOf([second])[0] as DetachedEvent;

    const receipt = custodyReceiptFor("pixel", events);
    assert.equal(receipt?.count, 1, "custody of a sieve is not custody of a prefix");
  });

  test("there is no receipt at all when the first payload is gone", () => {
    assert.equal(custodyReceiptFor("pixel", []), null);
  });

  test("the furthest receipt per holder wins, and other lanes are ignored", async () => {
    const peer = await Journal.open({ lane: "mac", device: "mac-01" });
    await peer.append([
      custodyReceiptDraft({ lane: "pixel", throughHash: "aa", count: 1 }),
      custodyReceiptDraft({ lane: "pixel", throughHash: "bb", count: 4 }),
      custodyReceiptDraft({ lane: "other", throughHash: "cc", count: 9 }),
    ]);

    const held = latestCustody(await peer.readAll(), "pixel");
    assert.equal(held.length, 1);
    assert.deepEqual(held[0], custody("mac-01", { lane: "pixel", throughHash: "bb", count: 4 }));
  });
});

describe("the prune guard refuses by default", () => {
  let lane: readonly EventEnvelope[] = [];
  let target: EventEnvelope;
  let head: EventEnvelope;

  before(async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    await journal.append([note("a"), note("b"), note("c")]);
    lane = envelopesOf(await journal.readLane("pixel"));
    const [first] = lane;
    const last = lane.at(-1);
    assert.ok(first && last);
    target = first;
    head = last;
  });

  // The default asker is deliberately NOT the device that produced the lane:
  // the backstop rule would otherwise fire first and mask every other refusal.
  const ask = (over: {
    selfDevice?: string;
    custody?: readonly HeldCustody[];
    policy?: RetentionPolicy;
  }) =>
    evaluatePrune({
      event: target,
      lane,
      selfDevice: over.selfDevice ?? "laptop-01",
      custody: over.custody ?? [],
      policy: over.policy ?? policy({ pruneOrder: ["laptop-01", "mac-01"] }),
    });

  const covering = (holder: string) =>
    custody(holder, { lane: "pixel", throughHash: head.integrity.hash, count: 3 });

  test("refuses with no holders at all", () => {
    const decision = ask({});
    assert.equal(decision.permitted, false);
    assert.match(decision.reason, /needs 2 other holders; 0 have custody/);
  });

  test("refuses with only one other holder", () => {
    const decision = ask({ custody: [covering("mac-01")] });
    assert.equal(decision.permitted, false);
    assert.match(decision.reason, /1 have custody/);
  });

  test("refuses when only relays hold it — a relay alone is not durability", () => {
    const decision = ask({ custody: [covering("relay-a"), covering("relay-b")] });
    assert.equal(decision.permitted, false);
    assert.match(decision.reason, /no device the user owns/);
  });

  test("refuses a device the policy does not permit to prune", () => {
    const decision = ask({
      selfDevice: "home-01",
      custody: [covering("mac-01"), covering("relay-a")],
    });
    assert.equal(decision.permitted, false);
    assert.match(decision.reason, /not permitted to prune/);
  });

  test("refuses while a device earlier in the prune order still holds it", () => {
    // mac-01 sits behind laptop-01 in the order, so mac must wait for laptop.
    const decision = ask({
      selfDevice: "mac-01",
      custody: [covering("laptop-01"), covering("home-01")],
    });
    assert.equal(decision.permitted, false);
    assert.match(decision.reason, /earlier in the prune order still holds/);
  });

  test("never counts its own receipt toward the requirement", () => {
    const decision = ask({ custody: [covering("laptop-01"), covering("mac-01")] });
    assert.equal(decision.permitted, false);
    assert.deepEqual(decision.holders, ["mac-01"]);
  });

  test("a receipt that stops short of the event does not cover it", () => {
    const short = custody("mac-01", {
      lane: "pixel",
      throughHash: "a-hash-that-is-not-in-this-lane",
      count: 1,
    });
    const decision = ask({ custody: [short, covering("home-01")] });
    assert.equal(decision.permitted, false);
    assert.deepEqual(decision.holders, ["home-01"]);
  });

  test("the originating device is the backstop and needs one more holder", () => {
    const asOriginator = evaluatePrune({
      event: target,
      lane,
      // pixel-01 produced this lane, so it gives up its copy only with margin.
      selfDevice: "pixel-01",
      custody: [covering("mac-01"), covering("home-01")],
      policy: policy(),
    });
    assert.equal(asOriginator.permitted, false);
    assert.match(asOriginator.reason, /backstop, so it needs 3 other holders/);

    const withMargin = evaluatePrune({
      event: target,
      lane,
      selfDevice: "pixel-01",
      custody: [covering("mac-01"), covering("home-01"), covering("relay-a")],
      policy: policy(),
    });
    assert.equal(withMargin.permitted, true);
  });

  test("permits a non-originator once the rule is satisfied", () => {
    const decision = evaluatePrune({
      event: target,
      lane,
      selfDevice: "laptop-01",
      custody: [covering("mac-01"), covering("relay-a")],
      policy: policy({ pruneOrder: ["laptop-01", "pixel-01"] }),
    });
    assert.equal(decision.permitted, true);
    assert.match(decision.reason, /2 other holders, 1 of them owned/);
  });

  test("a policy cannot lower the floor below two holders", () => {
    const decision = evaluatePrune({
      event: target,
      lane,
      selfDevice: "laptop-01",
      custody: [covering("mac-01")],
      policy: policy({ pruneOrder: ["laptop-01"], minHolders: 1 }),
    });
    assert.equal(decision.permitted, false);
    assert.match(decision.reason, /needs 2 other holders/);
  });

  test("refuses an event that is not in the lane supplied", () => {
    const decision = evaluatePrune({
      event: { ...target, id: "not-in-this-lane" },
      lane,
      selfDevice: "laptop-01",
      custody: [],
      policy: policy({ pruneOrder: ["laptop-01"] }),
    });
    assert.equal(decision.permitted, false);
    assert.match(decision.reason, /not in the lane supplied/);
  });
});

describe("the journal enforces the guard", () => {
  /** A pixel journal holding a peer lane whose receipts cover pixel's history. */
  async function pixelWithCustody(holders: readonly string[], store = new MemoryJournalStore()) {
    const pixel = await Journal.open({ lane: "pixel", device: "pixel-01", store });
    const events = await pixel.append([note("a"), note("b"), note("c")]);
    const last = events.at(-1);
    assert.ok(last);

    const receipt: CustodyReceipt = {
      lane: "pixel",
      throughHash: last.integrity.hash,
      count: events.length,
    };

    for (const holder of holders) {
      const peer = await Journal.open({ lane: `lane-${holder}`, device: holder });
      const [claim] = await peer.append([custodyReceiptDraft(receipt)]);
      assert.ok(claim);
      await pixel.replicate(`lane-${holder}`, [claim]);
    }

    return { pixel, events };
  }

  test("refuses to drop a payload the rule does not permit, and keeps it", async () => {
    const { pixel, events } = await pixelWithCustody(["mac-01"]);
    const [first] = events;
    assert.ok(first);

    await assert.rejects(
      () => pixel.detach("pixel", [first.id], policy()),
      (error: unknown) => {
        assert.ok(error instanceof RetentionError);
        assert.match(error.message, /refusing to drop payload/);
        return true;
      },
    );

    const after = await pixel.readLane("pixel");
    assert.ok(after.every(hasPayload), "a refused prune must not remove anything");
  });

  test("drops the payload, keeps the envelope, and the chain still verifies", async () => {
    const { pixel, events } = await pixelWithCustody(["mac-01", "home-01", "relay-a"]);
    const [first] = events;
    assert.ok(first);

    const dropped = await pixel.detach("pixel", [first.id], policy());
    assert.equal(dropped, 1);

    const after = await pixel.readLane("pixel");
    const [head] = after;
    assert.ok(head);
    assert.equal(hasPayload(head), false, "the payload is gone");
    assert.equal(head.id, first.id, "the envelope stayed");
    assert.equal(head.integrity.payloadHash, first.integrity.payloadHash);
    await pixel.verify();
  });

  test("the horizon names exactly what is missing", async () => {
    const { pixel, events } = await pixelWithCustody(["mac-01", "home-01", "relay-a"]);
    const [first, second] = events;
    assert.ok(first && second);

    assert.equal((await pixel.horizon()).complete, true);
    await pixel.detach("pixel", [first.id, second.id], policy());

    const horizon = await pixel.horizon();
    assert.equal(horizon.complete, false);
    assert.equal(horizon.missing, 2);
    const pixelLane = horizon.lanes.find((entry) => entry.lane === "pixel");
    assert.equal(pixelLane?.detached, 2);
    assert.equal(pixelLane?.withPayload, 1);
    assert.deepEqual([...(pixelLane?.missing ?? [])].sort(), [first.id, second.id].sort());
  });

  test("a replay over a partial replica reports its bound instead of guessing", async () => {
    const { pixel, events } = await pixelWithCustody(["mac-01", "home-01", "relay-a"]);
    const [first] = events;
    assert.ok(first);

    const before = await replay(pixel, 0, (n) => n + 1);
    assert.equal(before.complete, true);

    await pixel.detach("pixel", [first.id], policy());

    const after = await replay(pixel, 0, (n) => n + 1);
    assert.equal(after.complete, false, "a partial fold must never claim completeness");
    assert.deepEqual(after.skipped, [first.id]);
    assert.equal(after.state, before.state - 1);
  });

  test("refuses an event that is not in the named lane", async () => {
    const { pixel } = await pixelWithCustody(["mac-01", "home-01", "relay-a"]);
    await assert.rejects(
      () => pixel.detach("pixel", ["no-such-event"], policy()),
      /event is not in this lane/,
    );
  });

  test("dropping an already-dropped payload is a no-op, not an error", async () => {
    const { pixel, events } = await pixelWithCustody(["mac-01", "home-01", "relay-a"]);
    const [first] = events;
    assert.ok(first);

    assert.equal(await pixel.detach("pixel", [first.id], policy()), 1);
    assert.equal(await pixel.detach("pixel", [first.id], policy()), 0);
  });
});

describe("durability of a compacted lane", () => {
  test("a detached payload stays gone across a reopen, and appends still chain", async () => {
    const directory = await mkdtemp(join(tmpdir(), "orb-partial-"));
    try {
      const store = await FileJournalStore.open(directory);
      const pixel = await Journal.open({ lane: "pixel", device: "pixel-01", store });
      const events = await pixel.append([note("a"), note("b")]);
      const [first] = events;
      assert.ok(first);

      const last = events.at(-1);
      assert.ok(last);
      const receipt: CustodyReceipt = {
        lane: "pixel",
        throughHash: last.integrity.hash,
        count: events.length,
      };
      for (const holder of ["mac-01", "home-01", "relay-a"]) {
        const peer = await Journal.open({ lane: `lane-${holder}`, device: holder });
        const [claim] = await peer.append([custodyReceiptDraft(receipt)]);
        assert.ok(claim);
        await pixel.replicate(`lane-${holder}`, [claim]);
      }

      assert.equal(await pixel.detach("pixel", [first.id], policy()), 1);
      await pixel.close();

      const reopenedStore = await FileJournalStore.open(directory);
      const reopened = await Journal.open({ lane: "pixel", device: "pixel-01", store: reopenedStore });

      const lane = await reopened.readLane("pixel");
      const [head] = lane;
      assert.ok(head);
      assert.equal(hasPayload(head), false, "the payload did not come back");
      await reopened.verify();

      // The head the journal restored must still be the chain's real head, so a
      // later append extends the compacted lane rather than forking it.
      const appended = await reopened.appendOne(note("c"));
      assert.equal(appended.integrity.previous, lane.at(-1)?.integrity.hash);
      await reopened.verify();
      await reopened.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
