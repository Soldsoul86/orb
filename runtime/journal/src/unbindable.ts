/**
 * Unbindable intent — the record that no Capability matched.
 *
 * `docs/reviews/RECORDS.md` §3, answering `EXECUTION.md`'s question of where
 * `Agent.md` §7's unbindable intent belongs. The review offered `InferenceRecord`
 * or `Action`. **It is neither, and each contract rules itself out:**
 *
 * - Not an `InferenceRecord`. That is *reasoning provenance* — inputs, evidence,
 *   model, parameters, output. The reasoning already happened and is already
 *   recorded. That nothing matched is a fact about the **capability set at a
 *   moment**, discovered afterwards by the Agent, not a step in how a conclusion
 *   was reached.
 * - Not an `Action`. An Action is *"the immutable record that a Capability was
 *   invoked"* (`Action.md` §1). None was. An Action with no Capability would break
 *   the single thing an Action means.
 *
 * So it is a third kind: a record that a **binding did not exist**. That is this
 * project's recurring distinction in a new costume — the same shape as
 * `Readable: false`, which must never be rendered as an empty holding set, and as
 * `absent` versus `destroyed` in the keyring. *Could not bind* is not *chose not
 * to act*, and dropping it silently deletes the only evidence that Orb was asked
 * for something it cannot do.
 *
 * **It is a finding, never an error** (`Agent.md` §7). A run of these says
 * something about the plan, the capability set, or both. Counting them as failures
 * would tune the system in exactly the wrong direction — the same mistake as
 * counting a `dismissed` alert as a false positive.
 */
import type { EventDraft, StoredEvent } from "./types.js";
import { unwrapPayload } from "./payload.js";

export const UNBINDABLE_TYPE = "orb.intent.unbindable";
export const UNBINDABLE_SCHEMA = { id: "orb.intent.unbindable", version: 1 } as const;

/**
 * An intent that reached the Agent and matched no Capability.
 *
 * **`intent` is a reference, not prose.** It names the recorded intent the
 * Planner emitted, so this record adds no second copy of it (Art. IX §33) and
 * leaks nothing legible to a peer that holds the envelope — the same discipline
 * `RevocationRecord` keeps by carrying no reason.
 *
 * **`consideredCount` is present and deliberately weak.** How many Capabilities
 * were declared when nothing matched separates *"the runtime had no capabilities
 * loaded"* from *"it had forty and none fit"* — two very different findings that a
 * bare absence renders identically. It is a count and not a list, because the
 * list is derivable from the registry at that point in history and copying it here
 * would be the second source of truth again.
 */
export interface UnbindableRecord {
  /** The recorded intent that could not be bound, by identity. */
  readonly intent: string;
  /** How many Capabilities were declared at the moment nothing matched. */
  readonly consideredCount: number;
}

export function unbindableDraft(record: UnbindableRecord): EventDraft<UnbindableRecord> {
  return { type: UNBINDABLE_TYPE, schema: UNBINDABLE_SCHEMA, payload: record };
}

export function isUnbindable(event: StoredEvent): boolean {
  return event.type === UNBINDABLE_TYPE;
}

/**
 * Every intent recorded as unbindable across the events supplied.
 *
 * A pure projection. **Returns one entry per record, not per distinct intent** —
 * the same intent failing to bind on Monday and again on Friday is two findings,
 * and collapsing them would hide that the gap persisted across a change to the
 * capability set. Callers wanting distinct intents can reduce; callers wanting to
 * know whether anything changed cannot recover what a de-duplicating projection
 * threw away.
 */
export function unbindableIntents(
  events: Iterable<StoredEvent>,
): readonly UnbindableRecord[] {
  const found: UnbindableRecord[] = [];

  for (const event of events) {
    if (!isUnbindable(event)) continue;
    const record = unwrapPayload(event.payload) as UnbindableRecord | undefined;
    if (record?.intent) found.push(record);
  }

  return found;
}
