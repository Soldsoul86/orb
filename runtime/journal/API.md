# API — `@orb/journal`

## `Journal`

```ts
static open(options: JournalOptions): Promise<Journal>
```
Opens a journal over a store, restoring the local lane's head and clock so a
restarted process continues the same chain rather than forking it. Verifies the
local lane's integrity on open.

```ts
append(drafts: readonly EventDraft[]): Promise<readonly OrbEvent[]>
appendOne<P>(draft: EventDraft<P>): Promise<OrbEvent<P>>
```
Appends to the local lane as one atomic, durable batch. Concurrent callers are
serialised. Assigns `id`, `hlc`, `wallClock` and `integrity`.

```ts
replicate(lane: LaneId, events: readonly StoredEvent[]): Promise<void>
```
Adopts events from a foreign lane. Idempotent — already-known events are
skipped. Throws `JournalIntegrityError` for the local lane, for events that do
not belong to the named lane, and for a batch that breaks the chain.

```ts
readAll(): Promise<readonly StoredEvent[]>
readLane(lane: LaneId): Promise<readonly StoredEvent[]>
lanes(): Promise<readonly LaneId[]>
verify(): Promise<void>
subscribe(listener: JournalListener): () => void
close(): Promise<void>
get clock(): Hlc
```

## Partial replication

See `docs/PARTIAL_REPLICATION.md`. An event is an **envelope** plus a
**payload**. Every device holds every envelope; a device may hold only some
payloads. `hasPayload(event)` narrows `StoredEvent` to `OrbEvent`.

```ts
detach(lane: LaneId, eventIds: readonly string[], policy: RetentionPolicy): Promise<number>
```
Drops payloads, keeping envelopes. Every id is checked against `evaluatePrune`
first and the whole call is refused if any fails, so a caller is never left
unsure which payloads still exist. Throws `RetentionError`.

```ts
horizon(): Promise<Horizon>
```
What this device cannot answer: per lane, how many payloads are absent and which
ids. `complete` is the only basis for an unqualified answer.

```ts
evaluatePrune(request: PruneRequest): PruneDecision
```
Pure. Refuses unless: the device is in `policy.pruneOrder`; no device ahead of
it in that order still holds the payload; at least 2 other devices have covering
custody receipts; at least one of them is in `policy.ownedDevices`; and, when the
device produced the event, one holder more than that.

```ts
custodyReceiptFor(lane, events): CustodyReceipt | null
custodyReceiptDraft(receipt): EventDraft<CustodyReceipt>
latestCustody(events, lane): readonly HeldCustody[]
```
Receipts are ordinary events on the holder's own lane, so the holder is
`event.device` and is never a field. A receipt watermarks the contiguous prefix
actually held — a gap ends the claim.

## Ordering and replay

```ts
compareEventOrder(a: EventEnvelope, b: EventEnvelope): number   // (hlc, lane)
orderEvents<E extends EventEnvelope>(events: readonly E[]): readonly E[]
fold<S>(events: readonly OrbEvent[], initial: S, project: Projection<S>): S
replay<S>(journal: Journal, initial: S, project: Projection<S>): Promise<S>
```

## Hybrid Logical Clocks

```ts
class HybridLogicalClock {
  constructor(now: PhysicalClock, initial?: Hlc)
  tick(): Hlc                 // local append
  merge(incoming: Hlc): Hlc   // replicated event
  get last(): Hlc
}
compareHlc(a: Hlc, b: Hlc): number
encodeHlc(hlc: Hlc): string   // fixed-width, lexicographically ordered
decodeHlc(encoded: string): Hlc
```

## Integrity

```ts
canonicalJson(value: unknown): string
hashEvent(event: Omit<OrbEvent, "integrity"> & { previous: string | null }): string
verifyEvent(event: OrbEvent): boolean
verifyLane(events: readonly OrbEvent[]): void   // throws JournalIntegrityError
```

## Stores

```ts
interface JournalStore {
  append(lane: LaneId, events: readonly OrbEvent[]): Promise<void>;
  read(lane: LaneId): Promise<readonly OrbEvent[]>;
  lanes(): Promise<readonly LaneId[]>;
  close(): Promise<void>;
}

class MemoryJournalStore implements JournalStore {}
class FileJournalStore implements JournalStore {
  static open(directory: string): Promise<FileJournalStore>
}
```

`append` must be atomic per call and durable before it resolves.

## Types

```ts
interface OrbEvent<Payload = unknown> {
  readonly id: string;              // ULID-class, never reused
  readonly lane: LaneId;
  readonly device: string;
  readonly hlc: Hlc;
  readonly wallClock: number;       // human-facing only; never used for ordering
  readonly type: string;
  readonly causes: readonly string[];
  readonly schema: SchemaRef;
  readonly payload: Payload;        // opaque to the journal
  readonly integrity: Integrity;
}

interface EventDraft<Payload = unknown> {
  readonly type: string;
  readonly schema: SchemaRef;
  readonly payload: Payload;
  readonly causes?: readonly string[];
}
```

## Errors

`JournalIntegrityError` — a broken hash chain, a non-increasing HLC within a
lane, a write to a foreign lane, or a mismatched lane on replication. Carries a
`detail` object naming the offending event.
