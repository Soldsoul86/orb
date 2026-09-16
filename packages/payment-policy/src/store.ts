/**
 * Where reservations live.
 *
 * Every method is **synchronous**, and that is a load-bearing constraint
 * rather than a convenience. The guard's critical section reads the ledger,
 * decides, and writes the reservation with no suspension point in between —
 * exactly the argument that makes the executor's `claimExit` safe. An `async`
 * store would reintroduce the window this whole design exists to close: two
 * callers both reading an empty budget before either has written to it.
 *
 * A durable implementation must therefore do its own atomicity internally
 * (a transaction, a compare-and-set, an append-only file with a lock) and
 * expose a synchronous face, or be driven from a single-threaded writer.
 */
import type { Amount } from "./model.js";
import type { LedgerEntry } from "./ledger.js";

export interface LedgerStore {
  /** Every entry for an account, in any order. */
  entries(account: string): readonly LedgerEntry[];
  find(requestId: string): LedgerEntry | undefined;
  /** Records a new reservation. Throws if the request id is already known. */
  append(entry: LedgerEntry): void;
  /** Records what was actually spent. */
  settle(requestId: string, actualAmount: Amount): void;
  /** Records that the spend provably did not happen. */
  reverse(requestId: string): void;
  /** Reservations still open at `asOf` that were made more than `ageMs` ago. */
  staleReservations(asOf: number, ageMs: number): readonly LedgerEntry[];
}

export class LedgerStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerStoreError";
  }
}

/**
 * An in-process store.
 *
 * Enough to run a guard, and the reference for what a durable store must
 * guarantee. It keeps insertion order so a replay reads the same sequence
 * every time.
 */
export class MemoryLedgerStore implements LedgerStore {
  readonly #byId = new Map<string, LedgerEntry>();

  entries(account: string): readonly LedgerEntry[] {
    const out: LedgerEntry[] = [];
    for (const entry of this.#byId.values()) {
      if (entry.account === account) out.push(entry);
    }
    return out;
  }

  find(requestId: string): LedgerEntry | undefined {
    return this.#byId.get(requestId);
  }

  append(entry: LedgerEntry): void {
    if (this.#byId.has(entry.requestId)) {
      throw new LedgerStoreError(`duplicate reservation for ${entry.requestId}`);
    }
    this.#byId.set(entry.requestId, entry);
  }

  settle(requestId: string, actualAmount: Amount): void {
    const entry = this.#require(requestId);
    if (actualAmount < 0n) {
      throw new LedgerStoreError(`settled amount is negative for ${requestId}`);
    }
    // The recorded amount becomes what actually happened, not what was
    // authorized. A ledger that keeps the estimate drifts away from reality,
    // and every later budget decision inherits the drift.
    this.#byId.set(requestId, { ...entry, amount: actualAmount, state: "SETTLED" });
  }

  reverse(requestId: string): void {
    const entry = this.#require(requestId);
    this.#byId.set(requestId, { ...entry, state: "REVERSED" });
  }

  staleReservations(asOf: number, ageMs: number): readonly LedgerEntry[] {
    const out: LedgerEntry[] = [];
    for (const entry of this.#byId.values()) {
      if (entry.state === "PENDING" && asOf - entry.at > ageMs) out.push(entry);
    }
    return out;
  }

  #require(requestId: string): LedgerEntry {
    const entry = this.#byId.get(requestId);
    if (entry === undefined) throw new LedgerStoreError(`no reservation for ${requestId}`);
    return entry;
  }
}
