/**
 * Device revocation — the first record one device makes *about another*.
 *
 * `docs/reviews/RECORDS.md` §2, answering `INFRASTRUCTURE.md`'s question of where
 * `Encryption.md` §7's revocation lives. It is an Event type, like
 * `orb.custody.receipt` and `orb.erasure`, and needs no kernel contract for the
 * same reason they do not.
 *
 * **It breaks their pattern in one way, deliberately.** Custody says *I hold*.
 * Erasure says *I destroyed*. Both are a device speaking about itself, which is
 * what makes `event.device` sufficient and what makes them unforgeable — a device
 * writes only its own lane (`SECURITY.md` §4). Revocation is a device speaking
 * about a *different* device, so the subject cannot be the lane and has to be a
 * field.
 *
 * That raises Art. IV §14 — devices are equal peers, none authoritative — because
 * if A may revoke B and B may revoke A, either each outranks the other or the act
 * means nothing. **The authority is the user, not the device.** Enrolment is
 * already "an explicit, authenticated action initiated from an existing trusted
 * device" with no remote authority able to add one (`SECURITY.md` §4); revocation
 * is that act inverted, and the lane it lands on records where the user's
 * instruction happened to be given — never that one device outranks another.
 *
 * Two limits, stated here rather than discovered:
 *
 * **A revoked device can still write its own lane.** Nothing stops it; it holds
 * its key. What changes is that other devices stop *accepting* what it writes
 * after `fromHash`. Revocation is a rule about acceptance, enforced independently
 * by every peer — never a rule about writing, which no one can enforce.
 *
 * **A device cannot reliably be told it is revoked.** A stolen phone may never
 * sync again. So revocation is effective exactly where it is known, and the honest
 * sentence has the same shape as an unconfirmed erasure: *"revoked, and four of
 * five peers have seen it."*
 */
import type { EventDraft, StoredEvent } from "./types.js";
import { unwrapPayload } from "./payload.js";

export const REVOCATION_TYPE = "orb.device.revoked";
export const REVOCATION_SCHEMA = { id: "orb.device.revoked", version: 1 } as const;

/**
 * A statement that one device's later writes are no longer to be accepted.
 *
 * Two fields, and the second is what keeps Art. I §2 intact: revocation is a
 * statement about the *future*, so it names the point from which acceptance
 * stops. Without it, "revoked" would be ambiguous between *stop here* and *none
 * of it ever counted* — and the second reading would retroactively invalidate
 * history the device legitimately wrote, which no one is permitted to do.
 *
 * Deliberately carries **no reason**. `ERASURE.md` §2b's argument applies
 * unchanged: a legible record of *why* a device was revoked is readable by every
 * peer and by any witness, including one holding no payloads. "Lost in a taxi",
 * "sold", "seized" are facts about a person's life written in plaintext to
 * everything that syncs.
 */
export interface RevocationRecord {
  /** The device identity whose later events are no longer accepted. */
  readonly device: string;
  /**
   * Acceptance stops *after* this envelope hash on that device's lane.
   *
   * Events up to and including it stay valid, attributed and readable — the
   * device wrote them while trusted. A null means the device is revoked from its
   * lane's beginning, which is the enrolment-was-a-mistake case and is rare
   * enough to be worth spelling differently from the ordinary one.
   */
  readonly fromHash: string | null;
}

export function revocationDraft(record: RevocationRecord): EventDraft<RevocationRecord> {
  return { type: REVOCATION_TYPE, schema: REVOCATION_SCHEMA, payload: record };
}

export function isRevocation(event: StoredEvent): boolean {
  return event.type === REVOCATION_TYPE;
}

/**
 * Every device declared revoked across the events supplied, with the point
 * acceptance stops.
 *
 * A pure projection, never stored, so a replica that receives a revocation late
 * arrives at the same answer as one that had it all along (Art. I §3).
 *
 * **The earliest `fromHash` wins when a device is revoked more than once.** Two
 * revocations are not a contradiction — a second, earlier one is someone deciding
 * the device was untrustworthy sooner than first thought — and taking the
 * narrower bound is the direction that fails safe. A null (revoked from the
 * beginning) is the narrowest of all and beats any hash.
 */
export function revokedDevices(
  events: Iterable<StoredEvent>,
): ReadonlyMap<string, string | null> {
  const revoked = new Map<string, string | null>();
  // Which devices already carry a null, so a later hash cannot widen them again.
  const fromBeginning = new Set<string>();

  for (const event of events) {
    if (!isRevocation(event)) continue;
    const record = unwrapPayload(event.payload) as RevocationRecord | undefined;
    if (!record?.device) continue;

    if (record.fromHash === null) {
      fromBeginning.add(record.device);
      revoked.set(record.device, null);
      continue;
    }
    if (fromBeginning.has(record.device)) continue;
    // A first sighting takes the hash; a later one is ignored, because ordering
    // these by their own lanes is exactly the global order Art. IV forbids
    // persisting. Callers needing the true earliest pass events in lane order.
    if (!revoked.has(record.device)) revoked.set(record.device, record.fromHash);
  }

  return revoked;
}
