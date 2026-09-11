/**
 * The position registry — and the single authoritative exit transition.
 *
 * ## Why this can be lock-free
 *
 * JavaScript runs one turn of the event loop to completion. A function that
 * contains no `await` therefore executes atomically with respect to every other
 * task: nothing can observe it half-done. {@link PositionRegistry.claimExit} is
 * written to be exactly that — a synchronous compare-and-set with no awaits,
 * no callbacks, and no allocation that could yield.
 *
 * That is the entire concurrency argument, and it is why `claimExit` must never
 * become `async`. The tests fire many simultaneous triggers at it and assert
 * that exactly one claim succeeds.
 *
 * ## Escalation, not duplication
 *
 * A higher-authority reason arriving after a claim does not start a second
 * close. It escalates the recorded reason on the existing exit lifecycle, so a
 * kill switch during a hard-risk close is audited correctly without doubling
 * the orders.
 */
import type { Side } from "../signal/model.js";
import type {
  CloseAttempt,
  ExitReason,
  ManagedPosition,
  PositionState,
  ProtectiveOrder,
} from "./model.js";
import { isExiting, isTerminal, outranks } from "./model.js";
import { requireNextState, type PositionTransition } from "./state-machine.js";

/** Proof that the holder owns the one exit lifecycle for a position. */
export interface ExitToken {
  readonly tradeId: string;
  readonly symbol: string;
  readonly reason: ExitReason;
  readonly claimedAt: number;
  /** Monotonic per-position claim number. Always `1` for the winning claim. */
  readonly claim: number;
}

export type ClaimOutcome =
  /** This caller owns the exit. Exactly one caller ever sees this. */
  | { readonly kind: "claimed"; readonly token: ExitToken }
  /** An exit already owns the position; this reason outranked it and was recorded. */
  | { readonly kind: "escalated"; readonly from: ExitReason; readonly to: ExitReason }
  /** An exit already owns the position and this reason does not outrank it. */
  | { readonly kind: "already_exiting"; readonly reason: ExitReason }
  /** The position is gone, closed, or was never open. */
  | { readonly kind: "not_exitable"; readonly state: PositionState | "absent" };

/** Notified whenever a position changes. Listeners must not throw. */
export type PositionListener = (position: ManagedPosition, previous?: ManagedPosition) => void;

export class PositionRegistry {
  /** Keyed by symbol: the exchange nets to one position per asset. */
  readonly #positions = new Map<string, ManagedPosition>();
  /** Signal ids already processed, so a replayed signal cannot open a second position. */
  readonly #processedSignals = new Set<string>();
  readonly #listeners = new Set<PositionListener>();
  #claims = 0;

  /* ---------------------------------------------------------------- *
   * Reads
   * ---------------------------------------------------------------- */

  get(symbol: string): ManagedPosition | undefined {
    return this.#positions.get(symbol);
  }

  byTradeId(tradeId: string): ManagedPosition | undefined {
    for (const position of this.#positions.values()) {
      if (position.tradeId === tradeId) return position;
    }
    return undefined;
  }

  all(): readonly ManagedPosition[] {
    return [...this.#positions.values()];
  }

  /** Positions that exist on the exchange and are not finished. */
  live(): readonly ManagedPosition[] {
    return this.all().filter((position) => !isTerminal(position.state));
  }

  hasProcessed(signalId: string): boolean {
    return this.#processedSignals.has(signalId);
  }

  /**
   * Reserves a signal id, returning `false` if it was already taken.
   *
   * Synchronous, for the same reason `claimExit` is: two concurrent deliveries
   * of the same signal must not both proceed to open a position.
   */
  reserveSignal(signalId: string): boolean {
    if (this.#processedSignals.has(signalId)) return false;
    this.#processedSignals.add(signalId);
    return true;
  }

  /** Releases a reservation whose entry never happened, so it can be retried. */
  releaseSignal(signalId: string): void {
    this.#processedSignals.delete(signalId);
  }

  /* ---------------------------------------------------------------- *
   * Writes
   * ---------------------------------------------------------------- */

  subscribe(listener: PositionListener): () => void {
    this.#listeners.add(listener);
    return () => void this.#listeners.delete(listener);
  }

  #publish(position: ManagedPosition, previous?: ManagedPosition): void {
    this.#positions.set(position.symbol, position);
    for (const listener of this.#listeners) {
      try {
        listener(position, previous);
      } catch {
        // A listener must never destabilise the registry.
      }
    }
  }

  /** Inserts a new position. Refuses to overwrite a live one. */
  open(position: ManagedPosition): ManagedPosition {
    const existing = this.#positions.get(position.symbol);
    if (existing && !isTerminal(existing.state)) {
      throw new Error(
        `refusing to replace live position ${position.symbol} in state ${existing.state}`,
      );
    }
    this.#publish(position, existing);
    return position;
  }

  /**
   * Applies a state-machine transition plus a patch, atomically.
   *
   * @throws {IllegalTransitionError} when the transition is not in the table.
   */
  transition(
    symbol: string,
    transition: PositionTransition,
    patch: Partial<Omit<ManagedPosition, "symbol" | "tradeId" | "state">> = {},
  ): ManagedPosition {
    const current = this.#positions.get(symbol);
    if (!current) throw new Error(`no position for ${symbol}`);

    const state = requireNextState(current.state, transition);
    const next: ManagedPosition = { ...current, ...patch, state };
    this.#publish(next, current);
    return next;
  }

  /** Updates observed facts without changing state. Used by the monitor. */
  observe(
    symbol: string,
    patch: Partial<Omit<ManagedPosition, "symbol" | "tradeId" | "state">>,
  ): ManagedPosition | undefined {
    const current = this.#positions.get(symbol);
    if (!current) return undefined;
    const next: ManagedPosition = { ...current, ...patch };
    this.#publish(next, current);
    return next;
  }

  /** Appends a close attempt to the audit trail on the position. */
  recordCloseAttempt(symbol: string, attempt: CloseAttempt): void {
    const current = this.#positions.get(symbol);
    if (!current) return;
    this.#publish({ ...current, closeAttempts: [...current.closeAttempts, attempt] }, current);
  }

  recordProtectiveOrder(symbol: string, order: ProtectiveOrder | undefined): void {
    const current = this.#positions.get(symbol);
    if (!current) return;
    const next = { ...current };
    if (order === undefined) delete (next as { protectiveOrder?: ProtectiveOrder }).protectiveOrder;
    else (next as { protectiveOrder?: ProtectiveOrder }).protectiveOrder = order;
    this.#publish(next, current);
  }

  /**
   * Records a divergence between local belief and exchange truth.
   *
   * Discrepancies accumulate and are never removed: silently overwriting one is
   * exactly the failure this is here to prevent.
   */
  recordDiscrepancy(symbol: string, description: string): void {
    const current = this.#positions.get(symbol);
    if (!current) return;
    this.#publish({ ...current, discrepancies: [...current.discrepancies, description] }, current);
  }

  /* ---------------------------------------------------------------- *
   * The single authoritative exit transition
   * ---------------------------------------------------------------- */

  /**
   * Attempts to claim exit authority over a position.
   *
   * **Contains no `await` and must never contain one.** Its atomicity is the
   * whole guarantee that concurrent triggers cannot produce two closing
   * lifecycles.
   */
  claimExit(symbol: string, reason: ExitReason, at: number): ClaimOutcome {
    const current = this.#positions.get(symbol);
    if (!current) return { kind: "not_exitable", state: "absent" };

    if (isTerminal(current.state)) {
      return { kind: "not_exitable", state: current.state };
    }

    // Already claimed: escalate the reason if this one outranks, but never
    // start a second close.
    if (isExiting(current.state) || current.exitReason !== undefined) {
      const held = current.exitReason ?? "UNKNOWN";
      if (outranks(reason, held)) {
        this.#publish({ ...current, exitReason: reason }, current);
        return { kind: "escalated", from: held, to: reason };
      }
      return { kind: "already_exiting", reason: held };
    }

    const state = requireNextState(current.state, "EXIT_CLAIMED");
    this.#claims += 1;
    const token: ExitToken = {
      tradeId: current.tradeId,
      symbol,
      reason,
      claimedAt: at,
      claim: this.#claims,
    };

    this.#publish({ ...current, state, exitReason: reason, exitTriggeredAt: at }, current);
    return { kind: "claimed", token };
  }

  /** Total successful claims across the registry's lifetime. Asserted by tests. */
  get totalClaims(): number {
    return this.#claims;
  }

  /** Discards terminal positions. Used after their audit records are durable. */
  prune(): number {
    let removed = 0;
    for (const [symbol, position] of this.#positions) {
      if (isTerminal(position.state)) {
        this.#positions.delete(symbol);
        removed++;
      }
    }
    return removed;
  }
}

/** Builds a fresh position record. */
export function newPosition(fields: {
  tradeId: string;
  symbol: string;
  side: Side;
  state: PositionState;
  openedAt: number;
  leverage: number;
  size?: string;
  entryPrice?: string;
  signal?: ManagedPosition["signal"];
  entryClientOrderId?: `0x${string}`;
}): ManagedPosition {
  return {
    tradeId: fields.tradeId,
    symbol: fields.symbol,
    side: fields.side,
    state: fields.state,
    size: fields.size ?? "0",
    entryPrice: fields.entryPrice ?? "0",
    leverage: fields.leverage,
    openedAt: fields.openedAt,
    lastObservedAt: fields.openedAt,
    closeAttempts: [],
    discrepancies: [],
    ...(fields.signal ? { signal: fields.signal } : {}),
    ...(fields.entryClientOrderId ? { entryClientOrderId: fields.entryClientOrderId } : {}),
  };
}
