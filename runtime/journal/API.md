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
ids. `complete` is the only basis for an unqualified answer. `policy` carries
**why** — the sync payload policy this device has been running, from its own
lane, so a bounded horizon names what bounded it (`PARTIAL_REPLICATION.md` §6).
`none` there is not a fault: a device that never synced never recorded one.

```ts
syncPolicyInForce(events, device): SyncPolicyInForce
syncPolicyHistory(events, device): readonly SyncPolicyInForce[]
```
The policy a device has been running, and the sequence of them. Same three states
as `EffectivePolicy` and the same two rules: only the device's own records
(inv. 7), and the newest record governs whether or not it is readable. What comes
back is `PayloadPolicy.describe`, never a rebuilt `wants` — a predicate recovered
from a description would make an explanatory label a wire format.

```ts
latestOwnRecord<T>(events, device, type): OwnRecord<T>
ownRecordHistory<T>(events, device, type): readonly OwnRecord<T>[]
```
What both policy read-backs are built from, shared so the two cannot drift on the
parts that matter: the device filter, and stopping at the newest record even when
its payload is gone.

```ts
evaluatePrune(request: PruneRequest): PruneDecision
```
Pure. Refuses unless: the device is in `policy.pruneOrder`; no device ahead of
it in that order still holds the payload; at least 2 other devices have covering
custody receipts; at least one of them is in `policy.ownedDevices`; and, when the
device produced the event, one holder more than that.

```ts
effectivePolicy(events, device): EffectivePolicy
retentionPolicyDraft(events, device, policy): readonly EventDraft[]
evaluatePruneFromHistory(request: HistoricalPruneRequest): PruneDecision
```
The policy a device prunes under, read from its own history rather than passed
in — `PARTIAL_REPLICATION.md` inv. 6. `EffectivePolicy` is three states, and two
of them are *we do not know*: `none` (never recorded), `unreadable` (recorded,
payload gone), `policy` (read, with the id of the event it came from, so a
decision can cite the rule it applied).

`effectivePolicy` reads **only** events authored by `device` — inv. 7, no device
decides what another may hold — and stops at the newest policy event whether or
not it is readable, because the question is what governs *now* and an earlier
readable policy is a superseded one.

`evaluatePruneFromHistory` **fails closed**: `none` and `unreadable` both refuse,
with reasons that name which, since one wants a policy set and the other wants
one restated. A permissive default would drop payloads on the strength of a
missing record. `retentionPolicyDraft` records only a genuine change, compared
over the canonical encoding so reordered keys are not a change.

`RETENTION_POLICY_TYPE` is content, not bookkeeping: nothing outside the device
reads it, and a legible type would tell a witness when someone changed their mind
about what to keep.

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

### What a payload may contain

`canonicalJson` accepts `null`, booleans, strings, arrays, plain objects, and
**safe integers only**. It rejects `undefined`, NaN, Infinity, fractions,
integers beyond 2^53, and anything else — no dates, no binary, no class
instances. A timestamp is a number of milliseconds; bytes are an `Attachment`
referenced by hash.

The integer restriction is cross-implementation agreement by construction rather
than by matching two difficult algorithms. Java's `Double.toString` and
JavaScript's `JSON.stringify` disagree on `1.0` vs `1`, `100.0` vs `100` and
`1.0E21` vs `1e+21`; making the phone match would mean reimplementing
ECMAScript `Number::toString` byte-exactly, and one disagreement on one rare
value means two devices that can never agree they hold the same history.
`isSafeInteger` closes the spelling problem and the precision problem together:
the largest safe integer is sixteen digits, so no accepted value ever reaches
exponent notation, and none exceeds what both languages represent exactly.

### Fractions are carried scaled, and the scale is in the field name

`confidence: 0.95` is written `confidencePercent: 95`.

**The unit is the coarsest that loses no real distinction**, chosen once per
quantity, because history is immutable: a v1 event's `confidencePercent: 95`
must mean the same thing forever. A finer field may be added later; an old one
may never be reinterpreted.

| quantity | field | why that unit |
| --- | --- | --- |
| confidence | `confidencePercent` 0–100 | every value in `Observation.md` and `MOBILE_SENSING.md` §4 is at most two decimal places; those are *proposals, not measurements*, and a finer scale would permit a number nobody could defend |
| GPS accuracy | `accuracyCm` | a fix good to 3 m versus 30 m is a real difference, and sub-metre exists |
| heart rate | `bpm` | already whole |
| skin temperature | `tempCentiC` | 0.1 °C matters; one step finer is cheap insurance |
| pressure | `pressurePa` | already integral in practice |

Picking too coarse is recoverable — a finer field begins later and the old ones
stay honest. Picking too fine is not: every value written under it carries false
precision forever, and `ERASURE.md` §2 forbids removing the history that would
show it. The same asymmetry decided the coarse envelope in `ERASURE.md` §2b.

## Types

```ts
interface OrbEvent<Payload = unknown> {
  readonly v?: 2;                   // envelope format; absent means 1
  readonly id: string;              // ULID-class, never reused
  readonly lane: LaneId;
  readonly device: string;
  readonly hlc: Hlc;
  readonly wallClock: number;       // human-facing only; never used for ordering
  readonly type: string;
  readonly causes?: readonly string[];
  readonly schema: SchemaRef;
  readonly payload: Payload;        // opaque to the journal
  readonly nonce?: string;          // presentation state; see below
  readonly integrity: Integrity;
}

interface EventDraft<Payload = unknown> {
  readonly type: string;
  readonly schema: SchemaRef;
  readonly payload: Payload;
  readonly causes?: readonly string[];
}
```

### Two forms of the same event (v2)

`docs/ERASURE.md` §2a, §2b. An event has a **stored** form and a **presented**
form, and the difference is the envelope migration.

| | stored / on the wire | presented by `append` and `readLane` |
|---|---|---|
| `type` | `orb.content`, or a bookkeeping type | the real type |
| `schema` | `orb.content` v1 | the real schema |
| `causes` | absent | as written |
| `payload` | `{ causes, data, nonce, schema, type }` | `data`, as written |
| `nonce` | — | the wrapper's nonce |

A witness or a peer sees only the stored form: that an event happened, of a
coarse kind, at a time. The real type, schema and stated lineage are payload
data, so **erasing a payload erases them**, and what remains says *cannot say*
rather than *nothing* — `causes` is `undefined`, never `[]`.

`nonce` is carried on presented events so `storedPayload(event)` can rebuild the
wrapper and `verifyEvent` stays true of an event a caller just read. It is not
in any hash preimage and is not part of identity.

Two consequences worth stating plainly:

- **`payloadHash` is no longer a content address.** The nonce closes a
  confirmation oracle — `payloadHash` sits in a plaintext envelope, so without
  it an adversary hashes guesses until one matches. The cost is that two
  devices recording the same observation produce unlinkable events, so payloads
  cannot be deduplicated by hash.
- **Payloads cannot be selected by kind.** See `holdTypes` below.

## Errors

`JournalIntegrityError` — a broken hash chain, a non-increasing HLC within a
lane, a write to a foreign lane, or a mismatched lane on replication. Carries a
`detail` object naming the offending event.

## Sync

See `docs/SYNC_PROTOCOL.md` §4. Transport, discovery, identity and encryption
live behind `SyncPeer` and are not implemented here.

```ts
interface SyncPeer {
  readonly device: string;
  advertise(): Promise<readonly LaneWatermark[]>;
  tail(lane: LaneId, afterHash: string | null): Promise<readonly EventEnvelope[]>;
  payloads(lane: LaneId, eventIds: readonly string[]): Promise<readonly PayloadRecord[]>;
}
```
Every method is read-only with respect to the peer. A device never pushes into
another device, which is what makes Art. IV §15 mechanical: nothing can write a
lane it does not own because nothing writes remotely at all.

```ts
pullFrom(journal: Journal, peer: SyncPeer, policy: PayloadPolicy): Promise<SyncResult>
exchange(a, aPolicy, b, bPolicy): Promise<readonly [SyncResult, SyncResult]>
```
One direction, then both. Envelopes are accepted and verified before any payload
is requested, so a payload always arrives to an envelope that already commits to
its hash and can reject it.

A device skips envelope adoption for its **own** lane — it is the writer — but
still fetches payloads for it. That is the recovery path for a payload it
pruned, and it is safe because the envelope is its own.

```ts
holdEverything() | holdNothing() | holdSince(ms) | holdContent() | holdTypes([...])
```
`PayloadPolicy` decides which payloads this device holds. It is the device's own
decision; no other device consults it (inv. 7). `describe` is journaled when the
policy changes (inv. 6), so a horizon can be explained later.

A policy sees **envelopes only** — it is deciding whether to fetch the payload,
and a witness has no key in any case. From v2 an envelope carries no real type,
so `holdTypes(["note"])` holds nothing: selective retention by kind of content
is gone, not unimplemented. Any envelope field fine enough to restore it is a
field that survives erasure and is readable by whoever holds the envelope, which
is the leak §2b closed. What remains available is lane, device, wall clock and
content-versus-bookkeeping — `holdSince` and `holdContent`.

```ts
advertise(): Promise<readonly LaneWatermark[]>
tail(lane, afterHash): Promise<readonly EventEnvelope[]>
payloads(lane, eventIds): Promise<readonly PayloadRecord[]>
attach(lane, payloads): Promise<number>
```
`Journal`'s side of the same port. `tail` never withholds — inv. 1, partiality is
about retention, never emission. `attach` verifies every payload against its
envelope before storing and throws `JournalIntegrityError` otherwise.

### Convergence

A round is **returned, not journaled**. What gets appended is the policy when it
changes, and custody that advanced over at least one non-bookkeeping event.
Without that second condition sync never settles: each round would replicate the
last round's records and record that it had done so, forever.
