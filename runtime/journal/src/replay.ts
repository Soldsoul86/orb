/**
 * Replay — folding the union of all lanes into a derived view.
 *
 * EVENT_MODEL.md §7. Order is derived here, on read, and never stored: that is
 * what keeps devices equal peers (Constitution Art. IV §17).
 *
 * Ordering needs only envelopes, which is why a device that has dropped
 * payloads still agrees with every other device about what happened and in what
 * order. Folding needs payloads, so a fold over a partial replica reports what
 * it could not read rather than quietly leaving it out
 * (`docs/PARTIAL_REPLICATION.md` §5, inv. 5).
 */
import { compareHlc } from "./hlc.js";
import type { EventEnvelope, OrbEvent, StoredEvent } from "./types.js";
import { hasPayload } from "./types.js";
import type { Journal } from "./journal.js";

/**
 * The public total order: `(hlc, lane)`.
 *
 * The lane tiebreak makes the order identical on every device even when two
 * lanes produce the same HLC.
 */
export function compareEventOrder(a: EventEnvelope, b: EventEnvelope): number {
  const byHlc = compareHlc(a.hlc, b.hlc);
  if (byHlc !== 0) return byHlc;
  if (a.lane !== b.lane) return a.lane < b.lane ? -1 : 1;
  // Same lane and same HLC cannot happen in a valid journal; ordering by id
  // keeps the comparator total rather than letting sort order go undefined.
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function orderEvents<Event extends EventEnvelope>(
  events: readonly Event[],
): readonly Event[] {
  return [...events].sort(compareEventOrder);
}

/** A pure fold from history to derived state. */
export type Projection<State> = (state: State, event: OrbEvent) => State;

/**
 * A fold together with the bound on what it could see.
 *
 * `complete` is the only basis for an unqualified answer. When it is false the
 * caller holds a partial result and must say so: an answer that would change if
 * the skipped payloads were present is not an answer.
 */
export interface BoundedFold<State> {
  readonly state: State;
  readonly complete: boolean;
  /** Ids of events whose payloads this device does not hold, in public order. */
  readonly skipped: readonly string[];
}

/**
 * Folds `events` in public order through `project`.
 *
 * Events whose payload is absent are skipped and named. The return type makes
 * that impossible to overlook, which is the point — silently folding a subset
 * is how a partial replica starts lying.
 */
export function fold<State>(
  events: readonly StoredEvent[],
  initial: State,
  project: Projection<State>,
): BoundedFold<State> {
  let state = initial;
  const skipped: string[] = [];

  for (const event of orderEvents(events)) {
    if (!hasPayload(event)) {
      skipped.push(event.id);
      continue;
    }
    state = project(state, event);
  }

  return { state, complete: skipped.length === 0, skipped };
}

/** Rebuilds a projection from the whole journal, bounded by what this device holds. */
export async function replay<State>(
  journal: Journal,
  initial: State,
  project: Projection<State>,
): Promise<BoundedFold<State>> {
  return fold(await journal.readAll(), initial, project);
}
