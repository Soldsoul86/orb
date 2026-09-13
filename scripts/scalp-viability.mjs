#!/usr/bin/env node
/**
 * Can a scalp pay on Hyperliquid?
 *
 * Run with:  node scripts/scalp-viability.mjs
 *
 * This asks a different question from "is this signal any good". It asks
 * whether the *style* is available at all at the fees you pay — because if the
 * round trip costs more than the target is worth, signal quality is irrelevant.
 */
import {
  breakevenHitRate,
  maxViableCost,
  roundTripCost,
  minimumViableStop,
  HYPERLIQUID_BASE_FEES,
  EXECUTION_STYLES,
} from "@orb/trade-executor";

const say = (s = "") => process.stdout.write(`${s}\n`);
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bp = (x) => `${(x * 10_000).toFixed(2)}bp`;
const pct = (x) => (Number.isFinite(x) && x <= 1 ? `${(x * 100).toFixed(1)}%` : "impossible");

const style = (name, holdHours = 0, funding = 0, slippage = 0) => ({
  entryFeeFraction: EXECUTION_STYLES[name].entry,
  exitFeeFraction: EXECUTION_STYLES[name].exit,
  hourlyFundingFraction: funding,
  expectedHoldHours: holdHours,
  slippageFraction: slippage,
});

/* ETH realised move by horizon. ~60% annualised => ~3.1% daily, scaled by sqrt(t). */
const HORIZONS = [
  ["10 seconds", 0.00035],
  ["30 seconds", 0.00060],
  ["1 minute  ", 0.00085],
  ["2 minutes ", 0.00120],
  ["5 minutes ", 0.00180],
  ["15 minutes", 0.00320],
  ["30 minutes", 0.00450],
  ["1 hour    ", 0.00640],
];

say(bold("\nWhat a scalp is up against\n"));
say(`  Hyperliquid base fees:  taker ${bp(HYPERLIQUID_BASE_FEES.taker)}   maker ${bp(HYPERLIQUID_BASE_FEES.maker)}`);
say(`  A hard stop forces the exit to cross, so the exit is ${bold("always taker")}.`);
say(`  The best a hard-stopped strategy can do is maker entry + taker exit = ${bold(bp(roundTripCost(style("makerTaker"))))}\n`);

say(bold("Round-trip cost against the move you are trying to capture\n"));
say("  horizon        move      taker/taker   maker/taker   cost vs move");
say("  " + "-".repeat(66));
for (const [label, move] of HORIZONS) {
  const tt = roundTripCost(style("takerTaker"));
  const mt = roundTripCost(style("makerTaker"));
  const ratio = mt / move;
  const verdict =
    ratio >= 1 ? "  cost exceeds the target" : ratio > 0.5 ? "  over half the target" : "";
  say(
    `  ${label}   ${bp(move).padStart(7)}   ${bp(tt).padStart(9)}   ${bp(mt).padStart(11)}   ` +
      `${(ratio * 100).toFixed(0).padStart(4)}%${verdict}`,
  );
}

say(bold("\n\nBreak-even hit rate at 1:1, with a hard stop (maker entry, taker exit)\n"));
say("  horizon        required hit rate");
say("  " + "-".repeat(40));
for (const [label, move] of HORIZONS) {
  const required = breakevenHitRate({ stopFraction: move, targetFraction: move }, style("makerTaker"));
  const note = !Number.isFinite(required) ? dim("  no hit rate works") : required > 0.7 ? dim("  not realistically attainable") : "";
  say(`  ${label}   ${pct(required).padStart(12)}${note}`);
}

say(bold("\n\nThe cost ceiling: what you would have to pay for a scalp to work\n"));
say(dim("  the most a round trip may cost, given the hit rate you believe you have\n"));
say("  horizon       @60% hit    @70% hit    @80% hit    you pay (maker/taker)");
say("  " + "-".repeat(74));
for (const [label, move] of HORIZONS.slice(0, 5)) {
  const geometry = { stopFraction: move, targetFraction: move };
  const actual = roundTripCost(style("makerTaker"));
  const cells = [0.6, 0.7, 0.8].map((p) => {
    const ceiling = maxViableCost(geometry, p);
    const ok = ceiling > actual;
    return `${(ceiling > 0 ? bp(ceiling) : "none").padStart(8)}${ok ? " " : "!"}`;
  });
  say(`  ${label}   ${cells.join("   ")}   ${bp(actual)}`);
}
say(dim("\n  ! = your cost exceeds the ceiling; no signal at that geometry can pay"));

say(bold("\n\nWhat actually reopens a fast trade\n"));
const stop = 0.0006;
say(`  A 30-second stop (${bp(stop)}) at 1:1 is closed at base fees. Stretching the`);
say(`  target is the only lever that is free:\n`);
say("  reward ratio    target     break-even hit rate");
say("  " + "-".repeat(48));
for (const k of [1, 2, 3, 5, 8]) {
  const required = breakevenHitRate(
    { stopFraction: stop, targetFraction: stop * k },
    style("makerTaker"),
  );
  say(`  ${`${k}:1`.padStart(8)}      ${bp(stop * k).padStart(7)}     ${pct(required).padStart(12)}`);
}

say(bold("\n\nThe shortest horizon that is arithmetically open to you\n"));
for (const [label, hitRate] of [["a good discretionary trader (55%)", 0.55], ["a strong systematic edge (60%)", 0.6], ["an exceptional edge (70%)", 0.7]]) {
  const minStop = minimumViableStop(hitRate, 1, style("makerTaker"));
  const horizon = HORIZONS.find(([, m]) => m >= minStop)?.[0]?.trim() ?? "longer than an hour";
  say(`  ${label.padEnd(36)} min stop ${bp(minStop).padStart(8)}  ->  ${bold(horizon)} or slower`);
}

say(bold("\n\nVerdict\n"));
say(`
  Scalping is not blocked by a lack of signals. It is blocked by arithmetic.

  At a 30-second horizon you are trying to capture ${bp(0.0006)} while paying
  ${bp(roundTripCost(style("makerTaker")))} to get in and out. The cost is ${((roundTripCost(style("makerTaker")) / 0.0006) * 100).toFixed(0)}% of the target. There is no
  hit rate that fixes that, including 100%.

  Three things can change the answer, and none of them is a better signal:

    1. ${bold("Slow down.")} At 5 minutes the cost is 33% of the move rather than 100%.
       At 15 minutes it is 19%. This is the cheapest fix and the only one
       fully under your control.

    2. ${bold("Stretch the target.")} A 30-second stop with a 3:1 target needs a
       ${pct(breakevenHitRate({ stopFraction: 0.0006, targetFraction: 0.0018 }, style("makerTaker")))} hit rate — arithmetically open, if your setups actually run.
       Note this stops being a scalp: you are holding through noise.

    3. ${bold("Pay less.")} Hyperliquid has volume tiers and a staking discount that
       reduce both fees, and maker rebates exist at the top tiers. I cannot
       fetch the current schedule from here, so check your own effective rate
       on the fee page and re-run this with real numbers.

  What does not work: more leverage. Break-even is identical at 1x and 50x,
  because fees and PnL scale with notional together. Leverage only makes you
  arrive at the same answer faster.
`);
