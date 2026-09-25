/**
 * The erasure preview: what would happen, before it happens.
 *
 * `docs/ERASURE.md` §4, the operator's ruling that erasure names an ambiguity
 * and waits rather than choosing a default.
 *
 * The tests that carry the most weight are not the ones checking the blast
 * radius is right. They are the ones checking the plan **refuses to look
 * reassuring** when it cannot see: a preview reporting "no disclosures" where no
 * disclosure record exists is not caution, it is a false statement the owner
 * would act on.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  Journal,
  custodyReceiptDraft,
  decisionsRequired,
  planErasure,
  type EventDraft,
} from "../src/index.js";

const SCHEMA = { id: "test.note", version: 1 } as const;
const note = (text: string): EventDraft => ({ type: "note", schema: SCHEMA, payload: { text } });
const derived = (text: string, causes: readonly string[]): EventDraft => ({
  type: "note",
  schema: SCHEMA,
  payload: { text },
  causes,
});

describe("what falls over, and what survives", () => {
  test("a conclusion resting only on the target will disappear", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const target = await journal.appendOne(note("target"));
    const only = await journal.appendOne(derived("rests on target alone", [target.id]));

    const plan = planErasure({
      events: await journal.readLane("pixel"),
      lane: "pixel",
      targets: [target.id],
    });

    assert.deepEqual(plan.soleSupport, [only.id]);
    assert.deepEqual(plan.partialSupport, []);
  });

  test("a conclusion resting on the target and something else will survive", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const [target, other] = await journal.append([note("target"), note("other")]);
    assert.ok(target && other);
    const both = await journal.appendOne(derived("rests on both", [target.id, other.id]));

    const plan = planErasure({
      events: await journal.readLane("pixel"),
      lane: "pixel",
      targets: [target.id],
    });

    // §5a: an over-determined pattern survives its own evidence. Reporting this
    // as "will disappear" would be the plan lying about the thing that matters
    // most — whether erasing actually removes the conclusion.
    assert.deepEqual(plan.partialSupport, [both.id]);
    assert.deepEqual(plan.soleSupport, []);
  });

  test("loss propagates down a chain, and stops where other support enters", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const [target, outside] = await journal.append([note("target"), note("outside")]);
    assert.ok(target && outside);
    const first = await journal.appendOne(derived("only target", [target.id]));
    const second = await journal.appendOne(derived("only first", [first.id]));
    const rescued = await journal.appendOne(derived("second and outside", [second.id, outside.id]));

    const plan = planErasure({
      events: await journal.readLane("pixel"),
      lane: "pixel",
      targets: [target.id],
    });

    // first and second lose everything; `rescued` keeps a foot on solid ground.
    assert.deepEqual([...plan.soleSupport].sort(), [first.id, second.id].sort());
    assert.deepEqual(plan.partialSupport, [rescued.id]);
  });

  test("nothing built on it means nothing to decide about", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const alone = await journal.appendOne(note("alone"));

    const plan = planErasure({
      events: await journal.readLane("pixel"),
      lane: "pixel",
      targets: [alone.id],
    });

    assert.deepEqual(plan.fallout.ids, []);
    assert.deepEqual(plan.soleSupport, []);
    assert.deepEqual(plan.partialSupport, []);
  });
});

describe("the plan never looks more certain than it is", () => {
  test("what cannot be computed is named, not omitted", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const target = await journal.appendOne(note("a"));

    const plan = planErasure({
      events: await journal.readLane("pixel"),
      lane: "pixel",
      targets: [target.id],
    });

    const points = plan.unavailable.map((gap) => gap.point);
    // D4 is the dangerous one. A plan that simply omitted it would read as
    // "nothing was disclosed", which is a statement this device cannot make.
    assert.ok(points.includes("D4"), "prior disclosure cannot be checked and must say so");
    assert.ok(points.includes("D5"), "no confirmation protocol exists");
    assert.ok(points.includes("D6"), "re-derivation cannot be predicted without a policy layer");
    for (const gap of plan.unavailable) {
      assert.ok(gap.reason.length > 0, `${gap.point} must explain itself`);
    }
  });

  /**
   * The finding this test was written to assert wrongly, and now asserts.
   *
   * A forward walk reports `closed` when it runs out of dependents it holds —
   * and it can close **perfectly over a fragment**, because a cause that is
   * named but not held is never stepped through: the walk goes the other way.
   *
   * So closure is not evidence of completeness, and a plan trusting it would let
   * a partial replica present a confident, short blast radius. The evidence of
   * fragmentary history is a dangling cause anywhere in the index.
   */
  test("a closed walk over partial history still raises D3", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const target = await journal.appendOne(note("a"));
    await journal.appendOne(derived("cites something we lack", [target.id, "01ABSENT"]));

    const plan = planErasure({
      events: await journal.readLane("pixel"),
      lane: "pixel",
      targets: [target.id],
    });

    assert.equal(plan.fallout.closed, true, "the forward walk genuinely did close");
    assert.ok(
      plan.unavailable.some((gap) => gap.point === "D3"),
      "and the plan still refuses to call the radius trustworthy",
    );
  });

  test("a closed radius does not raise D3", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const target = await journal.appendOne(note("a"));
    await journal.appendOne(derived("clean", [target.id]));

    const plan = planErasure({
      events: await journal.readLane("pixel"),
      lane: "pixel",
      targets: [target.id],
    });

    // The negative control: if D3 were raised unconditionally, the test above
    // would pass while proving nothing.
    assert.equal(plan.fallout.closed, true);
    assert.ok(!plan.unavailable.some((gap) => gap.point === "D3"));
  });
});

describe("what the owner is told about the residue and the holders", () => {
  test("D7 lists what an erased event still says about itself", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const target = await journal.appendOne(note("private"));

    const plan = planErasure({
      events: await journal.readLane("pixel"),
      lane: "pixel",
      targets: [target.id],
    });

    const [residue] = plan.residue;
    assert.ok(residue);
    assert.equal(residue.eventId, target.id);
    // Read off the event, so this shrinks by itself when `type`, `schema` and
    // `causes` move into the payload (§2b) rather than needing a doc update.
    assert.ok(residue.fields.includes("type"), "the type is visible today");
    assert.ok(residue.fields.includes("wallClock"), "and so is the timing");
    assert.ok(!residue.fields.includes("payload"), "the payload is what goes");
  });

  test("a peer claiming custody of the target is listed as needing to be told", async () => {
    const pixel = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const target = await pixel.appendOne(note("a"));

    const mac = await Journal.open({ lane: "mac", device: "mac-01" });
    await mac.replicate("pixel", await pixel.readLane("pixel"));
    await mac.appendOne(
      custodyReceiptDraft({ lane: "pixel", throughHash: target.integrity.hash, count: 1 }),
    );

    // The owner plans against everything it holds, its own lane included:
    // that is where another device's receipt arrives.
    const everything = [...(await mac.readLane("pixel")), ...(await mac.readLane("mac"))];
    const plan = planErasure({ events: everything, lane: "pixel", targets: [target.id] });

    assert.equal(plan.holders.length, 1);
    assert.equal(plan.holders[0]?.holder, "mac-01");
    assert.ok(decisionsRequired(plan).includes("D5"));
  });

  test("E1 leaves witnesses undisturbed", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const target = await journal.appendOne(note("a"));

    const plan = planErasure({
      events: await journal.readLane("pixel"),
      lane: "pixel",
      targets: [target.id],
    });

    // No hash, height or count changes, so an attestation taken before the
    // erasure still reconciles afterwards. True by the ruling, not measured —
    // and it stops being true at E2 or E3, which are forbidden.
    assert.equal(plan.witnessesAffected, false);
  });
});

describe("the decisions the owner is asked for", () => {
  test("are ordered, deduplicated, and always include the gaps", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const [target, other] = await journal.append([note("target"), note("other")]);
    assert.ok(target && other);
    await journal.appendOne(derived("sole", [target.id]));
    await journal.appendOne(derived("partial", [target.id, other.id]));

    const plan = planErasure({
      events: await journal.readLane("pixel"),
      lane: "pixel",
      targets: [target.id],
    });
    const required = decisionsRequired(plan);

    assert.deepEqual(required, [...new Set(required)], "no duplicates");
    assert.deepEqual(required, [...required].sort(), "in D-order");
    for (const point of ["D1", "D2", "D3", "D4", "D6", "D7"]) {
      assert.ok(required.includes(point as never), `${point} must be asked`);
    }
  });

  test("planning is a pure read: it cannot append to a journal", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const target = await journal.appendOne(note("a"));
    const before = (await journal.readLane("pixel")).length;

    planErasure({
      events: await journal.readLane("pixel"),
      lane: "pixel",
      targets: [target.id],
    });

    // §2b: the preview may be rich, the record must stay bare. The function
    // takes events rather than a journal, so journaling the preview is not
    // something a caller can do by accident.
    assert.equal((await journal.readLane("pixel")).length, before);
  });
});
