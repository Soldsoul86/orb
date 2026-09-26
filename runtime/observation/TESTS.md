# Tests — @orb/observation

`npm test -w @orb/observation` — 16 tests.

## What they pin

**The contract's own confidences convert exactly.** 0.97, 0.74, 0.41, 1.00 — the
four in §1 — are asserted round-tripping, which is the evidence that percent
"holds all of them exactly, with nothing to spare" rather than an assumption
that it does.

**A third decimal throws.** `percentFromConfidence(0.947)` is the test that would
fail the moment someone made this convenient by rounding.

**Inlined bytes are found by path.** Three shapes: a `Buffer` at the top level, a
`Uint8Array` nested inside an array, and a bare `ArrayBuffer`. The assertions
match on the reported path, so a check that found the byte but lost track of
where would still fail.

**A detached Observation is still an Observation.** `readObservation` returns
`null` while `isObservation` stays true — the distinction between *cannot say*
and *nothing there*, at the one place a caller would be tempted to merge them.

**Supersession leaves the first untouched.** Two Observations, and the earlier
one's `confidencePercent` is re-read afterwards rather than assumed.

## Negative controls, verified to fail

| mutation | tests that fail |
| --- | --- |
| an unattributed Observation allowed | 1 |
| a fractional `confidencePercent` accepted | 2 |
| the inlined-bytes walk removed | 1 |
| a third decimal rounded rather than refused | 1 |

## Not tested here

Immutability and ordering: those are the journal's, tested there, and asserting
them again would be testing a dependency rather than this package.
