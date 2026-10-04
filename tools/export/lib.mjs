/**
 * The export analyser's pure core: reads the text of a device export (one journal event per line) and answers questions about it in **counts and
 * names only** — never a payload value except the closed, numeric ones named in `NUMERIC_REPORTS`. No file, clock or network access happens here.
 */
import { createHash } from "node:crypto";

/** Event types whose payload is entirely counts and enums, so the latest one may be shown whole (`docs/LOOP_PROTOCOL.md` §fit). */
export const NUMERIC_REPORTS = ["orb.loop.fit.reported"];

const canon = (v) =>
  Array.isArray(v)
    ? `[${v.map(canon).join(",")}]`
    : v !== null && typeof v === "object"
      ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`
      : JSON.stringify(v);

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/** Splits an export into events. Unparseable lines are counted, never quoted. */
export function parse(text) {
  const events = [];
  let unparseable = 0;
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    try {
      const e = JSON.parse(line);
      if (e && typeof e === "object" && typeof e.type === "string") events.push(e);
      else unparseable++;
    } catch {
      unparseable++;
    }
  }
  return { events, unparseable };
}

/**
 * The chain as a reader can check it: each event names the hash of the one before it, and where the payload is in the clear its hash is what the
 * envelope says. (The envelope hash itself is the journal's to verify; an export is checked here for continuity, not re-signed.)
 */
export function chain(events) {
  let linkBreaks = 0;
  let payloadMismatches = 0;
  let sealed = 0;
  let previous = null;
  for (const e of events) {
    const integrity = e.integrity ?? {};
    if (integrity.previous !== previous) linkBreaks++;
    previous = integrity.hash ?? null;
    if (e.payload === undefined || e.payload === null || typeof e.payload !== "object" || "sealed" in e.payload) {
      sealed++;
    } else if (sha256(canon(e.payload)) !== integrity.payloadHash) {
      payloadMismatches++;
    }
  }
  return { events: events.length, linkBreaks, payloadMismatches, sealed, ok: linkBreaks === 0 && payloadMismatches === 0 };
}

export function typeCounts(events) {
  const counts = {};
  for (const e of events) counts[e.type] = (counts[e.type] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** Versions the process started as, in order, deduplicated — what build produced this export. */
export function builds(events) {
  const seen = [];
  for (const e of events) {
    if (e.type !== "orb.process.start") continue;
    const v = e.payload?.versionCode;
    if (typeof v === "number" && !seen.includes(v)) seen.push(v);
  }
  return seen;
}

/** Crashes and caught faults: counts by type only. The fault text stays on the phone. */
export function faults(events) {
  const counts = typeCounts(events);
  return { crashed: counts["orb.process.crashed"] ?? 0, caught: counts["orb.fault.caught"] ?? 0 };
}

/** The latest event of each numeric-report type, whole. Anything not on the closed list is refused. */
export function latestReports(events, types = NUMERIC_REPORTS) {
  const out = {};
  for (const type of types) {
    if (!NUMERIC_REPORTS.includes(type)) throw new Error(`not a numeric report: ${type}`);
    const last = [...events].reverse().find((e) => e.type === type);
    if (!last) continue;
    const payload = {};
    for (const [k, v] of Object.entries(last.payload ?? {})) if (typeof v === "number") payload[k] = v;
    out[type] = payload;
  }
  return out;
}

/** Keys (never values) of the payloads of a type — for noticing that a new field appeared. */
export function payloadKeys(events, type) {
  const keys = new Set();
  for (const e of events) if (e.type === type) for (const k of Object.keys(e.payload ?? {})) keys.add(k);
  return [...keys].sort();
}

/** What changed between two exports of the same lane: per-type count differences and the new builds. */
export function diff(before, after) {
  const a = typeCounts(before);
  const b = typeCounts(after);
  const changed = {};
  for (const type of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const d = (b[type] ?? 0) - (a[type] ?? 0);
    if (d !== 0) changed[type] = d;
  }
  const had = builds(before);
  return {
    added: after.length - before.length,
    changed: Object.fromEntries(Object.entries(changed).sort(([x], [y]) => (x < y ? -1 : 1))),
    newBuilds: builds(after).filter((v) => !had.includes(v)),
  };
}

/**
 * Checks an export against a **prediction file**: `{ "checks": [{ "id": "P340", "type": "orb.sender.judged", "min": 1, "max": 9 }, ...] }`.
 * A check names an event type and bounds on how many there are (each bound optional). This is the mechanical half of `docs/DEVICE_LOOP.md`'s
 * numbered predictions; the judgement half stays with the person reading.
 */
export function check(events, predictions) {
  const counts = typeCounts(events);
  const results = [];
  for (const c of predictions.checks ?? []) {
    const n = counts[c.type] ?? 0;
    const ok = (c.min === undefined || n >= c.min) && (c.max === undefined || n <= c.max);
    results.push({ id: c.id, type: c.type, n, ok });
  }
  return { results, ok: results.every((r) => r.ok) };
}
