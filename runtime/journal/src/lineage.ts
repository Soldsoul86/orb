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
  /**
   * Whether this event says what it was built on.
   *
   * False when the event is held but its stated lineage is not readable here —
   * a v2 envelope whose payload was never fetched, pruned, or erased
   * (`docs/ERASURE.md` §2b). That is *cannot say*, and `causesOf` returning
   * `[]` for it would report *built on nothing*, which is a different and
   * false claim. `ancestorsOf` reads this so a walk through such an event is
   * reported open instead of closed.
   */
  statesCauses(id: string): boolean;
  /**
   * Events that are derived and cite nothing.
   *
   * Empty unless the caller supplied `derived` — the journal cannot populate
   * this alone, and that is a consequence of §2b rather than an omission: a v2
   * envelope says only that an event is content, so the journal cannot tell an
   * observation, which legitimately cites nothing, from a conclusion, which
   * must cite something. Only a layer holding the payload knows which is which.
   *
   * Non-empty means **a forward walk's answer is a lower bound**. Such an event
   * may have been computed from any target and nothing records that it was, so
   * a blast radius that excludes it is too small — and too small is the
   * dangerous direction, because an erasure planned on it tears down less than
   * the owner is told it did (`ERASURE.md` §3).
   */
  readonly ungrounded: ReadonlySet<string>;
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
  /**
   * Derived events in scope that cite nothing, so this answer is a lower bound.
   *
   * Deliberately separate from `unresolved`, which means *an edge led somewhere
   * this index does not hold*. This means *an edge was never recorded at all*.
   * The first is a partial replica, normal and fixable by syncing; the second is
   * a derivation that will sit on erased content forever, and no amount of
   * walking reaches it. Collapsing them would hide the one that cannot be fixed.
   */
  readonly ungrounded: readonly string[];
  /** How many events the answer was computed over. */
  readonly scope: number;
}

class Index implements LineageIndex {
  readonly #dependents = new Map<string, string[]>();
  readonly #ungrounded = new Set<string>();
  readonly #causes = new Map<string, readonly string[]>();
  /** Every indexed id, including those whose lineage is unreadable here. */
  readonly #held = new Set<string>();
  readonly #byHash = new Map<string, string>();
  readonly #order: string[] = [];
  readonly #unresolved = new Set<string>();

  constructor(events: Iterable<StoredEvent>, derived?: (event: StoredEvent) => boolean) {
    for (const event of events) {
      this.#order.push(event.id);
      this.#held.add(event.id);
      // Kept apart from `#held` deliberately. An event with no readable payload
      // states no lineage, and recording `[]` for it would make the index claim
      // the event was built on nothing.
      if (event.causes !== undefined) this.#causes.set(event.id, event.causes);
      // Derived and citing nothing. Checked only where the caller can say what
      // is derived; `event.causes === undefined` is *cannot say* and is already
      // carried by `statesCauses`, so it is not counted here as *cites nothing*.
      if (derived?.(event) === true && event.causes?.length === 0) {
        this.#ungrounded.add(event.id);
      }
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
      if (!this.#held.has(cause)) this.#unresolved.add(cause);
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
    return this.#held.has(id);
  }

  statesCauses(id: string): boolean {
    return this.#causes.has(id);
  }

  get scope(): number {
    return this.#order.length;
  }

  get unresolvedCauses(): ReadonlySet<string> {
    return this.#unresolved;
  }

  get ungrounded(): ReadonlySet<string> {
    return this.#ungrounded;
  }
}

/**
 * Builds a forward view. Call it, use it, drop it.
 *
 * `derived` is supplied by a layer that can read payloads and therefore knows a
 * conclusion from an observation. Without it the index still walks edges
 * correctly; it simply cannot report that an edge was never recorded, and says
 * so by leaving `ungrounded` empty rather than by implying there are none.
 */
export function indexLineage(
  events: Iterable<StoredEvent>,
  options?: { readonly derived?: (event: StoredEvent) => boolean },
): LineageIndex {
  return new Index(events, options?.derived);
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
  // Opaque where the lineage is not readable: an erased or unfetched payload
  // took the event's stated causes with it, so the walk stops there and says so
  // rather than reporting a provenance it never read.
  return walk(index, roots, (id) => index.causesOf(id), (id) => !index.statesCauses(id));
}

function walk(
  index: LineageIndex,
  roots: Iterable<string>,
  step: (id: string) => readonly string[],
  /** Held, but cannot be stepped through. Its edges are unknown, not absent. */
  opaque: (id: string) => boolean = () => false,
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

    if (opaque(id)) unresolved.add(id);

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
    // Scope-wide rather than path-specific, and deliberately so: an event that
    // records no inputs could have been computed from anything, so it weakens
    // every answer over this set, not one branch of it.
    ungrounded: [...index.ungrounded],
    scope: index.scope,
  };
}
