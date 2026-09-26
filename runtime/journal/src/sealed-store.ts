/**
 * Any store, with payloads sealed on the way in and opened on the way out.
 *
 * A decorator rather than an edit to each store: the rule lives in one place,
 * both `MemoryJournalStore` and `FileJournalStore` get it unchanged, and a store
 * written later gets it for free. `SECURITY.md` §3 already says the store holds
 * ciphertext; this is what makes that true without every store implementing
 * cryptography.
 *
 * **What stays plaintext, deliberately.** Only the payload is sealed. The
 * envelope is not — the hash chain has to be verifiable by a device that holds
 * no keys at all, which is what lets a witness hold envelopes and check
 * integrity while reading nothing (`WITNESSES.md` W2).
 *
 * **`payloadHash` commits to the plaintext**, never the ciphertext. Three things
 * depend on that: verification works the same before and after sealing; a
 * payload recovered from any source can still be checked against the envelope
 * (`PARTIAL_REPLICATION.md` §3); and two devices that seal the same payload
 * under different keys still agree on its hash, so the cross-implementation
 * vectors are untouched.
 *
 * It also has a cost, recorded in `ERASURE.md` rather than hidden here: a hash
 * over guessable plaintext is a **confirmation oracle**.
 */
import type { JournalStore, PayloadRecord } from "./store.js";
import type { AbsenceReason, LaneId, OrbEvent, StoredEvent } from "./types.js";
import { hasPayload } from "./types.js";
import { canonicalJson } from "./integrity.js";
import { isSealed, type PayloadKeyring } from "./keyring.js";

/**
 * Wraps `inner` so payloads are sealed at rest.
 *
 * The journal above sees plaintext and is unchanged; the store below sees only
 * ciphertext and is unchanged. Neither knows.
 */
export function sealedStore(inner: JournalStore, keyring: PayloadKeyring): JournalStore {
  async function sealAll(events: readonly StoredEvent[]): Promise<readonly StoredEvent[]> {
    const out: StoredEvent[] = [];
    for (const event of events) {
      if (!hasPayload(event)) {
        out.push(event);
        continue;
      }
      // Already sealed: an event arriving from a store that sealed it, or a
      // replay. Re-sealing would mint a second key and orphan the first, which
      // is how a payload becomes unopenable without anyone erasing anything.
      if (isSealed(event.payload)) {
        out.push(event);
        continue;
      }
      const sealed = await keyring.seal(event.id, canonicalJson(event.payload));
      out.push({ ...event, payload: sealed } as OrbEvent);
    }
    return out;
  }

  return {
    async append(lane: LaneId, events: readonly StoredEvent[]): Promise<void> {
      return inner.append(lane, await sealAll(events));
    },

    async read(lane: LaneId): Promise<readonly StoredEvent[]> {
      const stored = await inner.read(lane);
      const out: StoredEvent[] = [];

      for (const event of stored) {
        if (!hasPayload(event) || !isSealed(event.payload)) {
          out.push(event);
          continue;
        }

        const plaintext = await keyring.open(event.id, event.payload);
        if (plaintext === null) {
          // The key is gone. The ciphertext is still on disk and will stay
          // there; it decodes nowhere. The keyring is the ground truth for
          // erasure, so this holds even if a stored absence marker disagreed.
          const { payload: _payload, ...envelope } = event as OrbEvent;
          out.push({ ...envelope, absence: "erased" as const });
          continue;
        }

        out.push({ ...event, payload: JSON.parse(plaintext) as unknown } as OrbEvent);
      }

      return out;
    },

    lanes: () => inner.lanes(),

    async detach(
      lane: LaneId,
      eventIds: readonly string[],
      absence: AbsenceReason,
      prunedBecause?: string,
    ): Promise<number> {
      // Erasure *is* the key destruction. Dropping the bytes as well is belt and
      // braces and is what `inner.detach` does anyway; the key going is what
      // makes the copy on a peer's disk and the residue in flash inert.
      if (absence === "erased") {
        for (const id of eventIds) await keyring.destroy(id);
      }
      return inner.detach(lane, eventIds, absence, prunedBecause);
    },

    async attach(lane: LaneId, payloads: readonly PayloadRecord[]): Promise<number> {
      const sealed: PayloadRecord[] = [];
      for (const record of payloads) {
        // A payload for an event whose key was destroyed must not be re-sealed
        // under a fresh key: that would silently undo an erasure by giving the
        // owner's destroyed content a new key to live under. The store below
        // refuses erased events too; this refuses before a key is ever minted.
        if (!(await keyring.holds(record.eventId))) {
          const existing = await inner.read(lane);
          const known = existing.find((event) => event.id === record.eventId);
          if (known && !hasPayload(known) && known.absence === "erased") continue;
        }
        sealed.push({
          eventId: record.eventId,
          payload: await keyring.seal(record.eventId, canonicalJson(record.payload)),
        });
      }
      return inner.attach(lane, sealed);
    },

    close: () => inner.close(),
  };
}
