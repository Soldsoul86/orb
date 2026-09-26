/**
 * The retention policy a device is operating under, read from its own history.
 *
 * `docs/PARTIAL_REPLICATION.md` §9 inv. 6 — *"Journaled policy. Retention policy
 * changes enter history as events"* — and §11's own note on the shortfall it
 * left: *"The policy is recorded when it changes; nothing yet reads it back to
 * decide behaviour."* This module is that read-back.
 *
 * Why it matters rather than being tidiness: until the policy governing a prune
 * comes from history, *"why doesn't my phone know this?"* is unanswerable
 * (§6), and a window like `DECISIONS.md` DR-7's seven days is a constant in a
 * build rather than a rule anyone can audit or change. A policy nobody can read
 * back is an intention, not a policy.
 *
 * Pure, like the prune guard it serves: functions over a list of events, with
 * the journal doing the I/O — the same shape as `latestCustody`.
 */
import { canonicalJson } from "./integrity.js";
import { latestOwnRecord } from "./own-record.js";
import type { EventDraft, SchemaRef, StoredEvent } from "./types.js";
import type { PruneDecision, PruneRequest, RetentionPolicy } from "./retention.js";
import { evaluatePrune } from "./retention.js";

/**
 * Content, deliberately, and not bookkeeping.
 *
 * `vocabulary.ts`'s bookkeeping set exists for types *machinery outside this
 * device* must read without a key. Nothing outside reads this one: inv. 7 — *no
 * device decides what another may hold* — means another device has no business
 * knowing this device's policy, and a witness holding envelopes would otherwise
 * learn when a person changed their mind about what to keep.
 *
 * The cost is that finding the latest policy means unwrapping a device's own
 * content events rather than filtering on a legible type. That is a local
 * performance question with local answers (an index); the coarse-type ruling's
 * asymmetry is not — a label made fine cannot be made coarse again, and
 * `ERASURE.md` §2b spends that budget only where something outside needs it.
 */
export const RETENTION_POLICY_TYPE = "orb.retention.policy";
export const RETENTION_POLICY_SCHEMA: SchemaRef = { id: RETENTION_POLICY_TYPE, version: 1 };

/** The policy as recorded. Structurally `RetentionPolicy`, named for the record. */
export type RetentionPolicyRecord = RetentionPolicy;

/**
 * What history says this device's policy is.
 *
 * Three states, kept apart for the reason they are kept apart everywhere else in
 * this system: two of them are *we do not know*, and they are not the same as
 * each other or as a policy that says nothing.
 *
 * - `none` — no policy was ever recorded for this device.
 * - `unreadable` — a policy was recorded and its payload is no longer held, so
 *   the governing rule exists and cannot be read. Falling back to an earlier
 *   one would mean pruning under a policy known to be superseded.
 * - `policy` — read, with the id of the event it came from, so a decision can
 *   cite the rule it applied.
 */
export type EffectivePolicy =
  | { readonly state: "none" }
  | { readonly state: "unreadable"; readonly at: string }
  | { readonly state: "policy"; readonly policy: RetentionPolicy; readonly at: string };

/**
 * The latest retention policy this device recorded for itself.
 *
 * **Only its own.** Inv. 7 gives each device authority over its own retention and
 * no authority over anyone else's, so a policy event authored elsewhere is
 * skipped rather than merged. A reader that pooled them would let one device
 * quietly decide what another may drop, which is the one thing that invariant
 * exists to prevent.
 *
 * Scans backwards and stops at the first policy event it finds, readable or not
 * — because the question is *what governs now*, and the newest answer is the
 * answer even when it cannot be read.
 */
export function effectivePolicy(
  events: readonly StoredEvent[],
  device: string,
): EffectivePolicy {
  const found = latestOwnRecord<RetentionPolicyRecord>(events, device, RETENTION_POLICY_TYPE);
  if (found.state === "record") {
    return { state: "policy", policy: found.record, at: found.at };
  }
  return found;
}

/**
 * A draft recording `policy`, or nothing if it is already what history says.
 *
 * Mirrors `policyDraft` in `sync.ts`: an unchanged policy records nothing, so an
 * idle device does not grow its own history. Comparison is over the canonical
 * encoding, so a policy rewritten with its keys in another order is recognised
 * as the same policy rather than recorded as a change that did not happen.
 *
 * An `unreadable` current policy **does** draft a new one. The alternative is a
 * device that can never restate its own rule because it can no longer read the
 * rule it is restating.
 */
export function retentionPolicyDraft(
  events: readonly StoredEvent[],
  device: string,
  policy: RetentionPolicy,
): readonly EventDraft[] {
  const current = effectivePolicy(events, device);
  if (current.state === "policy" && canonicalJson(current.policy) === canonicalJson(policy)) {
    return [];
  }
  return [
    {
      type: RETENTION_POLICY_TYPE,
      schema: RETENTION_POLICY_SCHEMA,
      payload: policy,
    },
  ];
}

/** The prune request, with the policy taken from history instead of an argument. */
export interface HistoricalPruneRequest extends Omit<PruneRequest, "policy"> {
  /** Events to read the policy from — this device's own lane is enough. */
  readonly history: readonly StoredEvent[];
}

/**
 * Decide a prune under the policy history states, refusing when it cannot be read.
 *
 * **Fails closed, and that direction is the whole point.** `retention.ts` refuses
 * by default because what it guards against is silent and permanent; a policy
 * that cannot be read is exactly such a path. Defaulting to a permissive policy
 * would destroy payloads on the strength of a *missing* record — deciding that
 * data may go because nothing said it must stay, which inverts the rule.
 *
 * The refusal names which of the two unknowns it hit, because they call for
 * different repairs: `none` wants a policy set, `unreadable` wants one restated.
 */
export function evaluatePruneFromHistory(request: HistoricalPruneRequest): PruneDecision {
  const current = effectivePolicy(request.history, request.selfDevice);

  if (current.state === "none") {
    return {
      permitted: false,
      reason:
        `no retention policy recorded for ${request.selfDevice}; ` +
        "a device prunes under a rule in history or not at all",
      holders: [],
    };
  }
  if (current.state === "unreadable") {
    return {
      permitted: false,
      reason:
        `the retention policy for ${request.selfDevice} (${current.at}) is recorded ` +
        "but its payload is no longer held, so the governing rule cannot be read",
      holders: [],
    };
  }

  const { history: _history, ...rest } = request;
  return evaluatePrune({ ...rest, policy: current.policy });
}
