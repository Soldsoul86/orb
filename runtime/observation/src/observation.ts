/**
 * Observations — `contracts/Observation.md`.
 *
 * A recorded statement that **something occurred in reality**. It asserts
 * *occurrence, not truth*: "Met John at 3:02 PM" says the perception happened,
 * never that it is correct, complete or finally true. Whether it *means*
 * anything is interpretation, decided later and revisably, and never here.
 *
 * Every Observation is realized as an Event. The converse does not hold:
 * Observations originate from reality, Events from runtime activity. A reasoning
 * step, a plan, or an Action's *issuance* are Events and not Observations —
 * reality is updated only when a Sensor confirms something occurred, and Orb
 * never assumes an Action changed it.
 *
 * This module's job is to make the three things the contract calls **never
 * permitted** impossible rather than discouraged: an unattributed Observation,
 * a mutation of a recorded one, and truth asserted from inside one.
 */
import type { EventDraft, StoredEvent, OrbEvent } from "@orb/journal";
import { hasPayload, unwrapPayload } from "@orb/journal";

/** The one Event type an Observation is realized as. The specifics live inside. */
export const OBSERVATION_TYPE = "orb.observation";
export const OBSERVATION_SCHEMA = { id: OBSERVATION_TYPE, version: 1 } as const;

export interface Observation<Data = unknown> {
  /**
   * The source identity that produced this. inv. 3, **always attributed**.
   *
   * A Sensor, an Action, or an import — as a *value*, not a dependency on the
   * `Sensor` contract, so an Observation from an import does not have to invent
   * a Sensor to be valid.
   */
  readonly source: string;
  /**
   * The Confidence of Reality, as an integer 0–100. inv. 7.
   *
   * The value is in `[0, 1]`; this is only how it is written down, because the
   * journal's canonical encoding takes safe integers only — Java and JavaScript
   * spell `0.95` differently enough that one disagreement inside a hash preimage
   * means two devices that can never agree they hold the same history (measured
   * 2026-09-26).
   */
  readonly confidencePercent: number;
  /** What was observed. An occurrence, never a verdict about it. */
  readonly data: Data;
  /**
   * Attachment identities. inv. 5 — **references, never copies**.
   *
   * Raw bytes are never inlined here. `observationDraft` refuses a payload
   * carrying any, which is the invariant enforced rather than described.
   */
  readonly attachments?: readonly string[];
}

/** Thrown when an Observation would violate an invariant, rather than recording one that does. */
export class InvalidObservation extends Error {
  override readonly name = "InvalidObservation";
}

/**
 * A confidence in `[0, 1]` as the integer the journal can carry.
 *
 * **Refuses anything percent cannot hold exactly**, which is the point rather
 * than a limitation. Every confidence in the contract and in
 * `MOBILE_SENSING.md` §4 is at most two decimals — 0.97, 0.74, 0.41, 1.00 — and
 * §4 calls them *"proposals, not measurements"*. Silently rounding 0.947 to 95
 * would hide a source claiming a third decimal it never measured; refusing makes
 * that source decide in the open.
 */
export function percentFromConfidence(confidence: number): number {
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new InvalidObservation(`confidence must be in [0, 1], got ${confidence}`);
  }
  const scaled = confidence * 100;
  if (!Number.isInteger(Math.round(scaled * 1e6) / 1e6) || Math.abs(scaled - Math.round(scaled)) > 1e-9) {
    throw new InvalidObservation(
      `confidence ${confidence} needs more than two decimals, which percent cannot hold. ` +
        "Decide the judgement to two places rather than recording precision nobody measured.",
    );
  }
  return Math.round(scaled);
}

/** The recorded integer back as a confidence in `[0, 1]`, for interpretation. */
export function confidenceFromPercent(percent: number): number {
  return percent / 100;
}

/**
 * Builds the Event draft for an Observation, refusing an invalid one.
 *
 * Refusal rather than correction: the contract's *never permitted* list is not a
 * set of defaults to fall back on. An unattributed Observation has no honest
 * repair here, because only the caller knows what perceived it.
 *
 * `causes` is the journal's own lineage — for a connector synthesis, the id of
 * the call event it was derived from.
 */
export function observationDraft<Data>(
  observation: Observation<Data>,
  causes?: readonly string[],
): EventDraft<Observation<Data>> {
  if (observation.source.trim() === "") {
    throw new InvalidObservation("an unattributed Observation is invalid (inv. 3)");
  }
  const percent = observation.confidencePercent;
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    throw new InvalidObservation(
      `confidencePercent must be an integer 0–100, got ${percent}. ` +
        "A fraction here cannot be written identically by both encoders.",
    );
  }
  for (const identity of observation.attachments ?? []) {
    if (!/^[a-z0-9]+:[0-9a-f]+$/.test(identity)) {
      throw new InvalidObservation(
        `attachment reference is not a scheme-tagged identity: ${identity}`,
      );
    }
  }
  // inv. 5, enforced. A Buffer anywhere in `data` is raw content being inlined,
  // which would make the bytes part of history — unerasable by releasing a key,
  // and duplicated on every device that holds the envelope.
  const inlined = findBytes(observation.data);
  if (inlined !== null) {
    throw new InvalidObservation(
      `raw bytes inlined at data${inlined} — reference an Attachment by identity instead (inv. 5)`,
    );
  }

  return {
    type: OBSERVATION_TYPE,
    schema: OBSERVATION_SCHEMA,
    payload: observation,
    ...(causes === undefined ? {} : { causes }),
  };
}

/** Whether an event is an Observation. */
export function isObservation(event: StoredEvent): boolean {
  return event.type === OBSERVATION_TYPE;
}

/**
 * The Observation an event carries, or null when this device cannot read it.
 *
 * Null for an event whose payload is detached — which is *cannot say*, not *no
 * observation*, and the caller must not turn it into one.
 */
export function readObservation<Data>(event: StoredEvent): Observation<Data> | null {
  if (!isObservation(event) || !hasPayload(event)) return null;
  const payload = unwrapPayload((event as OrbEvent).payload);
  return (payload ?? null) as Observation<Data> | null;
}

/** Where raw bytes hide in a value, as a path, or null when there are none. */
function findBytes(value: unknown, path = ""): string | null {
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return path;
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = findBytes(item, `${path}[${index}]`);
      if (found !== null) return found;
    }
    return null;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      const found = findBytes(item, `${path}.${key}`);
      if (found !== null) return found;
    }
  }
  return null;
}
