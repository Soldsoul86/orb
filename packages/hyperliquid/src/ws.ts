/**
 * Hyperliquid WebSocket feed.
 *
 * Real-time monitoring is what makes a local hard-exit sentinel viable: polling
 * `/info` every few seconds is far too slow to respect a stop. But a socket is
 * exactly the thing that dies quietly, so this client is built around the
 * assumption that it *will* fail:
 *
 * - a keep-alive ping detects a half-open connection that still looks connected;
 * - reconnects use exponential backoff with jitter and re-establish every
 *   subscription automatically;
 * - a `health` signal tells the executor when the feed is no longer trustworthy,
 *   so it can fall back to REST reconciliation or enter its degraded state
 *   rather than sit quietly on an unmonitored position.
 *
 * This client never decides anything. It reports what it saw and when.
 */
import type { Address } from "./keys.js";
import type {
  ClearinghouseState,
  OpenOrder,
  OrderProcessingStatus,
  PerpAssetCtx,
  UserFill,
} from "./types.js";
import { MAINNET_WS, TESTNET_WS } from "./types.js";
import type { HyperliquidNetwork } from "./signing.js";

export interface ActiveAssetCtxEvent {
  readonly coin: string;
  readonly ctx: PerpAssetCtx;
}

export interface UserFillsEvent {
  readonly user: Address;
  readonly fills: readonly UserFill[];
  readonly isSnapshot?: true;
}

export interface OrderUpdateEvent {
  readonly order: OpenOrder;
  readonly status: OrderProcessingStatus;
  readonly statusTimestamp: number;
}

export interface WebData2Event {
  readonly clearinghouseState?: ClearinghouseState;
}

/** Feed health, as the executor's failure policy understands it. */
export type FeedHealth =
  | { readonly state: "connected"; readonly since: number }
  | { readonly state: "connecting"; readonly attempt: number }
  | { readonly state: "disconnected"; readonly since: number; readonly reason: string };

export interface HyperliquidSocketEvents {
  readonly activeAssetCtx: (event: ActiveAssetCtxEvent) => void;
  readonly userFills: (event: UserFillsEvent) => void;
  readonly orderUpdates: (events: readonly OrderUpdateEvent[]) => void;
  readonly webData2: (event: WebData2Event) => void;
  readonly health: (health: FeedHealth) => void;
}

/** The minimum of the WebSocket API this client uses, so it can be faked. */
export interface SocketLike {
  send(data: string): void;
  close(): void;
  onopen: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
}

export type SocketFactory = (url: string) => SocketLike;

export interface HyperliquidSocketOptions {
  readonly network: HyperliquidNetwork;
  readonly url?: string;
  readonly socketFactory?: SocketFactory;
  /** Interval between keep-alive pings. */
  readonly pingIntervalMs?: number;
  /** A connection with no traffic for this long is treated as dead. */
  readonly stallTimeoutMs?: number;
  readonly baseReconnectDelayMs?: number;
  readonly maxReconnectDelayMs?: number;
  readonly now?: () => number;
  readonly setTimer?: (fn: () => void, ms: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
  readonly random?: () => number;
}

type Subscription = Readonly<Record<string, unknown>> & { readonly type: string };

function defaultSocketFactory(url: string): SocketLike {
  const Ctor = (globalThis as { WebSocket?: new (url: string) => SocketLike }).WebSocket;
  if (!Ctor) {
    throw new Error("no global WebSocket — supply socketFactory (Node 22+ provides one)");
  }
  return new Ctor(url);
}

export class HyperliquidSocket {
  readonly #url: string;
  readonly #factory: SocketFactory;
  readonly #pingIntervalMs: number;
  readonly #stallTimeoutMs: number;
  readonly #baseReconnectDelayMs: number;
  readonly #maxReconnectDelayMs: number;
  readonly #now: () => number;
  readonly #setTimer: (fn: () => void, ms: number) => unknown;
  readonly #clearTimer: (handle: unknown) => void;
  readonly #random: () => number;

  readonly #listeners: { [K in keyof HyperliquidSocketEvents]: Set<HyperliquidSocketEvents[K]> } = {
    activeAssetCtx: new Set(),
    userFills: new Set(),
    orderUpdates: new Set(),
    webData2: new Set(),
    health: new Set(),
  };

  /** Every subscription we want, keyed canonically so re-subscribing is idempotent. */
  readonly #desired = new Map<string, Subscription>();

  #socket: SocketLike | null = null;
  #health: FeedHealth = { state: "disconnected", since: 0, reason: "not started" };
  #attempt = 0;
  #pingTimer: unknown = null;
  #stallTimer: unknown = null;
  #reconnectTimer: unknown = null;
  #lastMessageAt = 0;
  #stopped = true;

  constructor(options: HyperliquidSocketOptions) {
    this.#url = options.url ?? (options.network === "testnet" ? TESTNET_WS : MAINNET_WS);
    this.#factory = options.socketFactory ?? defaultSocketFactory;
    this.#pingIntervalMs = options.pingIntervalMs ?? 20_000;
    this.#stallTimeoutMs = options.stallTimeoutMs ?? 60_000;
    this.#baseReconnectDelayMs = options.baseReconnectDelayMs ?? 500;
    this.#maxReconnectDelayMs = options.maxReconnectDelayMs ?? 15_000;
    this.#now = options.now ?? (() => Date.now());
    this.#setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.#clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as never));
    this.#random = options.random ?? Math.random;
  }

  get health(): FeedHealth {
    return this.#health;
  }

  get connected(): boolean {
    return this.#health.state === "connected";
  }

  /** Milliseconds since the last message of any kind. Feeds the staleness check. */
  msSinceLastMessage(): number {
    return this.#lastMessageAt === 0 ? Number.POSITIVE_INFINITY : this.#now() - this.#lastMessageAt;
  }

  on<K extends keyof HyperliquidSocketEvents>(
    event: K,
    listener: HyperliquidSocketEvents[K],
  ): () => void {
    this.#listeners[event].add(listener);
    return () => void this.#listeners[event].delete(listener);
  }

  #emit<K extends keyof HyperliquidSocketEvents>(
    event: K,
    ...args: Parameters<HyperliquidSocketEvents[K]>
  ): void {
    for (const listener of this.#listeners[event]) {
      try {
        (listener as (...a: unknown[]) => void)(...args);
      } catch {
        // A listener must never take the feed down with it. The executor's own
        // error handling owns whatever went wrong inside the listener.
      }
    }
  }

  start(): void {
    if (!this.#stopped) return;
    this.#stopped = false;
    this.#connect();
  }

  stop(): void {
    this.#stopped = true;
    this.#clearTimers();
    const socket = this.#socket;
    this.#socket = null;
    if (socket) {
      socket.onopen = socket.onclose = socket.onerror = socket.onmessage = null;
      try {
        socket.close();
      } catch {
        // Already closing; nothing to do.
      }
    }
    this.#setHealth({ state: "disconnected", since: this.#now(), reason: "stopped" });
  }

  /** Subscribes now if connected, and always on every future reconnect. */
  subscribe(subscription: Subscription): void {
    const key = JSON.stringify(subscription);
    this.#desired.set(key, subscription);
    if (this.connected) this.#send({ method: "subscribe", subscription });
  }

  subscribeAssetContext(coin: string): void {
    this.subscribe({ type: "activeAssetCtx", coin });
  }

  subscribeUserFills(user: Address): void {
    this.subscribe({ type: "userFills", user });
  }

  subscribeOrderUpdates(user: Address): void {
    this.subscribe({ type: "orderUpdates", user });
  }

  subscribeAccount(user: Address): void {
    this.subscribe({ type: "webData2", user });
  }

  #send(payload: unknown): void {
    try {
      this.#socket?.send(JSON.stringify(payload));
    } catch {
      // The socket died between the health check and the write; the close
      // handler will reconnect.
    }
  }

  #setHealth(health: FeedHealth): void {
    this.#health = health;
    this.#emit("health", health);
  }

  #connect(): void {
    if (this.#stopped) return;
    this.#attempt += 1;
    this.#setHealth({ state: "connecting", attempt: this.#attempt });

    let socket: SocketLike;
    try {
      socket = this.#factory(this.#url);
    } catch (error) {
      this.#scheduleReconnect(error instanceof Error ? error.message : "factory failed");
      return;
    }
    this.#socket = socket;

    socket.onopen = () => {
      if (this.#socket !== socket) return;
      this.#attempt = 0;
      this.#lastMessageAt = this.#now();
      this.#setHealth({ state: "connected", since: this.#now() });
      // Re-establish everything: after a disconnect the server remembers nothing.
      for (const subscription of this.#desired.values()) {
        this.#send({ method: "subscribe", subscription });
      }
      this.#startTimers();
    };

    socket.onmessage = (event) => {
      if (this.#socket !== socket) return;
      this.#lastMessageAt = this.#now();
      this.#handleMessage(event.data);
    };

    socket.onerror = () => {
      // `onclose` always follows; reconnect is handled there so it happens once.
    };

    socket.onclose = () => {
      if (this.#socket !== socket) return;
      this.#socket = null;
      this.#scheduleReconnect("connection closed");
    };
  }

  #startTimers(): void {
    this.#clearTimers();
    this.#pingTimer = this.#setTimer(() => this.#ping(), this.#pingIntervalMs);
    this.#stallTimer = this.#setTimer(() => this.#checkStall(), this.#stallTimeoutMs);
  }

  #ping(): void {
    if (this.#stopped || !this.connected) return;
    this.#send({ method: "ping" });
    this.#pingTimer = this.#setTimer(() => this.#ping(), this.#pingIntervalMs);
  }

  #checkStall(): void {
    if (this.#stopped) return;
    if (this.msSinceLastMessage() >= this.#stallTimeoutMs) {
      // Half-open: the socket believes it is connected but nothing arrives.
      const socket = this.#socket;
      this.#socket = null;
      try {
        socket?.close();
      } catch {
        // Nothing useful to do; we are discarding it either way.
      }
      this.#scheduleReconnect("feed stalled");
      return;
    }
    this.#stallTimer = this.#setTimer(() => this.#checkStall(), this.#stallTimeoutMs);
  }

  #clearTimers(): void {
    for (const timer of [this.#pingTimer, this.#stallTimer, this.#reconnectTimer]) {
      if (timer !== null) this.#clearTimer(timer);
    }
    this.#pingTimer = this.#stallTimer = this.#reconnectTimer = null;
  }

  #scheduleReconnect(reason: string): void {
    this.#clearTimers();
    if (this.#stopped) return;

    this.#setHealth({ state: "disconnected", since: this.#now(), reason });

    // Full jitter: many executors reconnecting at once must not synchronise.
    const ceiling = Math.min(
      this.#baseReconnectDelayMs * 2 ** Math.min(this.#attempt, 10),
      this.#maxReconnectDelayMs,
    );
    const delay = this.#baseReconnectDelayMs + this.#random() * (ceiling - this.#baseReconnectDelayMs);
    this.#reconnectTimer = this.#setTimer(() => this.#connect(), delay);
  }

  #handleMessage(data: unknown): void {
    let message: { channel?: string; data?: unknown };
    try {
      message = JSON.parse(typeof data === "string" ? data : String(data)) as typeof message;
    } catch {
      return;
    }

    switch (message.channel) {
      case "activeAssetCtx":
        this.#emit("activeAssetCtx", message.data as ActiveAssetCtxEvent);
        return;
      case "userFills":
        this.#emit("userFills", message.data as UserFillsEvent);
        return;
      case "orderUpdates":
        this.#emit("orderUpdates", (message.data ?? []) as readonly OrderUpdateEvent[]);
        return;
      case "webData2":
        this.#emit("webData2", message.data as WebData2Event);
        return;
      default:
        // `pong`, `subscriptionResponse` and anything the exchange adds later.
        // Receiving it still counted as liveness, which is all we need.
        return;
    }
  }
}
