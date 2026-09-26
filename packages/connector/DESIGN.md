# Design — @orb/connector

## The shape

```
caller ── scope ──▶ recordCall ──▶ ConnectorDriver ──▶ external service
                         │
                         └──▶ journal: orb.connector.call
```

One function does one thing: run a fetch, and leave exactly one record of it
whatever happened. The driver is a parameter, so nothing in here knows a
provider exists.

## Why the failure path is caught rather than propagated

`recordCall` does not rethrow. An exception escaping before the append would
leave the attempt unrecorded, and an unrecorded attempt is the single outcome the
tier exists to make impossible. The caller learns what happened from
`call.outcome`, which is a value it must handle rather than an exception it can
forget to catch.

The cost is that a caller can ignore a failure. That is the right trade here:
ignoring a failure loses a fetch, and an unrecorded fetch loses the audit trail
for every fetch, because silence stops being interpretable.

## Why the count is optional

`count` is present under `value` and `empty`, and absent under `absent`, `threw`
and `denied`. A `count: 0` on `absent` would read as *you have no mail* when the
truth is *we were not told* — a fact invented out of a missing one. This is the
same rule as `prunedBecause` in the journal and `absence` before it: a field that
is unknown is **omitted**, never defaulted.

## Why the query is recorded and the content is not

They travel in opposite directions. The query left the device and is therefore a
disclosure; the content arrived and is therefore a holding. A holding has a life
— it can be kept for seven days and released (DR-7) — while a disclosure already
happened and cannot be taken back, so it belongs in history unconditionally.

## What this package does not decide

Whether a grant appearing is alarming, whether a mail is important, what a
synthesis means. `contracts/Observation.md`: an observation owns confidence, not
truth, and interpretation lives above this.

## The dependency that reorders DR-7

DR-7 lists the call, then the synthesis, then the raw. Implementation order is
not that: `Observation.md` inv. 5 forbids inlining raw content into an
Observation, so tier 2 needs Attachments as much as tier 3 does. Attachment is
therefore the next piece, and this package ends at tier 1 rather than reaching
for a shortcut that would be hard to withdraw.
