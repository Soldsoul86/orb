/**
 * The vectors the phone's Kotlin Evidence Graph is held to (`runtime/brain/tests/vectors/graph.json`).
 *
 * **Computed here, checked there**, as for the translation (`brain-vectors-build.ts`): `@orb/evidence`
 * is run over a hand-made history (and four damaged variants of it) and over the phone-written fixtures,
 * for **every question about every node** plus sensor, window and attachment queries, and what it says is
 * written down. The Kotlin graph has to say the same thing from the same lines — including the order of
 * `unresolved`, which is part of the answer.
 *
 * The hand-made history is a committed file (`graph-history.jsonl`, written once by
 * `scripts/write-graph-history.mjs`) because the journal mints its ids; the vectors computed from it are stable.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildGraph, type Answer, type EvidenceGraph, type GraphNode } from "@orb/evidence";
import type { StoredEvent } from "@orb/journal";

import { parseExport } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../../..");
export const graphVectorsPath = join(root, "runtime/brain/tests/vectors/graph.json");
const historyPath = join(root, "runtime/brain/tests/vectors/graph-history.jsonl");
const fixturePath = (name: string) => join(here, "../../tests/fixtures", name);

type Json = Record<string, unknown>;
type Mutable = Record<string, unknown>;

const SENSORS = ["orb.sensor.assist", "orb.sensor.share", "orb.sensor.grants", "orb.sensor.assist2", "orb.sensor.assist@orb-1"];
const NO_SUCH = "01NOSUCHEVENT";

const nodeJson = (n: GraphNode): Json => JSON.parse(JSON.stringify(n)) as Json;
const answerJson = <T>(a: Answer<T>, value: unknown): Json => ({ value, closed: a.closed, unresolved: a.unresolved, scope: a.scope });
const ids = (nodes: readonly GraphNode[]) => nodes.map((n) => n.id);

function windowsFor(g: EvidenceGraph): { from?: number; to?: number }[] {
  const times = SENSORS.flatMap((s) => g.fromSource(s).value.map((o) => o.occurredAt)).sort((a, b) => a - b);
  if (times.length === 0) return [{}];
  const at = (f: number) => times[Math.min(times.length - 1, Math.floor(times.length * f))]!;
  return [{}, { from: times[0]! }, { to: at(0.5) }, { from: at(0.25), to: at(0.75) }, { from: times[times.length - 1]! + 1 }, { from: at(0.5), to: at(0.5) }];
}

function scenario(name: string, lines: readonly string[], events: readonly StoredEvent[]) {
  const g = buildGraph(events);
  const queries: Json[] = [];
  for (const id of [...events.map((e) => e.id), NO_SUCH]) {
    const p = g.provenance(id);
    queries.push({ op: "provenance", id, expected: answerJson(p, ids(p.value)) });
    const o = g.observationsOf(id);
    queries.push({ op: "observationsOf", id, expected: answerJson(o, ids(o.value)) });
    const d = g.dependentsOf(id);
    queries.push({ op: "dependentsOf", id, expected: answerJson(d, ids(d.value)) });
  }
  for (const sensor of SENSORS) {
    for (const w of windowsFor(g)) {
      const a = g.fromSource(sensor, w);
      queries.push({
        op: "fromSource", sensor, ...w,
        expected: answerJson(a, a.value.map((x) => ({ id: x.node.id, occurredAt: x.occurredAt, occurredAtKnown: x.occurredAtKnown }))),
      });
    }
  }
  const identities = [...new Set(g.nodes().flatMap((n) => n.attachments ?? [])), "sha256:" + "00".repeat(32)];
  for (const identity of identities) {
    const h = g.holding(identity);
    queries.push({ op: "holding", identity, expected: answerJson(h, ids(h.value)) });
  }
  return { name, lines, nodes: g.nodes().map(nodeJson), queries };
}

const asLines = (events: readonly Mutable[]) => events.map((e) => JSON.stringify(e));

export async function buildGraphVectors() {
  const history = (await readFile(historyPath, "utf8")).split("\n").filter((l) => l !== "").map((l) => JSON.parse(l) as Mutable);
  const [capA1, , , , obsA1, , , conclusion] = history as [Mutable, Mutable, Mutable, Mutable, Mutable, Mutable, Mutable, Mutable];

  const variants: { name: string; events: Mutable[] }[] = [
    { name: "hand history", events: history },
    { name: "hand history, input in reverse", events: [...history].reverse() },
    { name: "hand history, a capture is not held", events: history.filter((e) => e !== capA1) },
    {
      name: "hand history, the conclusion states no lineage and holds no payload",
      events: history.map((e) => { if (e !== conclusion) return e; const { payload: _p, causes: _c, ...envelope } = e; return envelope; }),
    },
    {
      name: "hand history, an Observation holds no payload",
      events: history.map((e) => { if (e !== obsA1) return e; const { payload: _p, ...envelope } = e; return envelope; }),
    },
    { name: "hand history, a cycle", events: history.map((e) => (e === capA1 ? { ...e, causes: [obsA1["id"]] } : e)) },
  ];

  const scenarios = variants.map((v) => scenario(v.name, asLines(v.events), v.events as unknown as StoredEvent[]));

  for (const file of ["observed-export.txt", "assist-export.txt", "share-export.txt"]) {
    const text = await readFile(fixturePath(file), "utf8");
    const events = parseExport(text);
    scenarios.push(scenario(`phone-written ${file}`, text.split("\n").filter((l) => l.trim() !== ""), events));
  }

  return {
    note: "Generated by packages/device-watch/tests/graph-vectors-build.ts from @orb/evidence. Do not edit; regenerate with node scripts/write-brain-vectors.mjs.",
    scenarios,
  };
}
