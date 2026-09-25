# Tests — `@orb/journal`

`npm test --workspace @orb/journal`

26 tests across 8 suites.

## Covered

**Hybrid Logical Clocks**
- Counter advances within one physical millisecond; resets when time moves on.
- `merge` carries a remote clock that is ahead of local physical time, so a
  local append never appears to precede something already known.
- Tie-breaking takes the greater counter.
- Encoding is fixed-width, lexicographically ordered, and round-trips.

**Identifiers** — uniqueness across 2,000 generations at a single timestamp,
time-sortability, and well-formedness.

**Canonical encoding** — independent of key insertion order; rejects `NaN`,
`Infinity` and functions.

**Append** — stamps identity, lane, device, HLC and chain; batches are atomic
and consecutively chained; **50 concurrent appends produce one unbroken chain
with no repeated HLC**; subscribers fire after durability.

**Integrity** — detects a mutated payload, a removed event, and a reordered
lane.

**Lanes and replication** — a device refuses writes to its own lane;
replication merges a peer's clock; replication is idempotent; a batch whose
events do not match the named lane is refused.

**Ordering and replay** — public order is `(hlc, lane)` and identical
regardless of input order; replay folds the union of lanes; a projection can be
discarded and rebuilt identically.

**Durability** — a file-backed journal survives a restart and continues its
chain; **a torn trailing line from a crash is discarded, not repaired**; a lane
id that would escape the journal directory is refused.

## Not covered, deliberately

- **Encryption at rest** — not implemented yet (`STORAGE.md`, `SECURITY.md`).
- **Replication transport** — `replicate()` is tested; how events reach a peer
  is `SYNC_PROTOCOL.md` and a later phase.
- **Byzantine peers** — a replicated lane is verified for chain integrity, but
  a peer that signs a *valid* chain of false statements is an identity and
  trust problem, not a journal one.
- **Performance** — no benchmarks. `fsync`-per-append is a deliberate
  correctness choice; if it becomes a bottleneck the sink batches.
- **Clock adversaries** — HLC tolerates skew, not a peer deliberately
  reporting a far-future timestamp. That is a trust boundary question.

## Partial replication — `tests/partial-replication.test.ts`

**An envelope stands alone.** A lane verifies with every payload dropped;
tampering is still detected with no payloads present; a payload that does not
match the hash its envelope commits to is rejected; order derives identically
with and without payloads.

**Custody receipts.** A receipt watermarks the contiguous prefix actually held,
and a gap ends the claim rather than skipping over it. The furthest receipt per
holder wins; other lanes are ignored.

**The prune guard.** Each refusal path is tested on its own rather than through
a happy path that happens to cover them, because this is the one rule whose
failure is silent and permanent: too few holders; relays only; a device the
policy does not permit; a device earlier in the prune order still holding;
counting one's own receipt; a receipt that stops short of the event; the
originator's extra-holder requirement; a policy attempting to lower the floor
below two.

**The journal enforces it.** A refused prune removes nothing. A permitted one
drops the payload, keeps the envelope, and leaves the chain verifying. The
horizon names exactly what is missing. A replay over a partial replica reports
`complete: false` and the skipped ids instead of silently folding a subset.

**Durability.** A compacted lane survives a reopen with the payload still gone,
and a later append extends the compacted chain rather than forking it.

## Sync — `tests/sync.test.ts`

**Anti-entropy.** An exchange leaves both devices holding the union. Sync
resumes from where it stopped rather than resending. A device never adopts a
foreign copy of its own lane. The union verifies on both sides afterwards.

**Convergence.** Bookkeeping is history and replicates, so a round settles on
the second exchange — and must never provoke a third. Repeated exchanges move
nothing and grow neither lane.

**Emission vs retention.** A device holding no payloads still serves every
envelope, including onward to a third device — inv. 1. A policy selects which
payloads are held and the rest stay envelopes. A payload skipped under a narrow
policy is picked up under a wider one. A peer offering a payload that does not
match history is rejected, so no peer has to be trusted.

**What is journaled.** The policy is recorded when it changes and not otherwise.
Custody is claimed only for what is actually held, so a device that fetched
nothing claims nothing.

**The guard, live.** A phone may drop a payload once enough peers have fetched
it, and not before. A peer that took envelopes only does not count as a holder.
A dropped payload comes back from a peer that kept it.
