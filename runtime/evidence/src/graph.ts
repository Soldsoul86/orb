/**
 * The Evidence Graph — `docs/EVIDENCE_GRAPH.md`, built as `docs/PHONE_BRAIN.md` B2b.
 *
 * **A typed view over lineage, not a second structure.** The journal already records, for every event,
 * which events it was derived from (`causes`), and `@orb/journal`'s `lineage` already walks those
 * links safely in both directions. This module adds what the graph is *for*: it says what each node
 * **is** (an Observation, an event an Observation cites, anything else), and it answers the five
 * questions of §3 in the vocabulary of Observations. It walks nothing itself — every traversal is
 * `indexLineage` / `ancestorsOf` / `descendantsOf` — so there is one definition of "built on".
 *
 * **Nothing is stored.** The graph is a value: built from events, asked, dropped. A graph on disk would
 * be a copy of history outside history, and would outlive an erase.
 *
 * **Nodes are events** (inv. 1). **The one edge is `derivedFrom`, and it is exactly `causes`** (inv. 2):
 * none exists that an event does not state. **Source and attachment are values of an Observation, not
 * nodes** — `Observation.md`: *the source is a value, not a kernel contract* — so attribution and
 * holding are lookups.
 *
 * **No content.** A node carries identity, kind, clocks, and — for an Observation — its source, its
 * confidence and its attachment *identities*. It has no field that could carry what an Observation's
 * `data` says, let alone anything from inside a sealed attachment.
 *
 * **Nothing here resolves.** `supports` / `contradicts` are not read: the Evidence contract gives them
 * meaning but no event shape exists, and the first producer (which needs a second source — AD-6)
 * defines it. Until then this graph has provenance edges only, and says so.
 */
import { ancestorsOf, descendantsOf, indexLineage } from "@orb/journal";
import type { Hlc, LineageIndex, StoredEvent, Traversal } from "@orb/journal";
import { isObservation, readObservation } from "@orb/observation";

/** What a node is, judged from the events alone. */
export type NodeKind =
  /** An event of the Observation type. */
  | "observation"
  /** An event some Observation cites — the thing that was observed. */
  | "device-event"
  /** Anything else: orb's own bookkeeping, declines, exports. */
  | "other";

export interface GraphNode {
  readonly id: string;
  readonly kind: NodeKind;
  /** The event's type as presented. */
  readonly type: string;
  readonly lane: string;
  readonly device: string;
  readonly hlc: Hlc;
  /** When it was **written** — best-effort physical time. For an Observation, not when anything happened. */
  readonly recordedAt: number;
  /**
   * What this event cites. `undefined` is *cannot say* (an unfetched payload took the stated lineage
   * with it); `[]` is *built on nothing*. They are different facts and are never collapsed.
   */
  readonly causes: readonly string[] | undefined;
  /** Observations only, and only when the payload is held: who perceived it (inv. 3). */
  readonly source?: string;
  readonly confidencePercent?: number;
  /** Observations only: the sealed content it cites, by identity. Never the content. */
  readonly attachments?: readonly string[];
}

/**
 * An answer, and how far it can be trusted.
 *
 * `closed` means the walk ran out of edges **within the events held** and nothing needed was unreadable
 * or missing. It never means no other device holds more. `unresolved` names what stopped it.
 * An answer that is not closed is a **lower bound**, and must never be read as *there is nothing else*.
 */
export interface Answer<T> {
  readonly value: T;
  readonly closed: boolean;
  /** Ids the question needed and the events held could not supply. */
  readonly unresolved: readonly string[];
  /** How many events the answer was computed over. */
  readonly scope: number;
}

/** An Observation placed in time by **when the thing happened**, not when it was written down. */
export interface Occurrence {
  readonly node: GraphNode;
  /** The earliest wall clock among the events it cites that are held; else its own recording time. */
  readonly occurredAt: number;
  /**
   * False when none of its causes is held, so `occurredAt` is only when the Observation was written.
   * A back-filled Observation is written long after the occurrence; mixing the two silently would put
   * last month's capture in today's window.
   */
  readonly occurredAtKnown: boolean;
}

export interface Window {
  /** Inclusive. Absent means unbounded. */
  readonly from?: number;
  readonly to?: number;
}

export interface EvidenceGraph {
  /** The node for an id, or undefined if no such event is held. */
  node(id: string): GraphNode | undefined;
  /** Every node, in the order the events were given. */
  nodes(): readonly GraphNode[];
  /** What this event rests on, nearest first, each typed. */
  provenance(id: string): Answer<readonly GraphNode[]>;
  /** The Observations that cite this event: was it observed, and as what. */
  observationsOf(id: string): Answer<readonly GraphNode[]>;
  /** Everything built on this event, directly or through any chain — the blast radius of an erase. */
  dependentsOf(id: string): Answer<readonly GraphNode[]>;
  /** Observations by sensor (`orb.sensor.assist` matches `orb.sensor.assist@<install>`), by when they happened. */
  fromSource(sensor: string, window?: Window): Answer<readonly Occurrence[]>;
  /** Observations that hold this sealed content, by identity. */
  holding(identity: string): Answer<readonly GraphNode[]>;
}

/** Whether an Observation's source is this sensor: the same name, or that name at an install. */
export function sourceMatches(source: string, sensor: string): boolean {
  return source === sensor || source.startsWith(`${sensor}@`);
}

/**
 * Builds the graph over events. Call it, ask, drop it.
 *
 * Events are taken as given — `Journal.readLane` presents them with payloads where held. An event whose
 * payload is not held still has a node (its envelope is history), but an Observation whose payload is
 * not held cannot say its source or what it holds, and every answer that would need that is **not
 * closed** and names it.
 */
export function buildGraph(events: Iterable<StoredEvent>): EvidenceGraph {
  const all = [...events];
  const index: LineageIndex = indexLineage(all);

  const observed = new Set<string>();
  for (const event of all) {
    if (!isObservation(event)) continue;
    for (const cause of event.causes ?? []) observed.add(cause);
  }

  const byId = new Map<string, GraphNode>();
  const unreadable = new Set<string>();
  for (const event of all) {
    const kind: NodeKind = isObservation(event) ? "observation" : observed.has(event.id) ? "device-event" : "other";
    const base = {
      id: event.id,
      kind,
      type: event.type,
      lane: event.lane,
      device: event.device,
      hlc: event.hlc,
      recordedAt: event.wallClock,
      causes: event.causes,
    };
    let node: GraphNode = base;
    if (kind === "observation") {
      const observation = readObservation(event);
      if (observation === null) {
        unreadable.add(event.id);
      } else {
        node = {
          ...base,
          source: observation.source,
          confidencePercent: observation.confidencePercent,
          ...(observation.attachments === undefined ? {} : { attachments: [...observation.attachments] }),
        };
      }
    }
    byId.set(event.id, node);
  }

  const nodeOf = (id: string): GraphNode => byId.get(id)!;
  const typed = (ids: readonly string[]): readonly GraphNode[] => ids.filter((id) => byId.has(id)).map(nodeOf);
  const answer = <T>(value: T, t: Traversal): Answer<T> => ({
    value,
    closed: t.closed,
    unresolved: t.unresolved,
    scope: t.scope,
  });

  /** Observations whose payload is unreadable cannot be matched on what they say: name them. */
  const withUnreadable = <T>(value: T, extra: readonly string[] = []): Answer<T> => {
    const unresolved = [...extra, ...unreadable].sort();
    return { value, closed: unresolved.length === 0, unresolved, scope: all.length };
  };

  /**
   * A forward answer (*what cites / is built on this*) is complete only if every event could say what
   * it cites. One whose stated lineage is unreadable might cite this, and nothing records that it does —
   * so it is named, and the answer is a lower bound. The root not being held is the same kind of fact.
   */
  const forward = <T>(value: T, root: string, t?: Traversal): Answer<T> => {
    const cannotSay = [...byId.values()].filter((n) => n.causes === undefined).map((n) => n.id);
    const unresolved = [...new Set([...(byId.has(root) ? [] : [root]), ...(t?.unresolved ?? []), ...cannotSay])].sort();
    return { value, closed: unresolved.length === 0, unresolved, scope: all.length };
  };

  const occurrence = (node: GraphNode): Occurrence => {
    const held = (node.causes ?? []).map((id) => byId.get(id)).filter((n): n is GraphNode => n !== undefined);
    if (held.length === 0) return { node, occurredAt: node.recordedAt, occurredAtKnown: false };
    return { node, occurredAt: Math.min(...held.map((n) => n.recordedAt)), occurredAtKnown: true };
  };

  return {
    node: (id) => byId.get(id),
    nodes: () => all.map((e) => nodeOf(e.id)),

    provenance(id) {
      const t = ancestorsOf(index, [id]);
      return answer(typed(t.ids), t);
    },

    observationsOf(id) {
      const observations = typed(index.dependentsOf(id)).filter((n) => n.kind === "observation");
      return forward(observations, id);
    },

    dependentsOf(id) {
      const t = descendantsOf(index, [id]);
      return forward(typed(t.ids), id, t);
    },

    fromSource(sensor, window) {
      const found: Occurrence[] = [];
      for (const node of byId.values()) {
        if (node.kind !== "observation" || node.source === undefined) continue;
        if (!sourceMatches(node.source, sensor)) continue;
        const o = occurrence(node);
        if (window?.from !== undefined && o.occurredAt < window.from) continue;
        if (window?.to !== undefined && o.occurredAt > window.to) continue;
        found.push(o);
      }
      found.sort((a, b) => a.occurredAt - b.occurredAt || (a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0));
      return withUnreadable(found);
    },

    holding(identity) {
      const found = [...byId.values()].filter((n) => n.attachments?.includes(identity) === true);
      return withUnreadable(found);
    },
  };
}
