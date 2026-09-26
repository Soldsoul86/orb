# @orb/device-watch

**The first closed loop.**

```
Journal → Observation → small state projection → one rule → a person
   ▲                          │                                │
   └──────────────────────────┴────────── their answer ────────┘
```

It tells you when something new gains power over your phone, and records what
you said about it.

## What it stands in for, and does not pretend to be

`MASTER.md` puts five layers between a journal and an action. This package
occupies that space with two small things and is explicit about the swap:

| MASTER | here |
| --- | --- |
| Evidence Graph | collapsed into the journal's `causes` |
| Knowledge Engine | a projection small enough to read in one sitting |
| Digital Twin | absent |
| Reasoning Pipeline | one rule |
| Agent Runtime | absent |

Every one of those can be inserted later without rewriting what is below it,
which is the only reason the shortcut is allowed. This is a vertical slice
through the architecture, not a replacement for its middle.

## The projection is disposable

Nothing writes to it. It is folded from events every time, and the test is one
line: rebuild from the same events, get the same answer. That line is what keeps
the journal authoritative — the moment anything can be written here directly it
becomes a second source of truth (Art. IX §33) that would outlive an erasure of
the events describing it.

It holds three things: current holdings per kind, the changes seen, and which
changes have already been surfaced.

**An unreadable kind is never an empty one.** A read that failed would otherwise
look like every grant being revoked at once — loud, and wrong.

## One rule, and what it refuses to be

> A change in what holds power over this device is worth telling you about.

Not *a suspicious change*. `MOBILE_SENSING.md` §4.4's signal **reports a fact,
never a verdict**: a grant appearing is usually the owner installing something,
and whether it is alarming is interpretation that lives above this.

It refuses to judge by publisher. *"A non-Google name appeared"* was the obvious
heuristic and is the wrong one — it bakes in an opinion about who is safe, it is
wrong the first time a legitimate third-party service is granted access, and it
is exactly the judgement that belongs to the person being told rather than to the
thing telling them.

Two things never reach the rule, both filtered in the projection: **a baseline**,
because §5j's lesson from the device is that a first look reported as news says
FAILED for ever and means nothing, and **an unreadable kind**, for the reason
above.

A revocation is a change too. `MOBILE_SENSING.md` §4.4: *your own app's
permissions being revoked is itself evidence* — and it was watched happening on
this phone, five notification listeners becoming four.

## The return arrow has a job

It is not decoration. The projection reads the alerts it raised, so **running the
watch twice raises the alert once** — and that survives a restart, because the
alerts are in the journal rather than in memory. A process that restarted would
otherwise re-announce everything it had ever said.

## Recorded, not taught — DR-8

An answer is `acknowledged` or `dismissed`, and **both take the same path**. The
difference is preserved for whoever reads the journal later and does nothing
today.

There is a test that runs the whole loop twice, once with each answer, and
asserts the two end in the same state. If a dismissal ever starts changing what
the rule does, that test fails — which is the moment Orb would begin having
opinions nobody wrote down. That should be a decision taken deliberately, not one
discovered afterwards.

Dismissals are still the most valuable events here. §7 R6: *false positives cost
trust, and trust is the product.* A rule nobody can measure for false positives is
a rule nobody can improve — so they are counted, and the counting is the point
even while nothing acts on it.

## The transport

`importExport` takes a pass-2 export — the file the phone's share sheet produces
— and makes it readings here.

**It is replication, not parsing-and-reconstructing.** That file *is* a journal
lane, so every event keeps its own id, hlc, chain and hashes, and this device
ends up holding a replica of the phone's history rather than a retelling of it.
`Journal.replicate` does the work: it verifies the chain, refuses this device's
own lane, and skips events already held.

**The import is the first cross-implementation verification on real data.**
`verifyLane` re-derives every envelope hash *and* every payload hash, so the Java
encoder's output is checked by the TypeScript one over a device's actual history
rather than over a fixture. The phone cannot do this for itself — re-derivation
needs a JSON parser the probe deliberately does not have, so it checks linkage
only. An edited payload passes the phone's check and fails this one.

Only then does each reading become an Observation in *this* device's lane, citing
the replicated event. The phone's event is never rewritten.

**Idempotent twice over, by different mechanisms.** `replicate` skips by event id;
translation skips readings an Observation already cites. So re-importing the same
file is a no-op, and importing a *longer* export of the same lane adds only its
tail — which is what actually happens, since every pass-2 export contains the
whole journal from the beginning.

**A bad line fails the whole import.** A partly-imported chain is the known-absence
problem at its worst: a gap that looks like history. The error names the line.

### Still missing

Sync. The export is a file the operator carries; nothing yet moves a lane between
devices on its own.
