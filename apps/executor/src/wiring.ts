/**
 * Composition root.
 *
 * Every dependency is constructed here and injected downward; nothing below
 * this file reaches for a global. That is what lets the acceptance tests build
 * the same executor with scripted ports and assert on real behaviour.
 *
 * The mode decides which exchange port is built, and the choice is structural:
 * `dry_run` and `paper` construct ports with no signing key, so those
 * configurations cannot place an order even if every other control failed.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { FileJournalStore, Journal } from "@orb/journal";
import {
  ExchangeClient,
  HyperliquidSocket,
  InfoClient,
  Wallet,
  fetchTransport,
  toChecksumAddress,
  withRetry,
  type Address,
} from "@orb/hyperliquid";
import {
  JournalAuditSink,
  KillSwitch,
  TradeExecutor,
  type AssetInfo,
  type ExchangePort,
  type KillSwitchRecord,
  type KillSwitchStore,
  type MarketDataPort,
} from "@orb/trade-executor";

import { toRiskConfig, type ExecutorConfig } from "./config.js";
import { HyperliquidExchangePort } from "./adapters/hyperliquid-port.js";
import { DryRunExchangePort, PaperExchangePort } from "./adapters/simulated-port.js";
import { HyperliquidMarketDataFeed, ScriptedMarketDataFeed } from "./adapters/market-data.js";

/** Structured logging. Never receives a secret — the config view is redacted. */
export type Logger = (line: Record<string, unknown>) => void;

export const consoleLogger: Logger = (line) => {
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), ...line })}\n`);
};

/**
 * File-backed kill switch state.
 *
 * A read failure is not caught here: {@link KillSwitch} treats any failure as
 * "engaged", and swallowing it would turn a fail-closed control into a
 * fail-open one.
 */
export class FileKillSwitchStore implements KillSwitchStore {
  readonly #path: string;

  constructor(directory: string) {
    this.#path = join(directory, "kill-switch.json");
  }

  async load(): Promise<KillSwitchRecord | null> {
    try {
      return JSON.parse(await readFile(this.#path, "utf8")) as KillSwitchRecord;
    } catch (error) {
      // A missing file means "never engaged", which is genuinely different from
      // "cannot be read" — only the latter must fail closed.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async save(record: KillSwitchRecord): Promise<void> {
    await mkdir(join(this.#path, ".."), { recursive: true, mode: 0o700 });
    await writeFile(this.#path, JSON.stringify(record, null, 2), { mode: 0o600 });
  }
}

export interface WiredExecutor {
  readonly executor: TradeExecutor;
  readonly journal: Journal;
  readonly audit: JournalAuditSink;
  readonly exchange: ExchangePort;
  readonly marketData: MarketDataPort;
  readonly killSwitch: KillSwitch;
  readonly shutdown: () => Promise<void>;
}

/** Builds every component for a configuration. Does not start anything. */
export async function wireExecutor(
  config: ExecutorConfig,
  log: Logger = consoleLogger,
): Promise<WiredExecutor> {
  await mkdir(config.storage.dataDir, { recursive: true, mode: 0o700 });

  /* -- Journal: the audit substrate, and the first thing to exist. ------- */

  const store = await FileJournalStore.open(join(config.storage.dataDir, "journal"));
  const journal = await Journal.open({
    lane: config.storage.lane,
    device: config.storage.device,
    store,
  });
  const audit = new JournalAuditSink({
    journal,
    onError: (error, dropped) =>
      log({
        event: "audit_append_failed",
        error: error instanceof Error ? error.message : String(error),
        dropped: dropped.length,
      }),
  });

  /* -- Read side: always the real exchange, in every mode. --------------- */

  const transport = withRetry(fetchTransport(), { attempts: 3, baseDelayMs: 200 });
  const info = new InfoClient({ network: config.network, transport });
  const directory = await info.assetDirectory();

  const wallet =
    config.wallet.privateKey !== undefined
      ? Wallet.fromPrivateKey(config.wallet.privateKey)
      : undefined;

  const account: Address =
    config.wallet.vaultAddress ??
    wallet?.address ??
    (config.wallet.watchAddress !== undefined
      ? toChecksumAddress(config.wallet.watchAddress)
      : (() => {
          throw new Error("no account to observe: set ORB_HL_WATCH_ADDRESS or a private key");
        })());

  /* -- Write side: mode decides, and two of three modes cannot write. ---- */

  let exchange: ExchangePort;
  let marketData: MarketDataPort;
  let socket: HyperliquidSocket | undefined;

  if (config.mode === "live") {
    if (!wallet) throw new Error("live mode requires a signing key");

    const exchangeClient = new ExchangeClient({
      network: config.network,
      transport: fetchTransport(), // never retried: a repeated order doubles a position
      wallet,
      ...(config.wallet.vaultAddress ? { vaultAddress: config.wallet.vaultAddress } : {}),
    });
    const port = new HyperliquidExchangePort({ info, exchange: exchangeClient, directory, account });
    exchange = port;

    socket = new HyperliquidSocket({ network: config.network });
    marketData = new HyperliquidMarketDataFeed({
      socket,
      account,
      port,
      stalenessLimitMs: config.risk.feedStalenessLimitMs,
    });
  } else if (config.mode === "paper") {
    const readOnlyPort = new HyperliquidExchangePort({ info, directory, account });
    const assets: AssetInfo[] = config.risk.symbolAllowlist
      .map((symbol) => readOnlyPort.assetInfo(symbol))
      .filter((asset): asset is AssetInfo => asset !== undefined);

    const paper = new PaperExchangePort({
      assets,
      priceSource: (symbol) => readOnlyPort.markPrice(symbol),
      startingBalanceUsd: config.risk.maxPositionNotionalUsd * 10,
      account: `paper:${account}`,
    });
    exchange = paper;

    socket = new HyperliquidSocket({ network: config.network });
    marketData = new HyperliquidMarketDataFeed({
      socket,
      account,
      port: readOnlyPort,
      stalenessLimitMs: config.risk.feedStalenessLimitMs,
    });
  } else {
    const readOnlyPort = new HyperliquidExchangePort({ info, directory, account });
    exchange = new DryRunExchangePort(readOnlyPort, (orders) =>
      log({
        event: "dry_run_order",
        orders: orders.map((order) => ({
          symbol: order.symbol,
          side: order.side,
          size: order.size,
          price: order.price,
          reduceOnly: order.reduceOnly,
          kind: order.kind,
        })),
      }),
    );

    socket = new HyperliquidSocket({ network: config.network });
    marketData = new HyperliquidMarketDataFeed({
      socket,
      account,
      port: readOnlyPort,
      stalenessLimitMs: config.risk.feedStalenessLimitMs,
    });
  }

  const killSwitch = new KillSwitch(new FileKillSwitchStore(config.storage.dataDir), () => Date.now());

  const executor = new TradeExecutor({
    exchange,
    marketData,
    audit,
    killSwitch,
    config: toRiskConfig(config),
  });

  const shutdown = async (): Promise<void> => {
    await executor.stop();
    socket?.stop();
    await audit.flush();
    await journal.close();
  };

  return { executor, journal, audit, exchange, marketData, killSwitch, shutdown };
}

/**
 * Builds an executor over entirely scripted ports.
 *
 * Used by the acceptance tests and by `scripts/simulate.mjs`, so a complete
 * lifecycle can be demonstrated with no network and no exchange at all.
 */
export function wireSimulatedExecutor(options: {
  readonly config: ExecutorConfig;
  readonly assets: readonly AssetInfo[];
  readonly prices: Map<string, string>;
  readonly journal: Journal;
  readonly killSwitchStore: KillSwitchStore;
  readonly startingBalanceUsd?: number;
  readonly now?: () => number;
}): {
  executor: TradeExecutor;
  exchange: PaperExchangePort;
  feed: ScriptedMarketDataFeed;
  audit: JournalAuditSink;
  killSwitch: KillSwitch;
  setPrice: (symbol: string, price: number | string) => void;
} {
  const now = options.now ?? (() => Date.now());
  const audit = new JournalAuditSink({ journal: options.journal });

  const exchange = new PaperExchangePort({
    assets: options.assets,
    priceSource: async (symbol) => {
      const price = options.prices.get(symbol);
      if (price === undefined) throw new Error(`no scripted price for ${symbol}`);
      return price;
    },
    startingBalanceUsd: options.startingBalanceUsd ?? 100_000,
    now,
  });

  const feed = new ScriptedMarketDataFeed(now);
  const killSwitch = new KillSwitch(options.killSwitchStore, now);

  const executor = new TradeExecutor({
    exchange,
    marketData: feed,
    audit,
    killSwitch,
    config: toRiskConfig(options.config),
    now,
    sleep: async () => undefined,
    setInterval: () => null,
    clearInterval: () => undefined,
  });

  return {
    executor,
    exchange,
    feed,
    audit,
    killSwitch,
    /** Moves the market and delivers the tick, as the feed would. */
    setPrice: (symbol, price) => {
      options.prices.set(symbol, String(price));
      feed.push(symbol, price, now());
    },
  };
}
