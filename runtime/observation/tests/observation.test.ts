/**
 * Observations — `contracts/Observation.md`.
 *
 * The contract ends §7 with three things **never permitted**: an unattributed
 * Observation, mutating or deleting a recorded one, and asserting truth from
 * within one. The first is enforceable at the boundary and is tested here. The
 * second is the journal's (Art. I). The third is not a check but a shape — there
 * is no field in which to put a verdict.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { Journal, MemoryJournalStore, hasPayload, type OrbEvent } from "@orb/journal";
import {
  InvalidObservation,
  OBSERVATION_TYPE,
  confidenceFromPercent,
  isObservation,
  observationDraft,
  percentFromConfidence,
  readObservation,
  type Observation,
} from "../src/index.js";

const gps: Observation<{ lat: string; lon: string }> = {
  source: "sensor.gps",
  confidencePercent: 97,
  data: { lat: "12.97", lon: "77.59" },
};

async function journal() {
  return Journal.open({ lane: "pixel", device: "pixel-01", store: new MemoryJournalStore() });
}

describe("an Observation is always attributed", () => {
  test("a source is required, and there is no default for it", () => {
    // inv. 3. Only the caller knows what perceived this, so there is no honest
    // repair here — refusing is the whole of the handling.
    assert.throws(
      () => observationDraft({ ...gps, source: "" }),
      InvalidObservation,
    );
    assert.throws(() => observationDraft({ ...gps, source: "   " }), /unattributed/);
  });

  test("an import is a source, without inventing a Sensor", () => {
    // "The source is a value, not a dependency on the Sensor contract."
    const draft = observationDraft({ ...gps, source: "import.takeout-2019" });
    assert.equal(draft.type, OBSERVATION_TYPE);
  });
});

describe("confidence is carried as an integer, and only as one", () => {
  test("a fraction is refused, because two encoders spell it differently", () => {
    assert.throws(
      () => observationDraft({ ...gps, confidencePercent: 0.97 }),
      /integer 0–100/,
    );
  });

  test("out of range is refused in both directions", () => {
    assert.throws(() => observationDraft({ ...gps, confidencePercent: -1 }), InvalidObservation);
    assert.throws(() => observationDraft({ ...gps, confidencePercent: 101 }), InvalidObservation);
  });

  test("the contract's own confidences all convert exactly", () => {
    // 0.97, 0.74, 0.41, 1.00 from §1; percent holds each with nothing to spare.
    for (const [confidence, percent] of [
      [0.97, 97],
      [0.74, 74],
      [0.41, 41],
      [1, 100],
      [0, 0],
    ] as const) {
      assert.equal(percentFromConfidence(confidence), percent);
      assert.equal(confidenceFromPercent(percent), confidence);
    }
  });

  test("a third decimal is refused rather than rounded away", () => {
    // Rounding 0.947 to 95 would hide a source claiming precision it never
    // measured. §4 calls these "proposals, not measurements".
    assert.throws(() => percentFromConfidence(0.947), /more than two decimals/);
    assert.throws(() => percentFromConfidence(0.001), InvalidObservation);
  });

  test("a confidence outside [0, 1] is not a confidence", () => {
    for (const bad of [-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(() => percentFromConfidence(bad), InvalidObservation);
    }
  });

  test("low confidence is kept faithfully, never dropped or upgraded", () => {
    // §7: uncertainty is never silently dropped, and never upgraded to certainty.
    const draft = observationDraft({ ...gps, source: "llm.extract", confidencePercent: 41 });
    assert.equal((draft.payload as Observation).confidencePercent, 41);
  });
});

describe("references, never copies", () => {
  test("an Attachment is cited by identity", () => {
    const draft = observationDraft({
      ...gps,
      attachments: ["sha256:" + "a".repeat(64)],
    });
    assert.equal((draft.payload as Observation).attachments?.length, 1);
  });

  test("something that is not a scheme-tagged identity is refused", () => {
    assert.throws(
      () => observationDraft({ ...gps, attachments: ["/var/photos/IMG_0001.jpg"] }),
      /scheme-tagged identity/,
    );
  });

  test("raw bytes anywhere in the data are refused, with where", async () => {
    // inv. 5 enforced rather than described. Inlined bytes would become part of
    // history: unerasable by releasing a key, and copied to every device that
    // holds the envelope.
    assert.throws(
      () => observationDraft({ ...gps, data: { photo: Buffer.from("jpeg") } }),
      /data\.photo/,
    );
    assert.throws(
      () => observationDraft({ ...gps, data: { frames: [{ body: new Uint8Array(4) }] } }),
      /data\.frames\[0\]\.body/,
    );
    assert.throws(
      () => observationDraft({ ...gps, data: { raw: new ArrayBuffer(8) } }),
      /data\.raw/,
    );
  });

  test("an identity-shaped string in the data is fine — it is a reference", () => {
    const draft = observationDraft({
      ...gps,
      data: { photo: "sha256:" + "b".repeat(64) },
    });
    assert.ok(draft);
  });
});

describe("recorded, and read back", () => {
  test("it round-trips through the journal with its lineage", async () => {
    const j = await journal();
    const [cause] = await j.append([
      { type: "orb.connector.call", schema: { id: "orb.connector.call", version: 1 }, payload: {} },
    ]);
    assert.ok(cause);

    const [event] = await j.append([observationDraft(gps, [cause.id])]);
    assert.ok(event);
    assert.equal(isObservation(event), true);

    const read = readObservation<{ lat: string }>(event);
    assert.equal(read?.source, "sensor.gps");
    assert.equal(read?.confidencePercent, 97);
    assert.equal(read?.data.lat, "12.97");
    assert.deepEqual(event.causes, [cause.id]);
  });

  test("a detached Observation reads as cannot-say, not as no observation", async () => {
    const j = await journal();
    const [event] = await j.append([observationDraft(gps)]);
    assert.ok(event);

    const { payload: _payload, ...envelope } = event as OrbEvent;
    const detached = { ...envelope, absence: "pruned" as const };

    assert.equal(hasPayload(detached), false);
    assert.equal(readObservation(detached), null);
    // Still an Observation, and still history: §7's missing-attachment rule
    // generalised — unresolved content never invalidates the record of it.
    assert.equal(isObservation(detached), true);
  });

  test("a superseding Observation is a new one; the old is untouched", async () => {
    // §2.4 and §3: a correction is never an edit. Both coexist and
    // interpretation decides.
    const j = await journal();
    const [first] = await j.append([observationDraft(gps)]);
    assert.ok(first);
    const [second] = await j.append([
      observationDraft({ ...gps, source: "sensor.wifi", confidencePercent: 74 }),
    ]);
    assert.ok(second);

    const lane = await j.readLane("pixel");
    const observations = lane.filter(isObservation);
    assert.equal(observations.length, 2, "both are in history");
    assert.equal(readObservation(observations[0]!)?.confidencePercent, 97, "the first is unchanged");
  });

  test("a non-Observation event is not read as one", async () => {
    const j = await journal();
    const [event] = await j.append([
      { type: "note", schema: { id: "note", version: 1 }, payload: { source: "x" } },
    ]);
    assert.ok(event);
    assert.equal(isObservation(event), false);
    assert.equal(readObservation(event), null);
  });
});
