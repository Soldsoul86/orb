# Design — `@orb/trade-executor`

## 1. The architectural inversion

The obvious design is:

```
Friend API → execute signal → wait for friend to say close
```

That makes the provider the risk engine, the position manager and the exit
controller. Every one of those is an authority you cannot get back once a
position is open and the provider's API is down, slow, or wrong.

What is built instead:

```
Friend API → ENTRY INTENT
Executor   → RISK AUTHORITY · POSITION AUTHORITY · EXIT AUTHORITY
Hyperliquid → EXCHANGE TRUTH
```

The signal is an *input to a decision*, not a command. Everything else follows.

## 2. How the kernel maps onto this

This is not incidental — Orb's kernel already describes the shape:

| Concern | Kernel contract |
| --- | --- |
| The signal API | **Sensor** (a Reality boundary) → **Observation** |
| Exchange state over WS/REST | **Sensor** → **Observation** |
| Order submission | **Capability** (Act-irreversible) → **Action** |
| Risk and hard-exit rules | **Policy** |
| Position state | a **projection** over the Journal, never a source of truth |
| The lifecycle record | the **Event Journal** itself |

Constitution Art. XI §42 states the executor's most important rule as law:

> Orb never assumes an Action changed reality. The loop closes only when a
> Sensor confirms that reality occurred as expected.

That is exactly "never assume an order succeeded because the API returned 200",
and it is why `closePosition` loops until the *exchange* reports flat.

## 3. Functional core, imperative shell

Pure, no I/O, no clock, fully deterministic:

`signal/validate.ts` · `risk/sentinel.ts` · `risk/stop-price.ts` ·
`risk/entry-guards.ts` · `position/state-machine.ts` · `execution/order-plan.ts`

The repository linter enforces this: those paths may not reference `Date.now`,
`Math.random`, `fetch`, or any `node:` I/O module.

Everything else — `executor.ts`, `execution/closer.ts`, `reconcile/` — is the
shell, and takes its clock, its exchange and its sleep function by injection.

## 4. The sentinel

`evaluateHardExit` reads a position and a price. That is all it can see.

It cannot see the setup, the signal, the provider's opinion, an indicator, a
target price, or whether the strategy thinks the trade will recover. A test
asserts the shape of `RiskSnapshot` field by field, so adding any of those would
fail CI. Those are exactly the inputs that talk people out of stops.

**Breach is `>=`.** A threshold you can sit precisely on without acting is not a
threshold.

**Loss basis is configurable** because "10% loss" is ambiguous under leverage:

- `MARGIN` (default) — fraction of the margin committed. Leverage-aware: at 10×,
  a 1% adverse move is a 10% loss of margin.
- `NOTIONAL` — a pure price move, ignoring leverage.
- `ACCOUNT_EQUITY` — fraction of total account value.

A zero or nonsensical denominator reports an **infinite** loss fraction rather
than zero. Firing is the safe direction; reading "no risk" from a missing
divisor is not.

## 5. Two layers of protection

`risk/stop-price.ts` inverts the sentinel algebraically: *at what price does the
threshold breach?* That price becomes a resting reduce-only stop-market order on
the exchange.

- The **local sentinel** is fast and precise, and sees partial fills.
- The **exchange-native stop** does not need this process to be alive.

The resting order is placed slightly wider (`protectiveStopSlackFraction`) so
the sentinel normally acts first and the exchange order remains a backstop. A
test asserts the inversion and the sentinel agree at the trigger price, on every
basis — otherwise the two layers would be protecting different thresholds.

Together they mean the hard exit does not depend on a single process staying
healthy, which was the actual objective.

## 6. Exactly one exit, and why it needs no lock

JavaScript runs one turn of the event loop to completion. A function containing
no `await` is therefore atomic with respect to every other task. `claimExit` is
written to be exactly that — a synchronous compare-and-set, no awaits, no
callbacks, no yielding allocation.

That is the entire concurrency argument, and it is why `claimExit` must never
become `async`. A test asserts it does not return a Promise.

Escalation rather than duplication: a kill switch arriving during a hard-risk
close updates the recorded reason on the *existing* lifecycle. One position, one
close, one audit trail.

## 7. Idempotency at the exchange, not just in memory

`entryClientOrderId(signalId)` hashes the signal id into a client order id. The
same signal always produces the same `cloid`, and the exchange refuses a
duplicate.

That is the difference between "we think we already did this" — which a crash
erases — and "the exchange will not let us do it twice", which survives one.

Close attempts get *different* ids per attempt, because a retry is a genuinely
new order and reusing the id would have the exchange reject it.

## 8. Reconciliation: the exchange is truth, but never silently

Local state is a belief, and beliefs drift: a fill we never heard about, a close
that landed after we gave up, a position opened by hand, a process that died
between submitting and recording.

Two rules:

1. **Never silently overwrite a discrepancy.** Every divergence is recorded on
   the position and emitted as an audit event *before* local state is corrected.
   A reconciliation that leaves no trace is indistinguishable from a bug.
2. **Never assume flat.** An unreachable exchange moves every live position to
   `UNKNOWN`, not to `CLOSED`. An untracked position on the exchange is
   *adopted* and monitored, not ignored.

## 9. Failure policy

`EXIT_FAILED` is not terminal. A failed exit is still an open position, it keeps
being monitored, and it can be retried. Abandoning it would be the worst
available response.

When a position exists and monitoring cannot be established, the executor enters
a clearly-defined degraded state and applies the configured policy —
`CLOSE_ALL` by default. It never silently continues as though normal.

The kill switch **fails closed** in three senses: unreadable state is treated as
engaged; a failed write leaves it engaged; and a failed *release* leaves it
engaged, so a restart cannot come back up trading against state that was never
stored.

## 10. Trade-offs

| Decision | Cost | Why |
| --- | --- | --- |
| Audit writes are async | A crash can lose the last records | The exchange protects the position, not our log. Milliseconds on the exit path are not affordable. |
| `marginUsed` derived on the tick path | Slightly less precise than the exchange's figure | Fetching it would put a network round trip in front of the stop. Reconciliation corrects it. |
| One position per symbol | No hedged positions | The exchange nets anyway; pretending otherwise invites a stale-size close. |
| Aggressive IOC closes | Pays the spread | A close that does not fill is not a close. |
| No order retries in the client | Ambiguity after a timeout | Resolved by reconciliation. A duplicate position is unrecoverable. |
