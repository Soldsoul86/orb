# Domain Integrity Report — 6. Infrastructure (partial)

> Phase 3b architectural review. The Infrastructure domain answers: **what does
> every runtime depend on, and what must never change beneath it?** **Status:
> partial — `Journal.md`, `Storage.md` and `Synchronization.md` drafted 2026-09-28,
> all unreviewed.** `ModelRouter` and `Encryption` have no specification.
> Every contract in this domain is a Service.

---

## Why these two were written first

They are the only kernel contracts with a **working implementation and four days of
real device evidence behind them**. `runtime/journal` exists, `apps/pixel/pass1`
holds a second implementation of the same format in Java, and between them they
have produced a 5,667-event lane, a replicated export, a cross-implementation
verification and one permanent chain break.

That changes the job. For `Scheduler` and `Agent` the risk was writing something
untestable. Here the risk is the opposite: **writing a contract the implementation
already violates, and not noticing.** So these two were written against the code and
the device record rather than against the kernel entry alone, and three gaps came
out of it.

---

## The architectural principle adopted

**The journal owns the invariants; the store owns durability.**

`runtime/journal/src/store.ts` already says it in a comment, and it is the whole
reason the engine is interchangeable: *"Keeping them apart lets the same journal run
over memory (tests), a file (the device runtime), or any future encrypted store
without changing its semantics."* Elevating that from a comment to a contract is
most of what `Storage.md` is.

The second principle is the one that makes Art. I survivable:

**The envelope and the payload have different durability.** Every device holds every
envelope; payloads are separable. That is what lets erasure exist without amending
Art. I §2 — *the sequence keeps its length, its order and every hash; one event has
no readable content any more and says so* (operator ruling, 2026-09-25,
`ERASURE.md` §2). Both contracts are built on it and both state it, because a reader
who meets `detach` without it will conclude the journal deletes history.

---

## Gaps found between the kernel and the implementation

### 1. `Storage` is one kernel contract and three ports in the code

`KERNEL.md` names a single `Storage`. `runtime/journal` has **`JournalStore`,
`AttachmentStore` and `AttachmentKeyring`**, and the third is arguably
`Encryption`'s rather than `Storage`'s — it holds keys, and destroying a key is how
an attachment is erased.

`Storage.md` is drafted for the journal store only, and says so by scope rather than
by pretending the others do not exist. **A reviewer should decide** whether
attachments are a second tier of this contract, a separate contract, or
`Encryption`'s. Answering it by drafting was not open to me: it changes the kernel's
shape, and Art. X says the kernel grows by addition, never by a silent re-reading.

### 2. The projection half of `Storage` has no implementation, and may need none

`KERNEL.md` gives `Storage` the responsibility to *"persist immutable journal
segments and disposable projections."* **Nothing persists projections.**
`device-watch` folds its whole state from events on every call.

That is not a hole. It is evidence, and the draft treats it as such: persisting
projections is **permitted, never required**, and a persisted projection is a cache
that must be discardable at any moment and never consulted in preference to the
journal. A projection store that outlived the events it described would be the
second source of truth Art. IX §33 forbids — and the failure would be invisible,
because a stale cache answers confidently.

Demonstrated rather than argued: on 2026-09-28 a container died and the journal was
rebuilt from exports alone, re-deriving every observation and alert identically
(`DEVICE_LOOP.md` §7b3).

### 3. The envelope version is a migration, not a setting

`Journal.md` §5 carries a rule the kernel entry does not: **migrating a running
device's envelope version is not a configuration change.** Under v2 the fine type is
coarsened to `orb.content`, and machinery that finds an event by its real type stops
matching — silently, and in the direction that looks like nothing happening.

This is in the contract because the failure is already latent in shipped code:
`Pass2.lastOfType` reads the fine type off the line, and under v2 every observation
would re-baseline for ever, reporting no change and never saying why. The note sits
on the method in the source; it now sits in the contract too, where a future
implementer will meet it before writing the migration rather than after.

---

## What a reviewer should challenge

1. **`Journal` depends on `Storage` and `Encryption`; `Storage` depends on
   `Encryption`.** All Service→Service, so Art. X §40 is satisfied — but is
   `Encryption` on `Journal`'s edge doing any work that is not already done through
   `Storage`? A dependency that exists only to be mentioned should go.
2. **Invariant 6 of `Storage` — *detach reclaims the bytes* — is stated as an
   absolute** and some media cannot honour it (snapshotting filesystems,
   copy-on-write, flash wear-levelling). The draft's answer is that such a store
   must declare itself not erasure-capable rather than report success. That is
   honest and possibly unimplementable on a real phone, and it deserves a harder
   look than I gave it.
3. **`Journal.md` §7 says a chain break is never repaired.** Correct under Art. I,
   and it means a device carrying a break carries it for ever. There is no contract
   anywhere for *retiring* a lane, and if one is ever needed this is where its
   absence will be felt.
4. **Neither contract mentions size.** Pass 1's lane reached 3.3 MB in three days
   and its read cost became an ANR (§7b11). That was an implementation defect, not a
   contract one — but a contract that says *read the whole lane, in order, for ever*
   and says nothing about growth is worth a second opinion.

---

## Phase position

Twelve contracts Accepted, fifteen Draft, **three with no specification**:
`Synchronization`, `ModelRouter`, `Encryption`. Phase 3b's gate is every
specification accepted, so nothing here opens Phase 3c.


---

## Addendum — `Synchronization` drafted, 2026-09-28

The third of five, and the first in this domain written for something that **does
not exist**. `STATE.md` has said so throughout: sync is unbuilt and the export is a
file the operator carries.

That turned out to matter less than expected, because **`importExport` already
implements the contract's semantics with a human as the transport.** It groups an
export by lane, verifies the chain, skips every event already held, and adopts the
rest; re-importing changes nothing and a longer export adds only its tail. That is
anti-entropy, idempotence and resumption, demonstrated on real device data. What is
missing is automation and a peer — not the semantics.

**The spine** is that sync decides nothing. Not what is true, not what wins, not
what a peer may keep. Merge is the union of single-writer lanes, so there is no
conflict to resolve and no component here permitted to resolve one. Order is
computed on read and never transmitted, because **whoever wrote the order would be
deciding it for everyone** (Art. IV §17).

The distinction the contract works hardest to keep is **emission versus retention**:
a device always replicates its own lane *in full* — it is never the sole holder of
anything it produced — while what it *keeps* of other lanes is local policy that no
peer may override.

### The finding: the retention machinery is complete and currently unreachable

`evaluatePrune` refuses to drop a payload without **custody receipts from at least
two other devices**, one of them user-owned. It explicitly excludes the device's own
receipt (`held.holder === selfDevice` returns false).

Custody receipts are ordinary events on the holder's own lane. **Without sync,
another device's lane never arrives.** So on the operator's phone today, the prune
path can never be authorized — not because it is broken, but because the only
transport that could satisfy it is unbuilt.

Nothing is wrong, and nothing needs fixing. It is worth recording because it names
precisely what sync unblocks, and because the machinery passing its tests while
being unreachable in practice is exactly the shape of thing this project keeps
finding only on a real device.

### What a reviewer should challenge

1. **Who starts a sync?** Art. V §21 says the runtime owns scheduling and nothing
   wakes itself — so sync should be dispatched by the `Scheduler`. `KERNEL.md`'s
   Synchronization entry does not say so, and `Scheduler.md` does not list sync
   among the work it dispatches. **The draft is silent on this and should not be.**
   One of the two contracts needs to name it.
2. **What bounds a session?** The contract claims resumable, and the unit of
   resumption is never defined. Per lane? Per tail? Per byte? A claim of
   resumability that does not say what resumes is thinner than it reads.
3. **Erasure confirmation has no record type.** §7 requires recording *which peers
   confirmed* an erasure, and no contract defines that record. It is the same gap
   `Action`'s authorization reference had before `Policy.md` §1 was written.
4. **`Encryption` is on this contract's dependency edge** and the draft delegates
   everything cryptographic to it. If the only use is "the transport is encrypted",
   the edge may belong to the transport rather than to sync — the same question
   already open against `Journal`'s edge.