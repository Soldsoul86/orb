# Sync Protocol

> Status: Phase 1 architecture. Reviewed before implementation.
> Defines how equal-peer devices replicate history without authority.
> Incorporates the frozen multi-writer/HLC decision. See `EVENT_MODEL.md`.

---

## 1. Purpose

Sync extends one runtime across multiple devices **without changing ownership and
without introducing an authority**. The Mac and the Pixel each hold a complete
runtime; sync simply lets each device learn the others' history. It replicates
events; it never resolves truth.

> Constitutional law: *Cloud is replication, never authority.*

---

## 2. First Principles

- Devices are **equal peers**. Neither is authoritative.
- Each device owns exactly one **append-only lane** and writes only that lane.
- Sync **replicates immutable lanes** between devices. It moves events; it never
  edits, reorders, or merges-by-rewrite.
- Replication **preserves causality** (carried by HLC).
- **Global ordering is derived, never stored** — so there is nothing global to
  agree on, and thus nothing to contend over.

---

## 3. What Syncs

The unit of replication is the **event**, grouped by **lane**. Because a lane is
append-only and single-writer, replicating it is trivially safe: a peer copies
events it does not yet have. There is no conflict at the journal level — two
devices appending to *different* lanes can never collide.

```
Mac lane   ──replicate──▶  Pixel  (read-only copy of Mac's lane)
Pixel lane ──replicate──▶  Mac    (read-only copy of Pixel's lane)
```

Each device ends up holding the **union of all lanes**. Identical input → identical
union → identical derived order on every device.

---

## 4. Replication Mechanics

1. **Discovery / transport.** Peers connect over any available encrypted channel
   (direct local link, or a relay used purely as an encrypted dumb pipe — the
   relay is *replication, never authority* and never sees plaintext).
2. **Anti-entropy exchange.** Each peer advertises, per lane, how far it has seen
   (the latest event in that lane it holds). The other peer sends the missing
   tail. Because lanes are hash-chained, the gap is unambiguous.
3. **Verify.** The receiver checks the hash chain of incoming events against the
   lane it already holds before accepting them. Broken chains are rejected, not
   patched.
4. **HLC merge.** On accepting events, the device advances its own HLC to reflect
   the maximum seen, carrying causal knowledge forward (`EVENT_MODEL.md` §5).
5. **Re-derive.** Projections incorporate the new events; global order is
   recomputed by `(hlc, lane)` on read.

Sync is **resumable and idempotent**: receiving an event already held is a no-op.

---

## 5. No Conflicts at the Journal Layer

Because every write goes to a single-writer lane and history is immutable, the
journal has **no merge conflicts**. The union of append-only lanes is always
well-defined. This is the central payoff of the equal-peer/lane design: the hard
distributed-systems problem (multi-writer conflict) is dissolved, not solved at
runtime.

> Merge never rewrites history. Merge is set union of immutable lanes.

---

## 6. Conflicts Live in Interpretation, Not History

Two devices can still record events that *mean* contradictory things — e.g. each
observes a different "current address." That is **not** a journal conflict; it is
two true observations. Reconciliation happens **above** the journal:

- The **Evidence Graph** records both observations and that they conflict.
- The **Digital Twin** decides, as interpretation, which to believe (with
  confidence), and may revise later.

So apparent "conflicts" are handled where they belong — as evolving
interpretation over an immutable, fully-preserved history — never by editing
events.

---

## 7. Causality & Ordering Guarantees

- If event A causally precedes B (anywhere, any device), then after replication
  every device orders `A < B` (HLC guarantee).
- Concurrent events (no causal relation) get a **deterministic** total order via
  the `(hlc, lane)` tiebreak — identical on every device — so all devices agree
  on a single read order without any device being authoritative.
- Where genuine concurrency must be detected (not just ordered), the runtime may
  consult internal vector clocks; this never changes the public HLC order.

---

## 8. Security Posture (summary)

- Transport is always encrypted; relays are zero-knowledge pipes.
- Replicated lanes are verified (hash chain) before trust.
- Devices authenticate as members of the user's own device set; a foreign device
  cannot inject events into a lane it does not own.
- Full treatment in `SECURITY.md`.

---

## 9. Invariants

1. Devices are equal peers; none is authoritative.
2. Sync replicates immutable, single-writer lanes; it never rewrites history.
3. The journal has no merge conflicts; merge is union of lanes.
4. Replication preserves causality; HLC is advanced on receive.
5. Global order is derived `(hlc, lane)` on read, identically everywhere, never
   stored.
6. Incoming lanes are hash-verified before acceptance.
7. Semantic contradictions are resolved in interpretation, never in history.

---

## 10. Out of Scope

- Encryption scheme, device identity, key exchange → `SECURITY.md`.
- On-disk layout of lanes → `STORAGE.md`.
- Event structure and HLC rules → `EVENT_MODEL.md`.
