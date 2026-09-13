#!/usr/bin/env node
/**
 * Collects Hyperliquid candles into a JSONL file.
 *
 * Run this **on a machine with network access to the exchange** — your laptop,
 * a VPS, anywhere that is not behind a restrictive egress policy. It needs no
 * key and no account: `/info` is public and read-only.
 *
 *   node scripts/collect-candles.mjs ETH 1m 7        # last 7 days of 1m candles
 *   node scripts/collect-candles.mjs BTC 5m 30 --testnet
 *
 * Output goes to `data/candles/<SYMBOL>-<INTERVAL>.jsonl`, one candle per line,
 * oldest first. Commit it, or hand it over, and the analysis can run against
 * real data rather than assumed parameters.
 *
 * The exchange caps how many candles it returns per call, so a long range is
 * walked in windows and de-duplicated by opening timestamp.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { InfoClient, fetchTransport, withRetry } from "@orb/hyperliquid";

const INTERVAL_MS = {
  "1m": 60_000, "3m": 180_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000,
  "1h": 3_600_000, "2h": 7_200_000, "4h": 14_400_000, "8h": 28_800_000,
  "12h": 43_200_000, "1d": 86_400_000, "3d": 259_200_000,
  "1w": 604_800_000, "1M": 2_592_000_000,
};

const [, , symbolArg, intervalArg = "1m", daysArg = "7", ...flags] = process.argv;

if (!symbolArg) {
  process.stderr.write(
    "usage: node scripts/collect-candles.mjs <SYMBOL> [interval] [days] [--testnet]\n" +
      `       intervals: ${Object.keys(INTERVAL_MS).join(", ")}\n`,
  );
  process.exit(2);
}

const symbol = symbolArg.toUpperCase();
const interval = intervalArg;
const days = Number(daysArg);
const network = flags.includes("--testnet") ? "testnet" : "mainnet";

if (!(interval in INTERVAL_MS)) {
  process.stderr.write(`unknown interval ${interval}\n`);
  process.exit(2);
}
if (!Number.isFinite(days) || days <= 0) {
  process.stderr.write(`days must be a positive number, got ${daysArg}\n`);
  process.exit(2);
}

const step = INTERVAL_MS[interval];
const endTime = Date.now();
const startTime = endTime - days * 86_400_000;

const info = new InfoClient({
  network,
  transport: withRetry(fetchTransport(), { attempts: 4, baseDelayMs: 500 }),
  timeoutMs: 30_000,
});

process.stdout.write(
  `collecting ${symbol} ${interval} for ${days}d from ${network}\n` +
    `  ${new Date(startTime).toISOString()} -> ${new Date(endTime).toISOString()}\n`,
);

/** Keyed by opening timestamp, so overlapping windows de-duplicate naturally. */
const candles = new Map();
let cursor = startTime;
let windows = 0;
let emptyWindows = 0;

while (cursor < endTime) {
  // A window of 1000 candles is comfortably inside the exchange's cap.
  const windowEnd = Math.min(cursor + step * 1000, endTime);

  let batch;
  try {
    batch = await info.candleSnapshot(symbol, interval, cursor, windowEnd);
  } catch (error) {
    process.stderr.write(`\n  request failed at ${new Date(cursor).toISOString()}: ${error?.message ?? error}\n`);
    // A single failed window should not discard everything collected so far.
    cursor = windowEnd;
    continue;
  }

  windows += 1;
  for (const candle of batch) candles.set(candle.t, candle);

  if (batch.length === 0) {
    emptyWindows += 1;
    // Several empty windows in a row means the symbol has no history here,
    // rather than a transient gap.
    if (emptyWindows >= 3 && candles.size === 0) {
      process.stderr.write(`\n  no candles returned for ${symbol} — is the symbol listed?\n`);
      process.exit(1);
    }
  } else {
    emptyWindows = 0;
  }

  // Advance past the last candle we actually received, so a short window does
  // not cause an infinite loop.
  const lastOpen = batch.length > 0 ? batch[batch.length - 1].t : undefined;
  cursor = lastOpen !== undefined && lastOpen + step > cursor ? lastOpen + step : windowEnd;

  process.stdout.write(`\r  ${candles.size} candles over ${windows} windows`);
  // The public endpoint is rate limited; a small pause keeps us well inside it.
  await new Promise((resolve) => setTimeout(resolve, 120));
}

const ordered = [...candles.values()].sort((a, b) => a.t - b.t);
if (ordered.length === 0) {
  process.stderr.write("\nno candles collected\n");
  process.exit(1);
}

const out = join("data", "candles", `${symbol}-${interval}.jsonl`);
await mkdir(dirname(out), { recursive: true });
await writeFile(out, ordered.map((c) => JSON.stringify(c)).join("\n") + "\n");

/* A gap report matters more than it looks: a dataset with silent holes
   produces a backtest that quietly overstates its edge. */
let gaps = 0;
for (let i = 1; i < ordered.length; i++) {
  if (ordered[i].t - ordered[i - 1].t > step * 1.5) gaps += 1;
}

const first = ordered[0];
const last = ordered[ordered.length - 1];
const expected = Math.round((last.t - first.t) / step) + 1;

process.stdout.write(
  `\n\nwrote ${out}\n` +
    `  ${ordered.length} candles  ${new Date(first.t).toISOString()} -> ${new Date(last.T).toISOString()}\n` +
    `  coverage ${((ordered.length / expected) * 100).toFixed(1)}% of the expected ${expected}\n` +
    `  ${gaps} gap(s) longer than one interval\n` +
    (gaps > 0
      ? `  note: gaps bias a backtest optimistically — missing candles are\n` +
        `        usually the violent ones the exchange was busiest during\n`
      : ""),
);
