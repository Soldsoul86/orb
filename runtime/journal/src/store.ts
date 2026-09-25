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
   *
   * Takes `StoredEvent`, not `OrbEvent`, because replication legitimately
   * delivers envelopes whose payloads this device will not hold. Narrowing this
   * to `OrbEvent` makes a partial replica silently discard the history it was
   * sent, which is the worst failure this package has.
   */
  append(lane: LaneId, events: readonly StoredEvent[]): Promise<void>;
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
  /**
   * Restores payloads this device had dropped, or never fetched.
   *
   * The inverse of `detach`, and the arrival path for a payload pulled back
   * from a peer. The journal verifies each payload against the hash its
   * envelope commits to before calling this, so a store never has to trust the
   * source — that check is what lets a payload come from anywhere.
   *
   * Events not present in the lane are ignored: a payload for an event whose
   * envelope has not arrived yet is not history, it is noise.
   *
   * @returns how many payloads were actually restored.
   */
  attach(lane: LaneId, payloads: readonly PayloadRecord[]): Promise<number>;
  /** Releases any held resources. Appends after `close` are errors. */
  close(): Promise<void>;
}

/** A payload travelling on its own, identified by the event it belongs to. */
export interface PayloadRecord {
  readonly eventId: string;
  readonly payload: unknown;
}

/** In-memory store. Loses history on exit — for tests and ephemeral runtimes. */
export class MemoryJournalStore implements JournalStore {
  readonly #lanes = new Map<LaneId, StoredEvent[]>();
  #closed = false;

  async append(lane: LaneId, events: readonly StoredEvent[]): Promise<void> {
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

  async attach(lane: LaneId, payloads: readonly PayloadRecord[]): Promise<number> {
    if (this.#closed) throw new Error("journal store is closed");
    const events = this.#lanes.get(lane);
    if (!events) return 0;

    const incoming = new Map(payloads.map((record) => [record.eventId, record.payload]));
    let restored = 0;

    for (const [index, event] of events.entries()) {
      if (event.payload !== undefined) continue;
      const payload = incoming.get(event.id);
      if (payload === undefined) continue;
      events[index] = { ...event, payload };
      restored += 1;
    }

    return restored;
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
