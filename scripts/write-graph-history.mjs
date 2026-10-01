#!/usr/bin/env node
/**
 * Writes `runtime/brain/tests/vectors/graph-history.jsonl`: a small hand-made history — two captures of
 * one screen, a share, a bookkeeping event, three Observations **written three weeks after** what they
 * observed, and a conclusion built on two of them — with a clock the script sets.
 *
 *   npm run build && node scripts/write-graph-history.mjs
 *
 * Ids are minted by the journal, so this is run **once** and the file committed; the graph vectors are
 * then computed from the committed lines and are stable. Re-running changes every id (and the vectors
 * must be regenerated with `scripts/write-brain-vectors.mjs`).
 */
import { writeFile } from "node:fs/promises";
import { Journal } from "../runtime/journal/dist/src/index.js";
import { observationDraft } from "../runtime/observation/dist/src/index.js";

const WEEK = 7 * 24 * 3600 * 1000;
const A = "sha256:" + "aa".repeat(32);
let now = 1_000_000;
const journal = await Journal.open({ lane: "pixel", device: "pixel-01", now: () => now });
const device = (type, payload) => ({ type, schema: { id: type, version: 1 }, payload });
const observe = (source, cause, attachment) =>
  journal.appendOne(observationDraft({ source, confidencePercent: 100, data: { because: "x" }, ...(attachment ? { attachments: [attachment] } : {}) }, [cause]));

now = 1_000_000; const capA1 = await journal.appendOne(device("orb.assist.captured", { because: "r", package: "com.chat", attachment: A }));
now = 2_000_000; const capA2 = await journal.appendOne(device("orb.assist.captured", { because: "r", package: "com.chat", attachment: A }));
now = 3_000_000; const share = await journal.appendOne(device("orb.shared", { because: "s", references: "https://example.test/x" }));
now = 4_000_000; await journal.appendOne(device("orb.export", { because: "operator export" }));
now = 1_000_000 + 3 * WEEK;
const o1 = await observe("orb.sensor.assist@orb-1", capA1.id, A);
await observe("orb.sensor.assist@orb-1", capA2.id, A);
const o3 = await observe("orb.sensor.share@orb-1", share.id);
now += 1000;
await journal.appendOne({ type: "note", schema: { id: "note", version: 1 }, payload: { text: "c" }, causes: [o1.id, o3.id] });

const lines = (await journal.readLane("pixel")).map((e) => JSON.stringify(e));
await writeFile(new URL("../runtime/brain/tests/vectors/graph-history.jsonl", import.meta.url), lines.join("\n") + "\n");
console.log(`wrote ${lines.length} events`);
