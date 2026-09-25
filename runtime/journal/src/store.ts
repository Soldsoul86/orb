/**
 * Journal storage ports.
 *
 * The journal service owns the invariants; a store owns only durability. Keeping
 * them apart lets the same journal run over memory (tests), a file (the device
 * runtime), or any future encrypted store without changing its semantics.
 */
import type { LaneId, OrbEvent, StoredEvent } from "./types.js";

/** Durable, append-only storage for one device's journal. */
export interface JournalStore {
  /**
   * Appends events to `lane` in the given order. Must be atomic per call and
   * durable before resolving: the journal treats a resolved append as history.
   */
  append(lane: LaneId, events: readonly OrbEvent[]): Promise<void>;
  /**
   * Every event in `lane`, in append order.
   *
   * Events whose payload this device has dropped come back as envelopes
   * (`hasPayload` is false). The envelope is never absent.
   */
  read(lane: LaneId): Promise<readonly StoredEvent[]>;
  /** Every lane this store holds, local and replicated. */
  lanes(): Promise<readonly LaneId[]>;
  /**
   * Drops the payloads of `eventIds` in `lane`, keeping their envelopes.
   *
   * This removes bytes; it is not a flag. A store that cannot actually reclaim
   * the space is not implementing this method, because the whole point is that
   * a compromised device no longer holds the content
   * (`docs/PARTIAL_REPLICATION.md` §1).
   *
   * The journal gates every call behind `evaluatePrune`; a store must not
   * second-guess the decision, only carry it out durably.
   *
   * @returns how many payloads were actually dropped.
   */
  detach(lane: LaneId, eventIds: readonly string[]): Promise<number>;
  /** Releases any held resources. Appends after `close` are errors. */
  close(): Promise<void>;
}

/** In-memory store. Loses history on exit — for tests and ephemeral runtimes. */
export class MemoryJournalStore implements JournalStore {
  readonly #lanes = new Map<LaneId, StoredEvent[]>();
  #closed = false;

  async append(lane: LaneId, events: readonly OrbEvent[]): Promise<void> {
    if (this.#closed) throw new Error("journal store is closed");
    const existing = this.#lanes.get(lane);
    if (existing) existing.push(...events);
    else this.#lanes.set(lane, [...events]);
  }

  async read(lane: LaneId): Promise<readonly StoredEvent[]> {
    return [...(this.#lanes.get(lane) ?? [])];
  }

  async lanes(): Promise<readonly LaneId[]> {
    return [...this.#lanes.keys()].sort();
  }

  async detach(lane: LaneId, eventIds: readonly string[]): Promise<number> {
    if (this.#closed) throw new Error("journal store is closed");
    const events = this.#lanes.get(lane);
    if (!events) return 0;

    const wanted = new Set(eventIds);
    let dropped = 0;

    for (const [index, event] of events.entries()) {
      if (!wanted.has(event.id) || event.payload === undefined) continue;
      // Rebuild without the key rather than setting it undefined, so the stored
      // shape matches what a file store round-trips through JSON.
      const { payload: _payload, ...envelope } = event as OrbEvent;
      events[index] = envelope;
      dropped += 1;
    }

    return dropped;
  }

  async close(): Promise<void> {
    this.#closed = true;
  }

  /** Test helper: total events held across all lanes. */
  get size(): number {
    let total = 0;
    for (const events of this.#lanes.values()) total += events.length;
    return total;
  }
}
