# Partial Replication — availability is not existence

> Status: **PROPOSAL. Architectural. Not accepted, not implemented.**
> Per `CLAUDE.md`: design explained, risks identified, implementation proposed —
> **awaiting approval before any code.**
> Elaborates `SYNC_PROTOCOL.md` §3 and `STORAGE.md` §7. Closes the open question
> in `AIRWALL.md` §8. Read `MOBILE_SENSING.md` §9 for why the phone is the
> device this exists for.

---

## 1. The problem

`SYNC_PROTOCOL.md` §3: *"Each device ends up holding the union of all lanes."*

Which means the phone — the device most likely to be stolen, seized, coerced out
of your hands, or compromised by an app you installed — holds every observation
Orb has ever made. The airwall keeps the network away from Orb and does nothing
about this. It is the larger hole in the same wall.

The naive fix is to give the phone a subset. That immediately collides with four
laws, and the collisions are the reason this needs a document rather than a
config flag:

| Law | Apparent collision |
| --- | --- |
| Art. I §2 — events are never deleted | Dropping a local copy looks like deletion |
| Art. I §4 — every feature replayable from events | A device with a subset cannot replay from genesis |
| Art. IV §14 — devices are equal peers | A device holding less looks subordinate |
| Art. IV §18 — replication is the set union of immutable lanes | A subset is not the union |

---

## 2. The architecture already solved this — for Attachments

`Attachment.md` invariant 6:

> **Decoupled availability.** An Attachment may be momentarily unavailable on a
> device without invalidating the history that references it.

and its state diagram separates content (fixed forever) from *"where the bytes
are and whether this device currently holds them"* (varies freely).

`Event.md` §2 says the same thing about Events in one clause:

> Cold storage may relocate an Event's bytes (`STORAGE.md`) but never changes its
> identity, content, or replayability.

and `STORAGE.md` §7 already permits *"archival of cold journal segments … never
by mutation or silent deletion of history. Any archival policy must preserve the
ability to replay."*

**So the concept exists, is accepted, and is stated as an invariant — for blobs
and for cold storage.** This proposal does one thing: generalizes it to Events,
and makes the peer device a legitimate archive target alongside cold storage.

That is an addition in the Article X sense, not a mutation. Nothing below
changes the meaning of an existing contract.

---

## 3. The mechanism: envelope-complete, payload-partial

`Event.md` already splits an Event in exactly the place this needs.

- The **envelope** — identity, lane, device, HLC, predecessor commitment,
  integrity — is *frozen at v1* (§5).
- The **payload** is *opaque and versioned*, and the Event layer never interprets
  it (inv. 7).

Give that existing split a replication meaning:

> **Every device holds every Event's envelope. A device may hold a subset of
> payloads. A missing payload is a known absence, never an unknown one.**

Everything the laws require survives, and survives *mechanically* rather than by
argument:

| Requirement | Why it holds |
| --- | --- |
| Chained integrity (`Event.md` inv. 6) | The chain is over envelopes, and each envelope commits to its payload's hash. A device with envelopes alone verifies the entire chain and detects any tampering. |
| Derived ordering (inv. 5, Art. IV §17) | HLC and lane are in the envelope. `(HLC, lane)` is fully derivable on every device, identically. Nothing about order depends on payloads. |
| Set union (Art. IV §18) | The union is unchanged. Every device materializes the same *set*; they differ only in how much of each element they keep locally. |
| Equal peers (Art. IV §14) | Every device has an identical view of **what happened**. They differ in retained detail, not in authority. No device decides for another. |
| Fetch integrity | Because the envelope commits to the payload hash, a payload fetched later from any peer — or a relay, or a stranger — is verified against history before acceptance. Trust is not required of the source. |

**The envelope is what makes honest partial answers possible.** A device that
holds all envelopes knows *precisely* which payloads it lacks. It can therefore
say "I cannot answer that" instead of guessing. A device holding an arbitrary
subset, with no record of what it is missing, cannot — and will confidently
answer questions it has no business answering. That distinction is the whole
design.

---

## 4. Pruning requires proof

A device may drop a payload **only** with journaled evidence that it will still
exist elsewhere.

**Custody receipts.** A device appends to its own lane a watermark: *"I hold
payloads for lane L through envelope X."* Coarse — one per lane per sync round,
not per event. Receipts are ordinary Events, so durability becomes an
evidence-backed question you can ask the journal: *how many readable copies of
this payload exist, and where?*

**The rule:** prune a payload only when at least **K = 2** *other* devices have
outstanding custody receipts covering it, of which **at least one is a device you
own**.

The second clause matters. Art. IV §16 makes a relay a legitimate ciphertext
holder, so a relay may count toward K — but if a relay were the *only* other
holder, the cloud would become load-bearing and Art. VIII §31 ("Orb remains
useful with no network") would quietly become false. A relay adds durability; it
never substitutes for a device you own.

### The hazard worth naming

**Mutual pruning race.** A sees B's receipt, B sees A's, both prune, the payload
is gone. Three properties prevent it, and they need to be specified precisely
rather than assumed:

1. A device never counts its own receipt toward K.
2. K counts holders *after* the prune completes, not before.
3. The originating lane's owner is the backstop and prunes last — it is the one
   device guaranteed to have held the payload, and the cheapest place to put the
   obligation.

This is the part of the proposal most likely to be subtly wrong, and it is the
part review should attack hardest. Everything else degrades gracefully; this one
loses data.

---

## 5. Replay, honestly

Art. I §4 — *every feature must be replayable from events* — is a claim about
**the union**, and the union is untouched. What changes is the honest description
of what one device does:

> A device performs a **bounded replay** and **declares its bound**.

And the correctness rule that follows, which is the real safety property here:

> **A projection computed over a partial replica declares its horizon. An answer
> that would change if the missing payloads were present must say so.**

Without this, the phone answers *"you have never been to that address"* when it
simply pruned last year. **Absence of evidence rendered as evidence of absence is
a lie**, and it is precisely the lie Art. II (Orb never stores truth) and
Art. XI §43 (confidence, never truth) exist to prevent. The system already has
the vocabulary: a horizon-bounded answer is a low-confidence answer with its
reason recorded, exactly like a deferred sensor in `MOBILE_SENSING.md` §2.

Missing payloads are fetched on demand from a peer, verified against the
envelope's commitment, and used. If no peer is reachable, the answer stays
bounded and says so. Art. V §20 — *nothing is live* — already makes "I don't have
that yet" a normal state rather than an error.

---

## 6. What decides what a device keeps

Four policy inputs, in increasing order of implementation cost:

| Policy | How it works | Cost |
| --- | --- | --- |
| **Time window** | Keep payloads for the last N days | Trivial, predictable |
| **Source class** | The Sensor **declares** a sensitivity class at emission; the phone never retains payloads of the highest class | Needs a declared field — note this is *attribution*, not interpretation, so Art. II stays clean. The class must never be inferred later. |
| **Demand fetch** | Fetch on access, evict least-recently-used | Needs the fetch path from §5 |
| **Explicit pin** | You mark something to keep | Trivial |

Two invariants on policy itself:

- **Policy changes are journaled.** A retention change alters what a device can
  answer. If that is not in history, *"why doesn't my phone know this?"* is
  unanswerable, and the horizon in §5 becomes unexplainable.
- **No device decides what another may hold.** Each device's policy is its own.
  This is what keeps Art. IV §14 intact: authority over retention never leaves the
  device, so no device becomes an authority over any other.

---

## 7. Adoption tiers

| Tier | What it adds | New crypto |
| --- | --- | --- |
| **0 — today** | Full replication everywhere | — |
| **1 — recommended first** | Envelope-complete, payload-partial. Time-window policy. Custody receipts. Horizon declaration. | None |
| **2** | Source-class policy, declared at emission | None |
| **3 — optional** | Per-class payload keys, so an exposed device can **carry ciphertext it cannot read** | Yes — see below |

Tier 3 is worth naming because it is the strongest answer to the original
problem: the phone contributes to durability (it holds copies, its receipts
count toward K) while holding **nothing it can decrypt** beyond its own window.
Custody without disclosure.

It requires deriving per-class subkeys from the user-scoped data key and
withholding some from some devices — an addition to `SECURITY.md` §3's
"per-device keys + shared data key" model, and the single largest piece of new
design in this document. It should not be attempted before Tier 1 is running.

---

## 8. Cost, stated plainly

**Envelope metadata leaks.** A device holding every envelope leaks, if
compromised, the *shape* of a life: how many events, on which lanes, at what
times, of which schema, of what size. That is genuinely sensitive — arguably the
most sensitive thing short of the payloads themselves.

Three things bound it, none of which eliminate it:

- The journal store is encrypted at rest (`STORAGE.md` §3), so a merely *stolen*
  locked device leaks nothing. This is a live-compromise risk, not a theft risk.
- Schema id and size can be padded or bucketed if the shape matters more than the
  storage.
- It is strictly less than today's leak, which is envelopes **and** every payload.

**Envelopes grow linearly.** At roughly 200 bytes each: 500 events/day is ~36 MB
a year, about a gigabyte over thirty years — fine on a phone. 10,000 events/day
is ~22 GB over the same period — not fine.

A concrete design constraint falls out of that, and it is one worth having
anyway: **high-rate raw signal must never be one event per sample.** Batch a
window of IMU samples into an Attachment and reference it from a single
Observation. `Attachment.md` already argues for this on the grounds of keeping
history "small, uniform, deduplicated and replayable"; envelope-completeness is
the second, independent reason.

If even envelopes become too much, the escape hatch is a **checkpointed chain**:
hold envelopes only after a signed, durably-replicated checkpoint. The cost is
exactly the property §3 was built for — before the checkpoint, the device no
longer knows what it does not know, and its horizon goes coarse. Recorded as an
option; not recommended.

---

## 9. Invariants this proposes

1. **Emission completeness.** A device always replicates its own lane in full.
   Partiality is about *retention*, never about *emission*. A device is never the
   sole holder of anything it produced.
2. **Envelope completeness.** Every device holds every Event's envelope.
3. **Known absence.** A missing payload is always known to be missing.
4. **Proof before pruning.** A payload is dropped only with journaled custody
   receipts from K ≥ 2 other holders, at least one a device the user owns.
5. **Declared horizon.** Any projection over a partial replica declares its
   bound; an answer that could change with the missing payloads says so.
6. **Journaled policy.** Retention policy changes enter history as events.
7. **No retention authority.** No device decides what another may hold.

Invariants 1–4 preserve the union. 5 preserves honesty. 6–7 preserve equal
peerage.

---

## 10. The reading review must accept or reject

The sharpest tension is **Art. I §2: "Events are never edited, reordered, or
deleted."**

The reading this proposal rests on:

> §2 governs **history** — the journal as the logical, append-only record of what
> happened. `STORAGE.md` already distinguishes that from the **store**, the local
> materialization, and already permits relocating cold segments out of it (§7)
> while `Event.md` §2 permits relocating an Event's bytes. A payload dropped
> locally, with journaled proof of K durable readable copies elsewhere, has been
> *relocated*, not deleted. The Event's identity, content, and replayability are
> all untouched — which is exactly the test `Event.md` §2 states.

If review rejects that reading, the proposal fails and the fallbacks are Tier 0
(today's behaviour) or lane-granular replication — a device holds whole lanes or
none, which preserves per-lane chains perfectly and loses §3's "knows what it
does not know" property entirely.

**This should be ruled on explicitly rather than assumed**, because every
invariant in §9 depends on it and because a law that gets quietly reinterpreted
once will be quietly reinterpreted again.

---

## 11. Sources

`SYNC_PROTOCOL.md` §3, §9; `STORAGE.md` §3, §7, §8; `EVENT_MODEL.md`;
`contracts/Event.md` §2, §4 (inv. 5–8), §5; `contracts/Attachment.md` §3,
§4 (inv. 6); `contracts/Observation.md` §7; `SECURITY.md` §3;
Constitution Art. I §2 §4, Art. II, Art. IV §14 §16 §17 §18, Art. V §20,
Art. VIII §31, Art. X, Art. XI §43.
