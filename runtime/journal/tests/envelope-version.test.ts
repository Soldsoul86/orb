/**
 * Two envelope formats, one journal, forever.
 *
 * `docs/ERASURE.md` §2b moved `type`, `schema` and `causes`; §2a wrapped the
 * payload. All four change the hash preimage — and the operator's phone holds
 * 1475 events written under the old rule which Art. I forbids editing and the
 * E2/E3 ruling forbids removing (`DEVICE_LOOP.md` §0).
 *
 * So the journal contains both formats permanently, and the only question that
 * matters is whether a reader can always tell which rule applies. These tests
 * are about that, and about the two ways it could be got wrong: a v1 hash
 * changing, and a version that can be talked out of itself.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  ENVELOPE_VERSION,
  envelopeVersion,
  hashEvent,
  eventPreimage,
  type EnvelopePreimageInput,
} from "../src/index.js";

const BASE = {
  id: "01M3B90CADNB1PH0FQS6ZHQV5S",
  lane: "pixel",
  device: "Pixel 10a/stallion",
  hlc: { physical: 1790300066000, counter: 3 },
  wallClock: 1790300066000,
  type: "probe.heartbeat",
  causes: [] as readonly string[],
  schema: { id: "probe.heartbeat", version: 1 },
  payloadHash: "a5ca9c155c3f1b6c5bfbe82849ce74d0b508162d8316212d446266bdbe2e24d1",
  previous: null,
} satisfies EnvelopePreimageInput;

describe("absent means 1, and that is a definition rather than a default", () => {
  test("an envelope with no version is version 1", () => {
    assert.equal(envelopeVersion({}), 1);
    assert.equal(envelopeVersion({ v: 2 }), 2);
    // A value nobody wrote is still not version 2. Strict optional types make
    // `{ v: undefined }` unconstructible here, which is the compiler agreeing.
    assert.equal(envelopeVersion(JSON.parse('{"v":null}') as { v?: number }), 1);
  });

  test("a v1 hash is unchanged by the existence of versioning", () => {
    // The pinned value from `tests/vectors.json`, which the phone's Java
    // encoder also produces. If this ever moves, every event on the device
    // becomes unverifiable and nothing can repair them.
    assert.equal(
      hashEvent(BASE),
      "dce6c5bbf93be24367d7839fe897b99874f99899a286d5299745d3ba64549803",
    );
  });

  test("v1 writes no version field at all", () => {
    // Writing `v: 1` would have been tidier and would have changed every
    // existing hash, which is the one thing this mechanism exists to avoid.
    assert.ok(!eventPreimage(BASE).includes('"v"'));
  });
});

describe("version 2 is a different rule, and says so", () => {
  test("it drops causes and schema from the preimage", () => {
    const preimage = eventPreimage({ ...BASE, v: 2 });
    // Keys are sorted, so `v` sits between `type` and `wallClock` rather than
    // leading. Its position is not the point; its presence in the bytes is.
    assert.ok(preimage.includes('"v":2'), "the version is inside the preimage");
    assert.ok(!preimage.includes('"causes"'), "causes live in the payload now");
    assert.ok(!preimage.includes('"schema"'), "and so does schema");
    assert.ok(preimage.includes('"payloadHash"'), "still committed to, through this");
  });

  test("the same fields hash differently under the two rules", () => {
    assert.notEqual(hashEvent(BASE), hashEvent({ ...BASE, v: 2 }));
  });

  test("causes and schema no longer affect a v2 hash", () => {
    // Because they are not in the preimage. They are committed to through the
    // payload instead, so erasing a payload erases the stated lineage with it —
    // the operator's ruling, not a side effect.
    const withCauses = { ...BASE, v: 2 as const, causes: ["01SOMETHINGELSE"] };
    const withSchema = { ...BASE, v: 2 as const, schema: { id: "other", version: 9 } };
    assert.equal(hashEvent({ ...BASE, v: 2 }), hashEvent(withCauses));
    assert.equal(hashEvent({ ...BASE, v: 2 }), hashEvent(withSchema));
  });

  test("they still affect a v1 hash, so old events keep their meaning", () => {
    // The negative control. If this passed the same way, the dispatch would not
    // be doing anything and every test above would prove nothing.
    assert.notEqual(hashEvent(BASE), hashEvent({ ...BASE, causes: ["01SOMETHINGELSE"] }));
  });
});

describe("the version cannot be talked out of itself", () => {
  test("changing it changes the hash", () => {
    // `v` is inside the preimage precisely so this is true. Outside it, an
    // attacker could flip the field and make a verifier apply the wrong rule —
    // and a v2 event re-read as v1 would have its causes and schema back in
    // the preimage, which is a different event entirely.
    const v2 = hashEvent({ ...BASE, v: 2 });
    const downgraded = hashEvent(BASE);
    assert.notEqual(v2, downgraded);
  });

  test("the current version is 2, so new events are written the new way", () => {
    assert.equal(ENVELOPE_VERSION, 2);
  });
});
