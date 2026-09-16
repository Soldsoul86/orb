/**
 * The vocabulary of a spend.
 *
 * Two rules govern everything in this file, and they are the reason the
 * package exists:
 *
 * 1. **Amounts are integers.** Every amount is a `bigint` in the asset's base
 *    unit — wei, satoshi, paise, cents. Money is never a `number`, because
 *    `0.1 + 0.2` is not `0.3` and a budget that drifts is a budget that leaks.
 * 2. **Time is supplied, never read.** Nothing here calls a clock. The instant
 *    a request is evaluated at is carried on the request, so the same inputs
 *    always produce the same decision — which is what makes a decision
 *    replayable (Constitution Art. I §4).
 */

/**
 * An asset identifier, opaque to this package.
 *
 * The engine never converts between assets and never consults a price. A
 * budget denominated in one asset constrains that asset only. Cross-asset
 * limits would require a rate, a rate requires an oracle, and an oracle is a
 * dependency that can be wrong at exactly the wrong moment.
 */
export type AssetId = string;

/** An amount in the asset's smallest indivisible unit. Never negative. */
export type Amount = bigint;

/**
 * Who is asking to move money.
 *
 * The owner is not privileged here. A rule may grant the owner more than an
 * agent, but that is a decision written in the policy, not an assumption built
 * into the engine.
 */
export type Requester =
  | { readonly kind: "OWNER" }
  | { readonly kind: "AGENT"; readonly agentId: string }
  | { readonly kind: "SCHEDULE"; readonly scheduleId: string }
  | { readonly kind: "DELEGATE"; readonly delegateId: string };

/** The canonical string form of a requester, used for scoping and comparison. */
export function requesterKey(requester: Requester): string {
  switch (requester.kind) {
    case "OWNER":
      return "OWNER";
    case "AGENT":
      return `AGENT:${requester.agentId}`;
    case "SCHEDULE":
      return `SCHEDULE:${requester.scheduleId}`;
    case "DELEGATE":
      return `DELEGATE:${requester.delegateId}`;
  }
}

/**
 * An approval already collected for a request.
 *
 * The engine **counts** approvals; it does not authenticate them. Verifying
 * that an approver is who they claim to be, and that they really approved this
 * exact request, happens in the shell before `evaluate` is called. Keeping that
 * boundary explicit is deliberate: a pure function cannot check a signature
 * against a key it has no way to fetch, and pretending otherwise would hide a
 * trust assumption inside something that looks total.
 */
export interface Approval {
  readonly approver: string;
  readonly at: number;
}

/**
 * A request to move money.
 *
 * Note what is absent: no limit, no threshold, no override, no priority, no
 * "urgent" flag. A request carries facts about itself and nothing that can
 * widen its own authority. This mirrors the executor's governing rule — entry
 * may come from outside, exit authority stays local — one layer down: **a
 * payment may be requested by anyone; spend authority belongs to the policy.**
 */
export interface SpendRequest {
  readonly requestId: string;
  readonly account: string;
  readonly requester: Requester;
  readonly asset: AssetId;
  readonly amount: Amount;
  readonly destination: string;
  /** Wall-clock milliseconds. This is the instant the policy is evaluated at. */
  readonly requestedAt: number;
  readonly approvals: readonly Approval[];
  readonly memo: string | null;
}

/** Distinct approver identities on a request. Three signatures from one person are one approval. */
export function distinctApprovers(request: SpendRequest): readonly string[] {
  return [...new Set(request.approvals.map((a) => a.approver))].sort();
}
