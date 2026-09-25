/**
 * Append-only file store: one newline-delimited JSON file per lane.
 *
 * Durability matters here because crash recovery reads this back (§12 of the
 * executor's requirements). Every append is `write` + `fsync` before resolving,
 * so a resolved append survives process and machine death.
 *
 * A torn trailing line — the signature of a crash mid-write — is discarded on
 * read rather than repaired, because Art. I §2 forbids mutating history and a
 * partial line was never a complete event.
 *
 * `detach` and `attach` are the operations that rewrite a lane file. Both are compaction in
 * the sense of `RUNTIME_LOOP.md` §13 — it drops payload bytes and keeps every
 * envelope, so the chain still verifies afterwards and nothing about any event's
 * identity, content or replayability changes (`contracts/Event.md` §2). The
 * rewrite goes to a temporary file and is renamed into place, so a crash leaves
 * either the old lane or the new one and never a half-written lane.
 */
import { open, mkdir, readFile, readdir, rename, unlink } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { join } from "node:path";
import type { JournalStore, PayloadRecord } from "./store.js";
import type { AbsenceReason, LaneId, OrbEvent, StoredEvent } from "./types.js";
import { hasPayload } from "./types.js";

const LANE_FILE_SUFFIX = ".lane.jsonl";

/** Lane ids become filenames, so they must not escape the journal directory. */
function laneFile(directory: string, lane: LaneId): string {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(lane) || lane === "." || lane === "..") {
    throw new TypeError(`unsafe lane id: ${JSON.stringify(lane)}`);
  }
  return join(directory, `${lane}${LANE_FILE_SUFFIX}`);
}

export class FileJournalStore implements JournalStore {
  readonly #directory: string;
  readonly #handles = new Map<LaneId, FileHandle>();
  /** Serialises appends per lane so concurrent callers cannot interleave writes. */
  readonly #writeQueues = new Map<LaneId, Promise<void>>();
  #closed = false;

  private constructor(directory: string) {
    this.#directory = directory;
  }

  static async open(directory: string): Promise<FileJournalStore> {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    return new FileJournalStore(directory);
  }

  async #handle(lane: LaneId): Promise<FileHandle> {
    const existing = this.#handles.get(lane);
    if (existing) return existing;
    const handle = await open(laneFile(this.#directory, lane), "a", 0o600);
    this.#handles.set(lane, handle);
    return handle;
  }

  async append(lane: LaneId, events: readonly StoredEvent[]): Promise<void> {
    if (this.#closed) throw new Error("journal store is closed");
    if (events.length === 0) return;

    const body = events.map((event) => JSON.stringify(event)).join("\n") + "\n";
    const previous = this.#writeQueues.get(lane) ?? Promise.resolve();
    const next = previous.then(async () => {
      const handle = await this.#handle(lane);
      await handle.write(body);
      await handle.sync();
    });

    // Keep the chain alive even when one append fails, so later appends still
    // serialise behind it rather than racing.
    this.#writeQueues.set(lane, next.catch(() => undefined));
    await next;
  }

  async read(lane: LaneId): Promise<readonly StoredEvent[]> {
    let text: string;
    try {
      text = await readFile(laneFile(this.#directory, lane), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }

    const events: StoredEvent[] = [];
    for (const line of text.split("\n")) {
      if (line === "") continue;
      try {
        events.push(JSON.parse(line) as StoredEvent);
      } catch {
        // A torn final line is a crash artefact, not history. Anything earlier
        // being unparsable is corruption, and must surface.
        if (!text.endsWith(line)) throw new Error(`corrupt journal line in lane ${lane}`);
      }
    }
    return events;
  }

  async detach(
    lane: LaneId,
    eventIds: readonly string[],
    absence: AbsenceReason,
  ): Promise<number> {
    if (eventIds.length === 0) return 0;
    const wanted = new Set(eventIds);
    return this.#rewrite(lane, (event) => {
      if (!wanted.has(event.id)) return event;

      if (!hasPayload(event)) {
        // Already gone. Only a raise to `erased` changes anything, and reasons
        // never move back — see `JournalStore.detach`.
        if (absence !== "erased" || event.absence === "erased") return event;
        return { ...event, absence };
      }

      const { payload: _payload, ...envelope } = event as OrbEvent;
      return { ...envelope, absence };
    });
  }

  async attach(lane: LaneId, payloads: readonly PayloadRecord[]): Promise<number> {
    if (payloads.length === 0) return 0;
    const incoming = new Map(payloads.map((record) => [record.eventId, record.payload]));
    return this.#rewrite(lane, (event) => {
      if (event.payload !== undefined) return event;
      const payload = incoming.get(event.id);
      return payload === undefined ? event : { ...event, payload };
    });
  }

  /**
   * Rewrites a lane file through `transform`, atomically.
   *
   * Compaction in the sense of `RUNTIME_LOOP.md` §13: envelopes are preserved
   * exactly, so the chain still verifies afterwards. The rewrite goes to a
   * temporary file and is renamed into place, so a crash leaves either the old
   * lane or the new one and never a half-written lane.
   *
   * Serialised behind the lane's write queue, because an append landing partway
   * through a rewrite would be lost when the file is swapped.
   */
  async #rewrite(
    lane: LaneId,
    transform: (event: StoredEvent) => StoredEvent,
  ): Promise<number> {
    if (this.#closed) throw new Error("journal store is closed");

    const previous = this.#writeQueues.get(lane) ?? Promise.resolve();
    const next = previous.then(() => this.#rewriteNow(lane, transform));
    this.#writeQueues.set(
      lane,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  }

  async #rewriteNow(
    lane: LaneId,
    transform: (event: StoredEvent) => StoredEvent,
  ): Promise<number> {
    const events = await this.read(lane);
    let changed = 0;

    const rewritten = events.map((event) => {
      const next = transform(event);
      if (next !== event) changed += 1;
      return next;
    });
    if (changed === 0) return 0;

    const target = laneFile(this.#directory, lane);
    const temporary = `${target}.compacting`;
    const body = rewritten.map((event) => JSON.stringify(event)).join("\n") + "\n";

    const handle = await open(temporary, "w", 0o600);
    try {
      await handle.write(body);
      await handle.sync();
    } finally {
      await handle.close();
    }

    // Drop the append handle before swapping the file underneath it, or later
    // appends would land in the unlinked inode and silently vanish.
    const appendHandle = this.#handles.get(lane);
    if (appendHandle) {
      this.#handles.delete(lane);
      await appendHandle.close();
    }

    try {
      await rename(temporary, target);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }

    return changed;
  }

  async lanes(): Promise<readonly LaneId[]> {
    const entries = await readdir(this.#directory).catch(() => [] as string[]);
    return entries
      .filter((name) => name.endsWith(LANE_FILE_SUFFIX))
      .map((name) => name.slice(0, -LANE_FILE_SUFFIX.length))
      .sort();
  }

  async close(): Promise<void> {
    this.#closed = true;
    await Promise.all([...this.#writeQueues.values()]);
    await Promise.all([...this.#handles.values()].map((handle) => handle.close()));
    this.#handles.clear();
  }
}
