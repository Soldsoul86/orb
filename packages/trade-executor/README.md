# `@orb/trade-executor`

**Entry may come from the signal provider. Exit authority belongs to the executor.**

A signal-agnostic execution engine. It receives an *entry intent*, decides for
itself whether to act on it, and from that moment owns the position completely.
Once a position is open the executor never depends on the signal provider to
tell it when to get out.

The executor does not know how a signal was generated. Today a friend's API
feeds it; later an opportunity layer will. Neither changes anything here.

## The three authorities

| Authority | What it means | Where |
| --- | --- | --- |
| **Risk** | Whether a position may be opened at all | `risk/entry-guards.ts` |
| **Position** | What is actually open, reconciled against the exchange | `position/registry.ts`, `reconcile/` |
| **Exit** | When a position closes — and nothing else may decide | `risk/sentinel.ts`, `position/registry.ts` |

A provider cannot request an exit, defer one, raise a threshold, or reach the
exchange. None of those are in the signal contract, and unknown signal fields
are recorded but never read.

## The hard exit critical path

```
mark price tick
  → evaluateHardExit          (pure, no I/O, no clock)
  → registry.claimExit        (synchronous compare-and-set, no await)
  → submit reduce-only close
```

Nothing else is allowed in front of the order. The audit record is *enqueued*
synchronously — an array push — and becomes durable asynchronously. That is safe
because durability of our intent is not what protects the position: the exchange
is, and a restart reconciles against it.

## Exactly one exit

`PositionRegistry.claimExit` contains no `await`. In a single-threaded event
loop that makes it atomic: nothing can observe it half-done. However many
triggers fire at once, exactly one claim succeeds; a higher-authority reason
escalates the *recorded reason* without starting a second closing lifecycle.

The tests fire 1,000 simultaneous triggers and assert one claim.

## Exit priority

1. Emergency / kill switch (and liquidation, which already happened)
2. Hard risk exit
3. Other mandatory risk controls, including an operator's manual close
4. Normal strategy exit
5. Signal-provider exit

A lower-priority rule never overrides a higher one.

## Documents

- [`DESIGN.md`](DESIGN.md) · [`API.md`](API.md) · [`TESTS.md`](TESTS.md)
