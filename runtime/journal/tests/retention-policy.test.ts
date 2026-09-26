/**
 * Retention policy read back from history — `docs/PARTIAL_REPLICATION.md` §9
 * inv. 6 and §11's note on the gap it left: *"The policy is recorded when it
 * changes; nothing yet reads it back to decide behaviour."*
 *
 * The prune guard is the one rule whose failure is silent and permanent, so the
 * tests here are mostly about the paths where the policy is **not** available.
 * A guard that prunes when it cannot read its rule is worse than one that never
 * prunes at all: it destroys payloads on the strength of a missing record.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  Journal,
  MemoryJournalStore,
  custodyReceiptFor,
  effectivePolicy,
  evaluatePrune,
  evaluatePruneFromHistory,
  retentionPolicyDraft,
  RETENTION_POLICY_TYPE,
  RETENTION_POLICY_SCHEMA,
  type DetachedEvent,
  type HeldCustody,
  type OrbEvent,
  type RetentionPolicy,
  type StoredEvent,
} from "../src/index.js";

const NOTE_SCHEMA = { id: "note", version: 1 } as const;
const note = (text: string) => ({ type: "note", schema: NOTE_SCHEMA, payload: { text } });

const policy = (over: Partial<RetentionPolicy> = {}): RetentionPolicy => ({
  ownedDevices: ["mac-01", "home-01"],
  pruneOrder: ["pixel-01", "mac-01"],
  ...over,
});

const policyDraftOf = (p: RetentionPolicy) => ({
  type: RETENTION_POLICY_TYPE,
  schema: RETENTION_POLICY_SCHEMA,
  payload: p,
});

/** Strips the payload the way a store does: absence always carries a reason. */
function detach(event: StoredEvent): DetachedEvent {
  const { payload: _payload, ...envelope } = event as OrbEvent;
  return { ...envelope, absence: "pruned" };
}

async function laneWith(
  device: string,
  drafts: readonly { type: string; schema: { id: string; version: number }; payload: unknown }[],
): Promise<readonly StoredEvent[]> {
  const journal = await Journal.open({ lane: device, device, store: new MemoryJournalStore() });
  if (drafts.length > 0) await journal.append(drafts);
  return journal.readLane(device);
}

describe("what history says the policy is", () => {
  test("a device that never recorded one has none — which is not an empty policy", async () => {
    const events = await laneWith("pixel-01", [note("hello")]);
    assert.deepEqual(effectivePolicy(events, "pixel-01"), { state: "none" });
  });

  test("a recorded policy reads back, and says which event it came from", async () => {
    const events = await laneWith("pixel-01", [policyDraftOf(policy())]);
    const found = effectivePolicy(events, "pixel-01");

    assert.equal(found.state, "policy");
    if (found.state !== "policy") return;
    assert.deepEqual(found.policy, policy());
    // Cited, so a prune decision can name the rule it applied rather than
    // asserting that some rule allowed it.
    assert.equal(found.at, events[0]?.id);
  });

  test("the newest policy governs, not the first", async () => {
    const events = await laneWith("pixel-01", [
      policyDraftOf(policy()),
      policyDraftOf(policy({ pruneOrder: ["mac-01"] })),
    ]);
    const found = effectivePolicy(events, "pixel-01");

    assert.equal(found.state, "policy");
    if (found.state !== "policy") return;
    assert.deepEqual(found.policy.pruneOrder, ["mac-01"]);
  });

  test("a policy whose payload is gone is unreadable, never the one before it", async () => {
    // The distinction this module exists for. An earlier readable policy is a
    // *superseded* rule; using it would prune under a rule the device has
    // already replaced, which is worse than not pruning.
    const events = await laneWith("pixel-01", [
      policyDraftOf(policy()),
      policyDraftOf(policy({ pruneOrder: ["mac-01"] })),
    ]);
    const withLatestGone = [events[0]!, detach(events[1]!)];
    const found = effectivePolicy(withLatestGone, "pixel-01");

    assert.equal(found.state, "unreadable");
    if (found.state !== "unreadable") return;
    assert.equal(found.at, events[1]?.id);
  });

  test("another device's policy is not this device's policy", async () => {
    // Inv. 7 — no device decides what another may hold. A reader that pooled
    // policy events would let one device quietly govern another's pruning,
    // which is the single thing that invariant exists to prevent.
    const mine = await laneWith("pixel-01", [note("hello")]);
    const theirs = await laneWith("mac-01", [policyDraftOf(policy())]);

    assert.deepEqual(effectivePolicy([...mine, ...theirs], "pixel-01"), { state: "none" });
    assert.equal(effectivePolicy([...mine, ...theirs], "mac-01").state, "policy");
  });
});

describe("recording a policy only when it changes", () => {
  test("a device with no policy drafts one", async () => {
    const events = await laneWith("pixel-01", []);
    assert.equal(retentionPolicyDraft(events, "pixel-01", policy()).length, 1);
  });

  test("an unchanged policy drafts nothing, so an idle device does not grow", async () => {
    const events = await laneWith("pixel-01", [policyDraftOf(policy())]);
    assert.deepEqual(retentionPolicyDraft(events, "pixel-01", policy()), []);
  });

  test("key order is not a change", async () => {
    // Canonical comparison, so a policy rewritten with its fields in another
    // order is not recorded as a change that did not happen.
    const events = await laneWith("pixel-01", [policyDraftOf(policy())]);
    const reordered = {
      pruneOrder: ["pixel-01", "mac-01"],
      ownedDevices: ["mac-01", "home-01"],
    } as RetentionPolicy;
    assert.deepEqual(retentionPolicyDraft(events, "pixel-01", reordered), []);
  });

  test("a genuine change drafts", async () => {
    const events = await laneWith("pixel-01", [policyDraftOf(policy())]);
    const changed = policy({ minHolders: 3 });
    assert.equal(retentionPolicyDraft(events, "pixel-01", changed).length, 1);
  });

  test("an unreadable current policy can still be restated", async () => {
    // Otherwise a device could never re-record its own rule, because it can no
    // longer read the rule it would be comparing against.
    const events = await laneWith("pixel-01", [policyDraftOf(policy())]);
    const gone = [detach(events[0]!)];
    assert.equal(retentionPolicyDraft(gone, "pixel-01", policy()).length, 1);
  });
});

describe("a prune governed by history, refusing when there is none", () => {
  const RECEIPT_LANE = "pixel";

  async function scene(policyDrafts: readonly ReturnType<typeof policyDraftOf>[]) {
    const store = new MemoryJournalStore();
    const journal = await Journal.open({ lane: RECEIPT_LANE, device: "pixel-01", store });
    const [target] = await journal.append([note("the payload under test")]);
    if (policyDrafts.length > 0) await journal.append(policyDrafts);
    const lane = await journal.readLane(RECEIPT_LANE);

    // Two other holders, one of them owned, so the guard's own conditions pass
    // and anything it refuses is refused for the policy reason under test.
    const receipt = custodyReceiptFor(RECEIPT_LANE, lane);
    assert.ok(receipt, "the scene needs a receipt, or a refusal below means nothing");
    const custody: readonly HeldCustody[] = [
      { holder: "mac-01", receipt },
      { holder: "home-01", receipt },
    ];
    return { target: target!, lane, custody };
  }

  test("no policy recorded refuses, and says so in terms that name the repair", async () => {
    const { target, lane, custody } = await scene([]);
    const decision = evaluatePruneFromHistory({
      event: target,
      lane,
      selfDevice: "pixel-01",
      custody,
      history: lane,
    });

    assert.equal(decision.permitted, false);
    assert.match(decision.reason, /no retention policy recorded/);
    // Fails closed. A permissive default here would destroy payloads on the
    // strength of a *missing* record — data may go because nothing said it must
    // stay, which inverts the rule the guard exists to enforce.
  });

  test("an unreadable policy refuses, and names the event that cannot be read", async () => {
    const { target, lane, custody } = await scene([policyDraftOf(policy())]);
    const policyEvent = lane.find((event) => event.type === RETENTION_POLICY_TYPE)!;
    const history = lane.map((event) => (event.id === policyEvent.id ? detach(event) : event));

    const decision = evaluatePruneFromHistory({
      event: target,
      lane,
      selfDevice: "pixel-01",
      custody,
      history,
    });

    assert.equal(decision.permitted, false);
    assert.match(decision.reason, /cannot be read/);
    assert.match(decision.reason, new RegExp(policyEvent.id));
    // The two unknowns are reported apart because they want different repairs:
    // `none` wants a policy set, `unreadable` wants one restated.
    assert.doesNotMatch(decision.reason, /no retention policy recorded/);
  });

  test("a readable policy decides exactly as the guard would with it passed in", async () => {
    const { target, lane, custody } = await scene([policyDraftOf(policy())]);
    const fromHistory = evaluatePruneFromHistory({
      event: target,
      lane,
      selfDevice: "pixel-01",
      custody,
      history: lane,
    });
    const passedIn = evaluatePrune({
      event: target,
      lane,
      selfDevice: "pixel-01",
      custody,
      policy: policy(),
    });

    // Reading the rule from history must change *where the rule comes from* and
    // nothing else about the decision.
    assert.deepEqual(fromHistory, passedIn);
  });

  test("the guard's own refusals are not masked by the policy being readable", async () => {
    // A device absent from `pruneOrder` may never prune. That refusal has to
    // survive the new entry point rather than being swallowed by it.
    const { target, lane, custody } = await scene([
      policyDraftOf(policy({ pruneOrder: ["mac-01"] })),
    ]);
    const decision = evaluatePruneFromHistory({
      event: target,
      lane,
      selfDevice: "pixel-01",
      custody,
      history: lane,
    });

    assert.equal(decision.permitted, false);
    assert.doesNotMatch(decision.reason, /no retention policy recorded/);
    assert.doesNotMatch(decision.reason, /cannot be read/);
  });

  test("a recorded policy cannot talk the floor of two holders down to one", async () => {
    // The floor is in the guard, not in the policy, so writing a weaker number
    // into history does not buy it. Otherwise durability would be editable by
    // whoever could append.
    const { target, lane } = await scene([policyDraftOf(policy({ minHolders: 1 }))]);
    const receipt = custodyReceiptFor("pixel", lane);
    assert.ok(receipt, "the scene needs a receipt, or the refusal below means nothing");
    const onlyOne: readonly HeldCustody[] = [{ holder: "mac-01", receipt }];

    const decision = evaluatePruneFromHistory({
      event: target,
      lane,
      selfDevice: "pixel-01",
      custody: onlyOne,
      history: lane,
    });

    assert.equal(decision.permitted, false);
  });
});
