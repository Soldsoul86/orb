# Design — `@orb/journal`

> Governed by `CONSTITUTION.md` Article I (History), Article IV (Distribution)
> and `docs/EVENT_MODEL.md`. This document explains the *why*; the laws
> themselves are not restated here.

## 1. The shape of the problem

Orb is multi-writer by construction: every device is an equal peer and none is
authoritative (Art. IV §14). That rules out the usual answer — a single
append point with a monotonic sequence number — because a single append point
*is* an authority.

The structure that survives this is a **multi-lane, single-writer-per-lane
log**. Each device owns exactly one lane and appends only to it; other lanes
arrive by replication and are read-only. The global journal is the set union of
lanes, which makes merging trivially associative and commutative: there is
nothing to reconcile, because no two devices ever write the same lane.

## 2. Ordering is derived, never stored

Physical clocks across devices disagree. Pure logical clocks lose human-
meaningful time. Hybrid Logical Clocks give both: a logical counter bounded
close to physical time, such that if A causally precedes B then `A.hlc < B.hlc`.

The public order is `(hlc, lane)` — HLC first, lane id as a deterministic
tiebreak — computed **on read**. Persisting a global order would reintroduce the
authority we just removed, so we do not.

`compareEventOrder` also breaks a same-lane, same-HLC tie by event id. That
case cannot occur in a valid journal; the tiebreak exists so the comparator is
total rather than leaving `Array.sort` undefined on corrupt input.

## 3. Integrity

Each event commits to its predecessor's hash, so a lane is a chain. Removing,
reordering or editing an event breaks it detectably. The hash covers a
**canonical** JSON encoding — keys sorted, no incidental whitespace — because
two devices must derive byte-identical encodings for the same event, and
JavaScript object key order is insertion order.

`canonicalJson` refuses `NaN`, `Infinity`, `undefined` and functions. These are
not representable in a way that survives a round trip, and a value that changes
on replay is worse than one that fails to append.

## 4. Concurrency

`Journal.append` serialises through a promise chain. Identity, HLC and hash
must advance atomically: two concurrent appends that each read the same head
would produce a fork, not a chain. The chain is kept alive across failures
(`.catch(() => undefined)`) so that one failed append does not strand every
later one.

## 5. Durability, and what a crash looks like

`FileJournalStore` writes newline-delimited JSON and `fsync`s before resolving,
so a resolved append has survived the process and the machine.

A crash mid-write leaves a **torn final line**. On read that line is discarded,
not repaired: a partial line was never a complete event, and Art. I §2 forbids
mutating history in any case. An unparsable line that is *not* last is genuine
corruption and throws.

Lane ids become filenames, so they are validated against an allowlist pattern
before they touch the filesystem.

## 6. What this deliberately does not do

- **No encryption at rest.** That is `STORAGE.md` / `SECURITY.md` and a later
  phase. The `JournalStore` port is where it will live.
- **No replication protocol.** `replicate()` accepts events a peer hands over;
  how they get there is `SYNC_PROTOCOL.md`.
- **No indexes or queries.** Projections are folds. When a fold becomes too
  slow, the answer is a cached projection rebuilt from the journal — never a
  second source of truth (Art. IX §33).
- **No compaction.** History is not garbage.

## 7. Trade-offs taken

| Decision | Cost | Why anyway |
| --- | --- | --- |
| `fsync` on every append | Throughput | A trade-execution audit trail that loses its last record is not an audit trail. Batching at the sink amortises it. |
| Full replay for every projection | O(history) | Correctness and simplicity first. A cached projection is a later optimisation, not an architectural change. |
| JSON rather than a binary encoding | Size | Inspectable by hand, and forward-compatible through `schema.version`. |
| SHA-256 per event | CPU | Negligible next to the fsync it accompanies. |

## The envelope commits to the payload by hash

`contracts/Event.md` already splits an event into a frozen **envelope** and an
opaque **payload**. The integrity hash commits to the payload *by its hash*
rather than inline, which is the same by-reference commitment
`contracts/Attachment.md` uses for raw bytes. Two things follow, and both are
the reason for the change:

- the chain verifies on a device that holds no payloads at all, so a device may
  drop content without losing tamper-evidence over its own history;
- a payload fetched back later is checked against history before it is trusted,
  so it can come from a peer, a relay, or anywhere else without that source
  needing to be trusted.

**This changed the canonical preimage.** A lane written before this change
hashes its payload inline and will not verify against the current code. There is
no migration path in this package and none is offered: the journal carries no
long-lived history yet, and doing this after it does would have required
`Event v2` alongside v1 under Art. X §38. It is recorded here because a hash
format that changes silently is exactly the kind of thing that is impossible to
diagnose two years later.

## Pruning is guarded, not advertised

`retention.ts` is pure, total, and refuses by default. It is the only rule in
the partial-replication design whose failure is silent and permanent — a payload
dropped when it should not have been is simply gone — so every path that is not
provably safe returns a refusal carrying its reason, and `Journal.detach`
refuses the whole batch if any single event fails. A partial prune would leave
the caller unable to say which payloads still exist, which is the state the
design exists to prevent.

The concurrent-prune race is handled by `policy.pruneOrder` rather than by
coordination: a device may prune only once every device ahead of it has stopped
holding the payload, so at most one device in the set is eligible at a time. It
is deterministic, needs no agreement between devices, and also expresses intent
— the phone goes first, the home server last or not at all.
