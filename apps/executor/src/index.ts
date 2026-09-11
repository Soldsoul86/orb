/**
 * @orb/executor-app — the runtime host for the Hyperliquid trade executor.
 *
 * Owns configuration, the mainnet safety interlock, the authenticated signal
 * API, and the adapters that bind the executor's ports to Hyperliquid (or to a
 * simulated exchange, in paper and dry-run modes).
 */
export { loadConfig, describeConfig, toRiskConfig, ConfigError } from "./config.js";
export type { ExecutorConfig, ExecutionMode, Network, Environment } from "./config.js";

export { SignalApiServer, signRequest } from "./server.js";
export type { ServerOptions } from "./server.js";

export {
  wireExecutor,
  wireSimulatedExecutor,
  FileKillSwitchStore,
  consoleLogger,
} from "./wiring.js";
export type { WiredExecutor, Logger } from "./wiring.js";

export { HyperliquidExchangePort } from "./adapters/hyperliquid-port.js";
export type { HyperliquidPortOptions } from "./adapters/hyperliquid-port.js";

export { PaperExchangePort, DryRunExchangePort } from "./adapters/simulated-port.js";
export type { SimulatedPortOptions, PriceSource } from "./adapters/simulated-port.js";

export { HyperliquidMarketDataFeed, ScriptedMarketDataFeed } from "./adapters/market-data.js";
export type { HyperliquidFeedOptions } from "./adapters/market-data.js";

export { main } from "./main.js";
