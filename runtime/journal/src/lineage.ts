/**
 * Which events were built on which — read forwards.
 *
 * Every envelope already carries `causes`: the events it was derived from or
 * reacted to. Under Art. XI §41 a reasoning step, a plan or an issued Action is
 * runtime activity *recorded as an Event*, so a derivation is an event that
 * cites its inputs, and that citation **is** the lineage. Nothing new is stored
 * here and nothing new needs to be: a second structure holding the same facts
 * would be a second source of truth for them (Art. IX §33).
 *
 * What is missing is direction. `causes` points from a conclusion back to its
 * evidence, which answers *"where did this come from?"*. Erasure asks the
 * opposite — *"what was built on this?"* — and that is this module.
 *
 * **Nothing here is ever persisted.** The index is a value: computed from
 * events, used, discarded. The operator ruled that the journal entries are the
 * only trace that exists, so an index written to disk would be a second trail
 * outliving the entries it describes, and would survive an erasure that removed
 * them. Rebuilding it on demand is the point, not a limitation.
 *
 * **The honest limit.** This finds derivations that recorded their inputs.
 * A derivation that did not is invisible to any traversal, and nothing in the
 * structure forces `causes` to be complete — see `docs/ERASURE.md` §3. That is a
 * rule an honest implementation keeps, not an invariant, and the coarse envelope
 * type (§2b) means the journal itself can no longer check it: it cannot tell an
 * observation, which legitimately cites nothing, from a conclusion, which must
 * cite something.
 */
import type { StoredEvent } from "./types.js";

/**
 * A forward view over a set of events. Ephemeral by construction.
 *
 * Holds no payloads and copies no content: only ids, hashes and the edges
 * between them. An index that carried content would be a copy of history
 * sitting outside history.
 */
export interface LineageIndex {
  /** Events that directly cite `id`, in the order they were indexed. */
  dependentsOf(id: string): readonly string[];
  /** Events `id` directly cites, in the order that event records them. */
  causesOf(id: string): readonly string[];
  /** The event carrying this envelope hash, if it is in scope. */
  idForHash(hash: string): string | undefined;
  /** Whether this id is in scope at all. */
  holds(id: string): boolean;
  /** How many events the index was built over. */
  readonly scope: number;
  /**
   * Causes cited by an indexed event that the index does not hold.
   *
   * Evidence that this view is over partial history — normal on a replica, and
   * the reason no answer from it may be called complete.
   */
  readonly unresolvedCauses: ReadonlySet<string>;
}

/**
 * The result of a traversal, and how far it can be trusted.
 *
 * `closed` is deliberately not called `complete`. It means the walk ran out of
 * edges **within the events indexed** — nothing cited was missing. It never
 * means no other device holds a derivation this one has not seen, which is not
 * knowable from here and is why `Horizon` exists at all.
 */
export interface Traversal {
  /** Ids reached, excluding the roots, in the order they were indexed. */
  readonly ids: readonly string[];
  readonly closed: boolean;
  /** Roots or causes the index does not hold — why `closed` is false. */
  readonly unresolved: readonly string[];
  /** How many events the answer was computed over. */
  readonly scope: number;
}

class Index implements LineageIndex {
  readonly #dependents = new Map<string, string[]>();
  readonly #causes = new Map<string, readonly string[]>();
  readonly #byHash = new Map<string, string>();
  readonly #order: string[] = [];
  readonly #unresolved = new Set<string>();

  constructor(events: Iterable<StoredEvent>) {
    for (const event of events) {
      this.#order.push(event.id);
      this.#causes.set(event.id, event.causes);
      this.#byHash.set(event.integrity.hash, event.id);
    }

    for (const id of this.#order) {
      for (const cause of this.#causes.get(id) ?? []) {
        const dependents = this.#dependents.get(cause);
        if (dependents) dependents.push(id);
        else this.#dependents.set(cause, [id]);
      }
    }

    // A second pass, because a cause may legitimately be cited before the
    // event carrying it appears in the iteration order — lanes interleave.
    for (const cause of this.#dependents.keys()) {
      if (!this.#causes.has(cause)) this.#unresolved.add(cause);
    }
  }

  dependentsOf(id: string): readonly string[] {
    return this.#dependents.get(id) ?? [];
  }

  causesOf(id: string): readonly string[] {
    return this.#causes.get(id) ?? [];
  }

  idForHash(hash: string): string | undefined {
    return this.#byHash.get(hash);
  }

  holds(id: string): boolean {
    return this.#causes.has(id);
  }

  get scope(): number {
    return this.#order.length;
  }

  get unresolvedCauses(): ReadonlySet<string> {
    return this.#unresolved;
  }
}

/** Builds a forward view. Call it, use it, drop it. */
export function indexLineage(events: Iterable<StoredEvent>): LineageIndex {
  return new Index(events);
}

/**
 * Everything built on `roots`, directly or through any chain of derivations.
 *
 * The blast radius of an erasure: what must be torn down so that nothing
 * survives which was computed from content that is about to stop existing.
 *
 * Walks with a visited set rather than assuming acyclicity. `causes` should
 * only ever cite earlier events, so a cycle means a malformed or hostile
 * journal — and a traversal that looped forever on one would take the erasure
 * preview down with it, at the exact moment the owner is waiting on an answer.
 */
export function descendantsOf(
  index: LineageIndex,
  roots: Iterable<string>,
): Traversal {
  return walk(index, roots, (id) => index.dependentsOf(id));
}

/**
 * Everything `roots` were built on, directly or through any chain.
 *
 * Provenance: the direction `causes` already records. Reading it is reading what
 * an event openly says about itself, which is why it stays available under the
 * operator's ruling — what is forbidden is a trail stored *beside* the journal,
 * not an entry's own account of where it came from.
 */
export function ancestorsOf(index: LineageIndex, roots: Iterable<string>): Traversal {
  return walk(index, roots, (id) => index.causesOf(id));
}

function walk(
  index: LineageIndex,
  roots: Iterable<string>,
  step: (id: string) => readonly string[],
): Traversal {
  const seed = [...roots];
  const seen = new Set<string>(seed);
  const reached: string[] = [];
  const unresolved = new Set<string>();
  const queue = [...seed];

  for (const root of seed) {
    if (!index.holds(root)) unresolved.add(root);
  }

  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) break;

    for (const next of step(id)) {
      if (!index.holds(next)) {
        // Named by something we hold, but not held. The walk cannot continue
        // through it, and saying so is the only honest option.
        unresolved.add(next);
        continue;
      }
      if (seen.has(next)) continue;
      seen.add(next);
      reached.push(next);
      queue.push(next);
    }
  }

  return {
    ids: reached,
    closed: unresolved.size === 0,
    unresolved: [...unresolved],
    scope: index.scope,
  };
}
