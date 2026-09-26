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
  type ErasurePlan,
  grantCovers,
  grantFor,
  planDigest,
  Journal,
  custodyReceiptDraft,
  decisionsRequired,
  planErasure,
  type EventDraft,
} from "../src/index.js";

const SCHEMA = { id: "test.note", version: 1 } as const;
const note = (text: string): EventDraft => ({ type: "note", schema: SCHEMA, payload: { text } });
const CONCLUSION = { id: "test.conclusion", version: 1 } as const;
const derived = (text: string, causes: readonly string[]): EventDraft => ({
  type: "conclusion",
  schema: CONCLUSION,
  payload: { text },
  causes,
});

/**
 * What a caller that can read payloads knows and the journal cannot.
 *
 * A v2 envelope says only *content* (`ERASURE.md` §2b), so the journal cannot
 * tell an observation — which legitimately cites nothing — from a conclusion,
 * which must cite something. This is the layer that can, modelled as the real
 * one would be: it reads the presented event's real type.
 */
const isDerived = (event: { readonly type: string }): boolean =>
  event.type === "conclusion";

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
    // D9 is D4's twin and the newer trap. Attachments are where the sensitive
    // content actually lives, and erasure does not reach them (`ERASURE.md`
    // §2c). A plan that omitted the question would let an owner erase an entry
    // believing the photograph went with it.
    assert.ok(points.includes("D9"), "attachments cannot be checked and must say so");
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

  test("a closed radius over checked lineage does not raise D3", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const target = await journal.appendOne(note("a"));
    await journal.appendOne(derived("clean", [target.id]));

    const plan = planErasure({
      events: await journal.readLane("pixel"),
      lane: "pixel",
      targets: [target.id],
      derived: isDerived,
    });

    // The negative control: if D3 were raised unconditionally, the tests above
    // would pass while proving nothing.
    assert.equal(plan.fallout.closed, true);
    assert.deepEqual(plan.fallout.ungrounded, []);
    assert.ok(!plan.unavailable.some((gap) => gap.point === "D3"));
  });

  /**
   * `ERASURE.md` §3: *"if one derivation exists whose inputs were not recorded,
   * erasure is a lie."*
   *
   * The walk still closes — there is nothing to walk to — so closure cannot
   * catch this, and the radius comes back short while looking complete. That is
   * the dangerous direction: an owner erases believing they tore everything
   * down. Unlike a dangling cause, syncing never repairs it.
   */
  test("a derivation that recorded no inputs makes the radius a lower bound", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const target = await journal.appendOne(note("a"));
    await journal.appendOne(derived("cites nothing at all", []));

    const plan = planErasure({
      events: await journal.readLane("pixel"),
      lane: "pixel",
      targets: [target.id],
      derived: isDerived,
    });

    assert.equal(plan.fallout.closed, true, "the walk closes; that is the trap");
    assert.equal(plan.fallout.ids.length, 0, "and finds nothing built on the target");
    assert.equal(plan.fallout.ungrounded.length, 1, "but one derivation records no inputs");

    const d3 = plan.unavailable.find((gap) => gap.point === "D3");
    assert.ok(d3, "so the radius must not be presented as an answer");
    assert.match(d3.reason, /record no inputs/);
    assert.ok(decisionsRequired(plan).includes("D3"));
  });

  test("an observation that cites nothing is not a defect", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const target = await journal.appendOne(note("a"));
    await journal.appendOne(note("an unrelated observation, citing nothing"));

    const plan = planErasure({
      events: await journal.readLane("pixel"),
      lane: "pixel",
      targets: [target.id],
      derived: isDerived,
    });

    // The distinction the whole check rests on. An observation legitimately
    // cites nothing; a conclusion citing nothing is a broken lineage. Counting
    // both would make the warning meaningless and it would be ignored.
    assert.deepEqual(plan.fallout.ungrounded, []);
    assert.ok(!plan.unavailable.some((gap) => gap.point === "D3"));
  });

  /**
   * Saying nothing because nobody asked is not the same as saying there is
   * nothing — the fifth time that distinction has decided a design here.
   */
  test("a plan given no way to tell says so rather than implying a clean radius", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const target = await journal.appendOne(note("a"));
    await journal.appendOne(derived("clean", [target.id]));

    const plan = planErasure({
      events: await journal.readLane("pixel"),
      lane: "pixel",
      targets: [target.id],
    });

    assert.equal(plan.fallout.closed, true);
    const d3 = plan.unavailable.find((gap) => gap.point === "D3");
    assert.ok(d3, "no `derived` means the check did not run, and that must be said");
    assert.match(d3.reason, /no caller said which events are derivations/);
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
    for (const point of ["D1", "D2", "D3", "D4", "D6", "D7", "D9"]) {
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

/**
 * `CLAIMS.md` C1 route A4 — *get approval for a dry run, then change an
 * argument* — for the one action where the argument is a whole picture.
 *
 * Not an authorization system. There is no Capability plane in this repository
 * and two rulings in `CLAIMS.md` §5 block C1; this is the piece that needs
 * neither, because whatever gate is built later has to bind to something.
 */
describe("an authorization binds to the exact plan it was given for", () => {
  const plan = async (journal: Journal, targets: readonly string[]) =>
    planErasure({
      events: await journal.readLane("pixel"),
      lane: "pixel",
      targets,
      derived: isDerived,
    });

  test("the same plan is covered", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const target = await journal.appendOne(note("a"));
    const shown = await plan(journal, [target.id]);

    const grant = grantFor(shown, 1_000);
    const check = grantCovers(await plan(journal, [target.id]), grant, 5_000);
    assert.equal(check.ok, true);
    assert.equal(check.ageMs, 4_000, "the age is reported for the open ruling to use");
  });

  test("a different target is a different plan", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const [a, b] = await journal.append([note("a"), note("b")]);
    assert.ok(a && b);

    const grant = grantFor(await plan(journal, [a.id]), 1_000);
    const check = grantCovers(await plan(journal, [b.id]), grant, 1_000);
    assert.equal(check.ok, false);
    assert.match(check.reason ?? "", /given for a different plan/);
  });

  /**
   * The case A4 exists for, arriving from the world rather than an adversary.
   *
   * Nothing was tampered with: a derivation was appended between the preview and
   * the act, and it cites the target. The blast radius is now larger than the one
   * the owner saw, so their approval was consent to a smaller act than the one
   * about to happen.
   */
  test("a derivation appearing after approval voids the grant", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const target = await journal.appendOne(note("a"));
    const shown = await plan(journal, [target.id]);
    const grant = grantFor(shown, 1_000);
    assert.equal(shown.fallout.ids.length, 0, "nothing was built on it when shown");

    await journal.appendOne(derived("appeared after the owner looked", [target.id]));

    const now = await plan(journal, [target.id]);
    assert.equal(now.fallout.ids.length, 1, "and something is now");
    assert.equal(grantCovers(now, grant, 2_000).ok, false);
  });

  test("an unrelated append does not void a grant", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const target = await journal.appendOne(note("a"));
    const grant = grantFor(await plan(journal, [target.id]), 1_000);

    // The negative control, and the reason `scope` is not in the digest: a
    // device writing a heartbeat a minute would otherwise void every grant
    // within sixty seconds, protecting nothing `fallout` does not already cover.
    await journal.appendOne(note("an unrelated observation"));

    assert.equal(grantCovers(await plan(journal, [target.id]), grant, 2_000).ok, true);
  });

  test("a question the owner could not answer appearing is a different plan", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const target = await journal.appendOne(note("a"));
    const grant = grantFor(await plan(journal, [target.id]), 1_000);

    // D3 was absent when shown; an ungrounded derivation raises it. The owner
    // approved a plan that claimed a trustworthy radius, and this one does not.
    await journal.appendOne(derived("cites nothing", []));

    const now = await plan(journal, [target.id]);
    assert.ok(now.unavailable.some((gap) => gap.point === "D3"));
    assert.equal(grantCovers(now, grant, 2_000).ok, false);
  });

  test("the digest is stable across reordering, so it pins content and not order", async () => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const [a, b] = await journal.append([note("a"), note("b")]);
    assert.ok(a && b);

    assert.equal(
      planDigest(await plan(journal, [a.id, b.id])),
      planDigest(await plan(journal, [b.id, a.id])),
    );
  });
});

/**
 * Which fields the digest covers, one at a time.
 *
 * The tests above were written first and two negative controls walked straight
 * through them: blanking `fallout.ids` in the digest, and blanking the set of
 * unanswerable points, broke nothing. Both passed for a reason other than the
 * one they name, because appending a derivation changes several covered fields
 * at once and any one of them is enough to shift the hash.
 *
 * So the coverage is asserted directly instead: take one plan, change exactly
 * one field, and require the digest to move. A field that can be blanked
 * without failing anything is a field the grant does not really bind to.
 */
describe("the digest covers each part of the decision independently", () => {
  const base = async (): Promise<ErasurePlan> => {
    const journal = await Journal.open({ lane: "pixel", device: "pixel-01" });
    const target = await journal.appendOne(note("a"));
    await journal.appendOne(derived("built on it", [target.id]));
    return planErasure({
      events: await journal.readLane("pixel"),
      lane: "pixel",
      targets: [target.id],
      derived: isDerived,
    });
  };

  const mutations: ReadonlyArray<readonly [string, (p: ErasurePlan) => ErasurePlan]> = [
    ["targets", (p) => ({ ...p, targets: [...p.targets, "01OTHER"] })],
    ["fallout.ids", (p) => ({ ...p, fallout: { ...p.fallout, ids: [] } })],
    ["fallout.closed", (p) => ({ ...p, fallout: { ...p.fallout, closed: !p.fallout.closed } })],
    ["fallout.unresolved", (p) => ({ ...p, fallout: { ...p.fallout, unresolved: ["01GONE"] } })],
    ["fallout.ungrounded", (p) => ({ ...p, fallout: { ...p.fallout, ungrounded: ["01BLIND"] } })],
    ["soleSupport", (p) => ({ ...p, soleSupport: [] })],
    ["partialSupport", (p) => ({ ...p, partialSupport: ["01PARTIAL"] })],
    ["residue", (p) => ({ ...p, residue: [] })],
    ["holders", (p) => ({ ...p, holders: [{ holder: "mac-01", receipt: { lane: "pixel", throughHash: "h", count: 1 } }] })],
    ["witnessesAffected", (p) => ({ ...p, witnessesAffected: !p.witnessesAffected })],
    ["unavailable", (p) => ({ ...p, unavailable: [] })],
  ];

  for (const [field, mutate] of mutations) {
    test(`changing ${field} changes the digest`, async () => {
      const plan = await base();
      assert.notEqual(planDigest(mutate(plan)), planDigest(plan));
    });
  }

  test("changing scope alone does not, and that is deliberate", async () => {
    const plan = await base();
    // A device writing a heartbeat a minute would otherwise void every grant
    // within sixty seconds. `fallout` already covers the change that matters:
    // a new derivation citing a target moves the radius.
    const wider = { ...plan, scope: plan.scope + 500 };
    assert.equal(planDigest(wider), planDigest(plan));
  });

  test("rewording an explanation does not, and that is deliberate too", async () => {
    const plan = await base();
    const reworded = {
      ...plan,
      unavailable: plan.unavailable.map((gap) => ({ ...gap, reason: "reworded entirely" })),
    };
    // The owner answered a set of questions, not a set of sentences. Editing an
    // explanation must not invalidate a live grant.
    assert.equal(planDigest(reworded), planDigest(plan));
  });
});
