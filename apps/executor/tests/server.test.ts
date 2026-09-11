/**
 * The signal API.
 *
 * The provider is untrusted input, so these tests are written as attempts to
 * get through: forged signatures, replayed requests, stale timestamps, floods,
 * oversized bodies, and — most importantly — attempts to reach authority the
 * API deliberately does not expose.
 */
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FileJournalStore, Journal } from "@orb/journal";
import {
  JournalAuditSink,
  KillSwitch,
  MemoryKillSwitchStore,
  TradeExecutor,
  type AssetInfo,
  type RiskConfig,
} from "@orb/trade-executor";

import { SignalApiServer, signRequest } from "../src/server.js";
import { PaperExchangePort, ScriptedMarketDataFeed } from "../src/index.js";

const SIGNAL_SECRET = "s".repeat(48);
const OPERATOR_SECRET = "o".repeat(48);
const ETH: AssetInfo = { symbol: "ETH", index: 1, szDecimals: 4, maxLeverage: 25, isDelisted: false };

const config: RiskConfig = {
  hardExit: {
    maxLossFraction: 0.1,
    basis: "MARGIN",
    exchangeProtectiveStop: false,
    protectiveStopSlackFraction: 0.15,
  },
  entry: {
    symbolAllowlist: ["ETH"],
    maxPositionNotionalUsd: 50_000,
    maxLeverage: 20,
    maxConcurrentPositions: 3,
    minNotionalUsd: 10,
    minFreeMarginFraction: 0.05,
    maxSignalAgeMs: 30_000,
    maxClockSkewMs: 5_000,
    maxEntrySlippageFraction: 0.01,
  },
  execution: {
    entryTimeoutMs: 10_000,
    exitTimeoutMs: 30_000,
    maxCloseAttempts: 3,
    closeRetryDelayMs: 0,
    closeAggressionFraction: 0.02,
    reconciliationIntervalMs: 60_000,
    feedStalenessLimitMs: 30_000,
  },
  safety: { killSwitchPolicy: "CLOSE_ALL", degradedPolicy: "HOLD_AND_ALERT" },
};

let directory: string;
let journal: Journal;
let executor: TradeExecutor;
let killSwitch: KillSwitch;
let server: SignalApiServer;
let origin: string;
let time = 1_700_000_000_000;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "orb-api-"));
});

after(async () => {
  await rm(directory, { recursive: true, force: true });
});

beforeEach(async () => {
  if (server) await server.close();
  if (executor) await executor.stop();
  if (journal) await journal.close();

  time = 1_700_000_000_000;
  const store = await FileJournalStore.open(join(directory, randomUUID()));
  journal = await Journal.open({ lane: "executor", device: "api-test", store });

  const prices = new Map([["ETH", "2000"]]);
  const exchange = new PaperExchangePort({
    assets: [ETH],
    priceSource: async (symbol) => prices.get(symbol) ?? "2000",
    startingBalanceUsd: 100_000,
    now: () => time,
  });

  killSwitch = new KillSwitch(new MemoryKillSwitchStore(), () => time);
  executor = new TradeExecutor({
    exchange,
    marketData: new ScriptedMarketDataFeed(() => time),
    audit: new JournalAuditSink({ journal }),
    killSwitch,
    config,
    now: () => time,
    sleep: async () => undefined,
    setInterval: () => null,
    clearInterval: () => undefined,
  });

  await executor.start();
  await killSwitch.release("test setup");

  server = new SignalApiServer({
    executor,
    host: "127.0.0.1",
    port: 0,
    signalSecret: SIGNAL_SECRET,
    operatorSecret: OPERATOR_SECRET,
    maxSkewMs: 30_000,
    rateLimitPerMinute: 1_000,
    maxBodyBytes: 4_096,
    now: () => time,
  });
  const address = await server.listen();
  origin = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await server?.close();
  await executor?.stop();
  await journal?.close();
});

interface CallOptions {
  secret?: string;
  timestamp?: number;
  nonce?: string;
  headers?: Record<string, string>;
  method?: string;
}

async function call(path: string, body: unknown, options: CallOptions = {}) {
  const text = body === undefined ? "" : JSON.stringify(body);
  const timestamp = options.timestamp ?? time;
  const nonce = options.nonce ?? randomUUID();
  const secret = options.secret ?? SIGNAL_SECRET;

  const response = await fetch(`${origin}${path}`, {
    method: options.method ?? "POST",
    headers: { ...signRequest(secret, text, timestamp, nonce), ...options.headers },
    ...(options.method === "GET" ? {} : { body: text }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const signal = (overrides: Record<string, unknown> = {}) => ({
  signalId: `sig-${randomUUID()}`,
  timestamp: time,
  symbol: "ETH",
  side: "LONG",
  entry: { kind: "MARKET" },
  sizing: { kind: "BASE_SIZE", size: "1" },
  setupId: "api-test",
  leverage: 5,
  ...overrides,
});

describe("health", () => {
  test("is unauthenticated and reveals nothing useful to an attacker", async () => {
    const response = await fetch(`${origin}/health`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as Record<string, unknown>;
    assert.deepEqual(Object.keys(body).sort(), ["degraded", "killSwitch", "ok"]);
    assert.equal(body["ok"], true);
  });
});

describe("authentication", () => {
  test("a correctly signed signal is accepted", async () => {
    const { status, body } = await call("/signal", signal());
    assert.equal(status, 202, JSON.stringify(body));
    assert.equal(body["accepted"], true);
    assert.ok(typeof body["tradeId"] === "string");
  });

  test("an unsigned request is rejected", async () => {
    const response = await fetch(`${origin}/signal`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(signal()),
    });
    assert.equal(response.status, 401);
  });

  test("a forged signature is rejected", async () => {
    const { status } = await call("/signal", signal(), { secret: "w".repeat(48) });
    assert.equal(status, 401);
  });

  test("a signature over a different body is rejected", async () => {
    const timestamp = time;
    const nonce = randomUUID();
    const headers = signRequest(SIGNAL_SECRET, JSON.stringify(signal()), timestamp, nonce);

    // Same headers, different body: the signature covers the body, so this fails.
    const response = await fetch(`${origin}/signal`, {
      method: "POST",
      headers,
      body: JSON.stringify(signal({ sizing: { kind: "BASE_SIZE", size: "1000" } })),
    });
    assert.equal(response.status, 401);
  });

  test("missing authentication headers are rejected", async () => {
    for (const omit of ["x-orb-timestamp", "x-orb-nonce", "x-orb-signature"]) {
      const text = JSON.stringify(signal());
      const headers: Record<string, string> = signRequest(SIGNAL_SECRET, text, time, randomUUID());
      delete headers[omit];
      const response = await fetch(`${origin}/signal`, { method: "POST", headers, body: text });
      assert.equal(response.status, 401, omit);
    }
  });

  test("a stale timestamp is rejected", async () => {
    const { status } = await call("/signal", signal(), { timestamp: time - 60_000 });
    assert.equal(status, 401);
  });

  test("a timestamp from the future is rejected", async () => {
    const { status } = await call("/signal", signal(), { timestamp: time + 60_000 });
    assert.equal(status, 401);
  });

  test("a non-numeric timestamp is rejected", async () => {
    const text = JSON.stringify(signal());
    const response = await fetch(`${origin}/signal`, {
      method: "POST",
      headers: {
        ...signRequest(SIGNAL_SECRET, text, time, randomUUID()),
        "x-orb-timestamp": "tomorrow",
      },
      body: text,
    });
    assert.equal(response.status, 401);
  });
});

describe("replay protection", () => {
  test("a captured request cannot be replayed", async () => {
    const body = signal();
    const nonce = randomUUID();
    const timestamp = time;

    const first = await call("/signal", body, { nonce, timestamp });
    assert.equal(first.status, 202);

    // Byte-for-byte identical: same body, same nonce, same signature.
    const replay = await call("/signal", body, { nonce, timestamp });
    assert.equal(replay.status, 409, "the nonce must not be accepted twice");
  });

  test("a replay with a fresh timestamp does not verify", async () => {
    const body = signal();
    await call("/signal", body, { nonce: "nonce-a", timestamp: time });

    // Changing the timestamp invalidates the captured signature, because the
    // signature covers timestamp.nonce.body.
    const text = JSON.stringify(body);
    const captured = signRequest(SIGNAL_SECRET, text, time, "nonce-a");
    const response = await fetch(`${origin}/signal`, {
      method: "POST",
      headers: { ...captured, "x-orb-timestamp": String(time + 1_000) },
      body: text,
    });
    assert.equal(response.status, 401);
  });

  test("a too-short nonce is rejected", async () => {
    const { status } = await call("/signal", signal(), { nonce: "abc" });
    assert.equal(status, 401);
  });

  test("the signal API is idempotent: a retried signal reports success, not failure", async () => {
    const body = signal({ signalId: "idempotent-1" });

    const first = await call("/signal", body);
    assert.equal(first.status, 202);

    // A provider retrying after a timeout sends the same signal with a new nonce.
    const retry = await call("/signal", body);
    assert.equal(retry.status, 200, "a duplicate is success, not an error");
    assert.equal(retry.body["duplicate"], true);
    assert.equal(retry.body["reason"], "DUPLICATE_SIGNAL");
  });
});

describe("request validation", () => {
  test("a rejected signal reports a deterministic reason", async () => {
    const { status, body } = await call("/signal", signal({ symbol: "DOGE" }));
    assert.equal(status, 422);
    assert.equal(body["accepted"], false);
    assert.equal(body["reason"], "SYMBOL_NOT_ALLOWED");
  });

  test("a non-JSON body is rejected", async () => {
    const text = "not json {";
    const response = await fetch(`${origin}/signal`, {
      method: "POST",
      headers: signRequest(SIGNAL_SECRET, text, time, randomUUID()),
      body: text,
    });
    assert.equal(response.status, 400);
  });

  test("an oversized body is refused before it is parsed", async () => {
    const text = JSON.stringify({ padding: "x".repeat(20_000) });
    const response = await fetch(`${origin}/signal`, {
      method: "POST",
      headers: signRequest(SIGNAL_SECRET, text, time, randomUUID()),
      body: text,
    });
    assert.equal(response.status, 413);
  });

  test("an unknown endpoint is a 404, not a hint", async () => {
    const { status } = await call("/admin", {}, { secret: OPERATOR_SECRET });
    assert.equal(status, 404);
  });
});

describe("rate limiting", () => {
  test("a flood of authenticated requests is throttled", async () => {
    await server.close();
    server = new SignalApiServer({
      executor,
      host: "127.0.0.1",
      port: 0,
      signalSecret: SIGNAL_SECRET,
      operatorSecret: OPERATOR_SECRET,
      maxSkewMs: 30_000,
      rateLimitPerMinute: 5,
      maxBodyBytes: 4_096,
      now: () => time,
    });
    origin = `http://127.0.0.1:${(await server.listen()).port}`;

    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await call("/signal", signal())).status);
    }
    assert.ok(statuses.includes(429), `expected throttling, got ${statuses.join(",")}`);
  });
});

describe("authority separation", () => {
  test("the signal secret cannot reach the operator endpoints", async () => {
    for (const path of ["/kill", "/release", "/close", "/status"]) {
      const { status } = await call(path, { reason: "attempt" }, { secret: SIGNAL_SECRET });
      assert.equal(status, 401, `${path} must refuse the signal secret`);
    }
    assert.equal(killSwitch.engaged, false, "nothing was changed");
  });

  test("the operator secret can engage and release the kill switch", async () => {
    const engaged = await call("/kill", { reason: "operator halt" }, { secret: OPERATOR_SECRET });
    assert.equal(engaged.status, 200);
    assert.equal(killSwitch.engaged, true);

    // And with it engaged, signals are refused.
    const refused = await call("/signal", signal());
    assert.equal(refused.status, 422);
    assert.equal(refused.body["reason"], "KILL_SWITCH_ENGAGED");

    const released = await call("/release", { reason: "resume" }, { secret: OPERATOR_SECRET });
    assert.equal(released.status, 200);
    assert.equal(killSwitch.engaged, false);
  });

  test("the operator status view exposes state without secrets", async () => {
    const { status, body } = await call("/status", undefined, {
      secret: OPERATOR_SECRET,
      method: "GET",
    });
    assert.equal(status, 200);
    assert.ok("positions" in body);
    assert.ok("hardExit" in body);

    const text = JSON.stringify(body);
    assert.ok(!text.includes(SIGNAL_SECRET));
    assert.ok(!text.includes(OPERATOR_SECRET));
  });

  test("there is no endpoint that submits an order", async () => {
    // The whole surface. Anything not here does not exist.
    for (const path of ["/order", "/orders", "/execute", "/trade", "/exchange", "/submit", "/exit"]) {
      const { status } = await call(path, { anything: true }, { secret: OPERATOR_SECRET });
      assert.equal(status, 404, `${path} must not exist`);
    }
  });

  test("a signal cannot request an exit", async () => {
    // Open a position, then try every phrasing of "close it" through /signal.
    await call("/signal", signal({ signalId: "exit-attempt-position" }));

    for (const payload of [
      { action: "CLOSE", symbol: "ETH" },
      { ...signal(), exit: true },
      { ...signal(), side: "CLOSE" },
      { ...signal(), reduceOnly: true },
    ]) {
      const { status } = await call("/signal", payload);
      // Either malformed or refused as a conflicting position — never a close.
      assert.ok(status === 422 || status === 200, `unexpected ${status}`);
    }

    // The position is untouched: only the executor may close it.
    const position = executor.registry.get("ETH");
    assert.ok(position);
    assert.equal(position.exitReason, undefined, "no exit was ever triggered by a signal");
  });

  test("closing by hand requires the operator secret and records MANUAL_EXIT", async () => {
    await call("/signal", signal({ signalId: "manual-close-1" }));
    assert.equal(executor.registry.get("ETH")?.state, "MONITORING");

    const { status, body } = await call(
      "/close",
      { symbol: "ETH", reason: "operator decision" },
      { secret: OPERATOR_SECRET },
    );
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(executor.registry.get("ETH")?.state, "CLOSED");
    assert.equal(executor.registry.get("ETH")?.exitReason, "MANUAL_EXIT");
  });

  test("closing a symbol with no position is a conflict, not a silent success", async () => {
    const { status, body } = await call(
      "/close",
      { symbol: "BTC" },
      { secret: OPERATOR_SECRET },
    );
    assert.equal(status, 409);
    assert.equal(body["closed"], false);
  });

  test("a close with no symbol is refused", async () => {
    const { status } = await call("/close", {}, { secret: OPERATOR_SECRET });
    assert.equal(status, 400);
  });
});
