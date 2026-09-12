#!/usr/bin/env node
/**
 * What hit rate does a setup need, at each timeframe, to make money?
 *
 * Run with:  node scripts/setup-economics.mjs
 * (after `npm run build`)
 *
 * This forecasts nothing. It is the constraint every setup has to clear before
 * its signal quality matters at all.
 */
import {
  breakevenHitRate,
  minimumViableStop,
  roundTripCost,
  expectancyR,
  tradesToSignificance,
  EXECUTION_STYLES,
} from "@orb/trade-executor";

const say = (s = "") => process.stdout.write(`${s}\n`);
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const pct = (x) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : "impossible");

const cost = (style, holdHours = 0, hourlyFunding = 0, slippage = 0) => ({
  entryFeeFraction: EXECUTION_STYLES[style].entry,
  exitFeeFraction: EXECUTION_STYLES[style].exit,
  hourlyFundingFraction: hourlyFunding,
  expectedHoldHours: holdHours,
  slippageFraction: slippage,
});

/* Stop distances that correspond roughly to ETH's realised move at each
   horizon. Annualised vol ~60% => daily ~3.1% => scaled by sqrt(time). */
const HORIZONS = [
  ["30 seconds", 0.0006],
  ["2 minutes ", 0.0012],
  ["5 minutes ", 0.0018],
  ["15 minutes", 0.0032],
  ["1 hour    ", 0.0064],
  ["4 hours   ", 0.0128],
  ["1 day     ", 0.0310],
];

say(bold("\nBreak-even hit rate by holding horizon"));
say(dim("  stop sized to roughly one standard move at that horizon, 1:1 reward-to-risk"));
say(dim("  Hyperliquid base fees; no slippage, no funding — the optimistic case\n"));
say("  horizon       stop     taker/taker   maker/taker   cost as % of risk");
say("  " + "-".repeat(68));
for (const [label, stop] of HORIZONS) {
  const geometry = { stopFraction: stop, targetFraction: stop };
  const tt = breakevenHitRate(geometry, cost("takerTaker"));
  const mt = breakevenHitRate(geometry, cost("makerTaker"));
  const ratio = roundTripCost(cost("takerTaker")) / stop;
  const flag = tt > 0.65 ? "  <-- needs a near-perfect record" : "";
  say(
    `  ${label}  ${(stop * 100).toFixed(2).padStart(5)}%   ` +
      `${pct(tt).padStart(9)}   ${pct(mt).padStart(11)}   ${pct(ratio).padStart(10)}${flag}`,
  );
}

say(bold("\n\nThe same table at 2:1 reward-to-risk"));
say(dim("  letting winners run twice the stop distance\n"));
say("  horizon       stop     taker/taker   maker/taker");
say("  " + "-".repeat(52));
for (const [label, stop] of HORIZONS) {
  const geometry = { stopFraction: stop, targetFraction: stop * 2 };
  say(
    `  ${label}  ${(stop * 100).toFixed(2).padStart(5)}%   ` +
      `${pct(breakevenHitRate(geometry, cost("takerTaker"))).padStart(9)}   ` +
      `${pct(breakevenHitRate(geometry, cost("makerTaker"))).padStart(11)}`,
  );
}

say(bold("\n\nTightest stop that can still pay, given a hit rate you believe you have"));
say(dim("  taker both sides, 1:1 — below these distances the setup cannot break even\n"));
say("  hit rate    min stop    that is roughly a");
say("  " + "-".repeat(46));
for (const p of [0.52, 0.55, 0.6, 0.65, 0.7, 0.8]) {
  const stop = minimumViableStop(p, 1, cost("takerTaker"));
  if (!Number.isFinite(stop)) {
    say(`  ${pct(p).padStart(6)}      ${"no stop works".padStart(9)}`);
    continue;
  }
  const horizon =
    HORIZONS.find(([, s]) => s >= stop)?.[0]?.trim() ?? "multi-day hold";
  say(`  ${pct(p).padStart(6)}      ${(stop * 100).toFixed(3).padStart(6)}%      ${horizon}`);
}

say(bold("\n\nWhat a funded day costs a short-timeframe strategy"));
say(dim("  trading all day at 0.005%/hr funding, taker both sides, 0.2% stop, 1:1\n"));
const tight = { stopFraction: 0.002, targetFraction: 0.002 };
for (const [label, trades] of [["4 trades ", 4], ["20 trades", 20], ["100 trades", 100]]) {
  const c = roundTripCost(cost("takerTaker", 0.25, 0.00005));
  const dailyCostOfNotional = c * trades;
  say(
    `  ${label}/day  ->  ${(dailyCostOfNotional * 100).toFixed(2).padStart(6)}% of notional in cost per day` +
      `   ${dim(`(${(dailyCostOfNotional * 10 * 100).toFixed(1)}% of margin at 10x)`)}`,
  );
}

say(bold("\n\nHow long before you know whether an edge is real"));
say(dim("  trades needed to distinguish the observed rate from break-even, 95% confidence\n"));
const geometry = { stopFraction: 0.002, targetFraction: 0.002 };
const be = breakevenHitRate(geometry, cost("takerTaker"));
say(`  break-even at a 0.2% stop, taker both sides: ${pct(be)}\n`);
say("  observed    edge      trades needed     expectancy");
say("  " + "-".repeat(52));
for (const observed of [0.73, 0.75, 0.78, 0.8, 0.85]) {
  const n = tradesToSignificance(be, observed);
  const r = expectancyR(geometry, cost("takerTaker"), observed);
  say(
    `  ${pct(observed).padStart(6)}   ${((observed - be) * 100).toFixed(1).padStart(5)}pt   ` +
      `${String(Number.isFinite(n) ? n.toLocaleString() : "never").padStart(10)}        ${r.toFixed(3)}R`,
  );
}

say(bold("\n\nWhat this says about the plan"));
say(`
  Shorter timeframes do not make the economics easier. They make them
  harder, and the relationship is not linear — cost is roughly fixed per
  round trip while the stop shrinks with the square root of time, so the
  cost-to-risk ratio climbs steeply as you go faster.

  Your micro-structure theory may well be right about price. It still has
  to clear this table, and at a 30-second horizon that means being right
  ${pct(breakevenHitRate({ stopFraction: 0.0006, targetFraction: 0.0006 }, cost("takerTaker")))} of the time just to break even.

  The single largest lever available to you is not the signal. It is
  ${bold("resting the entry instead of crossing")} — worth 7.5 points of required hit
  rate at a 0.2% stop, which is more than most signal research ever finds.
  The executor already supports it: send entry as { kind: "LIMIT", price }
  and it posts ALO instead of IOC.

  The hard exit stays taker, always. An emergency close that sits in the
  book is not an emergency close.
`);
