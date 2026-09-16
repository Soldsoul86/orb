# Tests — `@orb/trade-executor`

`npm test --workspace @orb/trade-executor` — 147 tests across 27 suites.
The end-to-end acceptance suite lives in [`/tests/acceptance`](../../tests/acceptance).

## The hard exit sentinel (35 tests)

The most important suite in the repository.

- **LONG** crosses; **SHORT** crosses in the other direction.
- **The exact boundary breaches**; one tick inside does not.
- A profitable position never breaches, however far it runs.
- **Rapid crossing**: a gap straight through the threshold still breaches; every
  tick in a fast sequence is evaluated independently.
- Loss basis: `MARGIN`, `NOTIONAL` and `ACCOUNT_EQUITY` each measured exactly;
  `MARGIN` falls back to notional/leverage when the exchange reports none; a
  zero denominator reads as infinite, never as no risk.
- The threshold is configuration, not code — the same price breaches or not
  depending only on config.
- Additional rules: absolute USD cap; liquidation proximity; the most serious
  applicable rule is the one reported.
- **Independence**: a structural assertion that `RiskSnapshot`'s fields contain
  no signal, setup, target or strategy. Adding one fails this test.
- Purity: 100 evaluations of the same input give byte-identical results.
- **Stop-price inversion agrees with the sentinel** at the trigger price on
  every basis; the tightest configured rule wins; the resting stop sits further
  out than the local threshold in both directions.

## Signal validation (28 tests)

Valid signals and normalisation; the accepted side spellings, and refusal of
ones that merely resemble them; snake_case field names; malformed ids, symbols,
timestamps, sizes, prices and leverage; **staleness and future-dated signals**;
metadata accepted as flat scalars only and refused when nested, oversized or
too numerous; the provider's stop and target captured as *advisory*; **unknown
fields ignored and never read**; a provider cannot smuggle `maxLossFraction` or
`killSwitch` through the signal shape; determinism, and no clock of its own.

## Registry, state machine and concurrency (35 tests)

- The documented state path; `CLOSED`/`ENTRY_FAILED` terminal; an exit claimable
  from every state where a position might exist; `UNKNOWN` never resolves to
  flat by assumption; `EXIT_FAILED` retryable; illegal transitions refused.
- Every declared transition is reachable, and every reachable one resolves —
  so a dead transition fails CI.
- Exit priority ordering; a hard risk exit outranks every discretionary reason;
  no discretionary reason outranks it; the kill switch outranks it.
- **1,000 simultaneous identical triggers → exactly one claim.**
- **200 concurrent async triggers across real microtask boundaries → one claim.**
- A mix of five reasons arriving at once → one claim.
- Escalation updates the reason without a second lifecycle; escalation only ever
  moves upward; a lower-authority reason never overrides.
- A closed or absent position cannot be claimed; different symbols claim
  independently.
- **`claimExit` is synchronous** — asserted, because its atomicity is the whole
  guarantee.
- 1,000 concurrent reservations of one signal id → exactly one winner.

## Entry, config, orders and identity (53 tests)

Accepted entries and sizing from base size or notional; executor state checked
before anything else (kill switch outranks even an invalid signal); market
guards; conflicting and opposing positions; the concurrent limit; both leverage
ceilings; size, notional and margin limits including the free-margin floor
boundary; slippage bounds in both directions.

Risk config validation rejects an empty allowlist, a threshold outside `(0, 1]`,
and nonsensical execution limits — and reports every problem at once.

Kill switch: **starts engaged until loaded**; fails closed on an unreadable
store; survives a restart engaged; **stays engaged when the write fails**;
**refuses to release when the release cannot be persisted**.

Orders: entry crosses with an IOC at the slippage bound; a limit entry is
post-only; **a close is always reduce-only** and priced through the mark in the
crossing direction; a protective stop is a reduce-only stop-market;
unrepresentable sizes are refused.

Identity: deterministic per signal; 16-byte hex; **each close attempt gets its
own id** so a retry is not a duplicate; namespaces do not collide.

## Closing and reconciliation (24 tests)

- A reduce-only order, then verification that the exchange is flat.
- **Only the exchange saying flat ends the close** — orders that report filled
  while the position never shrinks do not.
- Partial fills: keeps closing the remainder, each attempt smaller than the last.
- Retries after a rejected close and after a transport failure, re-reading the
  position each time rather than trusting memory.
- Gives up after the configured attempts and reports why.
- A position already flat closes with no orders at all.
- Realised PnL and fees taken from the exchange's own fills.
- A dust remainder below one lot is reported, not looped on forever.
- Closing a short buys.
- Reconciliation: agreement is silent; untracked positions adopted and
  monitored; phantom positions closed *and recorded*; a close we commanded
  reaching flat is expected, not a discrepancy; size and side mismatches
  corrected with the divergence recorded; a sub-lot difference is not a
  mismatch; **an unreachable exchange makes positions `UNKNOWN`, never flat**;
  a pending entry is not a phantom; orphaned reduce-only orders flagged;
  idempotent across repeated runs.

## Settlement (3 acceptance tests)

- **A day-long hold with hourly funding reconciles exactly** against the paper
  account: `realizedPnl - fees - fundingPaid` matches the account delta to
  within 1e-6.
- **Reported fees cover the round trip**, not just the exit — a regression test
  for a bug where settlement windowed fills from the exit claim and so
  understated every trade by exactly its entry fee.
- **Funding is recorded even when the price never moves**, so a hold that costs
  only fees and funding is still fully accounted.

Plus two unit regressions in the close suite: settlement includes an entry fill
from a day earlier, and an adopted position does not sweep in a previous trade's
fills.

## Trade economics and per-setup measurement (36 tests)

**Economics** — round-trip cost sums fees, both sides of slippage and funding
over the hold; break-even is 50% for a costless coin flip and 54.5% at a 1%
stop with taker fees; **tightening the stop raises the required hit rate
hyperbolically** (52.3% at a 2% stop, 95% at 0.1%); a target that does not clear
the cost returns `NaN` rather than a hit rate above 1, and loses even at a
perfect record; **leverage does not change break-even at all** — asserted
across 1x to 50x, because PnL and fees scale with notional together; resting the
entry is worth 7.5 points of required hit rate at a 0.2% stop; `minimumViableStop`
inverts break-even consistently across hit rates and reward ratios; a small edge
needs tens of thousands of trades to prove, and a 4-trade sample proves nothing.

**Cost ceiling** — `maxViableCost` is the exact inverse of `breakevenHitRate`,
verified across geometries and hit rates; **a 30-second scalp cannot clear
Hyperliquid base fees at any plausible hit rate** — the ceiling at 70% sits
below maker-on-both-sides, and the taker exit fee alone already exceeds it; with
a hard stop the required hit rate at 1:1 is not attainable at all; stretching
the reward ratio, not improving the signal, is what reopens a fast trade.

**Per-setup measurement** — folds `SIGNAL_VALIDATED` and `TRADE_CLOSED` into
completed trades by `tradeId`; an unfinished trade is absent; a close with no
recorded open (an adopted position) cannot be attributed; **separates a winning
setup from a losing one inside a flat account** — including a scalp with a
perfectly respectable 50% hit rate and decisively negative expectancy; reports
what share of gross profit went to the exchange; computes break-even from
*realised* geometry rather than an assumed one; flags a flattering short sample
as not yet significant; totals reconcile with the sum of the trades.

## Spend authority (8 acceptance tests)

In `tests/acceptance/spend-authority.test.ts`, driving the real executor, the
real guard and a real `JournalLedgerStore` over the same journal the executor
audits to. Only the exchange and the clock are simulated.

**The test that carries the file** is *"a budget stops what no per-trade limit
can"*. Three $2,000 entries against a $5,000 day, each one inside every
`RiskConfig` limit — $10,000 per position, three concurrent, 10x leverage. Only
their sum is too much, and a per-trade cap cannot see a sum. The third is
refused as `SPEND_NOT_AUTHORIZED`, explicitly *not* `RISK_LIMIT_EXCEEDED`,
because a reader must be able to tell which control stopped the trade.

**The refused entry never reaches the venue** — a gate that refuses after the
order is placed is not a gate.

**Nothing changes without a guard.** With no `spendAuthority` configured, every
entry opens as before. Art. X §37: adding a control to the codebase must not
change an existing deployment's behaviour.

**Settlement is the exchange's number.** A confirmed position moves its
reservation to `SETTLED` against the size and price the venue reports.

**A rejected order frees its budget**, and the freed budget is usable by the
next entry.

**The two "we do not know" paths**, which are the subtle ones:

- an exchange that fails the *confirming* read (the second account read, not
  the first — failing both would reject the signal before authorization and
  prove nothing) leaves the reservation `PENDING`, neither settled nor
  reversed, and still held against the budget;
- a guard that throws yields `SPEND_AUTHORITY_UNAVAILABLE` and no trade —
  *could not ask* is not *was told yes*.

## Not covered, deliberately

- **Multi-symbol portfolio risk.** Limits are per-position and per-count. A
  correlation-aware portfolio limit is a different component.
- **Funding rate *prediction*.** Accrued funding is read from the exchange and
  reported; the future rate is never forecast, and funding is not projected
  forward when deciding whether to hold.
- **Fee- and funding-inclusive thresholds.** The sentinel measures price
  movement. The gap between that and realised loss is measured and documented
  (`DESIGN.md` §10) but not corrected, because it changes what the stop means.
- **Signal generation.** The executor has no opinion about what to trade and
  contains no setup detector, indicator, or scanner. `analysis/` measures
  whether a setup paid; it never proposes one.
- **Forecasting.** `economics.ts` is a constraint calculator. It says what a
  setup must achieve, never what it will achieve. No test asserts a prediction,
  because none is made.
- **Real exchange latency or liquidity.** The paper exchange fills at the
  reference price and models position management, not microstructure. A paper
  result is not an execution estimate.
- **Hedged positions.** One position per symbol, because the exchange nets.
- **Signal-provider exits.** `SIGNAL_EXIT` exists in the priority table for
  future use; no path currently produces one, by design.
