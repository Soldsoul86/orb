/**
 * The prune guard — the one rule that, if wrong, loses history.
 *
 * `docs/PARTIAL_REPLICATION.md` §4 and §9 inv. 4. A payload may be dropped only
 * with journaled evidence that it survives elsewhere. This module is pure and
 * total so the rule can be tested exhaustively rather than trusted.
 *
 * It refuses by default. Every path that is not provably safe returns a refusal
 * with a reason, because the failure it guards against is silent and permanent.
 */
import type { HeldCustody } from "./custody.js";
import type { EventEnvelope } from "./types.js";

export interface RetentionPolicy {
  /**
   * Devices the user owns, in the sense of Art. VIII §30.
   *
   * A relay is **never** listed here. Art. IV §16 lets a relay hold ciphertext
   * and so count toward durability, but if a relay were the only other holder
   * the cloud would become load-bearing and Art. VIII §31 — "Orb remains useful
   * with no network" — would quietly become false.
   */
  readonly ownedDevices: readonly string[];
  /**
   * Devices permitted to prune, most-eager first.
   *
   * This is what makes concurrent pruning safe without any coordination: a
   * device may prune only once every device ahead of it has stopped holding the
   * payload, so at most one device in the set is ever eligible at a time. It
   * also matches intent — put the phone first and the home server last, or
   * leave the home server out entirely so it never prunes.
   *
   * A device absent from this list may never prune.
   */
  readonly pruneOrder: readonly string[];
  /** Holders required besides this device. Never honoured below 2. */
  readonly minHolders?: number;
}

export interface PruneDecision {
  readonly permitted: boolean;
  /** Why, in terms a human can act on. Present whether permitted or refused. */
  readonly reason: string;
  /** Devices other than this one that hold the payload, per their receipts. */
  readonly holders: readonly string[];
}

export interface PruneRequest {
  /** The event whose payload might be dropped. */
  readonly event: EventEnvelope;
  /** That event's lane, in append order. Envelopes suffice. */
  readonly lane: readonly EventEnvelope[];
  /** The device considering the prune. */
  readonly selfDevice: string;
  /** Latest custody asserted for this lane, by device. See `latestCustody`. */
  readonly custody: readonly HeldCustody[];
  readonly policy: RetentionPolicy;
}

/** Holders are floored at 2 regardless of policy: one remaining copy is not durability. */
const MINIMUM_HOLDERS = 2;

function refuse(reason: string, holders: readonly string[]): PruneDecision {
  return { permitted: false, reason, holders };
}

/**
 * Decides whether `selfDevice` may drop the payload of `event`.
 *
 * Refuses unless every condition in `PARTIAL_REPLICATION.md` §4 holds.
 */
export function evaluatePrune(request: PruneRequest): PruneDecision {
  const { event, lane, selfDevice, custody, policy } = request;
  const required = Math.max(policy.minHolders ?? MINIMUM_HOLDERS, MINIMUM_HOLDERS);

  const position = lane.findIndex((candidate) => candidate.id === event.id);
  if (position === -1) {
    return refuse("event is not in the lane supplied, so custody cannot be resolved", []);
  }

  // A receipt covers the event when its watermark sits at or beyond the event's
  // position. Custody of a prefix is what `custodyReceiptFor` asserts, so a
  // watermark found earlier in the lane simply does not reach this event.
  const covering = custody.filter((held) => {
    if (held.holder === selfDevice) return false; // never count your own receipt
    if (held.receipt.lane !== event.lane) return false;
    const watermark = lane.findIndex(
      (candidate) => candidate.integrity.hash === held.receipt.throughHash,
    );
    return watermark >= position;
  });

  const holders = covering.map((held) => held.holder);

  if (!policy.pruneOrder.includes(selfDevice)) {
    return refuse("this device is not permitted to prune by policy", holders);
  }

  // Serialise pruning across devices with no coordination: everyone ahead of us
  // in the order must already have stopped holding this payload.
  const rank = policy.pruneOrder.indexOf(selfDevice);
  const eagerStillHolding = policy.pruneOrder
    .slice(0, rank)
    .filter((device) => holders.includes(device));
  if (eagerStillHolding.length > 0) {
    return refuse(
      `a device earlier in the prune order still holds this payload: ${eagerStillHolding.join(", ")}`,
      holders,
    );
  }

  // The originating device is the backstop: it is the one device guaranteed to
  // have held the payload, so it gives up its copy only with margin to spare.
  const isOriginator = selfDevice === event.device;
  const needed = isOriginator ? required + 1 : required;

  if (holders.length < needed) {
    return refuse(
      isOriginator
        ? `this device produced the event and is the backstop, so it needs ${needed} other holders; ${holders.length} have custody`
        : `needs ${needed} other holders; ${holders.length} have custody`,
      holders,
    );
  }

  const owned = holders.filter((holder) => policy.ownedDevices.includes(holder));
  if (owned.length === 0) {
    return refuse(
      "no device the user owns holds this payload; a relay alone is not durability",
      holders,
    );
  }

  return {
    permitted: true,
    reason: `${holders.length} other holders, ${owned.length} of them owned`,
    holders,
  };
}
