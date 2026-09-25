/**
 * Anti-entropy replication between equal peers.
 *
 * `SYNC_PROTOCOL.md` §4. Each peer advertises how far it has seen per lane, the
 * other sends the missing tail, the receiver verifies the chain before
 * accepting, and HLCs merge. There is no conflict to resolve: lanes are
 * single-writer and append-only, so the union is always well defined.
 *
 * Two things this layer adds over that document, both from
 * `docs/PARTIAL_REPLICATION.md`:
 *
 * - **Envelopes and payloads travel separately.** Envelopes always replicate in
 *   full — inv. 1, a device is never the sole holder of anything it produced.
 *   Payloads are pulled afterwards, only for what the receiving device's own
 *   policy says it should hold.
 * - **A round ends by recording what was held and under which policy** — inv. 6.
 *   Without that, a horizon is unexplainable: "why does my phone not know this?"
 *   has no answer.
 *
 * Transport, discovery, device identity and encryption are deliberately absent.
 * They live behind `SyncPeer`, which is injected exactly as `JournalStore` is,
 * so adding them later changes no semantics here (`SECURITY.md` §10).
 */
import type { EventEnvelope, LaneId } from "./types.js";
import type { PayloadRecord } from "./store.js";
import type { Journal } from "./journal.js";
import {
  CUSTODY_RECEIPT_TYPE,
  custodyReceiptDraft,
  custodyReceiptFor,
  latestCustody,
} from "./custody.js";

/** How far a peer has seen in one lane. */
export interface LaneWatermark {
  readonly lane: LaneId;
  /** Hash of the last event held, or null when the peer holds none of this lane. */
  readonly head: string | null;
  readonly count: number;
}

/**
 * The remote half of an exchange.
 *
 * Every method is read-only with respect to the peer: a device never pushes
 * into another device, it only answers what it is asked. That keeps Art. IV §15
 * mechanical — nothing can write a lane it does not own, because nothing writes
 * remotely at all.
 */
export interface SyncPeer {
  /** Stable identity of the device on the other end. */
  readonly device: string;
  /** What this peer holds, per lane. */
  advertise(): Promise<readonly LaneWatermark[]>;
  /** Envelopes in `lane` after `afterHash`; the whole lane when null. */
  tail(lane: LaneId, afterHash: string | null): Promise<readonly EventEnvelope[]>;
  /** Payloads the peer holds, of those asked for. */
  payloads(lane: LaneId, eventIds: readonly string[]): Promise<readonly PayloadRecord[]>;
}

/**
 * Which payloads this device chooses to hold.
 *
 * `wants` is the device's own decision and no other device consults it — inv. 7,
 * no device decides what another may hold. `describe` is what gets journaled, so
 * the horizon can be explained later.
 */
export interface PayloadPolicy {
  readonly describe: string;
  wants(envelope: EventEnvelope): boolean;
}

/** Hold everything. The right policy for a home server or any durability peer. */
export function holdEverything(): PayloadPolicy {
  return { describe: "hold:everything", wants: () => true };
}

/** Hold nothing — envelopes only. The most exposed a device can be without being blind. */
export function holdNothing(): PayloadPolicy {
  return { describe: "hold:nothing", wants: () => false };
}

/**
 * Hold payloads newer than `windowMs`, by the event's own wall clock.
 *
 * Wall clock is not an ordering (`EVENT_MODEL.md`), and this does not use it as
 * one — retention is a local storage choice, not a claim about what happened
 * before what.
 */
export function holdSince(windowMs: number, now: () => number = Date.now): PayloadPolicy {
  return {
    describe: `hold:since:${windowMs}ms`,
    wants: (envelope) => now() - envelope.wallClock <= windowMs,
  };
}

/** Hold payloads of the named event types only. */
export function holdTypes(types: readonly string[]): PayloadPolicy {
  const wanted = new Set(types);
  return {
    describe: `hold:types:${[...wanted].sort().join(",")}`,
    wants: (envelope) => wanted.has(envelope.type),
  };
}

export const SYNC_POLICY_TYPE = "orb.sync.policy";
export const SYNC_POLICY_SCHEMA = { id: "orb.sync.policy", version: 1 } as const;

/**
 * The payload policy a device put into force.
 *
 * `PARTIAL_REPLICATION.md` §9 inv. 6 asks for *policy changes* to be journaled,
 * not for every round to be. That distinction is what makes sync converge: see
 * `isBookkeeping` below.
 */
export interface SyncPolicyRecord {
  readonly policy: string;
}

/**
 * Bookkeeping a sync round produces about itself.
 *
 * These events are real history and replicate like any other — a peer needs
 * custody receipts to evaluate its own pruning. But they must never *cause*
 * more bookkeeping, or sync would never converge: each round would replicate
 * the last round's records and record that it had done so, forever.
 */
function isBookkeeping(event: { readonly type: string }): boolean {
  return event.type === CUSTODY_RECEIPT_TYPE || event.type === SYNC_POLICY_TYPE;
}

/** What one exchange did. Returned to the caller; not itself history. */
export interface SyncRound {
  /** The device on the other end. */
  readonly peer: string;
  /** `PayloadPolicy.describe` — the policy in force for this round. */
  readonly policy: string;
  /** Envelopes newly accepted, by lane. */
  readonly envelopes: Readonly<Record<string, number>>;
  /** Payloads newly held, by lane. */
  readonly payloads: Readonly<Record<string, number>>;
  /** Lanes whose advertised head this device could not place. */
  readonly unplaced: readonly string[];
}

export interface SyncResult {
  readonly round: SyncRound;
  /** Total envelopes accepted across all lanes. */
  readonly envelopes: number;
  /** Total payloads attached across all lanes. */
  readonly payloads: number;
}

/**
 * Pulls once from `peer` into `journal`.
 *
 * One direction only. A full exchange is this called from both sides, which is
 * what keeps each device's writes its own: nothing is ever pushed.
 *
 * Order matters and is not arbitrary — envelopes are accepted and verified
 * before any payload is requested, so a payload always arrives to an envelope
 * that already commits to its hash and can therefore reject it.
 */
export async function pullFrom(
  journal: Journal,
  peer: SyncPeer,
  policy: PayloadPolicy,
): Promise<SyncResult> {
  const mine = new Map((await journal.advertise()).map((mark) => [mark.lane, mark]));
  const envelopeCounts: Record<string, number> = {};
  const payloadCounts: Record<string, number> = {};
  const unplaced: string[] = [];
  let envelopes = 0;
  let payloads = 0;

  for (const theirs of await peer.advertise()) {
    // A device never adopts a foreign copy of its own lane: it is the writer,
    // and Art. IV §15 makes anything else a forgery by definition.
    //
    // Payloads are a different matter and are handled below even for the local
    // lane. Re-fetching a payload this device pruned is the recovery path, and
    // it is safe precisely because the envelope is ours and already commits to
    // the payload's hash — a peer returning the wrong bytes is rejected.
    const isOwnLane = theirs.lane === journal.lane;

    if (!isOwnLane) {
      const ours = mine.get(theirs.lane);
      const tail = await peer.tail(theirs.lane, ours?.head ?? null);

      if (tail.length > 0) {
        await journal.replicate(theirs.lane, tail);
        envelopeCounts[theirs.lane] = tail.length;
        envelopes += tail.length;
      } else if (ours && ours.count < theirs.count) {
        // The peer is ahead but could not place our head in its own lane.
        // Either we hold something it does not, or the chains diverge; recorded
        // rather than patched, because `SYNC_PROTOCOL.md` §4.3 rejects, never
        // repairs.
        unplaced.push(theirs.lane);
      }
    }

    // Payloads come second, and only for what this device chooses to hold.
    const held = await journal.readLane(theirs.lane);
    const wanted = held
      .filter((event) => event.payload === undefined && policy.wants(event))
      .map((event) => event.id);
    if (wanted.length === 0) continue;

    const fetched = await peer.payloads(theirs.lane, wanted);
    if (fetched.length === 0) continue;

    const attached = await journal.attach(theirs.lane, fetched);
    if (attached > 0) {
      payloadCounts[theirs.lane] = attached;
      payloads += attached;
    }
  }

  const round: SyncRound = {
    peer: peer.device,
    policy: policy.describe,
    envelopes: envelopeCounts,
    payloads: payloadCounts,
    unplaced,
  };

  // A round is not itself history: it is returned, not appended. What gets
  // journaled is the policy in force when it changes (inv. 6), and custody
  // that has actually advanced — both of which a later reader needs in order to
  // explain a horizon, and neither of which grows on an idle sync.
  const drafts = [...(await policyDraft(journal, policy)), ...(await advancedCustody(journal))];
  if (drafts.length > 0) await journal.append(drafts);

  return { round, envelopes, payloads };
}

/**
 * Records the payload policy when it differs from the last one recorded.
 *
 * Answers "why does this device not hold that?" from history alone, which is
 * the whole purpose of inv. 6. An unchanged policy records nothing.
 */
async function policyDraft(journal: Journal, policy: PayloadPolicy) {
  const own = await journal.readLane(journal.lane);

  for (let index = own.length - 1; index >= 0; index -= 1) {
    const event = own[index];
    if (!event || event.type !== SYNC_POLICY_TYPE) continue;
    const recorded = event.payload as SyncPolicyRecord | undefined;
    return recorded?.policy === policy.describe ? [] : [policyEvent(policy)];
  }

  return [policyEvent(policy)];
}

function policyEvent(policy: PayloadPolicy) {
  return {
    type: SYNC_POLICY_TYPE,
    schema: SYNC_POLICY_SCHEMA,
    payload: { policy: policy.describe } satisfies SyncPolicyRecord,
  };
}

/**
 * Receipts for lanes where this device's custody has actually advanced.
 *
 * Custody is asserted only for what is held, so a device that fetched nothing
 * claims nothing — which is what keeps the prune guard honest, since a receipt
 * is the only evidence it accepts. Re-stating an unchanged watermark every
 * round would be pure noise, so a receipt is drafted only when it reaches
 * further than the last one this device recorded.
 */
async function advancedCustody(journal: Journal) {
  const own = await journal.readLane(journal.lane);
  const drafts = [];

  for (const lane of await journal.lanes()) {
    if (lane === journal.lane) continue;

    const events = await journal.readLane(lane);
    const receipt = custodyReceiptFor(lane, events);
    if (!receipt) continue;

    const claimed = latestCustody(own, lane).find((held) => held.holder === journal.device);
    const previous = claimed?.receipt.count ?? 0;
    if (previous >= receipt.count) continue;

    // Custody that advanced over nothing but other devices' bookkeeping is true
    // and not worth saying. Recording it would make every round produce a
    // receipt that the next round would replicate and receipt in turn.
    const gained = events.slice(previous, receipt.count);
    if (gained.every(isBookkeeping)) continue;

    drafts.push(custodyReceiptDraft(receipt));
  }

  return drafts;
}

/**
 * A peer backed by a Journal in this process.
 *
 * The in-process case is not a test double: two runtimes on one machine are a
 * real deployment, and it is the shape every transport wraps.
 */
export class LocalSyncPeer implements SyncPeer {
  readonly device: string;
  readonly #journal: Journal;

  constructor(journal: Journal) {
    this.#journal = journal;
    this.device = journal.device;
  }

  async advertise(): Promise<readonly LaneWatermark[]> {
    return this.#journal.advertise();
  }

  async tail(lane: LaneId, afterHash: string | null): Promise<readonly EventEnvelope[]> {
    return this.#journal.tail(lane, afterHash);
  }

  async payloads(lane: LaneId, eventIds: readonly string[]): Promise<readonly PayloadRecord[]> {
    return this.#journal.payloads(lane, eventIds);
  }
}

/** Both directions of one exchange. Peers are equal; neither initiates by right. */
export async function exchange(
  a: Journal,
  aPolicy: PayloadPolicy,
  b: Journal,
  bPolicy: PayloadPolicy,
): Promise<readonly [SyncResult, SyncResult]> {
  const intoA = await pullFrom(a, new LocalSyncPeer(b), aPolicy);
  const intoB = await pullFrom(b, new LocalSyncPeer(a), bPolicy);
  return [intoA, intoB];
}
