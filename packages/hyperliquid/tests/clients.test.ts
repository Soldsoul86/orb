/** Info/exchange clients, transport failure classification, and the WebSocket feed. */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { InfoClient, AssetDirectory } from "../src/info.js";
import { ExchangeClient, parseOrderResponse } from "../src/exchange.js";
import { TransportError, withRetry } from "../src/transport.js";
import type { HttpTransport, HttpRequest } from "../src/transport.js";
import { Wallet } from "../src/keys.js";
import { HyperliquidSocket, type SocketLike } from "../src/ws.js";
import type { AssetMeta, OrderWire } from "../src/types.js";
import { isTerminalOrderStatus } from "../src/types.js";

const WALLET = Wallet.fromPrivateKey(
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);
const USER = WALLET.address;

const UNIVERSE: AssetMeta[] = [
  { name: "BTC", szDecimals: 5, maxLeverage: 40 },
  { name: "ETH", szDecimals: 4, maxLeverage: 25 },
  { name: "DEAD", szDecimals: 2, maxLeverage: 3, isDelisted: true },
];

/** Records every request and replies from a scripted queue. */
function scriptedTransport(replies: readonly unknown[]) {
  const requests: HttpRequest[] = [];
  let index = 0;
  const transport: HttpTransport = async (request) => {
    requests.push(request);
    const reply = replies[Math.min(index++, replies.length - 1)];
    if (reply instanceof Error) throw reply;
    return reply;
  };
  return { transport, requests, get calls() { return requests.length; } };
}

describe("asset directory", () => {
  test("resolves symbols to wire indices in universe order", () => {
    const directory = new AssetDirectory(UNIVERSE);
    assert.equal(directory.resolve("BTC").index, 0);
    assert.equal(directory.resolve("ETH").index, 1);
    assert.equal(directory.resolve("ETH").meta.szDecimals, 4);
  });

  test("throws rather than guessing an index for an unknown symbol", () => {
    const directory = new AssetDirectory(UNIVERSE);
    assert.throws(() => directory.resolve("DOGE"), RangeError);
    assert.equal(directory.has("DOGE"), false);
  });

  test("excludes delisted assets from the tradable set", () => {
    const directory = new AssetDirectory(UNIVERSE);
    assert.deepEqual([...directory.tradableSymbols], ["BTC", "ETH"]);
    assert.ok(directory.has("DEAD"), "still resolvable for reconciling an existing position");
  });
});

describe("info client", () => {
  test("posts the documented request shapes to /info", async () => {
    const script = scriptedTransport([
      { universe: UNIVERSE },
      { marginSummary: {}, assetPositions: [], time: 1 },
      [],
    ]);
    const info = new InfoClient({ network: "testnet", transport: script.transport });

    await info.meta();
    await info.clearinghouseState(USER);
    await info.userFills(USER);

    assert.deepEqual(script.requests.map((r) => r.body), [
      { type: "meta" },
      { type: "clearinghouseState", user: USER },
      { type: "userFills", user: USER },
    ]);
    assert.ok(script.requests.every((r) => r.url.endsWith("/info")));
  });

  test("targets testnet and mainnet hosts distinctly", async () => {
    const testnet = scriptedTransport([{ universe: [] }]);
    const mainnet = scriptedTransport([{ universe: [] }]);
    await new InfoClient({ network: "testnet", transport: testnet.transport }).meta();
    await new InfoClient({ network: "mainnet", transport: mainnet.transport }).meta();

    assert.match(testnet.requests[0]!.url, /hyperliquid-testnet\.xyz/);
    assert.match(mainnet.requests[0]!.url, /api\.hyperliquid\.xyz/);
  });

  test("tolerates the empty-object form the exchange uses for no open orders", async () => {
    const script = scriptedTransport([{}]);
    const info = new InfoClient({ network: "testnet", transport: script.transport });
    assert.deepEqual([...(await info.openOrders(USER))], []);
  });

  test("rejects a malformed response rather than inventing state", async () => {
    const script = scriptedTransport(["not an object"]);
    const info = new InfoClient({ network: "testnet", transport: script.transport });
    await assert.rejects(() => info.clearinghouseState(USER), TransportError);
  });
});

describe("transport failure classification", () => {
  test("only an outright rejection is known not to have applied", () => {
    assert.equal(new TransportError("x", "rejected").definitelyNotApplied, true);
    assert.equal(new TransportError("x", "unreachable").definitelyNotApplied, false);
    assert.equal(new TransportError("x", "server_error").definitelyNotApplied, false);
    assert.equal(new TransportError("x", "malformed").definitelyNotApplied, false);
  });

  test("retries transient failures and gives up on rejections", async () => {
    let attempts = 0;
    const flaky: HttpTransport = async () => {
      attempts++;
      if (attempts < 3) throw new TransportError("down", "server_error");
      return { ok: true };
    };
    const retrying = withRetry(flaky, { attempts: 3, baseDelayMs: 0, sleep: async () => {} });
    assert.deepEqual(await retrying({ url: "u", body: {}, timeoutMs: 1 }), { ok: true });
    assert.equal(attempts, 3);

    let rejectAttempts = 0;
    const rejecting: HttpTransport = async () => {
      rejectAttempts++;
      throw new TransportError("bad request", "rejected");
    };
    await assert.rejects(
      () => withRetry(rejecting, { attempts: 3, baseDelayMs: 0, sleep: async () => {} })({ url: "u", body: {}, timeoutMs: 1 }),
      TransportError,
    );
    assert.equal(rejectAttempts, 1, "a rejected request is never repeated");
  });
});

describe("order response parsing", () => {
  const ok = (statuses: unknown[]) => ({ status: "ok", response: { type: "order", data: { statuses } } });

  test("distinguishes resting, filled, waiting and rejected", () => {
    const outcomes = parseOrderResponse(
      ok([
        { resting: { oid: 1, cloid: "0x01" } },
        { filled: { oid: 2, totalSz: "1.5", avgPx: "2500.5" } },
        "waitingForTrigger",
        { error: "Insufficient margin" },
      ]),
      4,
    );
    assert.deepEqual(outcomes, [
      { kind: "resting", oid: 1, cloid: "0x01" },
      { kind: "filled", oid: 2, totalSz: "1.5", avgPx: "2500.5" },
      { kind: "waiting", detail: "waitingForTrigger" },
      { kind: "rejected", reason: "Insufficient margin" },
    ]);
  });

  test("an ok envelope with a per-order error is still a rejection", () => {
    const [outcome] = parseOrderResponse(ok([{ error: "Order has zero size." }]), 1);
    assert.equal(outcome!.kind, "rejected");
  });

  test("a top-level failure rejects every order in the batch", () => {
    const outcomes = parseOrderResponse({ status: "err", response: "rate limited" }, 3);
    assert.equal(outcomes.length, 3);
    assert.ok(outcomes.every((o) => o.kind === "rejected"));
  });

  test("throws on a shape it does not understand rather than assuming success", () => {
    assert.throws(() => parseOrderResponse({ status: "ok", response: { type: "cancel" } }, 1), TransportError);
  });
});

describe("exchange client", () => {
  const order: OrderWire = {
    a: 0, b: true, p: "30000", s: "0.1", r: false, t: { limit: { tif: "Ioc" } },
  };

  test("signs and posts to /exchange with a nonce and signature", async () => {
    const script = scriptedTransport([{ status: "ok", response: { type: "order", data: { statuses: [{ resting: { oid: 7 } }] } } }]);
    const exchange = new ExchangeClient({
      network: "testnet", transport: script.transport, wallet: WALLET,
      nonceSource: () => 1_700_000_000_000,
    });

    const outcomes = await exchange.placeOrders([order]);
    assert.deepEqual(outcomes, [{ kind: "resting", oid: 7 }]);

    const body = script.requests[0]!.body as Record<string, unknown>;
    assert.deepEqual(body["action"], { type: "order", orders: [order], grouping: "na" });
    assert.equal(body["nonce"], 1_700_000_000_000);
    const signature = body["signature"] as { r: string; s: string; v: number };
    assert.match(signature.r, /^0x[0-9a-f]{64}$/);
    assert.ok(signature.v === 27 || signature.v === 28);
    assert.ok(script.requests[0]!.url.endsWith("/exchange"));
  });

  test("never retries an order — a duplicate position is worse than a failed one", async () => {
    let attempts = 0;
    const transport: HttpTransport = async () => {
      attempts++;
      throw new TransportError("timeout", "unreachable");
    };
    const exchange = new ExchangeClient({ network: "testnet", transport, wallet: WALLET });
    await assert.rejects(() => exchange.placeOrders([order]), TransportError);
    assert.equal(attempts, 1);
  });

  test("carries the vault address into both the signature and the body", async () => {
    const vaultAddress = "0x1234567890abcdef1234567890abcdef12345678" as const;
    const script = scriptedTransport([{ status: "ok", response: { type: "order", data: { statuses: [{ resting: { oid: 1 } }] } } }]);
    const exchange = new ExchangeClient({
      network: "testnet", transport: script.transport, wallet: WALLET, vaultAddress,
    });

    await exchange.placeOrders([order]);
    assert.equal((script.requests[0]!.body as Record<string, unknown>)["vaultAddress"], vaultAddress);
    assert.equal(exchange.tradingAccount, vaultAddress);
    assert.equal(exchange.address, WALLET.address);
  });

  test("cancel and updateLeverage send the documented actions", async () => {
    const script = scriptedTransport([{ status: "ok", response: {} }]);
    const exchange = new ExchangeClient({ network: "testnet", transport: script.transport, wallet: WALLET });

    await exchange.cancelOrders([{ asset: 0, oid: 42 }]);
    await exchange.updateLeverage(3, 7, false);

    assert.deepEqual((script.requests[0]!.body as Record<string, unknown>)["action"], {
      type: "cancel", cancels: [{ a: 0, o: 42 }],
    });
    assert.deepEqual((script.requests[1]!.body as Record<string, unknown>)["action"], {
      type: "updateLeverage", asset: 3, isCross: false, leverage: 7,
    });
  });

  test("rejects a nonsensical leverage before it reaches the wire", async () => {
    const script = scriptedTransport([{ status: "ok", response: {} }]);
    const exchange = new ExchangeClient({ network: "testnet", transport: script.transport, wallet: WALLET });
    await assert.rejects(() => exchange.updateLeverage(0, 0, true), RangeError);
    await assert.rejects(() => exchange.updateLeverage(0, 1.5, true), RangeError);
    assert.equal(script.calls, 0);
  });

  test("surfaces an exchange-level rejection of a cancel", async () => {
    const script = scriptedTransport([{ status: "err", response: "Order was never placed" }]);
    const exchange = new ExchangeClient({ network: "testnet", transport: script.transport, wallet: WALLET });
    await assert.rejects(() => exchange.cancelOrders([{ asset: 0, oid: 1 }]), TransportError);
  });
});

describe("order status vocabulary", () => {
  test("open and triggered orders may still fill; everything else is terminal", () => {
    assert.equal(isTerminalOrderStatus("open"), false);
    assert.equal(isTerminalOrderStatus("triggered"), false);
    for (const status of ["filled", "canceled", "rejected", "marginCanceled", "reduceOnlyCanceled"]) {
      assert.equal(isTerminalOrderStatus(status), true, status);
    }
  });
});

/* ---------------------------------------------------------------- *
 * WebSocket feed
 * ---------------------------------------------------------------- */

/** A fake socket plus a manual timer queue, so reconnection is deterministic. */
function socketHarness() {
  const sockets: FakeSocket[] = [];
  let time = 1_000;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  let nextId = 1;

  class FakeSocket implements SocketLike {
    sent: string[] = [];
    closed = false;
    onopen: ((event: unknown) => void) | null = null;
    onclose: ((event: unknown) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;

    send(data: string): void {
      if (this.closed) throw new Error("socket closed");
      this.sent.push(data);
    }
    close(): void {
      this.closed = true;
      this.onclose?.({});
    }
    open(): void {
      this.onopen?.({});
    }
    deliver(channel: string, data: unknown): void {
      this.onmessage?.({ data: JSON.stringify({ channel, data }) });
    }
    get subscriptions(): unknown[] {
      return this.sent.map((s) => JSON.parse(s)).filter((m) => m.method === "subscribe").map((m) => m.subscription);
    }
  }

  const socket = new HyperliquidSocket({
    network: "testnet",
    socketFactory: () => {
      const created = new FakeSocket();
      sockets.push(created);
      return created;
    },
    now: () => time,
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.push({ at: time + ms, fn, id });
      return id;
    },
    clearTimer: (handle) => {
      const index = timers.findIndex((t) => t.id === handle);
      if (index >= 0) timers.splice(index, 1);
    },
    random: () => 0,
    pingIntervalMs: 100,
    stallTimeoutMs: 500,
    baseReconnectDelayMs: 10,
  });

  const advance = (ms: number) => {
    const target = time + ms;
    for (;;) {
      const due = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers.splice(timers.indexOf(due), 1);
      time = due.at;
      due.fn();
    }
    time = target;
  };

  return { socket, sockets, advance, setTime: (t: number) => (time = t), get now() { return time; } };
}

describe("hyperliquid socket", () => {
  test("subscribes on connect and reports health transitions", () => {
    const h = socketHarness();
    const health: string[] = [];
    h.socket.on("health", (state) => health.push(state.state));

    h.socket.subscribeAssetContext("ETH");
    h.socket.subscribeUserFills(USER);
    h.socket.start();
    h.sockets[0]!.open();

    assert.deepEqual(h.sockets[0]!.subscriptions, [
      { type: "activeAssetCtx", coin: "ETH" },
      { type: "userFills", user: USER },
    ]);
    assert.deepEqual(health, ["connecting", "connected"]);
    assert.equal(h.socket.connected, true);
  });

  test("re-establishes every subscription after a reconnect", () => {
    const h = socketHarness();
    h.socket.subscribeAssetContext("ETH");
    h.socket.subscribeOrderUpdates(USER);
    h.socket.start();
    h.sockets[0]!.open();

    h.sockets[0]!.close();
    h.advance(100); // let the backoff timer fire
    assert.equal(h.sockets.length, 2, "reconnected");
    h.sockets[1]!.open();

    assert.deepEqual(h.sockets[1]!.subscriptions, [
      { type: "activeAssetCtx", coin: "ETH" },
      { type: "orderUpdates", user: USER },
    ]);
  });

  test("a subscription added while disconnected is applied on reconnect", () => {
    const h = socketHarness();
    h.socket.start();
    h.sockets[0]!.open();
    h.sockets[0]!.close();

    h.socket.subscribeAssetContext("BTC"); // while down
    h.advance(100);
    h.sockets[1]!.open();

    assert.deepEqual(h.sockets[1]!.subscriptions, [{ type: "activeAssetCtx", coin: "BTC" }]);
  });

  test("detects a half-open connection that stops delivering messages", () => {
    const h = socketHarness();
    const health: string[] = [];
    h.socket.start();
    h.sockets[0]!.open();
    h.socket.on("health", (state) => health.push(state.state));

    h.advance(600); // past the stall timeout with no traffic
    assert.ok(health.includes("disconnected"), "stall was detected");
    assert.equal(h.socket.connected, false);
  });

  test("any message counts as liveness and resets the stall clock", () => {
    const h = socketHarness();
    h.socket.start();
    h.sockets[0]!.open();

    h.advance(400);
    h.sockets[0]!.deliver("pong", null);
    h.advance(400);

    assert.equal(h.socket.connected, true, "still alive: traffic arrived within the window");
  });

  test("routes each channel to its listener", () => {
    const h = socketHarness();
    const seen: string[] = [];
    h.socket.on("activeAssetCtx", (e) => seen.push(`ctx:${e.coin}`));
    h.socket.on("userFills", (e) => seen.push(`fills:${e.fills.length}`));
    h.socket.on("orderUpdates", (e) => seen.push(`orders:${e.length}`));
    h.socket.on("webData2", () => seen.push("account"));
    h.socket.start();
    h.sockets[0]!.open();

    h.sockets[0]!.deliver("activeAssetCtx", { coin: "ETH", ctx: { markPx: "2500" } });
    h.sockets[0]!.deliver("userFills", { user: USER, fills: [{}, {}] });
    h.sockets[0]!.deliver("orderUpdates", [{}, {}, {}]);
    h.sockets[0]!.deliver("webData2", {});
    h.sockets[0]!.deliver("somethingNew", {});

    assert.deepEqual(seen, ["ctx:ETH", "fills:2", "orders:3", "account"]);
  });

  test("a throwing listener cannot take the feed down", () => {
    const h = socketHarness();
    const seen: string[] = [];
    h.socket.on("activeAssetCtx", () => { throw new Error("listener blew up"); });
    h.socket.on("activeAssetCtx", (e) => seen.push(e.coin));
    h.socket.start();
    h.sockets[0]!.open();

    h.sockets[0]!.deliver("activeAssetCtx", { coin: "ETH", ctx: {} });
    assert.deepEqual(seen, ["ETH"]);
    assert.equal(h.socket.connected, true);
  });

  test("malformed frames are ignored, not fatal", () => {
    const h = socketHarness();
    h.socket.start();
    h.sockets[0]!.open();
    h.sockets[0]!.onmessage?.({ data: "not json{" });
    assert.equal(h.socket.connected, true);
  });

  test("stop() ends reconnection attempts", () => {
    const h = socketHarness();
    h.socket.start();
    h.sockets[0]!.open();
    h.socket.stop();

    const before = h.sockets.length;
    h.advance(10_000);
    assert.equal(h.sockets.length, before, "no reconnect after stop");
    assert.equal(h.socket.connected, false);
  });
});
