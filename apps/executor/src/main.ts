/**
 * Entry point.
 *
 * Startup order is the safety property here: nothing accepts a signal until the
 * kill switch has been read, the exchange has been reconciled, monitoring is
 * attached to every position that actually exists, and the hard threshold has
 * been evaluated against all of them. Only then does the API open.
 *
 * A restart must never leave a position unmonitored, and must never wait for
 * the next tick to notice a threshold that is already breached.
 */
import { pathToFileURL } from "node:url";

import { loadConfig, describeConfig, ConfigError } from "./config.js";
import { wireExecutor, consoleLogger, type Logger } from "./wiring.js";
import { SignalApiServer } from "./server.js";

export async function main(
  env: NodeJS.ProcessEnv = process.env,
  log: Logger = consoleLogger,
): Promise<() => Promise<void>> {
  const config = loadConfig(env);
  log({ event: "config_loaded", config: describeConfig(config) });

  if (config.mode === "live" && config.network === "mainnet") {
    log({
      event: "live_mainnet",
      warning: "this process will place real orders with real funds",
      hardExitFraction: config.risk.maxLossFraction,
      lossBasis: config.risk.lossBasis,
    });
  }

  const wired = await wireExecutor(config, log);

  // Start the executor first. Until it has reconciled and attached monitoring,
  // accepting a signal would mean opening a position into an unknown state.
  await wired.executor.start();
  log({ event: "executor_started", status: wired.executor.status() });

  const server = new SignalApiServer({
    executor: wired.executor,
    host: config.api.host,
    port: config.api.port,
    signalSecret: config.api.signalSecret,
    operatorSecret: config.api.operatorSecret,
    maxSkewMs: config.api.maxSkewMs,
    rateLimitPerMinute: config.api.rateLimitPerMinute,
    maxBodyBytes: config.api.maxBodyBytes,
    log,
  });
  const address = await server.listen();
  log({ event: "api_listening", ...address });

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log({ event: "shutdown_started" });
    // Stop accepting signals before stopping the executor, so nothing new
    // arrives while open positions are being settled.
    await server.close();
    await wired.shutdown();
    log({ event: "shutdown_complete" });
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void shutdown().then(
        () => process.exit(0),
        (error: unknown) => {
          log({ event: "shutdown_failed", error: String(error) });
          process.exit(1);
        },
      );
    });
  }

  // An unhandled rejection in a trading process is not survivable as a warning:
  // it means some path did not run. Engage the kill switch, then exit loudly.
  process.on("unhandledRejection", (reason) => {
    log({ event: "unhandled_rejection", reason: String(reason) });
    void wired.executor
      .engageKillSwitch("unhandled rejection in the executor process", "runtime")
      .finally(() => shutdown().finally(() => process.exit(1)));
  });

  return shutdown;
}

// Only run when executed directly, so tests can import `main` freely.
const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  main().catch((error: unknown) => {
    if (error instanceof ConfigError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(2);
    }
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exit(1);
  });
}
