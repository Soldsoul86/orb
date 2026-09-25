/**
 * Anti-entropy replication — `docs/SYNC_PROTOCOL.md` §4, under the partial
 * replication rules in `docs/PARTIAL_REPLICATION.md`.
 *
 * The two properties that matter most here are the ones a naive implementation
 * gets wrong: that envelopes replicate in full regardless of what the sender
 * retains (inv. 1 — partiality is about retention, never emission), and that a
 * payload is verified against history before it is accepted, so no peer has to
 * be trusted.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  Journal,
  LocalSyncPeer,
  MemoryJournalStore,
  SYNC_POLICY_TYPE,
  exchange,
  hasPayload,
  holdContent,
  holdEverything,
  holdNothing,
  holdTypes,
  isBookkeepingType,
  latestCustody,
  pullFrom,
  type PayloadRecord,
  type RetentionPolicy,
  type SyncPolicyRecord,
} from "../src/index.js";

const NOTE_SCHEMA = { id: "test.note", version: 1 } as const;
const ALERT_SCHEMA = { id: "test.alert", version: 1 } as const;
const note = (text: string) => ({ type: "note", schema: NOTE_SCHEMA, payload: { text } });
const alert = (text: string) => ({ type: "alert", schema: ALERT_SCHEMA, payload: { text } });

/**
 * Content events only.
 *
 * A lane also carries the sync rounds and custody receipts the device recorded
 * about itself, which are real history and must not be filtered out anywhere
 * but here, where the subject is what replicated rather than what was noted.
 *
 * Counts what is *not* bookkeeping rather than what is a "note" or an "alert".
 * A replica holds envelopes whose payloads it never fetched, and an envelope has
 * never heard of a note (`docs/ERASURE.md` §2b): it says `orb.content`. The same
 * event read where its payload *is* held comes back with its real type restored.
 * So the two forms agree on exactly one thing — whether this is bookkeeping —
 * and that is what a count across replicas has to be built on.
 */
function contentIn(events: readonly { type: string }[]): number {
  return events.filter((event) => !isBookkeepingType(event.type)).length;
}

async function pixelAndMac() {
  const pixel = await Journal.open({ lane: "pixel", device: "pixel-01" });
  const mac = await Journal.open({ lane: "mac", device: "mac-01" });
  return { pixel, mac };
}

describe("anti-entropy", () => {
  test("an exchange leaves both devices holding the union of lanes", async () => {
    const { pixel, mac } = await pixelAndMac();
    await pixel.append([note("p1"), note("p2")]);
    await mac.append([note("m1")]);

    await exchange(pixel, holdEverything(), mac, holdEverything());

    assert.deepEqual(await pixel.lanes(), ["mac", "pixel"]);
    assert.deepEqual(await mac.lanes(), ["mac", "pixel"]);
    assert.equal(contentIn(await pixel.readLane("mac")), 1);
    assert.equal(contentIn(await mac.readLane("pixel")), 2);
  });

  test("sync converges: repeated exchanges stop moving and stop recording", async () => {
    const { pixel, mac } = await pixelAndMac();
    await pixel.append([note("p1")]);

    // Bookkeeping is history and replicates, so it takes a second round to
    // settle. It must never provoke a third — that is the loop `isBookkeeping`
    // exists to break.
    await exchange(pixel, holdEverything(), mac, holdEverything());
    await exchange(pixel, holdEverything(), mac, holdEverything());

    const settled = [(await mac.readLane("mac")).length, (await pixel.readLane("pixel")).length];

    for (let round = 0; round < 3; round += 1) {
      const [intoPixel, intoMac] = await exchange(
        pixel,
        holdEverything(),
        mac,
        holdEverything(),
      );
      assert.equal(intoPixel.envelopes, 0, "nothing left to pull");
      assert.equal(intoMac.envelopes, 0, "nothing left to pull");
    }

    assert.deepEqual(
      [(await mac.readLane("mac")).length, (await pixel.readLane("pixel")).length],
      settled,
      "an idle exchange must not grow either lane",
    );
  });

  test("sync resumes from where it stopped rather than resending", async () => {
    const { pixel, mac } = await pixelAndMac();
    await pixel.append([note("p1")]);
    await pullFrom(mac, new LocalSyncPeer(pixel), holdEverything());

    await pixel.append([note("p2"), note("p3")]);
    const second = await pullFrom(mac, new LocalSyncPeer(pixel), holdEverything());

    assert.equal(second.round.envelopes["pixel"], 2, "only the tail crosses");
    assert.equal(contentIn(await mac.readLane("pixel")), 3);
  });

  test("a device never adopts a foreign copy of its own lane", async () => {
    const { pixel, mac } = await pixelAndMac();
    await pixel.append([note("p1")]);
    await pullFrom(mac, new LocalSyncPeer(pixel), holdEverything());

    // mac now holds a replica of "pixel". Pulling from mac must not let that
    // replica flow back into pixel as if it were foreign.
    const back = await pullFrom(pixel, new LocalSyncPeer(mac), holdEverything());
    assert.equal(back.round.envelopes["pixel"], undefined);
    assert.equal(contentIn(await pixel.readLane("pixel")), 1);
  });

  test("the whole union is verifiable on both sides afterwards", async () => {
    const { pixel, mac } = await pixelAndMac();
    await pixel.append([note("p1"), note("p2")]);
    await mac.append([note("m1"), note("m2")]);
    await exchange(pixel, holdEverything(), mac, holdEverything());

    await pixel.verify();
    await mac.verify();
  });
});

describe("envelopes are emitted in full, payloads by local policy", () => {
  test("a device that holds no payloads still serves every envelope", async () => {
    const { pixel, mac } = await pixelAndMac();
    await pixel.append([note("p1"), note("p2")]);

    // mac takes envelopes only — the most exposed posture short of blindness.
    const intoMac = await pullFrom(mac, new LocalSyncPeer(pixel), holdNothing());
    assert.equal(intoMac.envelopes, 2);
    assert.equal(intoMac.payloads, 0);

    const replica = await mac.readLane("pixel");
    assert.equal(contentIn(replica), 2);
    assert.ok(replica.every((event) => !hasPayload(event)));
    await mac.verify();

    // Inv. 1: what mac retains does not shrink what mac emits. A third device
    // pulling from mac must still receive every envelope.
    const laptop = await Journal.open({ lane: "laptop", device: "laptop-01" });
    const intoLaptop = await pullFrom(laptop, new LocalSyncPeer(mac), holdNothing());
    assert.equal(intoLaptop.round.envelopes["pixel"], 2);
    assert.equal(contentIn(await laptop.readLane("pixel")), 2);
  });

  test("a policy selects which payloads are held, and the rest stay envelopes", async () => {
    // A stepped clock, because three appends in one millisecond would make the
    // cutoff below meaningless and the test vacuous.
    let tick = 1_000;
    const pixel = await Journal.open({ lane: "pixel", device: "pixel-01", now: () => (tick += 10) });
    const mac = await Journal.open({ lane: "mac", device: "mac-01" });

    await pixel.append([note("p1"), alert("a1")]);
    const [last] = await pixel.append([note("p2")]);
    assert.ok(last);

    // Selection happens on the envelope, because that is all a fetching device
    // has — the payload is what it is deciding whether to ask for. So the policy
    // discriminates on wall clock, which the envelope still carries.
    await pullFrom(mac, new LocalSyncPeer(pixel), {
      describe: "hold:after-cutoff",
      wants: (envelope) => envelope.wallClock >= last.wallClock,
    });

    const replica = await mac.readLane("pixel");
    assert.equal(contentIn(replica), 3);
    assert.deepEqual(
      replica
        .filter((event) => !isBookkeepingType(event.type))
        .map((event) => hasPayload(event)),
      [false, false, true],
    );

    const horizon = await mac.horizon();
    assert.equal(horizon.complete, false);
    assert.equal(horizon.missing, 2);
  });

  test("a policy cannot select content by kind, and holds nothing if it tries", async () => {
    const { pixel, mac } = await pixelAndMac();
    await pixel.append([note("p1"), alert("a1")]);

    // Pins the cost of the coarse-type ruling so it cannot be rediscovered as a
    // bug. Every content envelope says `orb.content`, so a policy naming a real
    // event type matches nothing — and the alternative, a finer envelope label,
    // is exactly the leak §2b closed. `holdContent` is the honest replacement.
    await pullFrom(mac, new LocalSyncPeer(pixel), holdTypes(["alert"]));
    assert.equal((await mac.horizon()).missing, 2, "no content payload was fetched");

    const wider = await Journal.open({ lane: "wider", device: "wider-01" });
    await pullFrom(wider, new LocalSyncPeer(pixel), holdContent());
    assert.equal((await wider.horizon()).missing, 0, "content is all or nothing");
  });

  test("a payload missed under one policy is picked up under a wider one", async () => {
    const { pixel, mac } = await pixelAndMac();
    await pixel.append([note("p1"), alert("a1")]);

    await pullFrom(mac, new LocalSyncPeer(pixel), holdNothing());
    assert.equal((await mac.horizon()).missing, 2);

    const second = await pullFrom(mac, new LocalSyncPeer(pixel), holdEverything());
    assert.equal(second.envelopes, 0, "no new envelopes");
    assert.equal(second.payloads, 2, "the payloads it had skipped");
    assert.equal((await mac.horizon()).complete, true);
  });

  test("a peer cannot hand over a payload that does not match history", async () => {
    const { pixel, mac } = await pixelAndMac();
    const events = await pixel.append([note("p1")]);
    const [first] = events;
    assert.ok(first);

    await pullFrom(mac, new LocalSyncPeer(pixel), holdNothing());

    // A peer that lies about a payload is rejected by the envelope's own
    // commitment, so no peer has to be trusted.
    const forged: PayloadRecord[] = [{ eventId: first.id, payload: { text: "rewritten" } }];
    await assert.rejects(
      () => mac.attach("pixel", forged),
      /payload does not match the hash its envelope commits to/,
    );
    assert.equal((await mac.horizon()).missing, 1, "nothing was stored");
  });
});

describe("a round reports itself and journals only what lasts", () => {
  test("the round names the peer, the policy and what moved", async () => {
    const { pixel, mac } = await pixelAndMac();
    await pixel.append([note("p1"), note("p2")]);
    const result = await pullFrom(mac, new LocalSyncPeer(pixel), holdEverything());

    // The round is returned, not appended: it is operational detail, and
    // journaling one per poll would bury history in restatements.
    assert.equal(result.round.peer, "pixel-01");
    assert.equal(result.round.policy, "hold:everything");
    assert.equal(result.round.envelopes["pixel"], 2);
    assert.equal(result.round.payloads["pixel"], 2);
  });

  test("the policy in force is recoverable from history, so a horizon is explainable", async () => {
    const { pixel, mac } = await pixelAndMac();
    await pixel.append([note("p1"), alert("a1")]);
    await pullFrom(mac, new LocalSyncPeer(pixel), holdTypes(["alert"]));

    const own = await mac.readLane("mac");
    const record = own.find((event) => event.type === SYNC_POLICY_TYPE)
      ?.payload as SyncPolicyRecord;
    assert.equal(record.policy, "hold:types:alert");
    // "Why does this device not hold p1?" is answerable from the journal alone —
    // and under v2 the honest answer is that this policy names types no envelope
    // carries, so it held nothing at all. The horizon is explainable either way,
    // which is the property under test.
    assert.equal((await mac.horizon()).missing, 2);
  });

  test("an unchanged policy is recorded once, a changed one is recorded again", async () => {
    const { pixel, mac } = await pixelAndMac();
    await pixel.append([note("p1"), alert("a1")]);

    await pullFrom(mac, new LocalSyncPeer(pixel), holdTypes(["alert"]));
    await pullFrom(mac, new LocalSyncPeer(pixel), holdTypes(["alert"]));
    const policies = (await mac.readLane("mac")).filter(
      (event) => event.type === SYNC_POLICY_TYPE,
    );
    assert.equal(policies.length, 1);

    await pullFrom(mac, new LocalSyncPeer(pixel), holdEverything());
    const after = (await mac.readLane("mac")).filter((event) => event.type === SYNC_POLICY_TYPE);
    assert.equal(after.length, 2);
    assert.equal((after.at(-1)?.payload as SyncPolicyRecord).policy, "hold:everything");
  });

  test("custody is claimed only for what is actually held", async () => {
    const { pixel, mac } = await pixelAndMac();
    await pixel.append([note("p1"), note("p2")]);

    await pullFrom(mac, new LocalSyncPeer(pixel), holdNothing());
    assert.equal(
      latestCustody(await mac.readLane("mac"), "pixel").length,
      0,
      "a device that fetched nothing claims nothing",
    );

    await pullFrom(mac, new LocalSyncPeer(pixel), holdEverything());
    const held = latestCustody(await mac.readLane("mac"), "pixel");
    assert.equal(held.length, 1);
    assert.equal(held[0]?.holder, "mac-01");
    assert.equal(held[0]?.receipt.count, 2);
  });

  test("an unchanged watermark is not restated on every round", async () => {
    const { pixel, mac } = await pixelAndMac();
    await pixel.append([note("p1")]);

    await pullFrom(mac, new LocalSyncPeer(pixel), holdEverything());
    const after = (await mac.readLane("mac")).length;
    await pullFrom(mac, new LocalSyncPeer(pixel), holdEverything());
    await pullFrom(mac, new LocalSyncPeer(pixel), holdEverything());

    assert.equal((await mac.readLane("mac")).length, after);
  });

  test("a second exchange settles rather than echoing forever", async () => {
    const { pixel, mac } = await pixelAndMac();
    await pixel.append([note("p1")]);

    await exchange(pixel, holdEverything(), mac, holdEverything());
    await exchange(pixel, holdEverything(), mac, holdEverything());
    const [intoPixel, intoMac] = await exchange(pixel, holdEverything(), mac, holdEverything());

    assert.equal(intoPixel.envelopes, 0);
    assert.equal(intoMac.envelopes, 0);
  });
});

describe("sync makes the prune guard live", () => {
  test("a phone can drop a payload once enough peers have fetched it", async () => {
    const store = new MemoryJournalStore();
    const pixel = await Journal.open({ lane: "pixel", device: "pixel-01", store });
    const events = await pixel.append([note("p1"), note("p2")]);
    const [first] = events;
    assert.ok(first);

    const policy: RetentionPolicy = {
      ownedDevices: ["mac-01", "home-01"],
      // The phone is most exposed, so it prunes first; the home server never does.
      pruneOrder: ["pixel-01", "mac-01"],
    };

    // Before anyone has fetched anything, the guard refuses — the phone wrote
    // this lane and is its backstop.
    await assert.rejects(
      () => pixel.detach("pixel", [first.id], policy),
      /refusing to drop payload/,
    );

    for (const [lane, device] of [
      ["mac", "mac-01"],
      ["home", "home-01"],
      ["relay", "relay-a"],
    ] as const) {
      const peer = await Journal.open({ lane, device });
      await pullFrom(peer, new LocalSyncPeer(pixel), holdEverything());
      await pullFrom(pixel, new LocalSyncPeer(peer), holdEverything());
    }

    // Three holders now carry custody, one of them owned, so the backstop's
    // extra-holder requirement is met.
    assert.equal(await pixel.detach("pixel", [first.id], policy), 1);

    const lane = await pixel.readLane("pixel");
    const [head] = lane;
    assert.ok(head);
    assert.equal(hasPayload(head), false);
    await pixel.verify();
  });

  test("a peer that took envelopes only does not count as a holder", async () => {
    const pixel = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const events = await pixel.append([note("p1")]);
    const [first] = events;
    assert.ok(first);

    for (const [lane, device] of [
      ["mac", "mac-01"],
      ["home", "home-01"],
      ["relay", "relay-a"],
    ] as const) {
      const peer = await Journal.open({ lane, device });
      // Envelopes only — nobody actually holds the content.
      await pullFrom(peer, new LocalSyncPeer(pixel), holdNothing());
      await pullFrom(pixel, new LocalSyncPeer(peer), holdEverything());
    }

    await assert.rejects(
      () =>
        pixel.detach("pixel", [first.id], {
          ownedDevices: ["mac-01", "home-01"],
          pruneOrder: ["pixel-01"],
        }),
      /refusing to drop payload/,
    );
    assert.equal((await pixel.horizon()).complete, true, "the payload is still here");
  });

  test("a dropped payload comes back from a peer that kept it", async () => {
    const pixel = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const events = await pixel.append([note("p1"), note("p2")]);
    const [first] = events;
    assert.ok(first);

    const holders: Journal[] = [];
    for (const [lane, device] of [
      ["mac", "mac-01"],
      ["home", "home-01"],
      ["relay", "relay-a"],
    ] as const) {
      const peer = await Journal.open({ lane, device });
      await pullFrom(peer, new LocalSyncPeer(pixel), holdEverything());
      await pullFrom(pixel, new LocalSyncPeer(peer), holdEverything());
      holders.push(peer);
    }

    await pixel.detach("pixel", [first.id], {
      ownedDevices: ["mac-01", "home-01"],
      pruneOrder: ["pixel-01", "mac-01"],
    });
    assert.equal((await pixel.horizon()).missing, 1);

    const home = holders[1];
    assert.ok(home);
    const restored = await pullFrom(pixel, new LocalSyncPeer(home), holdEverything());

    assert.equal(restored.payloads, 1);
    assert.equal((await pixel.horizon()).complete, true);
    await pixel.verify();
  });
});
