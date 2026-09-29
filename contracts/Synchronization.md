# Synchronization — Contract Specification

```
Contract:   Synchronization
Domain:     Infrastructure
Kind:       Service
Version:    v1
Status:     Accepted
Depends on: Journal, Event, Encryption
```

> Synchronization moves immutable lanes between devices that are equal. It carries
> history; it never decides anything about it. See `../docs/SYNC_PROTOCOL.md` and
> `../docs/PARTIAL_REPLICATION.md`.

**Why a permanent kernel contract?** Because *"devices are equal peers; no device
is authoritative"* (Art. IV §14) is a claim that survives only if the component
moving data between them can never become the exception. Anything that merged, that
resolved, that decided which version won, or that persisted a global order would be
an authority — and the architecture would have one without anyone choosing to add
one. Fixing replication as **union of single-writer lanes, verified before
acceptance, never rewriting, never deciding** is what makes equal peerage
structural. The *transport* is replaceable — a cable, a local link, a relay that
never sees plaintext — and the contract is not.

---

## 1. Semantics

A **Synchronization** is a Service that exchanges missing lane tails between peers
and hands what it receives to the `Journal` for adoption.

Its subject matter is the unit that makes this safe: a **lane** is append-only and
single-writer, so replicating one is copying events a peer does not yet have. **Two
devices appending to different lanes can never collide**, which is why there is no
merge algorithm here, no vector clock reconciliation, and no conflict resolution.
Merge is set union, and the union is the same on every device that has seen the
same events.

**It decides nothing.** Not what is true, not what wins, not what a peer may keep.
A contradiction between two devices' histories is a contradiction in the world and
is resolved in interpretation — never by editing, dropping or preferring one lane
(Art. IV §18).

### Order is computed, never carried

Global order is `(hlc, lane)`, derived on read. Sync advances the local clock to
reflect the maximum it has seen, so causal knowledge moves forward — but it never
transmits or persists an ordering. **Persisting a global order would reintroduce an
authority** (Art. IV §17): whoever wrote the order would be deciding it for
everyone.

### Emission and retention are different things

| | |
| --- | --- |
| **Emission** | A device always replicates **its own lane in full**. It is never the sole holder of anything it produced |
| **Retention** | A device may hold only *some* payloads of lanes it received. That is local policy |

Every device holds every **envelope**; payloads vary. So devices differ in retained
detail, never in what they know happened — and the derived order needs only
envelopes, so it is identical everywhere regardless.

**No device decides what another may hold** (`PARTIAL_REPLICATION.md` inv. 7). A
peer that wants fewer payloads is not misconfigured, and a peer that wants more is
not entitled to them.

---

## 2. Lifecycle

1. **Discovery and transport.** A session begins only when the runtime **dispatches**
   it — sync never wakes itself or polls (Art. V §21; the `Scheduler` owns when).
   Peers then connect over any encrypted channel — a direct local link, or a relay
   used purely as a dumb pipe. The relay is *replication, never authority*: it moves
   ciphertext and holds no keys.
2. **Advertisement.** Each peer states, per lane, how far it has seen. Because
   lanes are hash-chained, the gap that follows is unambiguous.
3. **Transfer.** The peer sends the missing tail.
4. **Verification.** The receiver checks the incoming chain against the lane it
   already holds, **before** accepting anything.
5. **Adoption.** Verified events go to the `Journal`, which is what actually
   appends them. Sync never writes storage itself.
6. **Clock merge.** The local HLC advances to the maximum seen.
7. **Continuity.** A session ends; synchronization does not. There is no state in
   which two devices are finished with each other.

---

## 3. State transitions

```
idle ──peer reachable──▶ advertising ──▶ transferring ──▶ verifying ──▶ adopting ──▶ idle
  ▲                           │              │               │
  │                           │              │               └─chain invalid──▶ rejected
  │                           │              └─interrupted──▶ idle  (resumable; nothing partial was adopted)
  └───────────────no peer reachable, indefinitely───────────────────────────────┘
```

Three distinctions the diagram keeps apart:

- **`idle` is not failure.** A peer that has not been reachable since Tuesday is a
  fact about the world, not an error state. See §7.
- **Interrupted is not partial.** A transfer cut halfway adopts nothing. **The unit of
  resumption is the lane:** a re-advertisement names the last event *durably adopted*
  and transfer resumes from the next, so there is no half-applied tail to reason about.
  Nothing finer than a lane is promised, and nothing finer is needed, because adoption
  is the `Journal`'s atomic append — a partial batch was never adopted.
- **`rejected` is not `repaired`.** A broken chain is refused whole. Patching it
  would be writing history on behalf of another device, which is the one thing a
  peer may never do.

---

## 4. Invariants

1. **Equal peers.** No device is authoritative, including over what another device
   retains (Art. IV §14, `PARTIAL_REPLICATION.md` inv. 7).
2. **Replicates, never rewrites.** Sync adopts events; it never authors, edits,
   reorders or drops them (Art. IV §18).
3. **Merge is union.** There are no journal-level conflicts to resolve, and no
   component here is permitted to resolve one.
4. **Verify before accept.** Incoming chains are hash-verified against what is
   already held. A broken chain is rejected, never patched.
5. **Causality is preserved.** The HLC advances on receive.
6. **Order is derived, never transmitted or stored** (Art. IV §17).
7. **Idempotent and resumable.** Receiving a known event is a no-op; an interrupted
   session loses no ground and creates no partial state.
8. **Emission is complete.** A device replicates its own lane in full. Partiality is
   a property of retention only (`PARTIAL_REPLICATION.md` inv. 1).
9. **Every envelope reaches every device**; only payloads are selective (inv. 2).
10. **Relays are zero-knowledge.** They carry ciphertext, hold no keys and see no
    plaintext (Art. IV §16). The mechanism is `Encryption`'s and is never
    re-implemented here.
11. **Never decides.** Not truth, not precedence, not another device's retention.
12. **Never self-initiating.** Sync is dispatched by the runtime `Scheduler`; it does
    not wake itself or poll (Art. V §21). The dispatch edge runs `Scheduler → Sync`,
    so sync gains no dependency on a scheduler — it is *called*, not *calling*.

Upholds Constitution Articles I (History), IV (Distribution) and VIII §30 (the user
is the root of trust).

---

## 5. Versioning rules

- **New transports** are added freely — they are implementations, not versions.
- **The wire protocol is versioned**, and peers negotiate. A peer that cannot
  negotiate a common version **does not sync and says so**; it never falls back to
  a weaker verification to stay compatible.
- The core obligation — *union of lanes, verified before acceptance, never
  rewriting, never deciding, idempotent and resumable* — is frozen at v1. Weakening
  it requires `Synchronization v2` alongside v1.
- A peer running an older version is **behind, not wrong.** Nothing in this contract
  permits one device to require another to upgrade.

---

## 6. Compatibility guarantees

Consumers may permanently rely on:

- Two devices that have seen the same events derive the same order.
- Syncing twice changes nothing the first sync did not.
- No event is ever altered in transit, and an altered one is rejected rather than
  accepted and flagged.
- A device's own lane is fully replicated to any peer it syncs with, so nothing it
  authored exists in only one place.

Not guaranteed:

- **Convergence by any deadline.** Eventually is the promise; *when* is not
  (Art. V §20).
- **That every peer is reachable.** Ever.
- **That two devices hold the same payloads.** They hold the same envelopes.
- **That a peer will act on what it receives** — including an erasure declaration.
  See §7.
- **Ordering of delivery between lanes.** Only causality is preserved, not arrival
  sequence.

---

## 7. Failure modes

- **Peer unreachable.** Not an error. Nothing is dropped, nothing is retried into
  the void, and the state is *behind*, which is honest and normal.
- **Broken chain received.** Rejected whole. A partly-adopted tail is the worst
  possible outcome — a gap that looks like history — so nothing is adopted rather
  than some of it.
- **Transfer interrupted.** Resume by re-advertising. Because adoption is the
  `Journal`'s atomic append, there is never a half-applied batch to recover from.
- **Clock skew or a peer's clock jumping.** Irrelevant to order: `hlc` orders,
  `wallClock` is only what the device believed. A peer with a wildly wrong wall
  clock replicates correctly and its events sort correctly.
- **Relay compromised.** It held ciphertext and no keys, so it can withhold or
  delay but never read or forge. Withholding presents as *behind*, which §7's first
  entry already handles honestly.
- **An erasure that a peer does not confirm.** **Synchronization cannot make
  another device forget.** A peer may be offline, lost, or unwilling. What is
  available is: erase locally, declare it, propagate the declaration, and **record
  which peers confirmed** — where a peer's confirmation is **its own `orb.erasure`
  declaration on its own lane** naming the same `{lane, hash}`, the confirming device
  being `event.device` by the same rule that keeps `holder` out of a custody receipt,
  and read back by `confirmationsFor(events, hash)`. No separate record type exists or
  is needed (`../docs/reviews/RECORDS.md` §1). The honest statement is therefore never *"it is gone"*
  but *"gone here; three of four peers confirmed; one has not been seen since
  Tuesday"* (`ERASURE.md`, D5). Where the peer only ever held ciphertext and the key
  is destroyed, its unconfirmed copy is inert — so the limit constrains bookkeeping
  rather than exposure, which is the strongest argument for destroying keys rather
  than bytes.
- **A peer that will not send.** Its lane stays unreplicated and this device's
  horizon says so. A device never infers content it has not received.

Never permitted: adopting an unverified event; patching a chain; transmitting or
persisting a global order; deciding what a peer may retain; claiming an erasure is
complete when a peer has not confirmed.

---

## 8. Examples

- **Anti-entropy, done by hand — what exists today.** `importExport` takes a pass-2
  export, groups it by lane, verifies the chain, skips every event already held, and
  adopts the rest. Re-importing the same file changes nothing; importing a longer
  export of the same lane adds only its tail. **That is this contract's semantics
  with a human as the transport** — every property except automation is already
  demonstrated on real data (`../docs/DEVICE_LOOP.md` §7b1).
- **Two lanes, no conflict.** The phone writes `grants`; the desk writes its own
  lane holding alerts and answers. Both live in one journal, neither ever collides,
  and the desk's lane is the one the phone will never have — which is a difference
  in what each holds, never a disagreement about what happened.
- **A second app, a second lane.** `dev.orb.pass2b` writes `grants-b` rather than
  `grants` precisely so two installs on one phone do not both claim one chain. Had
  they, a journal replicating both would have refused the second — correctly, and
  only after the data was collected (§7b7).
- **Order without an authority.** Every event in both lanes derives the same boot
  instant and sorts by `(hlc, lane)`, computed on read. Nothing anywhere stores
  "the order", and two devices that have seen the same events agree without
  consulting each other.
- **An erasure with an honest ending.** The user erases a payload. Three peers
  confirm; the fourth has been off since Tuesday. The record says exactly that
  rather than *"erased"*, and the difference between those two sentences is the
  whole of D5.
