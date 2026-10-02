/**
 * The phone's first action, read by the TypeScript side.
 *
 * `tests/fixtures/action-export.txt` is **written by `Remind` and `ActionFacts`** — the classes the phone runs — on real
 * keys (`tools/gen-action-export.sh`): a reminder confirmed with a sealed note and released, one not confirmed, one
 * withdrawn, one refused at the moment because Android's permission was gone, and the capability turned off and on
 * (`docs/GATE_PHONE.md` §4). The test asserts the lineage the gate promises, the **fields** each record may carry, and that
 * no word of a note is in the file; it never asserts an id.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { Journal, MemoryJournalStore, unwrapPayload, verifyLane } from "@orb/journal";
import { importExport, parseExport } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = () => readFile(join(here, "../../tests/fixtures/action-export.txt"), "utf8");

const FIELDS: Readonly<Record<string, readonly string[]>> = {
  "orb.action.intent": ["capability", "dueAtUtcMs", "version", "versionCode", "zone"],
  "orb.action.cancelled": ["capability", "reason", "version"],
  "orb.action.released": ["authorization", "capability", "lateMs", "version"],
  "orb.action.refused": ["capability", "reason", "version"],
  "orb.action.revoked": ["capability", "scope", "version"],
  "orb.action.allowed": ["capability", "version"],
};
const CONFIRMED_FIELDS = ["attachment", "attachmentBytes", "authorization", "capability", "dueAtUtcMs", "urgency", "version", "zone"];

async function events() {
  return parseExport(await fixture());
}

describe("an export in which the phone acted", () => {
  test("the lane verifies", async () => {
    const all = await events();
    assert.doesNotThrow(() => verifyLane(all));
  });

  test("every kind of record is there, and the whole chain, including what was stopped", async () => {
    const counts = new Map<string, number>();
    for (const e of await events()) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
    assert.equal(counts.get("orb.action.intent"), 4);
    assert.equal(counts.get("orb.action.confirmed"), 3);
    assert.equal(counts.get("orb.action.released"), 1);
    assert.equal(counts.get("orb.action.cancelled"), 1, "a cancel is recorded as a confirmation is");
    assert.equal(counts.get("orb.action.refused"), 1, "so is a refusal at the moment");
    assert.equal(counts.get("orb.action.revoked"), 2, "one withdrawn, and the capability turned off");
    assert.equal(counts.get("orb.action.allowed"), 1);
  });

  test("lineage is in `causes`: intents cite the item, confirmations their intent, outcomes their confirmation", async () => {
    const all = await events();
    const byId = new Map(all.map((e) => [e.id, e]));
    const share = all.find((e) => e.type === "orb.shared")!;
    for (const e of all) {
      const causes = e.causes ?? [];
      switch (e.type) {
        case "orb.action.intent":
          assert.deepEqual(causes, [share.id]);
          break;
        case "orb.action.confirmed":
        case "orb.action.cancelled":
          assert.equal(causes.length, 1);
          assert.equal(byId.get(causes[0]!)?.type, "orb.action.intent", `${e.type} cites its intent`);
          break;
        case "orb.action.released":
        case "orb.action.refused":
          assert.equal(byId.get(causes[0]!)?.type, "orb.action.confirmed", `${e.type} cites its confirmation`);
          break;
        default:
          break;
      }
    }
    const withdrawn = all.filter((e) => e.type === "orb.action.revoked" && (unwrapPayload(e.payload) as Record<string, unknown>)["scope"] === "one");
    assert.equal(withdrawn.length, 1);
    assert.equal(byId.get((withdrawn[0]!.causes ?? [])[0]!)?.type, "orb.action.confirmed", "a withdrawal names the reminder");
  });

  test("each record carries only the fields it may — ids, times and identities", async () => {
    for (const e of await events()) {
      const payload = unwrapPayload(e.payload) as Record<string, unknown>;
      if (e.type === "orb.action.confirmed") {
        for (const key of Object.keys(payload)) assert.ok(CONFIRMED_FIELDS.includes(key), `confirmed carries "${key}"`);
        assert.ok("authorization" in payload && "urgency" in payload, "the authorization and the argument for urgency");
      } else if (e.type in FIELDS) {
        for (const key of Object.keys(payload)) assert.ok(FIELDS[e.type]!.includes(key), `${e.type} carries "${key}"`);
      }
    }
  });

  test("the argument for acting in advance is written into the confirmation", async () => {
    const confirmed = (await events()).filter((e) => e.type === "orb.action.confirmed");
    for (const e of confirmed) {
      assert.match(String((unwrapPayload(e.payload) as Record<string, unknown>)["urgency"]), /when you are not looking/);
    }
  });

  test("a note is a sealed attachment by identity; a reminder with none has none", async () => {
    const confirmed = (await events()).filter((e) => e.type === "orb.action.confirmed").map((e) => unwrapPayload(e.payload) as Record<string, unknown>);
    assert.match(String(confirmed[0]!["attachment"]), /^sha256:[0-9a-f]{64}$/);
    assert.equal(confirmed[1]!["attachment"], undefined);
  });

  test("the refusal says why, and the release says how late", async () => {
    const all = await events();
    const refused = unwrapPayload(all.find((e) => e.type === "orb.action.refused")!.payload) as Record<string, unknown>;
    assert.equal(refused["reason"], "permissionWithdrawn");
    const released = unwrapPayload(all.find((e) => e.type === "orb.action.released")!.payload) as Record<string, unknown>;
    assert.equal(released["lateMs"], 5000);
    const cancelled = unwrapPayload(all.find((e) => e.type === "orb.action.cancelled")!.payload) as Record<string, unknown>;
    assert.equal(cancelled["reason"], "declined");
  });

  test("no word of a note, or of what the reminder is about, is in the file", async () => {
    const raw = await fixture();
    for (const word of ["insurance", "clinic", "dentist", "appointment"]) assert.ok(!raw.includes(word), `"${word}" is not in the export`);
  });
});

describe("importing it", () => {
  const desk = () => Journal.open({ lane: "mac", device: "mac-01", store: new MemoryJournalStore() });

  test("the actions are the phone's own record, not Observations: only the share is observed", async () => {
    const j = await desk();
    const result = await importExport(j, await fixture());
    assert.equal(result.replicated, 15, "the lane arrives whole");
    assert.equal(result.observed, 1, "a share is perceived; an action is Orb's own doing");
  });

  test("and importing it again is a no-op", async () => {
    const j = await desk();
    await importExport(j, await fixture());
    const again = await importExport(j, await fixture());
    assert.equal(again.replicated, 0);
    assert.equal(again.observed, 0);
  });
});
