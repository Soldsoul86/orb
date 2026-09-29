# Domain Integrity Report — 6. Infrastructure (partial)

> Phase 3b architectural review. The Infrastructure domain answers: **what does
> every runtime depend on, and what must never change beneath it?** **Status:
> `Journal` and `Storage` reviewed and ACCEPTED 2026-09-29** (verdict at foot);
> `Synchronization.md` drafted 2026-09-28, unreviewed.** `ModelRouter` and `Encryption`
> are drafted (addendum below), unreviewed. `ModelRouter` and `Encryption` have no specification.
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

### 1. `Storage` is one kernel contract and three ports in the code — ~~open~~ **resolved 2026-09-29**

`KERNEL.md` names a single `Storage`. `runtime/journal` has **`JournalStore`,
`AttachmentStore` and `AttachmentKeyring`**, and the third is arguably
`Encryption`'s rather than `Storage`'s — it holds keys, and destroying a key is how
an attachment is erased.

`Storage.md` is drafted for the journal store only, and says so by scope rather than
by pretending the others do not exist. **A reviewer should decide** whether
attachments are a second tier of this contract, a separate contract, or
`Encryption`'s. Answering it by drafting was not open to me: it changes the kernel's
shape, and Art. X says the kernel grows by addition, never by a silent re-reading.

**Ruled (operator, 2026-09-29): the attachment store is a *second store of the
same `Storage` contract*, not a new kernel contract.** It shares Storage's durability
obligations and differs only in shape — address-keyed, not lane-ordered — so
`Storage.md` §1 now carries a two-shapes split, and its append-only / append-order
invariants are marked as the journal store's alone. The `AttachmentKeyring` is
`Encryption`'s, already stated in `Encryption.md` §1/§3/§4. The kernel stays thirty
contracts; the change is a scope clause, not a new entry.

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
---

## Addendum — `ModelRouter` and `Encryption` drafted, 2026-09-28

With these two, **all five Infrastructure contracts are drafted**: `Journal`,
`Storage`, `Synchronization`, `ModelRouter`, `Encryption`. Five of the thirty
kernel contracts remain at Draft rather than Accepted; none is reviewed.

The two are opposite ends of the same domain. `ModelRouter` is the only
Infrastructure contract that may send the user's data *out*; `Encryption` is the
only one that depends on nothing, because everything depends on it. Writing them
together made one thing plain: **the router is the disclosure boundary and the
keyring is the enforcement of it.** Policy decides, the router minimizes and
records, and encryption is why the decision still holds on a disk nobody expected
to be read.

### The spines they were written on

- **ModelRouter** — routing is not interpretation; a remote route is a disclosure
  (minimized, permissioned, recorded); an output is an observation with full
  provenance, never truth; **capability is discovered, never assumed**; and
  `degraded` is never `unavailable`, because a local route is always available.
- **Encryption** — *cannot read* rather than *not allowed to read*; a key is stored
  rather than derived **exactly when destroying it must accomplish something**;
  encrypting bytes hides content but never *which* content; tamper-evidence is
  detection, never prevention.

### Gaps found

#### 4. Is a remote model call a `Capability`? — ~~open~~ **settled 2026-09-28, DR-9: yes**

`Capability.md` §4.1 says the runtime affects the world only through a Capability,
and §8 says **reads are capabilities too**. A remote model call is an outbound
network effect carrying user data. On the plain reading of those two clauses it is
a Capability — yet `ModelRouter` is a separate Service with its own gate to
`Policy`, so **the architecture may have two independent egress paths, only one of
which is described as egress**.

Both readings are defensible and they are not the same architecture:

- *The router is a Capability consumer* — it obtains a network Capability like
  anything else, and there is one egress path with one authorization surface.
- *The router is its own egress* — model disclosure is a distinct kind of effect,
  gated distinctly, and `Capability.md` §8 does not reach it.

Nothing in the kernel said which, and accepting both as written would have frozen
the ambiguity into v1.

**Settled (`../DECISIONS.md` DR-9): resolving is not emitting.** A remote route is
a Capability — tier *Act (irreversible)*, because you cannot un-disclose, declared
per route because the destination is part of the consequence. The `ModelRouter` is
not one and never becomes one: a Capability declares a *specific* effect, and the
router's whole job is choosing among effects, so it could not declare honestly and
completely (inv. 2). It resolves and minimizes and yields a **proposed
disclosure**; its caller carries that through the Capability; the Capability emits
and produces the `Action`.

The immediate price, charged rather than deferred: **remote reasoning stops being
free at the point of use.** At irreversible tier it defaults to human confirmation,
so routine remote calls run on an explicit standing, per-scope authorization
(`Policy` §1, Ruling 1) — not on the absence of a gate. The counter-reading, and
why it lost, is recorded in DR-9 rather than dropped.

#### 5. `ModelRouter` was the only Infrastructure contract depending on `Policy` — ~~intended~~ **it was the symptom**

Every other one depends on `Journal`, `Storage`, `Event` or `Encryption` —
mechanism. `ModelRouter` depended on a **decision-maker**, and this section first
recorded that as intended, reasoning that the router cannot authorize itself
(Art. VIII §32) and so must reach something that can.

**That explanation was wrong, and gap 4 is why.** The anomaly was real; it was the
symptom of the same mistake. The router reached a decision-maker because it was
doing the deciding — holding its own gate, on its own egress path. Under DR-9 it
emits nothing, therefore authorizes nothing, therefore needs no edge to `Policy`:
`KERNEL.md`'s entry now reads **`Encryption` alone**, and Infrastructure depends on
no decision-maker anywhere.

Worth keeping as a worked example rather than quietly deleting: *an edge that needs
a paragraph of justification is usually a design error wearing one.* The paragraph
was written, was plausible, and was defending the wrong thing.

#### 6. `AttachmentKeyring`'s rules lived only in code comments

`runtime/journal/src/attachment-keyring.ts` carries three rules that no contract
stated: keys stored never derived, a destroyed identity tombstoned so `seal`
refuses, and `held`/`destroyed`/`absent` as three states rather than two. They were
correct and they were load-bearing, and until today the only place they existed was
a docstring above the implementation that depends on them. `Encryption.md` §1, §3
and §4 now state them. **This is the case for writing the contract even where the
code already works**: the code cannot tell a future reader which of its properties
are obligations and which are incidental.

#### 7. `AIRWALL.md` is an unapproved proposal that constrains the router

It constrains `Reasoner` egress directly and bears on every remote route
`ModelRouter` resolves. `ModelRouter.md` was written without assuming it, since
assuming an unapproved document is how a proposal becomes architecture by
accident. If it is approved, the router contract needs a pass; if it is rejected,
that should be recorded so the next writer does not re-open it.

### What a reviewer should challenge

1. ~~**Gap 4 first.** One egress or two.~~ **Settled, DR-9** — one. What remains
   reviewable is the *price*: irreversible tier means routine remote reasoning
   depends on a standing per-scope authorization, and a reviewer who thinks that is
   too heavy is disagreeing with the tier, not with the ruling.
2. **"Capability is discovered, never assumed" is an obligation with a cost.**
   Rechecking is a round trip. The contract says capability is rechecked rather
   than remembered and does not say how often, which may be the right silence or
   may be the same missing bound as `Synchronization`'s "resumable".
3. **`Encryption` depends on nothing — is that true of key *custody*?** Hardware
   key storage is a device facility; the contract says "behind hardware where the
   device offers it" and otherwise keeps the keyring a port. If custody ever needs
   a Service, the no-dependency claim fails and Art. X §40's spirit with it.
4. **The confirmation oracle is accepted, not solved.** `payloadHash` commits to
   plaintext, which makes a guess testable against history. `Encryption.md` §6
   names it under "not guaranteed". A reviewer should decide whether naming it is
   enough, or whether the hash should be salted — which would cost
   cross-implementation vector agreement and `PARTIAL_REPLICATION.md` §3's ability
   to check a payload recovered from anywhere.
5. **Revocation has no record type.** §7 says a lost device's identity is revoked
   and its future writes are not accepted. *Which* contract defines the revocation
   record, and how a peer learns of it, is unspecified — the same shape of gap as
   erasure confirmation in the previous addendum.


---

## Review verdict — `Journal` and `Storage`, 2026-09-29

**Both Accepted.** Faithful to `KERNEL.md` (kind, purpose, dependencies match),
consistent with Articles I, IV, VIII, IX §33–34 and X §40, and — the bar this
project holds — describing code that exists and passes (672 tests green;
`FileJournalStore`, `MemoryJournalStore`, `verifyLane`, `evaluatePrune`,
`store.ts`'s split comment all real).

The five reviewer challenges, adjudicated:

1. **Journal's direct `Encryption` edge — kept, now documented.** At-rest sealing
   is delivered through `Storage`, and the hash chain uses `node:crypto`
   directly, so the edge is neither of those. Its real work is **erasure**:
   destroying a payload's key is what reaches a copy a peer already holds
   (`attachment-keyring.ts`). `Journal.md` inv. 11 now says so, so the edge is no
   longer "a paragraph of justification." Removing it would be a kernel change and
   is not recommended.
2. **`Storage` inv. 6 (detach reclaims bytes) as an absolute — accepted.** A store
   that cannot destroy bytes must declare itself not erasure-capable (§7) rather
   than report success. The impossibility is made loud, not silently false. Known
   limitation, correctly handled.
3. **`Journal` §7 break-never-repaired → no lane-retirement contract — not a
   blocker.** Journal is correct that a break is permanent (Art. I). The missing
   retirement contract is a future need to log if ever felt, not a defect here.
4. **Neither mentions size/growth — accepted.** Performance is out of `Storage`'s
   scope (§6); growth is bounded in-contract by `detach` (prune) + projections
   (cache). The pass-1 ANR was an implementation defect, fixed and in `SETTLED.md`.
5. **Gap 1 (attachment durability) — resolved above**, and it was the only
   Accept-blocker (Journal depends on Storage).

Gap 3 — the v2 envelope migration landmine — is already captured correctly in
`Journal.md` §5 and survives into the accepted contract, which was the finding
most worth keeping.
