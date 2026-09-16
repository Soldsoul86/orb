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
| **Spend** | Whether this requester may commit more exposure *today* | `risk/spend-authority.ts` *(optional)* |

A provider cannot request an exit, defer one, raise a threshold, or reach the
exchange. None of those are in the signal contract, and unknown signal fields
are recorded but never read.

## Spend authority — the limit that spans time

`RiskConfig` caps one entry: notional, leverage, concurrent positions, symbol.
It has no notion of time, so nothing in it stops **fifty $1,000 entries in one
afternoon** — each inside every limit, together a $50,000 day nobody
authorised.

That is not an oversight in the config; it is a different kind of control. A
per-trade limit answers *"is this trade too big?"*. A budget answers *"has this
requester had enough today?"*, and answering it needs a durable record of what
already happened. Pass an optional `spendAuthority` and the executor asks
[`@orb/payment-policy`](../payment-policy) before it commits:

```ts
new TradeExecutor({
  exchange, marketData, audit, killSwitch, config,
  spendAuthority: { guard, account: "acct:desk" },   // omit and nothing changes
});
```

Three things worth knowing:

- **It meters exposure opened, not cash withdrawn.** A perp entry commits
  margin and takes on notional risk; it does not move money out. The asset is
  named `usd:notional` so no reader mistakes the ledger for a cash balance.
- **It settles on the exchange's number, not the estimate.** The reservation is
  made before the order goes out and closed with the size and price the venue
  reports — Art. XI §42, the same rule that governs exits.
- **It is refused as a spend, not as a risk breach.**
  `SPEND_NOT_AUTHORIZED` and `SPEND_AUTHORITY_UNAVAILABLE` are distinct from
  `RISK_LIMIT_EXCEEDED` and from each other: *too big*, *had enough*, and
  *could not ask* are three different facts, and the third never resolves in
  favour of trading.

Omitted, the executor behaves exactly as it always has (Art. X §37 — the kernel
evolves through addition).

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

## Measuring whether a setup pays

The executor generates no signals and has no opinion about what to trade. What
it can do is tell you, from recorded history, whether a setup actually made
money — and what it would have to achieve before it could.

```ts
import { breakevenHitRate, buildSetupLedger, EXECUTION_STYLES } from "@orb/trade-executor";

// What a setup must achieve before its signal quality matters at all.
breakevenHitRate({ stopFraction: 0.002, targetFraction: 0.002 }, cost);  // 72.5%

// What each setupId actually did, net of fees and funding, from the journal.
const ledger = buildSetupLedger(await replayLifecycle(journal), cost);
```

`node scripts/setup-economics.mjs` prints the constraint across holding
horizons. The short version: **shorter timeframes make the economics harder,
not easier.** Cost is roughly fixed per round trip while the stop shrinks with
the square root of time, so the cost-to-risk ratio climbs steeply as you speed
up. At a 30-second horizon the round trip costs more than the target is worth,
and no hit rate breaks even.

## Documents

- [`DESIGN.md`](DESIGN.md) · [`API.md`](API.md) · [`TESTS.md`](TESTS.md)
