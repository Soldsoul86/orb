/**
 * Journal storage ports.
 *
 * The journal service owns the invariants; a store owns only durability. Keeping
 * them apart lets the same journal run over memory (tests), a file (the device
 * runtime), or any future encrypted store without changing its semantics.
 */
import type { AbsenceReason, LaneId, OrbEvent, StoredEvent } from "./types.js";
import { detached, hasPayload } from "./types.js";

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
   * `absence` is recorded against each envelope and is **not optional**:
   * `pruned` and `erased` mean opposite things to every path that moves
   * payloads, and a store that cannot tell them apart will restore what its
   * owner destroyed (`docs/ERASURE.md` §7).
   *
   * **An already-absent payload can still be raised to `erased`.** A device that
   * never held a payload — `unfetched`, because its policy did not want it —
   * receives the owner's erasure declaration like any other event, and from that
   * moment must never fetch it. Without this it would keep the right to ask
   * forever, purely because it had not got round to asking yet.
   *
   * Reasons only ever move **toward** `erased`, and never back. `unfetched` is
   * not raised to `pruned`: that would claim this device once held something it
   * never held, and a horizon explained with a false history is worse than one
   * left unexplained (inv. 6).
   *
   * @returns how many events changed state — a payload dropped, or an absence
   * raised to `erased`.
   */
  detach(
    lane: LaneId,
    eventIds: readonly string[],
    absence: AbsenceReason,
    /**
     * What wanted these payloads gone, recorded on each as `prunedBecause`.
     *
     * Only meaningful for `pruned`: an erasure is explained by its declaration,
     * and a payload never fetched was never dropped. Omitted leaves the reason
     * unknown rather than assumed.
     */
    prunedBecause?: string,
  ): Promise<number>;
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
   * **An erased payload is never restored**, whatever the caller sends and
   * however well it verifies. This is the last line of the erasure guarantee:
   * every layer above should already have refused, and this one refuses anyway,
   * because the cost of a single missed check is the owner's destroyed content
   * coming back.
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

  async detach(
    lane: LaneId,
    eventIds: readonly string[],
    absence: AbsenceReason,
    prunedBecause?: string,
  ): Promise<number> {
    if (this.#closed) throw new Error("journal store is closed");
    const events = this.#lanes.get(lane);
    if (!events) return 0;

    const wanted = new Set(eventIds);
    let dropped = 0;

    for (const [index, event] of events.entries()) {
      if (!wanted.has(event.id)) continue;

      if (!hasPayload(event)) {
        // Already gone; only a raise to `erased` is a change worth making.
        if (absence !== "erased" || event.absence === "erased") continue;
        // The reason described a prune. The payload is now erased, which is a
        // different act with its own declaration, so carrying the old motive
        // beside it would describe the wrong disappearance.
        const { prunedBecause: _was, ...rest } = event;
        events[index] = { ...rest, absence };
        dropped += 1;
        continue;
      }

      // Rebuild without the key rather than setting it undefined, so the stored
      // shape matches what a file store round-trips through JSON.
      const { payload: _payload, ...envelope } = event as OrbEvent;
      events[index] = detached(envelope, absence, prunedBecause);
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
      if (hasPayload(event)) continue;
      // Erased is forever, and this is the last place that can still say no.
      if (event.absence === "erased") continue;
      const payload = incoming.get(event.id);
      if (payload === undefined) continue;
      // Drop `absence` rather than spreading it: a restored event holds its
      // payload, so a reason for not holding it would be a stale contradiction
      // sitting inside the same object. `prunedBecause` goes with it — it
      // explains an absence, and there is no longer one to explain.
      const { absence: _absence, prunedBecause: _because, ...envelope } = event;
      events[index] = { ...envelope, payload };
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
