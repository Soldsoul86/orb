/**
 * What the phone's assistant keeps, read by the TypeScript side.
 *
 * `tests/fixtures/assist-export.txt` is **written by `Capture.remember` and `Erase.execute`**
 * (`tools/gen-assist-export.sh`) against real keys on a temp disk: a screen kept, the same
 * screen kept again, a different one, both citations of the first erased, and the same text
 * then refused. The inputs are an invented conversation; the point of the first test is that
 * **none of its words are in the file** — the clear record was designed to be clear of content,
 * and this is the check that it is.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { Journal, MemoryJournalStore, erasedHashes, unwrapPayload, verifyLane } from "@orb/journal";
import { readObservation, type Observation } from "@orb/observation";
import {
  ASSIST_FIELDS_ATTACHED,
  ASSIST_FIELDS_EXCLUDED,
  ASSIST_FIELDS_MAPPED,
  ASSIST_SENSOR,
  importExport,
  parseExport,
  type AssistReading,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = () => readFile(join(here, "../../tests/fixtures/assist-export.txt"), "utf8");
const desk = () => Journal.open({ lane: "mac", device: "mac-01", store: new MemoryJournalStore() });

async function captures(journal: Journal): Promise<readonly Observation<AssistReading>[]> {
  const out: Observation<AssistReading>[] = [];
  for (const event of await journal.readLane("mac")) {
    const observation = readObservation(event);
    if (observation !== null && observation.source.startsWith(ASSIST_SENSOR)) {
      out.push(observation as Observation<AssistReading>);
    }
  }
  return out;
}

describe("an export in which the phone's assistant kept screens", () => {
  test("verifies under the TypeScript verifier", async () => {
    const events = parseExport(await fixture());
    assert.doesNotThrow(() => verifyLane(events));
  });

  test("contains no word of what the screens said, and no page address", async () => {
    const text = await fixture();
    for (const secret of ["meet ravi", "bring the contract", "example.test", "different screen"]) {
      assert.ok(!text.includes(secret), `"${secret}" must not appear anywhere in the export`);
    }
  });

  test("a decline names a reason and a build, never an app", async () => {
    const declined = parseExport(await fixture()).filter((event) => event.type === "orb.assist.declined");
    assert.equal(declined.length, 1);
    const payload = unwrapPayload(declined[0]!.payload) as Record<string, unknown>;
    assert.deepEqual(Object.keys(payload).sort(), ["reason", "versionCode"]);
  });

  test("a refused re-keep is a failure that names no app", async () => {
    const failed = parseExport(await fixture()).filter((event) => event.type === "orb.assist.captureFailed");
    assert.equal(failed.length, 1);
    const payload = unwrapPayload(failed[0]!.payload) as Record<string, unknown>;
    assert.deepEqual(Object.keys(payload).sort(), ["outcome", "versionCode"]);
    assert.equal(payload["outcome"], "erased");
  });

  test("both citations of the first screen are declared erased; the other screen is not", async () => {
    const events = parseExport(await fixture());
    const kept = events.filter((event) => event.type === "orb.assist.captured");
    assert.equal(kept.length, 3);
    const erased = erasedHashes(events);
    assert.equal(erased.size, 2);
    assert.ok(erased.has(kept[0]!.integrity.hash));
    assert.ok(erased.has(kept[1]!.integrity.hash));
    assert.ok(!erased.has(kept[2]!.integrity.hash));
  });
});

describe("each capture becomes one Observation, and nothing else does", () => {
  test("three captures are observed; declines, grants, erasures and failures are Events", async () => {
    const j = await desk();
    const result = await importExport(j, await fixture());
    assert.equal(result.replicated, 9);
    assert.equal(result.observed, 3);
    assert.equal((await captures(j)).length, 3);
  });

  test("attributed to the assist sensor at the install, certain of the occurrence", async () => {
    const j = await desk();
    await importExport(j, await fixture());
    const [first] = await captures(j);
    assert.match(first!.source, /^orb\.sensor\.assist@orb-/);
    assert.equal(first!.confidencePercent, 100);
  });

  test("the sealed text is cited by identity and never inlined", async () => {
    const j = await desk();
    await importExport(j, await fixture());
    const all = await captures(j);
    for (const observation of all) {
      assert.equal(observation.attachments?.length, 1);
      assert.match(observation.attachments![0]!, /^sha256:[0-9a-f]{64}$/);
      assert.equal((observation.data as unknown as Record<string, unknown>)["attachment"], undefined);
    }
    assert.equal(all[0]!.attachments![0], all[1]!.attachments![0], "the same screen kept twice is one Attachment");
    assert.notEqual(all[0]!.attachments![0], all[2]!.attachments![0]);
  });

  test("the data carries what the phone wrote, under its names", async () => {
    const j = await desk();
    await importExport(j, await fixture());
    const [first, second, third] = await captures(j);
    assert.equal(first!.data.because, "user.remembered");
    assert.equal(first!.data.package, "com.example.chat");
    assert.equal(first!.data.textNodes, 2);
    assert.equal(first!.data.webUri, true);
    assert.equal(first!.data.resolveOutcome, "stored");
    assert.equal(second!.data.resolveOutcome, "held", "the same screen again is held, not written again");
    assert.equal(third!.data.webUri, false);
  });

  test("importing it again is a no-op", async () => {
    const j = await desk();
    await importExport(j, await fixture());
    const again = await importExport(j, await fixture());
    assert.equal(again.replicated, 0);
    assert.equal(again.observed, 0);
  });
});

describe("the importer and the phone agree about every field", () => {
  const accounted = new Set<string>([
    ...ASSIST_FIELDS_MAPPED,
    ...ASSIST_FIELDS_ATTACHED,
    ...ASSIST_FIELDS_EXCLUDED,
  ]);

  test("a field the phone writes in a capture is one the importer has decided about", async () => {
    const source = await readFile(join(here, "../../../../apps/pixel/orb/src/AssistFacts.java.in"), "utf8");
    const start = source.lastIndexOf("static Map<String, Object> captured("); // the overload that builds the record
    const body = source.slice(start, source.indexOf("\n    }\n", start));
    const written = new Set([...body.matchAll(/p\.put\("([A-Za-z]+)"/g)].map((match) => match[1]!));
    assert.ok(written.size >= 8, `expected to find the phone's fields, found ${written.size}`);
    for (const key of written) {
      assert.ok(accounted.has(key), `AssistFacts.java.in writes "${key}" and the importer has not decided what to do with it`);
    }
    for (const key of accounted) assert.ok(written.has(key), `"${key}" is mapped but the phone never writes it`);
  });
});
