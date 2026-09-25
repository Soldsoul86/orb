/**
 * Lineage: reading `causes` forwards.
 *
 * `docs/ERASURE.md` §3. Erasing an event does not erase what was built on it,
 * so before anything is destroyed the system has to answer *"what was built on
 * this?"* — and it answers it from the citations events already carry, never
 * from a stored graph. The operator ruled the journal entries are the only
 * trace that exists; an index on disk would be a second trail outliving them.
 *
 * The tests that matter most here are the ones about **not** knowing: a
 * traversal over partial history must say so rather than return a confident
 * subset, because an erasure planned against a silently-short answer tears down
 * some derivations and leaves others standing.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  Journal,
  ancestorsOf,
  descendantsOf,
  indexLineage,
  type EventDraft,
  type StoredEvent,
} from "../src/index.js";

const SCHEMA = { id: "test.note", version: 1 } as const;

const note = (text: string): EventDraft => ({ type: "note", schema: SCHEMA, payload: { text } });

const derived = (text: string, causes: readonly string[]): EventDraft => ({
  type: "note",
  schema: SCHEMA,
  payload: { text },
  causes,
});

async function lane(): Promise<Journal> {
  return Journal.open({ lane: "pixel", device: "pixel-01" });
}

describe("reading causes forwards", () => {
  test("finds what was built directly on an event", async () => {
    const journal = await lane();
    const [a, b] = await journal.append([note("a"), note("b")]);
    assert.ok(a && b);
    const conclusion = await journal.appendOne(derived("both", [a.id, b.id]));

    const index = indexLineage(await journal.readLane("pixel"));
    assert.deepEqual(index.dependentsOf(a.id), [conclusion.id]);
    assert.deepEqual(index.dependentsOf(b.id), [conclusion.id]);
    assert.deepEqual(index.dependentsOf(conclusion.id), [], "nothing was built on it yet");
  });

  test("follows a chain of derivations to the end", async () => {
    const journal = await lane();
    const seed = await journal.appendOne(note("seed"));
    const first = await journal.appendOne(derived("first", [seed.id]));
    const second = await journal.appendOne(derived("second", [first.id]));
    const third = await journal.appendOne(derived("third", [second.id]));

    const index = indexLineage(await journal.readLane("pixel"));
    const fallout = descendantsOf(index, [seed.id]);

    assert.deepEqual(fallout.ids, [first.id, second.id, third.id]);
    assert.equal(fallout.closed, true);
    assert.equal(fallout.scope, 4);
  });

  test("reaches only what actually used the event", async () => {
    const journal = await lane();
    const [target, unrelated] = await journal.append([note("target"), note("unrelated")]);
    assert.ok(target && unrelated);
    const fromTarget = await journal.appendOne(derived("uses target", [target.id]));
    const fromOther = await journal.appendOne(derived("uses other", [unrelated.id]));

    const index = indexLineage(await journal.readLane("pixel"));
    const fallout = descendantsOf(index, [target.id]);

    // Without this the answer would be "everything", which is not a blast
    // radius, it is a refusal to compute one.
    assert.deepEqual(fallout.ids, [fromTarget.id]);
    assert.ok(!fallout.ids.includes(fromOther.id));
  });

  test("a conclusion drawn from two erased roots is reported once", async () => {
    const journal = await lane();
    const [a, b] = await journal.append([note("a"), note("b")]);
    assert.ok(a && b);
    const conclusion = await journal.appendOne(derived("both", [a.id, b.id]));

    const index = indexLineage(await journal.readLane("pixel"));
    const fallout = descendantsOf(index, [a.id, b.id]);
    assert.deepEqual(fallout.ids, [conclusion.id]);
  });

  test("roots are not reported as their own fallout", async () => {
    const journal = await lane();
    const seed = await journal.appendOne(note("seed"));
    const index = indexLineage(await journal.readLane("pixel"));

    const fallout = descendantsOf(index, [seed.id]);
    assert.deepEqual(fallout.ids, [], "nothing was built on it");
    assert.equal(fallout.closed, true);
  });
});

describe("an answer over partial history says so", () => {
  test("a cause the index does not hold leaves the walk unclosed", async () => {
    const journal = await lane();
    const seed = await journal.appendOne(note("seed"));
    const conclusion = await journal.appendOne(derived("from elsewhere", [seed.id, "01ABSENT"]));

    const index = indexLineage(await journal.readLane("pixel"));
    assert.ok(index.unresolvedCauses.has("01ABSENT"));

    const back = ancestorsOf(index, [conclusion.id]);
    assert.equal(back.closed, false, "we cannot see everything this was built on");
    assert.deepEqual(back.unresolved, ["01ABSENT"]);
    assert.deepEqual(back.ids, [seed.id], "what is visible is still reported");
  });

  test("a root the index does not hold is unresolved, not silently empty", async () => {
    const journal = await lane();
    await journal.appendOne(note("a"));

    const index = indexLineage(await journal.readLane("pixel"));
    const fallout = descendantsOf(index, ["01NOTHERE"]);

    // The dangerous answer is `ids: []` with `closed: true` — indistinguishable
    // from "nothing was built on it", and an erasure planned on that tears
    // down nothing while believing it tore down everything.
    assert.deepEqual(fallout.ids, []);
    assert.equal(fallout.closed, false);
    assert.deepEqual(fallout.unresolved, ["01NOTHERE"]);
  });

  test("the scope of the answer is always reported", async () => {
    const journal = await lane();
    await journal.append([note("a"), note("b"), note("c")]);
    const index = indexLineage(await journal.readLane("pixel"));
    assert.equal(descendantsOf(index, []).scope, 3);
  });
});

describe("provenance still works, because an entry may describe itself", () => {
  test("ancestors walk back through a chain", async () => {
    const journal = await lane();
    const seed = await journal.appendOne(note("seed"));
    const first = await journal.appendOne(derived("first", [seed.id]));
    const second = await journal.appendOne(derived("second", [first.id]));

    const index = indexLineage(await journal.readLane("pixel"));
    const back = ancestorsOf(index, [second.id]);
    assert.deepEqual(back.ids, [first.id, seed.id]);
    assert.equal(back.closed, true);
  });

  test("an envelope hash resolves to its event, for erasure declarations", async () => {
    const journal = await lane();
    const event = await journal.appendOne(note("a"));
    const index = indexLineage(await journal.readLane("pixel"));

    // Declarations reference the envelope hash, `causes` references the id.
    assert.equal(index.idForHash(event.integrity.hash), event.id);
    assert.equal(index.idForHash("not-a-hash"), undefined);
  });
});

describe("a malformed journal cannot hang the traversal", () => {
  test("a citation cycle terminates", () => {
    // Not reachable through `Journal.append`, which only ever cites earlier
    // events. Constructed directly, because a traversal that looped forever
    // would take down the erasure preview at the moment the owner waits on it.
    const cyclic = [
      { id: "A", causes: ["B"], integrity: { hash: "ha" } },
      { id: "B", causes: ["A"], integrity: { hash: "hb" } },
    ] as unknown as StoredEvent[];

    const index = indexLineage(cyclic);
    const fallout = descendantsOf(index, ["A"]);
    assert.deepEqual(fallout.ids, ["B"]);
    assert.equal(fallout.closed, true);
  });

  test("an event citing itself terminates", () => {
    const selfish = [
      { id: "A", causes: ["A"], integrity: { hash: "ha" } },
    ] as unknown as StoredEvent[];

    const index = indexLineage(selfish);
    assert.deepEqual(descendantsOf(index, ["A"]).ids, []);
  });
});
