/**
 * The imperative shell.
 *
 * The engine decides. The guard is what a caller actually holds: it stamps the
 * time, runs the decision, reserves the budget, executes the operation, and
 * records what really happened.
 *
 * Two things make it more than a convenience wrapper.
 *
 * **The critical section.** Read, decide and reserve must not interleave with
 * another caller doing the same, *and* the reservation must be durable before
 * the operation runs. An earlier version got the first half by making the
 * whole path synchronous — which works in one process, but forecloses the
 * second half, because a durable append cannot be synchronous.
 *
 * So the path is serialised by a promise chain instead: each call queues
 * behind the last, exactly as the Journal serialises its own appends to keep
 * the hash chain intact. Same guarantee as `claimExit`, reached with a lock
 * rather than with synchrony, and durable as well.
 *
 * **What happens when the operation fails.** Constitution Art. XI §42: Orb
 * never assumes an Action changed reality. A thrown error does not tell you
 * whether the money moved — a connection reset before the request left is
 * indistinguishable, from here, from a response lost after the vendor already
 * charged. So the default is to *hold*: the reservation stays open, the
 * outcome is reported as indeterminate, and `staleReservations` surfaces it
 * for reconciliation. Silently reversing would release budget for money that
 * may well have been spent, which is the expensive direction to be wrong in.
 */
import type { Approval, Amount, AssetId, Requester, SpendRequest } from "./model.js";
import { requestIntent } from "./model.js";
import type { Attestation } from "./attestation.js";
import type { SpendPolicy } from "./policy.js";
import type { Decision } from "./evaluate.js";
import { authorizedEntry, evaluate } from "./evaluate.js";
import type { LedgerEntry } from "./ledger.js";
import type { LedgerStore } from "./store.js";
import type { Clock } from "./clock.js";
import { systemClock } from "./clock.js";
import type { ReconciliationReport, SpendObserver } from "./reconcile.js";
import { reconcile } from "./reconcile.js";

/** A request without the bookkeeping the shell can fill in. */
export interface SpendDraft {
  readonly requestId: string;
  readonly account: string;
  readonly requester: Requester;
  readonly asset: AssetId;
  readonly amount: Amount;
  readonly destination: string;
  readonly requestedAt?: number;
  readonly approvals?: readonly Approval[];
  readonly attestations?: readonly Attestation[];
  readonly memo?: string;
}

function materialize(draft: SpendDraft, now: number): SpendRequest {
  return {
    requestId: draft.requestId,
    account: draft.account,
    requester: draft.requester,
    asset: draft.asset,
    amount: draft.amount,
    destination: draft.destination,
    requestedAt: draft.requestedAt ?? now,
    approvals: draft.approvals ?? [],
    attestations: draft.attestations ?? [],
    memo: draft.memo ?? null,
  };
}

/** Where a policy comes from. Returning `undefined` denies: no policy, nothing moves. */
export type PolicySource = (account: string) => SpendPolicy | undefined;

/** A `PolicySource` for the common case of one account, one policy. */
export function singlePolicy(policy: SpendPolicy): PolicySource {
  return (account) => (account === policy.account ? policy : undefined);
}

/**
 * Three outcomes, discriminated so the compiler carries the difference.
 *
 * A refusal because the policy said no and a refusal because the id has been
 * seen before are not the same event, and collapsing them into one shape with
 * nullable fields would force a cast in the one code path that should never
 * contain one.
 */
export type Authorization =
  | {
      readonly granted: true;
      readonly request: SpendRequest;
      readonly decision: Decision;
      readonly reservation: LedgerEntry;
      /** Records what was actually spent, which may differ from the estimate. */
      settle(actualAmount: Amount): Promise<void>;
      /** Records that the spend provably did not happen. */
      reverse(): Promise<void>;
    }
  | {
      readonly granted: false;
      readonly refusal: "DENIED";
      readonly request: SpendRequest;
      readonly decision: Decision;
    }
  | {
      readonly granted: false;
      readonly refusal: "DUPLICATE";
      readonly request: SpendRequest;
      readonly existing: LedgerEntry;
    }
  /**
   * The id has been seen, but for a different spend.
   *
   * Distinct from `DUPLICATE` because the two mean opposite things. A
   * duplicate is a safe retry to be absorbed; this is a client contradicting
   * itself, and answering "already done" would tell it a payment succeeded
   * that nobody ever authorised.
   */
  | {
      readonly granted: false;
      readonly refusal: "MISMATCH";
      readonly request: SpendRequest;
      readonly existing: LedgerEntry;
      readonly detail: string;
    };

/** What the operation is handed. */
export interface Grant {
  readonly request: SpendRequest;
  readonly decision: Decision;
  /**
   * Declare what was actually consumed.
   *
   * Call it on the way out with the real figure — an estimate of 4,000 tokens
   * that turns out to be 4,231 must land in the ledger as 4,231, or every
   * later budget inherits the error. Calling it before throwing is also how
   * you tell the guard a failed operation still cost something (or, with `0n`,
   * that it provably did not).
   */
  report(actualAmount: Amount): void;
}

export type GuardOutcome<T> =
  | {
      readonly outcome: "COMPLETED";
      readonly value: T;
      readonly decision: Decision;
      readonly reserved: Amount;
      readonly actual: Amount;
      /** Positive when the operation cost more than it reserved. */
      readonly overage: Amount;
    }
  | { readonly outcome: "REFUSED"; readonly decision: Decision }
  | { readonly outcome: "DUPLICATE"; readonly existing: LedgerEntry }
  /** The id was reused for a different spend. The operation does not run. */
  | {
      readonly outcome: "MISMATCH";
      readonly existing: LedgerEntry;
      readonly detail: string;
    }
  /** The operation failed and told us what it cost. The ledger holds the truth. */
  | { readonly outcome: "FAILED"; readonly error: unknown; readonly decision: Decision; readonly actual: Amount }
  /**
   * The operation failed without saying whether it spent anything. The
   * reservation is still open on purpose; reconcile it against the vendor.
   */
  | {
      readonly outcome: "INDETERMINATE";
      readonly error: unknown;
      readonly decision: Decision;
      readonly reservation: LedgerEntry;
    };

export interface GuardOptions {
  readonly store: LedgerStore;
  readonly policyFor: PolicySource;
  readonly clock?: Clock;
  /**
   * Called for every decision, allowed or refused, before the operation runs.
   *
   * This is the journal seam. Art. VII §29: there are no silent actions — and
   * a refusal is as much a part of the record as a payment.
   */
  readonly onDecision?: (decision: Decision, request: SpendRequest) => void;
}

const EMPTY_POLICY = (account: string): SpendPolicy => ({ account, version: 1, rules: [] });

export class SpendGuard {
  readonly #store: LedgerStore;
  readonly #policyFor: PolicySource;
  readonly #clock: Clock;
  readonly #onDecision: ((decision: Decision, request: SpendRequest) => void) | null;
  /** Serialises every ledger mutation. See the note on the critical section. */
  #tail: Promise<unknown> = Promise.resolve();

  constructor(options: GuardOptions) {
    this.#store = options.store;
    this.#policyFor = options.policyFor;
    this.#clock = options.clock ?? systemClock;
    this.#onDecision = options.onDecision ?? null;
  }

  /**
   * Runs `work` with exclusive access to the ledger.
   *
   * Every mutation goes through here, settlements included: a settle landing
   * between another caller's read and its reservation would let that caller
   * decide against a ledger that no longer exists.
   */
  #serialize<T>(work: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(work);
    // The chain must survive a rejection, or one failure wedges every later
    // caller behind a promise that never settles.
    this.#tail = result.catch(() => undefined);
    return result;
  }

  /**
   * Decides and reserves, atomically and durably.
   *
   * Queued behind any other ledger mutation, so two callers cannot both
   * observe the same unspent budget, and the reservation is in history before
   * this resolves.
   */
  authorize(draft: SpendDraft): Promise<Authorization> {
    return this.#serialize(() => this.#authorizeNow(draft));
  }

  async #authorizeNow(draft: SpendDraft): Promise<Authorization> {
    const request = materialize(draft, this.#clock.now());

    const existing = await this.#store.find(request.requestId);
    if (existing !== undefined) {
      // A repeated id is a retry, and a retry must never spend twice. But an
      // id alone is not enough to say two requests are the same request: a
      // client that reuses an id for a different amount would otherwise be
      // told "already done" about a spend it never asked for. So the intent is
      // compared, and a contradiction is refused rather than absorbed.
      const intent = requestIntent(request);
      if (existing.intent !== "" && existing.intent !== intent) {
        return {
          granted: false,
          refusal: "MISMATCH",
          request,
          existing,
          detail:
            `${request.requestId} was reserved for a different spend ` +
            `(${existing.intent.slice(0, 12)}), not ${intent.slice(0, 12)}`,
        };
      }
      return { granted: false, refusal: "DUPLICATE", request, existing };
    }

    const policy = this.#policyFor(request.account) ?? EMPTY_POLICY(request.account);
    const decision = evaluate(request, policy, await this.#store.entries(request.account));
    this.#onDecision?.(decision, request);

    if (decision.outcome !== "ALLOW") {
      return { granted: false, refusal: "DENIED", request, decision };
    }

    const reservation = authorizedEntry(request, decision);
    await this.#store.append(reservation);

    const store = this.#store;
    return {
      granted: true,
      request,
      decision,
      reservation,
      settle: (actualAmount) => this.#serialize(() => store.settle(request.requestId, actualAmount)),
      reverse: () => this.#serialize(() => store.reverse(request.requestId)),
    };
  }

  /**
   * The whole cycle: decide, reserve, run, record.
   *
   * The operation receives a {@link Grant} and should `report` what it really
   * consumed. If it never reports, the reservation is settled at the amount
   * requested.
   */
  async run<T>(draft: SpendDraft, operation: (grant: Grant) => Promise<T>): Promise<GuardOutcome<T>> {
    const auth = await this.authorize(draft);

    if (!auth.granted) {
      switch (auth.refusal) {
        case "DUPLICATE":
          return { outcome: "DUPLICATE", existing: auth.existing };
        case "MISMATCH":
          return { outcome: "MISMATCH", existing: auth.existing, detail: auth.detail };
        case "DENIED":
          return { outcome: "REFUSED", decision: auth.decision };
      }
    }

    let reported: Amount | null = null;
    const grant: Grant = {
      request: auth.request,
      decision: auth.decision,
      report: (actualAmount) => {
        reported = actualAmount;
      },
    };

    let value: T;
    try {
      value = await operation(grant);
    } catch (error) {
      const declared: Amount | null = reported;
      if (declared === null) {
        // We do not know whether the money moved, so we do not pretend to.
        // The reservation stays open and shows up in `staleReservations`.
        return {
          outcome: "INDETERMINATE",
          error,
          decision: auth.decision,
          reservation: auth.reservation,
        };
      }
      await auth.settle(declared);
      return { outcome: "FAILED", error, decision: auth.decision, actual: declared };
    }

    const reserved = auth.request.amount;
    const actual: Amount = reported ?? reserved;
    await auth.settle(actual);

    return {
      outcome: "COMPLETED",
      value,
      decision: auth.decision,
      reserved,
      actual,
      // Recorded rather than prevented: the spend already happened, and the
      // next decision will see the true, higher figure.
      overage: actual > reserved ? actual - reserved : 0n,
    };
  }

  /** Reservations left open longer than `ageMs`. These need reconciling, not guessing. */
  openReservations(ageMs: number): Promise<readonly LedgerEntry[]> {
    return this.#store.staleReservations(this.#clock.now(), ageMs);
  }

  /**
   * Closes the loop on open reservations by asking a sensor what really
   * happened (Art. XI §42). See `reconcile.ts` for why an unknown stays open.
   */
  reconcile(observer: SpendObserver, ageMs: number): Promise<ReconciliationReport> {
    return reconcile({
      store: this.#store,
      observer,
      asOf: this.#clock.now(),
      ageMs,
      serialize: (work) => this.#serialize(work),
    });
  }
}
