#!/usr/bin/env node
/**
 * A runnable demonstration of the hard exit, with no network and no exchange.
 *
 * Shows the acceptance criteria happening in order:
 *
 *   1. a signal arrives and a position opens,
 *   2. the provider says HOLD, repeatedly and emphatically,
 *   3. the configured threshold crosses,
 *   4. the executor closes the position anyway,
 *   5. the exchange confirms flat,
 *   6. the whole lifecycle is read back from the journal.
 *
 * Run with:  node scripts/simulate-hard-exit.mjs
 * (after `npm run build`)
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FileJournalStore, Journal } from "@orb/journal";
import {
  JournalAuditSink,
  KillSwitch,
  MemoryKillSwitchStore,
  TradeExecutor,
  replayLifecycle,
} from "@orb/trade-executor";
import { PaperExchangePort, ScriptedMarketDataFeed } from "@orb/executor-app";

const ETH = { symbol: "ETH", index: 1, szDecimals: 4, maxLeverage: 25, isDelisted: false };
const ENTRY = 2000;
const LEVERAGE = 10;

const config = {
  hardExit: {
    maxLossFraction: 0.1, // 10% of the margin committed
    basis: "MARGIN",
    exchangeProtectiveStop: true,
    protectiveStopSlackFraction: 0.15,
  },
  entry: {
    symbolAllowlist: ["ETH"],
    maxPositionNotionalUsd: 50_000,
    maxLeverage: 20,
    maxConcurrentPositions: 1,
    minNotionalUsd: 10,
    minFreeMarginFraction: 0.05,
    maxSignalAgeMs: 30_000,
    maxClockSkewMs: 5_000,
    maxEntrySlippageFraction: 0.01,
  },
  execution: {
    entryTimeoutMs: 10_000,
    exitTimeoutMs: 30_000,
    maxCloseAttempts: 5,
    closeRetryDelayMs: 0,
    closeAggressionFraction: 0.02,
    reconciliationIntervalMs: 60_000,
    feedStalenessLimitMs: 30_000,
  },
  safety: { killSwitchPolicy: "CLOSE_ALL", degradedPolicy: "CLOSE_ALL" },
};

const settle = async (rounds = 15) => {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setImmediate(r));
};

const say = (line = "") => process.stdout.write(`${line}\n`);
const step = (n, text) => say(`\n\x1b[1m${n}. ${text}\x1b[0m`);

async function main() {
  const directory = await mkdtemp(join(tmpdir(), "orb-simulate-"));
  let time = Date.now();

  const store = await FileJournalStore.open(join(directory, "journal"));
  const journal = await Journal.open({ lane: "sim", device: "simulate", store });
  const audit = new JournalAuditSink({ journal });

  const prices = new Map([["ETH", String(ENTRY)]]);
  const exchange = new PaperExchangePort({
    assets: [ETH],
    priceSource: async (symbol) => prices.get(symbol),
    startingBalanceUsd: 100_000,
    now: () => time,
  });
  const feed = new ScriptedMarketDataFeed(() => time);
  const killSwitch = new KillSwitch(new MemoryKillSwitchStore(), () => time);

  const executor = new TradeExecutor({
    exchange,
    marketData: feed,
    audit,
    killSwitch,
    config,
    now: () => time,
    sleep: async () => undefined,
    setInterval: () => null,
    clearInterval: () => undefined,
  });

  say("\x1b[1mHyperliquid trade executor — hard exit demonstration\x1b[0m");
  say(`   paper exchange, no network, no funds at risk`);
  say(`   entry ${ENTRY}, ${LEVERAGE}x leverage, hard exit at ` +
      `${config.hardExit.maxLossFraction * 100}% of margin`);

  await executor.start();
  await killSwitch.release("simulation");

  /* -- 1. Entry ------------------------------------------------------- */

  step(1, "A signal arrives");
  const result = await executor.submitSignal({
    signalId: "demo-signal-001",
    timestamp: time,
    symbol: "ETH",
    side: "LONG",
    entry: { kind: "MARKET" },
    sizing: { kind: "BASE_SIZE", size: "1" },
    setupId: "demo-breakout",
    leverage: LEVERAGE,
    // The provider's own stop. Advisory only — note where it is, and note that
    // it is not what fires.
    stop: "1500",
  });
  await settle();

  const opened = executor.registry.get("ETH");
  say(`   accepted: ${result.accepted}   trade: ${result.tradeId}`);
  say(`   position: ${opened.side} ${opened.size} ETH @ ${opened.entryPrice}  [${opened.state}]`);
  say(`   exchange confirms: ${(await exchange.accountState()).positions.length} position(s)`);
  say(`   resting protective stop on the exchange: ${opened.protectiveOrder?.triggerPrice ?? "none"}`);
  say(`   provider's advisory stop (never used): 1500`);

  /* -- 2. The provider says HOLD -------------------------------------- */

  step(2, "The provider insists on holding");
  for (const [id, extra] of [
    ["demo-hold-1", { exit: "HOLD", hold: true }],
    ["demo-hold-2", { action: "DO_NOT_EXIT" }],
    ["demo-hold-3", { maxLossFraction: 1, disableStop: true }],
  ]) {
    await executor.submitSignal({
      signalId: id,
      timestamp: time,
      symbol: "ETH",
      side: "LONG",
      entry: { kind: "MARKET" },
      sizing: { kind: "BASE_SIZE", size: "1" },
      setupId: "demo-breakout",
      ...extra,
    });
    say(`   ${id}: ${JSON.stringify(extra)}  → ignored`);
  }
  await settle();
  say(`   threshold unchanged: ${executor.config.hardExit.maxLossFraction * 100}% of margin`);
  say(`   position unchanged:  ${executor.registry.get("ETH").state}`);

  /* -- 3/4/5. The threshold crosses ----------------------------------- */

  step(3, "The market moves against the position");
  for (const price of [1995, 1990, 1985, 1982, 1979]) {
    time += 250;
    prices.set("ETH", String(price));
    feed.push("ETH", price, time);
    await settle(4);

    const position = executor.registry.get("ETH");
    const pnl = (price - ENTRY) * 1;
    const margin = (ENTRY * 1) / LEVERAGE;
    const lossPct = pnl < 0 ? ((-pnl / margin) * 100).toFixed(1) : "0.0";
    say(`   mark ${price}   pnl ${pnl.toFixed(2).padStart(7)}   ` +
        `loss ${lossPct.padStart(5)}% of margin   [${position?.state ?? "gone"}]`);
  }
  await settle(30);

  step(4, "The executor closed it — with no further signal");
  const closed = executor.registry.get("ETH");
  say(`   state:        ${closed.state}`);
  say(`   exit reason:  ${closed.exitReason}`);
  say(`   exit price:   ${closed.exitPrice ?? "-"}`);
  say(`   realised pnl: ${closed.realizedPnl ?? "-"}`);
  say(`   fees:         ${closed.fees ?? "-"}`);

  step(5, "The exchange confirms flat");
  const account = await exchange.accountState();
  say(`   open positions on the exchange: ${account.positions.length}`);
  say(`   account value: ${Number(account.accountValue).toFixed(2)}`);

  /* -- 6. Audit -------------------------------------------------------- */

  step(6, "The lifecycle, read back from the journal");
  await audit.flush();
  await journal.verify();
  say(`   hash chain verified ✓`);

  const lifecycle = await replayLifecycle(journal, closed.tradeId);
  for (const event of lifecycle) {
    const detail =
      event.stage === "HARD_THRESHOLD_CROSSED"
        ? `  measured ${event.risk.measured.toFixed(4)} >= threshold ${event.risk.threshold} (${event.risk.basis}) @ ${event.risk.markPrice}`
        : event.stage === "TRADE_CLOSED"
          ? `  reason ${event.exitReason}, pnl ${event.realizedPnl}, fees ${event.fees}`
          : event.size
            ? `  ${event.side ?? ""} ${event.size} @ ${event.price ?? "-"}`
            : "";
    say(`   ${String(event.stage).padEnd(26)}${detail}`);
  }

  await executor.stop();
  await journal.close();
  await rm(directory, { recursive: true, force: true });

  say(`\n\x1b[1mThe position closed because the executor decided to close it.\x1b[0m`);
  say(`The provider was never asked, and could not have prevented it.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exit(1);
});
