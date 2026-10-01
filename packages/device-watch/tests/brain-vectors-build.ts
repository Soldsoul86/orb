/**
 * The vectors the phone's Kotlin translation is held to (`runtime/brain/tests/vectors`).
 *
 * **Computed here, checked there.** `translateEvent` is the one function that assembles the body of an
 * Observation from a device event; this test runs it over hand-made edge cases and over every event of
 * the phone-written fixtures, and writes what it returns. The Kotlin side then has to produce the same
 * body from the same line. Agreement means something because the answer was not computed by the thing
 * being checked.
 *
 * **A stale file fails.** The test only compares; regenerate with `node scripts/write-brain-vectors.mjs`
 * (after `npm run build`), so the vectors cannot drift from the TypeScript rules by being forgotten.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { translateEvent, parseExport } from "../src/index.js";
import { unwrapPayload, hasPayload } from "@orb/journal";

const here = dirname(fileURLToPath(import.meta.url));
export const vectorsPath = join(here, "../../../../runtime/brain/tests/vectors/observations.json");
const fixturePath = (name: string) => join(here, "../../tests/fixtures", name);

const DEVICE = "orb-0123456789abcdef01234567";
const ASSIST = "orb.assist.captured";
const SHARED = "orb.shared";
const IDENTITY = "sha256:" + "ab".repeat(32);

/** [name, type, payload]. No fractions and no integers past 2^53: the phone's reader refuses those lines whole. */
const CASES: ReadonlyArray<readonly [string, string, unknown]> = [
  ["assist: a typical capture", ASSIST, { because: "remember", package: "com.whatsapp", textNodes: 25, textChars: 658, webUri: false, resolveOutcome: "stored", attachment: IDENTITY, attachmentBytes: 912, versionCode: 29847449, passwordFields: 0 }],
  ["assist: only what the phone omitted is omitted", ASSIST, { package: "com.example.chat" }],
  ["assist: empty object", ASSIST, {}],
  ["assist: wrong types are left out, never coerced", ASSIST, { because: 5, package: 7, textNodes: "25", textChars: true, webUri: "false", resolveOutcome: ["stored"], attachmentBytes: null, versionCode: {}, passwordFields: "0" }],
  ["assist: null fields are left out", ASSIST, { because: null, package: null, textChars: null }],
  ["assist: a bad attachment identity is dropped", ASSIST, { package: "a.b", attachment: "sha256:XYZ" }],
  ["assist: an uppercase-hex identity is dropped", ASSIST, { package: "a.b", attachment: "sha256:" + "AB".repeat(32) }],
  ["assist: an identity with no scheme is dropped", ASSIST, { package: "a.b", attachment: "ab".repeat(32) }],
  ["assist: a non-string identity is dropped", ASSIST, { package: "a.b", attachment: 12 }],
  ["assist: a short scheme-tagged identity is accepted (the shape, not the length)", ASSIST, { package: "a.b", attachment: "sha256:00ff" }],
  ["assist: unknown fields are not carried", ASSIST, { package: "a.b", text: "the secret words", extra: { nested: [1, 2, 3] } }],
  ["assist: zero and negative counts are counts", ASSIST, { textNodes: 0, textChars: 0, passwordFields: 2, attachmentBytes: -1 }],
  ["assist: an array payload is not an object", ASSIST, ["package", "a.b"]],
  ["assist: a string payload", ASSIST, "hello"],
  ["assist: a number payload", ASSIST, 42],
  ["assist: a null payload", ASSIST, null],
  ["share: a typical share", SHARED, { because: "share", shareReadable: true, action: "android.intent.action.SEND", mimeType: "text/plain", referrer: "android-app://com.whatsapp", itemCount: 1, references: "https://example.test/a:b?c=d", resolved: true, resolveOutcome: "stored", attachment: IDENTITY, attachmentBytes: 120, elapsedRealtimeMs: 123456 }],
  ["share: text containing colons, quotes, newlines and emoji is carried whole", SHARED, { because: "share", references: "he said \"call me: 5pm\"\nthen 🙂 left\u0000x\\" }],
  ["share: unreadable intent", SHARED, { because: "share", shareReadable: false, absenceReason: "unreadableIntent" }],
  ["share: the uptime clock is deliberately not carried", SHARED, { because: "share", elapsedRealtimeMs: 999 }],
  ["share: wrong types are left out", SHARED, { because: false, shareReadable: "yes", itemCount: "1", resolved: 1, references: 3 }],
  ["share: empty object", SHARED, {}],
  ["share: an array payload", SHARED, []],
  ["share: a null payload", SHARED, null],
  ["a type Orb does not translate here", "orb.export", { because: "operator export" }],
];

interface VectorCase {
  readonly name: string;
  readonly type: string;
  readonly device: string;
  readonly id: string;
  readonly line: string;
  readonly expected: unknown;
}

function caseFor(index: number, name: string, type: string, payload: unknown): VectorCase {
  const id = `01VECTOR${String(index).padStart(18, "0")}`;
  const line = JSON.stringify({ causes: [], device: DEVICE, id, payload, type });
  return { name, type, device: DEVICE, id, line, expected: translateEvent(type, DEVICE, payload) };
}

async function fixtureCases(file: string, types: readonly string[]) {
  const events = parseExport(await readFile(fixturePath(file), "utf8"));
  const out: { cause: string; expected: unknown }[] = [];
  for (const event of events) {
    if (!types.includes(event.type) || !hasPayload(event)) continue;
    const observation = translateEvent(event.type, event.device, unwrapPayload((event as never as { payload: never }).payload));
    out.push({ cause: event.id, expected: observation });
  }
  return { file: `packages/device-watch/tests/fixtures/${file}`, expected: out };
}

export async function buildVectors() {
  return {
    note: "Generated by packages/device-watch/tests/brain-vectors.test.ts from the TypeScript translation. Do not edit; regenerate with node scripts/write-brain-vectors.mjs.",
    cases: CASES.map(([name, type, payload], i) => caseFor(i, name, type, payload)),
    fixtures: [
      await fixtureCases("assist-export.txt", [ASSIST]),
      await fixtureCases("share-export.txt", [SHARED]),
    ],
  };
}

