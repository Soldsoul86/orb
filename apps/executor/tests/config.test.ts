/**
 * Configuration and the production safety interlock.
 *
 * The interlock is the control that stops "I meant to be on testnet" from
 * becoming a real loss, so these tests try hard to get to mainnet by accident.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadConfig, describeConfig, toRiskConfig, ConfigError, type Environment } from "../src/config.js";
import { validateRiskConfig } from "@orb/trade-executor";

const SIGNAL_SECRET = "s".repeat(48);
const OPERATOR_SECRET = "o".repeat(48);
const PRIVATE_KEY = "0x" + "1".repeat(64);

/** A complete, valid testnet dry-run environment. */
const base: Environment = {
  ORB_HL_MODE: "dry_run",
  ORB_HL_ENV: "testnet",
  ORB_HL_WATCH_ADDRESS: "0x" + "ab".repeat(20),
  ORB_HL_SIGNAL_SECRET: SIGNAL_SECRET,
  ORB_HL_OPERATOR_SECRET: OPERATOR_SECRET,
  ORB_HL_SYMBOL_ALLOWLIST: "ETH,BTC",
  ORB_HL_MAX_LOSS_FRACTION: "0.1",
};

function expectProblem(env: Environment, pattern: RegExp): void {
  try {
    loadConfig(env);
    assert.fail(`expected a ConfigError matching ${pattern}`);
  } catch (error) {
    assert.ok(error instanceof ConfigError, String(error));
    assert.ok(
      error.problems.some((problem) => pattern.test(problem)),
      `no problem matched ${pattern}; got:\n  ${error.problems.join("\n  ")}`,
    );
  }
}

describe("defaults and required settings", () => {
  test("a complete testnet configuration loads", () => {
    const config = loadConfig(base);
    assert.equal(config.mode, "dry_run");
    assert.equal(config.network, "testnet");
    assert.deepEqual([...config.risk.symbolAllowlist], ["ETH", "BTC"]);
    assert.equal(config.risk.maxLossFraction, 0.1);
  });

  test("defaults to the safest mode and network", () => {
    const config = loadConfig({ ...base, ORB_HL_MODE: undefined, ORB_HL_ENV: undefined });
    assert.equal(config.mode, "dry_run");
    assert.equal(config.network, "testnet");
  });

  test("the hard exit threshold is required — there is no safe default", () => {
    expectProblem({ ...base, ORB_HL_MAX_LOSS_FRACTION: undefined }, /MAX_LOSS_FRACTION is required/);
  });

  test("the symbol allowlist is required — the executor trades nothing by default", () => {
    expectProblem({ ...base, ORB_HL_SYMBOL_ALLOWLIST: undefined }, /SYMBOL_ALLOWLIST is required/);
    expectProblem({ ...base, ORB_HL_SYMBOL_ALLOWLIST: "" }, /SYMBOL_ALLOWLIST is required/);
  });

  test("the allowlist is normalised to upper case and trimmed", () => {
    const config = loadConfig({ ...base, ORB_HL_SYMBOL_ALLOWLIST: " eth , btc ,, sol " });
    assert.deepEqual([...config.risk.symbolAllowlist], ["ETH", "BTC", "SOL"]);
  });

  test("reports every problem at once", () => {
    try {
      loadConfig({ ORB_HL_MODE: "live", ORB_HL_ENV: "mainnet" });
      assert.fail("should have thrown");
    } catch (error) {
      assert.ok(error instanceof ConfigError);
      assert.ok(error.problems.length >= 4, error.problems.join("; "));
    }
  });

  test("rejects a malformed numeric setting rather than silently defaulting", () => {
    expectProblem({ ...base, ORB_HL_MAX_LEVERAGE: "lots" }, /MAX_LEVERAGE must be an integer/);
    expectProblem({ ...base, ORB_HL_API_PORT: "8787.5" }, /API_PORT must be an integer/);
  });

  test("the produced risk configuration is itself valid", () => {
    assert.doesNotThrow(() => validateRiskConfig(toRiskConfig(loadConfig(base))));
  });
});

describe("the mainnet interlock", () => {
  test("mainnet requires the explicit confirmation phrase", () => {
    expectProblem(
      { ...base, ORB_HL_ENV: "mainnet", ORB_HL_MODE: "live", ORB_HL_PRIVATE_KEY: PRIVATE_KEY },
      /CONFIRM_MAINNET/,
    );
  });

  test("the confirmation phrase must match exactly", () => {
    for (const attempt of ["yes", "true", "I UNDERSTAND", "i-understand-this-trades-real-funds"]) {
      expectProblem(
        {
          ...base,
          ORB_HL_ENV: "mainnet",
          ORB_HL_MODE: "live",
          ORB_HL_PRIVATE_KEY: PRIVATE_KEY,
          ORB_HL_CONFIRM_MAINNET: attempt,
        },
        /CONFIRM_MAINNET/,
      );
    }
  });

  test("a dry-run configuration can never reach mainnet", () => {
    expectProblem(
      {
        ...base,
        ORB_HL_ENV: "mainnet",
        ORB_HL_MODE: "dry_run",
        ORB_HL_CONFIRM_MAINNET: "I-UNDERSTAND-THIS-TRADES-REAL-FUNDS",
      },
      /only valid with ORB_HL_MODE=live/,
    );
  });

  test("a paper configuration can never reach mainnet", () => {
    expectProblem(
      {
        ...base,
        ORB_HL_ENV: "mainnet",
        ORB_HL_MODE: "paper",
        ORB_HL_CONFIRM_MAINNET: "I-UNDERSTAND-THIS-TRADES-REAL-FUNDS",
      },
      /only valid with ORB_HL_MODE=live/,
    );
  });

  test("all three settings together are accepted", () => {
    const config = loadConfig({
      ...base,
      ORB_HL_ENV: "mainnet",
      ORB_HL_MODE: "live",
      ORB_HL_PRIVATE_KEY: PRIVATE_KEY,
      ORB_HL_CONFIRM_MAINNET: "I-UNDERSTAND-THIS-TRADES-REAL-FUNDS",
    });
    assert.equal(config.network, "mainnet");
    assert.equal(config.mode, "live");
  });

  test("testnet live needs no confirmation phrase", () => {
    const config = loadConfig({ ...base, ORB_HL_MODE: "live", ORB_HL_PRIVATE_KEY: PRIVATE_KEY });
    assert.equal(config.mode, "live");
    assert.equal(config.network, "testnet");
  });
});

describe("wallet configuration", () => {
  test("live mode requires a signing key", () => {
    expectProblem({ ...base, ORB_HL_MODE: "live", ORB_HL_PRIVATE_KEY: undefined }, /requires ORB_HL_PRIVATE_KEY/);
  });

  test("a malformed key is refused", () => {
    expectProblem({ ...base, ORB_HL_MODE: "live", ORB_HL_PRIVATE_KEY: "0xdeadbeef" }, /32 hex bytes/);
  });

  test("read-only modes need an account to watch", () => {
    expectProblem(
      { ...base, ORB_HL_MODE: "paper", ORB_HL_WATCH_ADDRESS: undefined },
      /requires ORB_HL_WATCH_ADDRESS/,
    );
  });

  test("malformed addresses are refused", () => {
    expectProblem({ ...base, ORB_HL_WATCH_ADDRESS: "0xnope" }, /WATCH_ADDRESS must be a 20-byte/);
    expectProblem({ ...base, ORB_HL_VAULT_ADDRESS: "not-an-address" }, /VAULT_ADDRESS must be a 20-byte/);
  });
});

describe("API secrets", () => {
  test("both secrets are required", () => {
    expectProblem({ ...base, ORB_HL_SIGNAL_SECRET: undefined }, /SIGNAL_SECRET/);
    expectProblem({ ...base, ORB_HL_OPERATOR_SECRET: undefined }, /OPERATOR_SECRET/);
  });

  test("short secrets are refused", () => {
    expectProblem({ ...base, ORB_HL_SIGNAL_SECRET: "short" }, /at least 32 characters/);
  });

  test("the operator secret must differ from the signal secret", () => {
    // Otherwise a compromised signal provider could release the kill switch.
    expectProblem(
      { ...base, ORB_HL_OPERATOR_SECRET: SIGNAL_SECRET },
      /must differ from ORB_HL_SIGNAL_SECRET/,
    );
  });

  test("a secret can be supplied by file, keeping it out of the environment", async () => {
    const directory = await mkdtemp(join(tmpdir(), "orb-secret-"));
    try {
      const path = join(directory, "signal.secret");
      await writeFile(path, `${SIGNAL_SECRET}\n`, { mode: 0o600 });

      const config = loadConfig({
        ...base,
        ORB_HL_SIGNAL_SECRET: undefined,
        ORB_HL_SIGNAL_SECRET_FILE: path,
      });
      assert.equal(config.api.signalSecret, SIGNAL_SECRET, "trailing newline is trimmed");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("a file takes precedence over the environment variable", async () => {
    const directory = await mkdtemp(join(tmpdir(), "orb-secret-"));
    try {
      const path = join(directory, "signal.secret");
      const fromFile = "f".repeat(48);
      await writeFile(path, fromFile, { mode: 0o600 });

      const config = loadConfig({ ...base, ORB_HL_SIGNAL_SECRET_FILE: path });
      assert.equal(config.api.signalSecret, fromFile);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("an unreadable or empty secret file is a configuration error", async () => {
    const directory = await mkdtemp(join(tmpdir(), "orb-secret-"));
    try {
      const empty = join(directory, "empty.secret");
      await writeFile(empty, "   \n");
      expectProblem({ ...base, ORB_HL_SIGNAL_SECRET_FILE: empty }, /empty file/);

      expectProblem(
        { ...base, ORB_HL_SIGNAL_SECRET_FILE: join(directory, "missing.secret") },
        /could not be read/,
      );
    } finally {
      await chmod(directory, 0o700).catch(() => undefined);
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("redaction", () => {
  test("the describable view never contains a secret or a key", () => {
    const config = loadConfig({
      ...base,
      ORB_HL_MODE: "live",
      ORB_HL_PRIVATE_KEY: PRIVATE_KEY,
    });
    const text = JSON.stringify(describeConfig(config));

    assert.ok(!text.includes(PRIVATE_KEY), "the private key must not appear");
    assert.ok(!text.includes(PRIVATE_KEY.slice(2)), "nor the key without its prefix");
    assert.ok(!text.includes(SIGNAL_SECRET), "the signal secret must not appear");
    assert.ok(!text.includes(OPERATOR_SECRET), "the operator secret must not appear");

    // It still says the things an operator needs to see.
    assert.ok(text.includes("mainnet") || text.includes("testnet"));
    assert.ok(text.includes("maxLossFraction"));
  });

  test("a new configuration field cannot leak by being forgotten", () => {
    // The view is built by naming fields, so this asserts the shape is closed.
    const described = describeConfig(loadConfig(base));
    assert.deepEqual(Object.keys(described).sort(), ["api", "mode", "network", "risk", "storage", "tradingAccount"]);
    assert.deepEqual(Object.keys(described["api"] as object).sort(), [
      "host", "maxSkewMs", "port", "rateLimitPerMinute",
    ]);
  });
});
