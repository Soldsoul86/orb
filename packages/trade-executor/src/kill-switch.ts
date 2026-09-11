/**
 * The global kill switch.
 *
 * Fails closed, in three senses:
 *
 * 1. If its persisted state cannot be read, it is treated as **engaged**. A
 *    kill switch that fails open is not a kill switch.
 * 2. It is checked before every entry, and the signal API has no way to clear
 *    it — a provider cannot trade through a control the operator set.
 * 3. Its state is persisted, so a restart does not quietly resume trading.
 */
import type { Clock } from "./ports.js";

export interface KillSwitchRecord {
  readonly engaged: boolean;
  readonly reason: string;
  readonly at: number;
  /** Who engaged it: an operator, a risk rule, or the executor itself. */
  readonly source: string;
}

/** Durable storage for the switch. Any failure is treated as "engaged". */
export interface KillSwitchStore {
  load(): Promise<KillSwitchRecord | null>;
  save(record: KillSwitchRecord): Promise<void>;
}

/** Non-persistent store, for tests and ephemeral runs. */
export class MemoryKillSwitchStore implements KillSwitchStore {
  #record: KillSwitchRecord | null = null;
  /** Set to make loads fail, to exercise the fail-closed path. */
  failOnLoad = false;

  async load(): Promise<KillSwitchRecord | null> {
    if (this.failOnLoad) throw new Error("kill switch store unavailable");
    return this.#record;
  }

  async save(record: KillSwitchRecord): Promise<void> {
    this.#record = record;
  }
}

export class KillSwitch {
  readonly #store: KillSwitchStore;
  readonly #now: Clock;
  readonly #listeners = new Set<(record: KillSwitchRecord) => void>();

  /**
   * Starts engaged. Until {@link load} has actually read the stored state, the
   * executor must not trade — "not yet known" and "engaged" are the same thing
   * as far as safety is concerned.
   */
  #record: KillSwitchRecord;

  constructor(store: KillSwitchStore, now: Clock) {
    this.#store = store;
    this.#now = now;
    this.#record = {
      engaged: true,
      reason: "kill switch state has not been loaded yet",
      at: now(),
      source: "executor",
    };
  }

  get engaged(): boolean {
    return this.#record.engaged;
  }

  get state(): KillSwitchRecord {
    return this.#record;
  }

  subscribe(listener: (record: KillSwitchRecord) => void): () => void {
    this.#listeners.add(listener);
    return () => void this.#listeners.delete(listener);
  }

  #set(record: KillSwitchRecord): void {
    this.#record = record;
    for (const listener of this.#listeners) {
      try {
        listener(record);
      } catch {
        // A listener must not be able to jam the switch.
      }
    }
  }

  /**
   * Loads persisted state.
   *
   * A read failure leaves the switch engaged rather than assuming it is clear.
   */
  async load(): Promise<KillSwitchRecord> {
    try {
      const stored = await this.#store.load();
      this.#set(
        stored ?? { engaged: false, reason: "no kill switch recorded", at: this.#now(), source: "executor" },
      );
    } catch (error) {
      this.#set({
        engaged: true,
        reason: `kill switch state unreadable: ${error instanceof Error ? error.message : String(error)}`,
        at: this.#now(),
        source: "executor",
      });
    }
    return this.#record;
  }

  /**
   * Engages the switch.
   *
   * The in-memory state is set **before** persisting: if the write fails, the
   * switch must still be on. Refusing to trade after a failed write is safe;
   * continuing to trade is not.
   */
  async engage(reason: string, source = "operator"): Promise<KillSwitchRecord> {
    const record: KillSwitchRecord = { engaged: true, reason, at: this.#now(), source };
    this.#set(record);
    await this.#store.save(record).catch(() => undefined);
    return record;
  }

  /**
   * Releases the switch.
   *
   * The write must succeed first: if it fails, the switch stays engaged, so a
   * restart cannot come back up trading against a state that was never stored.
   */
  async release(reason: string, source = "operator"): Promise<KillSwitchRecord> {
    const record: KillSwitchRecord = { engaged: false, reason, at: this.#now(), source };
    await this.#store.save(record);
    this.#set(record);
    return record;
  }
}
