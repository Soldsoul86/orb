/**
 * The latest record a device wrote about itself, and whether it can still be read.
 *
 * Shared by the two policy read-backs — retention (`PARTIAL_REPLICATION.md` §9
 * inv. 6) and sync payload policy — because the subtle parts are identical and
 * would be worth exactly nothing if the two copies drifted:
 *
 * - **Only the device's own records count.** Inv. 7, *no device decides what
 *   another may hold*. A reader that pooled records across devices would let one
 *   device quietly govern another, which is the single thing that invariant
 *   exists to prevent.
 * - **The newest record wins whether or not it is readable.** The question is
 *   always *what governs now*, and an earlier readable record is a **superseded**
 *   rule. Falling through to it would operate under something the device has
 *   already replaced, which is worse than having no answer.
 */
import { unwrapPayload } from "./payload.js";
import { hasPayload } from "./types.js";
import type { StoredEvent } from "./types.js";

/**
 * Three states, two of which are *we do not know* and are not the same unknown.
 *
 * `none` wants a record written; `unreadable` wants one restated. A caller that
 * merged them would offer one repair for two faults.
 */
export type OwnRecord<T> =
  | { readonly state: "none" }
  | { readonly state: "unreadable"; readonly at: string }
  | {
      readonly state: "record";
      readonly record: T;
      /** The event it came from, so a decision can cite the rule it applied. */
      readonly at: string;
      /** When it took effect. Human-facing, never an ordering (`EVENT_MODEL.md`). */
      readonly wallClock: number;
    };

/** The most recent `type` event authored by `device`, readable or not. */
export function latestOwnRecord<T>(
  events: readonly StoredEvent[],
  device: string,
  type: string,
): OwnRecord<T> {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event || event.device !== device || event.type !== type) continue;
    if (!hasPayload(event)) return { state: "unreadable", at: event.id };
    const record = unwrapPayload(event.payload) as T | undefined;
    if (record === undefined) return { state: "unreadable", at: event.id };
    return { state: "record", record, at: event.id, wallClock: event.wallClock };
  }
  return { state: "none" };
}

/** Every `type` event authored by `device`, oldest first. Unreadable ones included. */
export function ownRecordHistory<T>(
  events: readonly StoredEvent[],
  device: string,
  type: string,
): readonly OwnRecord<T>[] {
  const out: OwnRecord<T>[] = [];
  for (const event of events) {
    if (event.device !== device || event.type !== type) continue;
    if (!hasPayload(event)) {
      out.push({ state: "unreadable", at: event.id });
      continue;
    }
    const record = unwrapPayload(event.payload) as T | undefined;
    out.push(
      record === undefined
        ? { state: "unreadable", at: event.id }
        : { state: "record", record, at: event.id, wallClock: event.wallClock },
    );
  }
  return out;
}
