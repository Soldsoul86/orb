/**
 * The Event Journal as the executor's audit substrate.
 *
 * Constitution Art. IX, law 34: all history enters through the Journal, and
 * nothing bypasses it. Every lifecycle record therefore becomes an immutable,
 * hash-chained event, and a complete trade is reconstructable by replaying
 * them.
 *
 * ## Why recording is not awaited
 *
 * `record` is called from the hard-exit critical path, between a threshold
 * crossing and a close order. A disk write there would add milliseconds to the
 * one code path that cannot afford them. So `record` only enqueues — an array
 * push — and a background drain appends to the journal in order.
 *
 * That is safe, and the reasoning matters: the durability of our *intent* is
 * not what protects the position. The exchange is. If the process dies between
 * enqueue and append, the record is lost, but reconciliation at startup
 * rediscovers the position from the exchange and re-evaluates the threshold
 * immediately. Losing an audit line is recoverable; losing a stop is not.
 *
 * Ordering is preserved: the queue is FIFO and the drain is serialised.
 */
import type { Journal } from "@orb/journal";
import type { AuditSink } from "../ports.js";
import { LIFECYCLE_SCHEMA, type LifecycleEvent } from "./lifecycle.js";

export interface JournalAuditSinkOptions {
  readonly journal: Journal;
  /** Events appended per batch. Batching keeps the fsync count down. */
  readonly batchSize?: number;
  /** Called when an append fails. Must not throw. */
  readonly onError?: (error: unknown, dropped: readonly LifecycleEvent[]) => void;
  /** Cap on the queue. Beyond it, the oldest records are dropped, loudly. */
  readonly maxQueued?: number;
}

export class JournalAuditSink implements AuditSink {
  readonly #journal: Journal;
  readonly #batchSize: number;
  readonly #maxQueued: number;
  readonly #onError: (error: unknown, dropped: readonly LifecycleEvent[]) => void;

  readonly #queue: LifecycleEvent[] = [];
  #draining: Promise<void> | null = null;
  #dropped = 0;

  constructor(options: JournalAuditSinkOptions) {
    this.#journal = options.journal;
    this.#batchSize = options.batchSize ?? 64;
    this.#maxQueued = options.maxQueued ?? 10_000;
    this.#onError = options.onError ?? (() => undefined);
  }

  /** Records recorded but not yet durable. */
  get pending(): number {
    return this.#queue.length;
  }

  /** Records lost to a full queue. Non-zero means the journal cannot keep up. */
  get dropped(): number {
    return this.#dropped;
  }

  /**
   * Enqueues a lifecycle record. Synchronous, O(1), never throws.
   */
  record(event: LifecycleEvent): void {
    if (this.#queue.length >= this.#maxQueued) {
      // Drop the oldest: the most recent records describe the situation we are
      // currently in, which is the one worth keeping.
      this.#queue.shift();
      this.#dropped += 1;
    }
    this.#queue.push(event);
    this.#schedule();
  }

  #schedule(): void {
    if (this.#draining !== null) return;
    this.#draining = this.#drain().finally(() => {
      this.#draining = null;
      // A record enqueued during the drain needs another pass.
      if (this.#queue.length > 0) this.#schedule();
    });
  }

  async #drain(): Promise<void> {
    while (this.#queue.length > 0) {
      const batch = this.#queue.splice(0, this.#batchSize);
      try {
        await this.#journal.append(
          batch.map((event) => ({
            type: `trade.${event.stage.toLowerCase()}`,
            schema: LIFECYCLE_SCHEMA,
            payload: event as unknown as Record<string, unknown>,
          })),
        );
      } catch (error) {
        // History could not be written. Surface it — this is exactly the kind
        // of silent failure the Constitution forbids — but never let it take
        // the trading path down with it.
        this.#onError(error, batch);
      }
    }
  }

  /** Waits until everything recorded so far is durable. */
  async flush(): Promise<void> {
    this.#schedule();
    while (this.#draining !== null) await this.#draining;
  }
}

/**
 * Rebuilds a trade's lifecycle from the journal.
 *
 * This is the audit path: given only persisted history, reconstruct what
 * happened to a trade, in order. Constitution Art. I, law 4 — every feature
 * must be replayable from events.
 */
export async function replayLifecycle(
  journal: Journal,
  tradeId?: string,
): Promise<readonly LifecycleEvent[]> {
  const { orderEvents, hasPayload } = await import("@orb/journal");
  const events = orderEvents(await journal.readAll());

  const out: LifecycleEvent[] = [];
  for (const event of events) {
    if (event.schema.id !== LIFECYCLE_SCHEMA.id) continue;
    if (!hasPayload(event)) {
      // This device dropped the payload (`docs/PARTIAL_REPLICATION.md`). An
      // audit that silently omits a lifecycle record is worse than no audit, so
      // refuse rather than return a plausible-looking gap.
      throw new Error(
        `lifecycle event ${event.id} is not held on this device; fetch it from a peer before auditing`,
      );
    }
    const payload = event.payload as LifecycleEvent;
    if (tradeId === undefined || payload.tradeId === tradeId) out.push(payload);
  }
  return out;
}
