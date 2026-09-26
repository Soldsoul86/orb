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

## What is missing

**The transport.** Pass 2 writes these readings on the phone, in Java, in its own
lane. Getting that lane into this runtime is an import or a sync, and neither is
built. This package is written against the reading's *shape* rather than against
the pipe, so the pipe can be either.
