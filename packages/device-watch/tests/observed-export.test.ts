/**
 * An export in which **the phone observed its own events** (`docs/PHONE_BRAIN.md` B2a).
 *
 * `tests/fixtures/observed-export.txt` is written by `tools/gen-observed-export.sh`: the phone's
 * real Kotlin brain and Java shell (`Observe.run`) over events the phone's own code kept. Three
 * captures/shares were observed by the phone; a fourth was kept *after* the pass, so it is not.
 *
 * What this checks is what only the other implementation can: that the hashes the Java side wrote
 * **with causes in them** verify here, that the Observations the phone wrote say what this side's
 * translation says, and that importing the file does not put a second Observation on any occurrence.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { Journal, MemoryJournalStore, unwrapPayload, verifyLane } from "@orb/journal";
import { readObservation, isObservation } from "@orb/observation";
import { importExport, parseExport, translateEvent } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = () => readFile(join(here, "../../tests/fixtures/observed-export.txt"), "utf8");
const desk = () => Journal.open({ lane: "mac", device: "mac-01", store: new MemoryJournalStore() });

const TRANSLATED = ["orb.assist.captured", "orb.shared"];

describe("what the phone wrote when it observed itself", () => {
  test("verifies under the TypeScript verifier, causes and all", async () => {
    const events = parseExport(await fixture());
    assert.doesNotThrow(() => verifyLane(events));
  });

  test("three Observations, each citing exactly one kept event", async () => {
    const events = parseExport(await fixture());
    const observations = events.filter(isObservation);
    assert.equal(observations.length, 3);
    const ids = new Set(events.map((e) => e.id));
    for (const o of observations) {
      assert.equal(o.causes?.length, 1, "an Observation cites its cause");
      assert.ok(ids.has(o.causes![0]!), "and the cause is an event in the lane");
      const cause = events.find((e) => e.id === o.causes![0])!;
      assert.ok(TRANSLATED.includes(cause.type), `${cause.type} is a type the phone observes`);
    }
    assert.equal(new Set(observations.map((o) => o.causes![0])).size, 3, "one Observation per event");
  });

  test("each says exactly what this side's translation says of its cause", async () => {
    const events = parseExport(await fixture());
    for (const o of events.filter(isObservation)) {
      const cause = events.find((e) => e.id === o.causes![0])!;
      const expected = translateEvent(cause.type, cause.device, unwrapPayload((cause as never as { payload: never }).payload));
      assert.deepEqual(readObservation(o), expected);
    }
  });

  test("the kept event after the pass is not yet observed, and nothing else is missing", async () => {
    const events = parseExport(await fixture());
    const cited = new Set(events.filter(isObservation).flatMap((o) => o.causes ?? []));
    const unobserved = events.filter((e) => TRANSLATED.includes(e.type) && !cited.has(e.id));
    assert.equal(unobserved.length, 1);
    assert.equal(unobserved[0]!.type, "orb.assist.captured");
    assert.equal(events.at(-1)!.id, unobserved[0]!.id, "it is the last event");
  });

  test("contains no word of what the screens said", async () => {
    const text = await fixture();
    for (const secret of ["priya", "invoice", "lift code", "4471", "9pm", "one more thing"]) {
      assert.ok(!text.includes(secret), `"${secret}" must not appear anywhere in the export`);
    }
  });

  test("an Observation holds the app and counts in the clear, and the text only by identity", async () => {
    const events = parseExport(await fixture());
    const capture = events.filter(isObservation).map((o) => readObservation(o)!).find((o) => o.source.startsWith("orb.sensor.assist"))!;
    assert.match(capture.attachments![0]!, /^sha256:[0-9a-f]{64}$/);
    assert.equal((capture.data as unknown as Record<string, unknown>)["package"], "com.example.chat");
    assert.equal(Object.keys(capture).sort().join(), "attachments,confidencePercent,data,source");
  });
});

describe("importing it", () => {
  test("translates only what the phone had not observed — no second Observation on any occurrence", async () => {
    const j = await desk();
    const result = await importExport(j, await fixture());
    assert.equal(result.replicated, 10);
    assert.equal(result.observed, 1, "only the event kept after the pass");

    const cites = new Map<string, number>();
    for (const lane of [j.lane, ...result.lanes]) {
      for (const event of await j.readLane(lane)) {
        if (readObservation(event) === null) continue;
        for (const cause of event.causes ?? []) cites.set(cause, (cites.get(cause) ?? 0) + 1);
      }
    }
    assert.equal(cites.size, 4, "four occurrences, each observed");
    for (const [cause, n] of cites) assert.equal(n, 1, `${cause} is cited by exactly one Observation`);
  });

  test("importing again is a no-op", async () => {
    const j = await desk();
    await importExport(j, await fixture());
    const again = await importExport(j, await fixture());
    assert.equal(again.replicated, 0);
    assert.equal(again.observed, 0);
  });

  test("an export from a build that writes none is translated here as before", async () => {
    const j = await desk();
    const old = await readFile(join(here, "../../tests/fixtures/assist-export.txt"), "utf8");
    const result = await importExport(j, old);
    assert.equal(result.observed, 3);
  });
});
