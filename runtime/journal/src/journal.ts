/**
 * The Event Journal — Orb's single source of truth.
 *
 * Constitution Art. I: appends only, never mutates, hash-chains for
 * tamper-evidence. Art. IV §15: a device writes only its own lane and merely
 * replicates foreign lanes. Everything else in Orb is a projection of this.
 */
import { HybridLogicalClock, type Hlc, type PhysicalClock } from "./hlc.js";
import { hashEvent, hashPayload, verifyLane, ENVELOPE_VERSION } from "./integrity.js";
import type { LaneWatermark } from "./sync.js";
import { newEventId } from "./ids.js";
import { wrapPayload, isWrapped } from "./payload.js";
import { coarseType, coarseSchema } from "./vocabulary.js";
import type { JournalStore, PayloadRecord } from "./store.js";
import { MemoryJournalStore } from "./store.js";
import type { EventDraft, EventEnvelope, LaneId, OrbEvent, StoredEvent } from "./types.js";
import { hasPayload, JournalIntegrityError, RetentionError } from "./types.js";
import { latestCustody } from "./custody.js";
import { evaluatePrune, type RetentionPolicy } from "./retention.js";

export interface JournalOptions {
  /** This device's lane. The journal appends here and nowhere else. */
  readonly lane: LaneId;
  /** Stable device identity recorded on every event. */
  readonly device: string;
  readonly store?: JournalStore;
  readonly now?: PhysicalClock;
}

/**
 * Notified after events become durable. Listeners must not throw.
 *
 * Receives `StoredEvent`: replicated history may arrive as envelopes whose
 * payloads this device does not hold, and a listener that never saw those would
 * be building a projection over a subset without knowing it.
 */
export type JournalListener = (events: readonly StoredEvent[]) => void;

/** What one lane is missing on this device. */
export interface LaneHorizon {
  readonly lane: LaneId;
  readonly events: number;
  readonly withPayload: number;
  readonly detached: number;
  /** Ids of events whose payloads this device does not hold. */
  readonly missing: readonly string[];
}

/**
 * The bound on what this device can answer.
 *
 * `complete` is the only honest basis for an unqualified answer; anything else
 * must be reported alongside the result.
 */
export interface Horizon {
  readonly complete: boolean;
  readonly missing: number;
  readonly lanes: readonly LaneHorizon[];
}

/**
 * A stored event turned back into the event its writer wrote.
 *
 * History holds a coarse envelope over a wrapped payload: type `orb.content`, a
 * schema describing *an encrypted payload*, no stated lineage, and a payload
 * carrying the real type, schema, causes and a nonce (`docs/ERASURE.md` §2b,
 * §2a). That is what a witness sees and what compulsion reaches. It is not what
 * a projection should have to parse.
 *
 * So presentation restores all four — fine type, fine schema, causes, and the
 * caller's own payload — and **carries the nonce alongside** so the wrapper can
 * be rebuilt. Without the nonce the restored event would be unverifiable in the
 * hand, and the failure mode is the dangerous one: a caller verifies what it
 * just read and is told its history is corrupt when nothing is wrong. That bug
 * already happened once today, in `verifyLane` against sealed payloads (§5g).
 *
 * The alternative considered and rejected was to present nothing and export
 * `unwrapPayload` for callers to use. It verifies trivially, but it pushes the
 * migration's cost onto every projection ever written, permanently, and
 * `replay` was the proof: every projection in the system broke at once. A cost
 * paid here, in one function, is the cheaper and the more reversible one.
 *
 * **An event whose payload is gone is presented untouched** — coarse type, no
 * causes. Not a degradation to work around: erasing a payload erases what the
 * event was built on, and a reader that recovered it from elsewhere would have
 * defeated the erasure. `causes` being `undefined` rather than `[]` is what
 * tells `lineage.ts` the difference between *built on nothing* and *cannot say*.
 */
function presented(event: StoredEvent): StoredEvent {
  if (!hasPayload(event) || !isWrapped(event.payload)) return event;
  const wrapper = event.payload;
  return {
    ...event,
    type: wrapper.type,
    schema: wrapper.schema,
    causes: wrapper.causes,
    payload: wrapper.data,
    nonce: wrapper.nonce,
  };
}

export class Journal {
  readonly lane: LaneId;
  readonly device: string;

  readonly #store: JournalStore;
  readonly #clock: HybridLogicalClock;
  readonly #now: PhysicalClock;
  readonly #listeners = new Set<JournalListener>();

  /** Hash of the last event appended to the local lane; `null` until first append. */
  #head: string | null = null;
  /** Serialises appends so identity, HLC and hash chain advance atomically. */
  #tail: Promise<unknown> = Promise.resolve();
  #opened = false;

  private constructor(options: JournalOptions, store: JournalStore) {
    this.lane = options.lane;
    this.device = options.device;
    this.#store = store;
    this.#now = options.now ?? (() => Date.now());
    this.#clock = new HybridLogicalClock(this.#now);
  }

  /**
   * Opens a journal over `store`, restoring the local lane's head and clock so
   * a restarted process continues the same chain rather than forking it.
   */
  static async open(options: JournalOptions): Promise<Journal> {
    const store = options.store ?? new MemoryJournalStore();
    const journal = new Journal(options, store);
    await journal.#restore();
    return journal;
  }

  async #restore(): Promise<void> {
    const existing = await this.#store.read(this.lane);
    verifyLane(existing);

    const last = existing.at(-1);
    if (last) {
      this.#head = last.integrity.hash;
      this.#clock.merge(last.hlc);
    }

    // Carry every replicated lane's causal knowledge into the local clock, so a
    // local append never appears to precede something it already knows about.
    for (const lane of await this.#store.lanes()) {
      if (lane === this.lane) continue;
      const foreign = await this.#store.read(lane);
      const foreignLast = foreign.at(-1);
      if (foreignLast) this.#clock.merge(foreignLast.hlc);
    }

    this.#opened = true;
  }

  /** The HLC this journal would extend. Exposed for diagnostics and tests. */
  get clock(): Hlc {
    return this.#clock.last;
  }

  /**
   * Appends drafts to the local lane as one atomic, durable batch.
   *
   * Appends are serialised: concurrent callers are ordered by arrival, and each
   * batch's ids, HLCs and hashes are assigned without interleaving.
   */
  async append(drafts: readonly EventDraft[]): Promise<readonly OrbEvent[]> {
    if (!this.#opened) throw new Error("journal is not open");
    if (drafts.length === 0) return [];

    const result = this.#tail.then(() => this.#appendNow(drafts));
    this.#tail = result.catch(() => undefined);
    return result;
  }

  /** Convenience for the common single-event case. */
  async appendOne<P>(draft: EventDraft<P>): Promise<OrbEvent<P>> {
    const [event] = await this.append([draft]);
    if (!event) throw new Error("append produced no event");
    return event as OrbEvent<P>;
  }

  async #appendNow(drafts: readonly EventDraft[]): Promise<readonly OrbEvent[]> {
    // Two shapes, kept deliberately apart. `stored` is what history holds: a
    // coarse envelope over a wrapped payload. `events` is what the caller gets
    // back: the event it wrote. Collapsing them into one would mean either the
    // caller seeing the wrapper or the store holding the fine type, and both
    // were the point of the migration.
    const stored: OrbEvent[] = [];
    const events: OrbEvent[] = [];
    let previous = this.#head;

    for (const draft of drafts) {
      const hlc = this.#clock.tick();
      const wallClock = this.#now();
      const causes = draft.causes ?? [];
      const id = newEventId(wallClock);

      // The real type, schema and causes go inside the payload, together with a
      // nonce; the envelope keeps a coarse type and a schema describing *an
      // encrypted payload* (`docs/ERASURE.md` §2b, §2a).
      //
      // Wrapping happens here and not in a store decorator, because
      // `payloadHash` must commit to the nonced form. A nonce the hash does not
      // cover defeats nothing: the oracle it closes works on the hash.
      const wrapped = wrapPayload({
        data: draft.payload,
        causes,
        schema: draft.schema,
        type: draft.type,
      });
      const payloadHash = hashPayload(wrapped);

      // No `causes` here, and that is the whole of the lineage ruling: an
      // envelope states no derivation, so erasing a payload erases what the
      // event was built on. A witness holding envelopes learns that events
      // happened, never how they were reasoned from one another.
      const envelope = {
        v: ENVELOPE_VERSION,
        id,
        lane: this.lane,
        device: this.device,
        hlc,
        wallClock,
        type: coarseType(draft.type),
        schema: coarseSchema(draft.type, draft.schema),
      };
      const hash = hashEvent({ ...envelope, previous, payloadHash });
      const integrity = { previous, hash, payloadHash };

      stored.push({ ...envelope, payload: wrapped as unknown, integrity });

      // What the caller gets back is the event it wrote, presented exactly as a
      // later read would present it — same fine type, same payload, same nonce.
      // Writing and reading must not disagree about what an event is.
      events.push({
        ...envelope,
        type: draft.type,
        schema: draft.schema,
        causes,
        payload: draft.payload,
        nonce: wrapped.nonce,
        integrity,
      });

      previous = hash;
    }

    await this.#store.append(this.lane, stored);
    this.#head = previous;

    for (const listener of this.#listeners) listener(events);
    return events;
  }

  /**
   * Adopts events from a foreign lane (Art. IV §18: merge is set union of
   * immutable lanes). Rejects anything claiming to be this device's lane.
   *
   * Accepts bare envelopes as well as stored events, because that is what
   * anti-entropy delivers: envelopes replicate in full and payloads are pulled
   * afterwards, only for what this device's policy wants (inv. 1). An envelope
   * arriving without a payload is marked `unfetched` here rather than at each
   * call site — the journal owns the invariant that absence always carries a
   * reason, so a store can never be handed an absence that does not explain
   * itself.
   */
  async replicate(
    lane: LaneId,
    events: readonly (StoredEvent | EventEnvelope)[],
  ): Promise<void> {
    if (lane === this.lane) {
      throw new JournalIntegrityError("a device never accepts writes to its own lane", { lane });
    }
    if (events.some((event) => event.lane !== lane)) {
      throw new JournalIntegrityError("replicated event does not belong to the named lane", { lane });
    }

    const arriving: readonly StoredEvent[] = events.map((event) =>
      "payload" in event && event.payload !== undefined
        ? (event as StoredEvent)
        : { ...(event as EventEnvelope), payload: undefined, absence: "unfetched" as const },
    );

    const existing = await this.#store.read(lane);
    const known = new Set(existing.map((event) => event.id));
    const fresh = arriving.filter((event) => !known.has(event.id));
    if (fresh.length === 0) return;

    verifyLane([...existing, ...fresh]);
    await this.#store.append(lane, fresh);

    const last = fresh.at(-1);
    if (last) this.#clock.merge(last.hlc);
    for (const listener of this.#listeners) listener(fresh);
  }

  /** Every event in every lane, unordered. Use `replay` for ordered folding. */
  async readAll(): Promise<readonly StoredEvent[]> {
    const out: StoredEvent[] = [];
    for (const lane of await this.#store.lanes()) out.push(...(await this.#store.read(lane)));
    return out.map(presented);
  }

  async readLane(lane: LaneId): Promise<readonly StoredEvent[]> {
    return (await this.#store.read(lane)).map(presented);
  }

  async lanes(): Promise<readonly LaneId[]> {
    return this.#store.lanes();
  }

  /**
   * What this device cannot answer from its own store.
   *
   * A device holds every envelope, so it knows exactly which payloads it is
   * missing rather than guessing. That is what lets a projection say "I cannot
   * answer that" instead of quietly returning a wrong answer
   * (`docs/PARTIAL_REPLICATION.md` §5).
   */
  async horizon(): Promise<Horizon> {
    const lanes: LaneHorizon[] = [];
    let missing = 0;

    for (const lane of await this.#store.lanes()) {
      const events = await this.#store.read(lane);
      const absent = events.filter((event) => !hasPayload(event)).map((event) => event.id);
      missing += absent.length;
      lanes.push({
        lane,
        events: events.length,
        withPayload: events.length - absent.length,
        detached: absent.length,
        missing: absent,
      });
    }

    return { complete: missing === 0, missing, lanes };
  }

  /**
   * Drops the payloads named, keeping their envelopes.
   *
   * Every event is checked against `evaluatePrune` first and the whole call is
   * refused if any one of them fails, because a partial prune would leave the
   * caller unsure which payloads still exist. Art. I is untouched: the events
   * remain in history, chained and ordered, and only this device's copy of the
   * content goes away (`docs/PARTIAL_REPLICATION.md` §10).
   *
   * @throws {RetentionError} naming the first event that may not be dropped.
   */
  async detach(
    lane: LaneId,
    eventIds: readonly string[],
    policy: RetentionPolicy,
  ): Promise<number> {
    if (!this.#opened) throw new Error("journal is not open");
    if (eventIds.length === 0) return 0;

    const laneEvents = await this.#store.read(lane);
    const custody = latestCustody(await this.readAll(), lane);
    const byId = new Map(laneEvents.map((event) => [event.id, event]));

    for (const id of eventIds) {
      const event = byId.get(id);
      if (!event) {
        throw new RetentionError("event is not in this lane", { lane, eventId: id });
      }
      if (!hasPayload(event)) continue;

      const decision = evaluatePrune({
        event,
        lane: laneEvents,
        selfDevice: this.device,
        custody,
        policy,
      });
      if (!decision.permitted) {
        throw new RetentionError(`refusing to drop payload: ${decision.reason}`, {
          lane,
          eventId: id,
          holders: decision.holders,
        });
      }
    }

    // Pruning, explicitly. Erasure is a different act with a different
    // declaration and reaches the store by its own path (`erasure.ts`); routing
    // both through one call is how a store ends up unable to tell a payload it
    // may fetch back from one it must never see again.
    return this.#store.detach(lane, eventIds, "pruned");
  }

  /**
   * How far this device has seen in every lane it holds.
   *
   * The advertisement half of anti-entropy (`SYNC_PROTOCOL.md` §4.2). Because
   * lanes are hash-chained and single-writer, a head hash names the gap
   * unambiguously.
   */
  async advertise(): Promise<readonly LaneWatermark[]> {
    const out: LaneWatermark[] = [];
    for (const lane of await this.#store.lanes()) {
      const events = await this.#store.read(lane);
      out.push({ lane, head: events.at(-1)?.integrity.hash ?? null, count: events.length });
    }
    return out;
  }

  /**
   * The envelopes in `lane` after `afterHash`, or the whole lane when it is null.
   *
   * Envelopes only, and never withheld: `PARTIAL_REPLICATION.md` §9 inv. 1 —
   * partiality is about what a device *retains*, never about what it *emits*.
   * A device is never the sole holder of anything it produced.
   *
   * An `afterHash` this device does not know yields nothing: the peer is ahead
   * of us, or the chains diverge. Either way we have nothing to give, and the
   * other direction of the exchange settles it.
   */
  async tail(lane: LaneId, afterHash: string | null): Promise<readonly EventEnvelope[]> {
    const events = await this.#store.read(lane);
    const envelopes = events.map((event) => {
      const { payload: _payload, ...envelope } = event as OrbEvent;
      return envelope;
    });

    if (afterHash === null) return envelopes;
    const at = envelopes.findIndex((envelope) => envelope.integrity.hash === afterHash);
    return at === -1 ? [] : envelopes.slice(at + 1);
  }

  /** The payloads this device actually holds, of those asked for. */
  async payloads(lane: LaneId, eventIds: readonly string[]): Promise<readonly PayloadRecord[]> {
    const wanted = new Set(eventIds);
    const events = await this.#store.read(lane);
    const out: PayloadRecord[] = [];

    for (const event of events) {
      if (!wanted.has(event.id) || !hasPayload(event)) continue;
      out.push({ eventId: event.id, payload: event.payload });
    }
    return out;
  }

  /**
   * Takes payloads back into this device, verifying each against history first.
   *
   * A payload is accepted only when it hashes to what its envelope already
   * commits to, so it may come from a peer, a relay, or anywhere else without
   * that source being trusted (`PARTIAL_REPLICATION.md` §3). Anything that does
   * not match is rejected rather than stored and flagged.
   *
   * @throws {JournalIntegrityError} on the first payload that does not match.
   */
  async attach(lane: LaneId, payloads: readonly PayloadRecord[]): Promise<number> {
    if (!this.#opened) throw new Error("journal is not open");
    if (payloads.length === 0) return 0;

    const events = await this.#store.read(lane);
    const byId = new Map(events.map((event) => [event.id, event]));

    for (const record of payloads) {
      const event = byId.get(record.eventId);
      if (!event) continue; // an envelope we have not replicated yet is not history here
      if (hashPayload(record.payload) !== event.integrity.payloadHash) {
        throw new JournalIntegrityError("payload does not match the hash its envelope commits to", {
          lane,
          eventId: record.eventId,
        });
      }
    }

    return this.#store.attach(lane, payloads);
  }

  /** Verifies every lane's hash chain. Throws on the first corruption found. */
  async verify(): Promise<void> {
    for (const lane of await this.#store.lanes()) verifyLane(await this.#store.read(lane));
  }

  /** Subscribes to durable appends. Returns an unsubscribe function. */
  subscribe(listener: JournalListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async close(): Promise<void> {
    await this.#tail;
    this.#opened = false;
    this.#listeners.clear();
    await this.#store.close();
  }
}
