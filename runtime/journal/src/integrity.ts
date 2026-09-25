/**
 * Tamper-evidence for the journal.
 *
 * Constitution Art. I §5: lanes are hash-chained so that any corruption or
 * rewriting is detectable.
 *
 * The envelope hash covers every envelope field except the hash itself,
 * commits to the predecessor's hash, and commits to the payload **by its
 * hash** rather than inline. That is what makes the chain verifiable on a
 * device holding no payloads (`docs/PARTIAL_REPLICATION.md` §3), and it is the
 * same by-reference commitment `contracts/Attachment.md` already uses for raw
 * bytes.
 */
import { createHash } from "node:crypto";
import type { EventEnvelope, OrbEvent, StoredEvent } from "./types.js";
import { hasPayload, JournalIntegrityError } from "./types.js";

/**
 * Deterministic JSON encoding: object keys sorted, no incidental whitespace.
 *
 * Two devices must derive byte-identical encodings for the same event, so
 * insertion order must not matter.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;

  switch (typeof value) {
    case "number":
      if (!Number.isFinite(value)) throw new TypeError(`non-finite number in event: ${value}`);
      return JSON.stringify(value);
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "undefined":
      throw new TypeError("undefined is not representable in an event");
    case "object": {
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
    }
    default:
      throw new TypeError(`unsupported value in event: ${typeof value}`);
  }
}

/** The commitment an envelope carries in place of the payload itself. */
export function hashPayload(payload: unknown): string {
  return createHash("sha256").update(canonicalJson(payload), "utf8").digest("hex");
}

/** Envelope fields plus the two commitments, as the hash sees them. */
export type EnvelopePreimageInput = Omit<EventEnvelope, "integrity"> & {
  readonly previous: string | null;
  readonly payloadHash: string;
};

/**
 * The envelope format an event was written under.
 *
 * **1** — `type` is fine-grained, `causes` and `schema` are in the envelope, the
 * payload is unwrapped. Everything written before 2026-09-25.
 *
 * **2** — `type` is coarse, `causes` and `schema` moved into the payload, the
 * payload is nonce-wrapped (`docs/ERASURE.md` §2b, §2a).
 */
export type EnvelopeVersion = 1 | 2;

/** The current version. Everything new is written this way. */
export const ENVELOPE_VERSION: EnvelopeVersion = 2;

/**
 * Which rule an event was written under.
 *
 * **Absent means 1**, and that is not a default — it is the definition. Every
 * event written before the field existed is v1 by construction, and there are
 * 1475 of them on the operator's phone that Art. I forbids editing and the
 * E2/E3 ruling forbids removing (`DEVICE_LOOP.md` §0). A reader that guessed
 * here would report every one of them as corrupt.
 */
export function envelopeVersion(envelope: { readonly v?: number }): EnvelopeVersion {
  return envelope.v === 2 ? 2 : 1;
}

/**
 * The bytes an event commits to. Excludes `integrity.hash`; includes the
 * payload's hash.
 *
 * **`v` is inside the preimage, deliberately.** A version outside it could be
 * flipped to make a verifier apply the wrong rule — a downgrade attack. Inside,
 * changing it changes the hash, which breaks linkage with the next event, so
 * the chain protects the field that selects how the chain is checked.
 *
 * **`v` is in the envelope and never the payload**, for the same reason the
 * type is: a witness holds envelopes and no keys (`WITNESSES.md` W2), and a
 * version locked inside an encrypted, erasable payload would make history
 * unverifiable the moment somebody exercised their right to erase.
 *
 * v1 omits `v` entirely rather than writing `v: 1`. Writing it would change
 * every existing hash, which is the one thing this whole mechanism exists to
 * avoid.
 */
export function eventPreimage(input: EnvelopePreimageInput): string {
  const version = envelopeVersion(input);

  if (version === 1) {
    return canonicalJson({
      id: input.id,
      lane: input.lane,
      device: input.device,
      hlc: input.hlc,
      wallClock: input.wallClock,
      type: input.type,
      causes: input.causes,
      schema: input.schema,
      payloadHash: input.payloadHash,
      previous: input.previous,
    });
  }

  // v2: `causes` and `schema` are gone from the envelope, so they are gone from
  // here. They live in the payload and are committed to through `payloadHash`,
  // which means erasing a payload erases an event's stated lineage with it —
  // which is the operator's ruling, not a side effect.
  return canonicalJson({
    v: 2,
    id: input.id,
    lane: input.lane,
    device: input.device,
    hlc: input.hlc,
    wallClock: input.wallClock,
    type: input.type,
    payloadHash: input.payloadHash,
    previous: input.previous,
  });
}

export function hashEvent(input: EnvelopePreimageInput): string {
  return createHash("sha256").update(eventPreimage(input), "utf8").digest("hex");
}

/**
 * Recomputes an envelope's hash and checks it against the recorded one.
 *
 * Needs no payload — that is the property the whole partial-replication design
 * rests on.
 */
export function verifyEnvelope(envelope: EventEnvelope): boolean {
  return (
    hashEvent({
      ...envelope,
      previous: envelope.integrity.previous,
      payloadHash: envelope.integrity.payloadHash,
    }) === envelope.integrity.hash
  );
}

/**
 * Checks a payload against the commitment its envelope carries.
 *
 * This is the gate a payload must pass when it is fetched back after being
 * dropped, whoever supplied it.
 *
 * Only meaningful on plaintext. `payloadHash` commits to the plaintext, so
 * hashing a sealed blob compares two unrelated values — see
 * {@link verifiablePayload}.
 */
export function verifyPayload(event: OrbEvent): boolean {
  return hashPayload(event.payload) === event.integrity.payloadHash;
}

/**
 * Whether this device can check the payload at all.
 *
 * A sealed payload cannot be: `payloadHash` commits to the plaintext, and the
 * device reading the store may hold no key — a witness holds envelopes and
 * sealed blobs and never any key (`WITNESSES.md` W2).
 *
 * The distinction matters because the alternative is worse than useless.
 * Hashing the ciphertext and finding a mismatch would report **corruption**
 * where nothing is corrupt, telling a witness its history was tampered with
 * every time it looked. *Cannot check* and *failed the check* are different
 * answers, and a verifier that collapses them is lying in the more alarming
 * direction.
 *
 * This opens no new hole. Substituting a sealed blob for a real payload destroys
 * content without declaring it, which is `CLAIMS.md` C2d — already named as
 * undetectable, and not made worse here.
 */
export function verifiablePayload(event: OrbEvent): boolean {
  const payload = event.payload;
  return !(
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as { sealed?: unknown }).sealed === "string"
  );
}

/** Verifies the envelope always, and the payload when this device can read it. */
export function verifyEvent(event: StoredEvent): boolean {
  if (!verifyEnvelope(event)) return false;
  if (!hasPayload(event)) return true;
  return verifiablePayload(event) ? verifyPayload(event) : true;
}

/**
 * Verifies a full lane: every hash is self-consistent and every event commits
 * to its predecessor, with strictly increasing HLC.
 *
 * Accepts envelopes, so a device that has dropped payloads still verifies its
 * whole history. Events that do carry payloads have those checked too.
 *
 * The parameter is deliberately wider than `StoredEvent`: a bare
 * `EventEnvelope` carries no `absence`, because it has not been stored anywhere
 * and so nothing has a reason for not holding it. Integrity is a property of the
 * chain, never of what one device happens to have — narrowing this would make
 * the check demand a fact it does not use.
 *
 * @throws {JournalIntegrityError} naming the first event that fails.
 */
export function verifyLane(events: readonly (StoredEvent | EventEnvelope)[]): void {
  let previousHash: string | null = null;
  let previousPhysical = -1;
  let previousCounter = -1;

  for (const [index, event] of events.entries()) {
    if (!verifyEnvelope(event)) {
      throw new JournalIntegrityError("event hash does not match its contents", {
        eventId: event.id,
        index,
      });
    }
    if (hasPayload(event) && verifiablePayload(event) && !verifyPayload(event)) {
      throw new JournalIntegrityError("payload does not match the hash its envelope commits to", {
        eventId: event.id,
        index,
      });
    }
    if (event.integrity.previous !== previousHash) {
      throw new JournalIntegrityError("lane hash chain is broken", {
        eventId: event.id,
        index,
        expectedPrevious: previousHash,
        actualPrevious: event.integrity.previous,
      });
    }
    const goesBackwards =
      event.hlc.physical < previousPhysical ||
      (event.hlc.physical === previousPhysical && event.hlc.counter <= previousCounter);
    if (index > 0 && goesBackwards) {
      throw new JournalIntegrityError("lane HLC is not strictly increasing", {
        eventId: event.id,
        index,
      });
    }

    previousHash = event.integrity.hash;
    previousPhysical = event.hlc.physical;
    previousCounter = event.hlc.counter;
  }
}
