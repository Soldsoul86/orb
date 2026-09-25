# `@orb/journal`

The Event Journal — Orb's single source of truth.

Append-only, hash-chained, HLC-ordered history. Everything else in the runtime
is a projection of what passes through here, and any projection can be deleted
and rebuilt by replaying it.

This is the first executable component of Orb (ROADMAP Phase 4), and the
substrate the Hyperliquid trade executor records its audit trail on.

## Quick start

```ts
import { Journal, FileJournalStore, replay } from "@orb/journal";

const store = await FileJournalStore.open(".orb-local/journal");
const journal = await Journal.open({ lane: "mac", device: "mac-01", store });

await journal.appendOne({
  type: "note",
  schema: { id: "example.note", version: 1 },
  payload: { text: "hello" },
});

// Any derived view is a fold over history.
const count = await replay(journal, 0, (n) => n + 1);
```

## What it guarantees

| Guarantee | Where |
| --- | --- |
| Appends only; history is never mutated | `journal.ts` |
| One writer per lane; foreign lanes are replicated read-only | `journal.ts` |
| Tamper-evidence through a per-lane hash chain | `integrity.ts` |
| Causal ordering across unsynchronised clocks | `hlc.ts` |
| Public order derived on read, never stored | `replay.ts` |
| Durability across process and machine restart | `file-store.ts` |

## Documents

- [`DESIGN.md`](DESIGN.md) — why it is built this way.
- [`API.md`](API.md) — the public surface.
- [`TESTS.md`](TESTS.md) — what is covered and what is not.

## Partial replication

Every device holds every event's **envelope**; payloads may be dropped locally
once custody receipts prove the payload survives on at least two other devices,
one of them the user's own. The chain verifies and `(hlc, lane)` order derives
from envelopes alone, so a device that has pruned still agrees with every peer
about what happened and in what order — and, because it holds every envelope, it
knows exactly what it is missing rather than answering as though nothing were.

`fold` and `replay` therefore return a `BoundedFold`: the state plus whether it
was complete and which events were skipped. See `docs/PARTIAL_REPLICATION.md`.

## Sync

`pullFrom` and `exchange` implement `docs/SYNC_PROTOCOL.md` §4 over an injected
`SyncPeer`. Envelopes replicate in full regardless of what the sender retains;
payloads are pulled afterwards, only for what the receiving device's own
`PayloadPolicy` says it should hold. Transport, discovery, device identity and
encryption are deliberately absent and live behind the port.
