/**
 * The signal API.
 *
 * The provider is untrusted input. Not malicious by assumption — but a key can
 * leak, a bug can replay, and a compromised upstream must not be able to move
 * money. So the API surface is deliberately tiny:
 *
 *   POST /signal   — submit an entry intent (signal secret)
 *   GET  /health   — liveness (unauthenticated, no detail)
 *   GET  /status   — full executor state (operator secret)
 *   POST /kill     — engage the kill switch (operator secret)
 *   POST /release  — release the kill switch (operator secret)
 *   POST /close    — close a position by hand (operator secret)
 *
 * **There is no endpoint that submits an order.** A caller can express an entry
 * intent and nothing else: it cannot choose a price, request an exit, defer
 * one, change a threshold, or reach the exchange. Those are executor
 * authorities and they are not on the wire.
 *
 * The two secrets are separate and must differ, so a compromised signal
 * provider cannot touch the kill switch.
 *
 * Every request carries an HMAC over `timestamp.nonce.body`, so a captured
 * request cannot be replayed: the timestamp bounds the window and the nonce
 * cache covers it.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { TradeExecutor } from "@orb/trade-executor";

export interface ServerOptions {
  readonly executor: TradeExecutor;
  readonly host: string;
  readonly port: number;
  readonly signalSecret: string;
  readonly operatorSecret: string;
  readonly maxSkewMs: number;
  readonly rateLimitPerMinute: number;
  readonly maxBodyBytes: number;
  readonly now?: () => number;
  readonly log?: (line: Record<string, unknown>) => void;
}

/** Fixed-time comparison that tolerates differing lengths without leaking them. */
function secretEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) {
    // Still do the comparison, so a length mismatch costs the same as a
    // content mismatch.
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

/**
 * Replay protection.
 *
 * A nonce is accepted once within the skew window. Entries older than the
 * window are dropped, so the cache cannot grow without bound — and cannot be
 * used to exhaust memory by flooding unique nonces.
 */
class NonceCache {
  readonly #seen = new Map<string, number>();
  readonly #windowMs: number;
  readonly #maxEntries: number;

  constructor(windowMs: number, maxEntries = 100_000) {
    this.#windowMs = windowMs;
    this.#maxEntries = maxEntries;
  }

  /** @returns `true` when the nonce is fresh; `false` when it is a replay. */
  accept(nonce: string, now: number): boolean {
    this.#evict(now);
    if (this.#seen.has(nonce)) return false;
    if (this.#seen.size >= this.#maxEntries) return false;
    this.#seen.set(nonce, now);
    return true;
  }

  #evict(now: number): void {
    const cutoff = now - this.#windowMs * 2;
    for (const [nonce, at] of this.#seen) {
      if (at < cutoff) this.#seen.delete(nonce);
      else break; // Map preserves insertion order, so the rest are newer.
    }
  }

  get size(): number {
    return this.#seen.size;
  }
}

/** Token bucket per caller identity. */
class RateLimiter {
  readonly #buckets = new Map<string, { tokens: number; refilledAt: number }>();
  readonly #perMinute: number;

  constructor(perMinute: number) {
    this.#perMinute = perMinute;
  }

  allow(key: string, now: number): boolean {
    const bucket = this.#buckets.get(key) ?? { tokens: this.#perMinute, refilledAt: now };
    const elapsed = now - bucket.refilledAt;
    const refill = (elapsed / 60_000) * this.#perMinute;
    bucket.tokens = Math.min(this.#perMinute, bucket.tokens + refill);
    bucket.refilledAt = now;

    if (bucket.tokens < 1) {
      this.#buckets.set(key, bucket);
      return false;
    }
    bucket.tokens -= 1;
    this.#buckets.set(key, bucket);
    return true;
  }
}

interface AuthResult {
  readonly ok: boolean;
  readonly status?: number;
  readonly error?: string;
}

export class SignalApiServer {
  readonly #options: Required<Pick<ServerOptions, "now" | "log">> & ServerOptions;
  readonly #nonces: NonceCache;
  readonly #limiter: RateLimiter;
  #server: Server | null = null;

  constructor(options: ServerOptions) {
    this.#options = {
      ...options,
      now: options.now ?? (() => Date.now()),
      log: options.log ?? (() => undefined),
    };
    this.#nonces = new NonceCache(options.maxSkewMs);
    this.#limiter = new RateLimiter(options.rateLimitPerMinute);
  }

  async listen(): Promise<{ host: string; port: number }> {
    const server = createServer((request, response) => {
      void this.#handle(request, response).catch(() => {
        // A handler must never take the process down: an unhandled rejection
        // here would kill the executor along with it.
        this.#send(response, 500, { error: "internal error" });
      });
    });
    this.#server = server;

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(this.#options.port, this.#options.host, () => {
        server.removeListener("error", reject);
        resolve();
      });
    });

    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : this.#options.port;
    return { host: this.#options.host, port };
  }

  async close(): Promise<void> {
    const server = this.#server;
    if (!server) return;
    this.#server = null;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  /* ---------------------------------------------------------------- *
   * Request handling
   * ---------------------------------------------------------------- */

  async #handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", "http://localhost");
    const route = `${request.method ?? "GET"} ${url.pathname}`;

    // Liveness carries no detail and needs no secret: a load balancer must be
    // able to reach it, and it must reveal nothing to anyone else.
    if (route === "GET /health") {
      const status = this.#options.executor.status();
      return this.#send(response, status.running ? 200 : 503, {
        ok: status.running,
        degraded: status.degraded,
        killSwitch: status.killSwitch.engaged,
      });
    }

    let body: string;
    try {
      body = await this.#readBody(request);
    } catch (error) {
      // The connection is closed after the refusal: the caller is still sending
      // a body we have decided not to read.
      response.setHeader("connection", "close");
      return this.#send(response, 413, { error: error instanceof Error ? error.message : "body too large" });
    }

    const operator = route !== "POST /signal";
    const secret = operator ? this.#options.operatorSecret : this.#options.signalSecret;
    const auth = this.#authenticate(request, body, secret, operator ? "operator" : "signal");
    if (!auth.ok) {
      this.#options.log({ event: "auth_rejected", route, error: auth.error });
      return this.#send(response, auth.status ?? 401, { error: auth.error ?? "unauthorized" });
    }

    switch (route) {
      case "POST /signal":
        return this.#handleSignal(response, body);
      case "GET /status":
        return this.#send(response, 200, this.#options.executor.status());
      case "POST /kill":
        return this.#handleKill(response, body);
      case "POST /release":
        return this.#handleRelease(response, body);
      case "POST /close":
        return this.#handleClose(response, body);
      default:
        return this.#send(response, 404, { error: "no such endpoint" });
    }
  }

  async #handleSignal(response: ServerResponse, body: string): Promise<void> {
    let payload: unknown;
    try {
      payload = JSON.parse(body || "{}");
    } catch {
      return this.#send(response, 400, { accepted: false, reason: "MALFORMED_SIGNAL", detail: "body is not JSON" });
    }

    const result = await this.#options.executor.submitSignal(payload);
    this.#options.log({
      event: "signal",
      accepted: result.accepted,
      signalId: result.signalId ?? null,
      reason: result.rejection?.reason ?? null,
    });

    if (result.accepted) {
      return this.#send(response, 202, {
        accepted: true,
        tradeId: result.tradeId,
        signalId: result.signalId,
      });
    }

    // A duplicate is not an error: it is the idempotent success case, and a
    // provider retrying on a timeout must not be told it failed.
    const duplicate = result.rejection?.reason === "DUPLICATE_SIGNAL";
    return this.#send(response, duplicate ? 200 : 422, {
      accepted: false,
      duplicate,
      reason: result.rejection?.reason ?? "UNKNOWN",
      detail: result.rejection?.detail ?? "",
      signalId: result.signalId ?? null,
    });
  }

  async #handleKill(response: ServerResponse, body: string): Promise<void> {
    const reason = parseField(body, "reason") ?? "engaged via the operator API";
    await this.#options.executor.engageKillSwitch(reason, "operator-api");
    this.#options.log({ event: "kill_switch_engaged", reason });
    return this.#send(response, 200, { killSwitch: this.#options.executor.status().killSwitch });
  }

  async #handleRelease(response: ServerResponse, body: string): Promise<void> {
    const reason = parseField(body, "reason") ?? "released via the operator API";
    await this.#options.executor.releaseKillSwitch(reason, "operator-api");
    this.#options.log({ event: "kill_switch_released", reason });
    return this.#send(response, 200, { killSwitch: this.#options.executor.status().killSwitch });
  }

  async #handleClose(response: ServerResponse, body: string): Promise<void> {
    const symbol = parseField(body, "symbol");
    if (symbol === undefined) return this.#send(response, 400, { error: "symbol is required" });

    const reason = parseField(body, "reason") ?? "closed via the operator API";
    const closed = await this.#options.executor.closePositionNow(symbol, "MANUAL_EXIT", reason);
    this.#options.log({ event: "manual_close", symbol, closed });
    return this.#send(response, closed ? 200 : 409, {
      closed,
      symbol,
      status: this.#options.executor.status().positions.find((p) => p.symbol === symbol) ?? null,
    });
  }

  /* ---------------------------------------------------------------- *
   * Authentication
   * ---------------------------------------------------------------- */

  /**
   * Verifies the HMAC, the timestamp window, the nonce, and the rate limit.
   *
   * Signature is over `timestamp.nonce.body` so that changing any of them
   * invalidates it — a replayed body with a fresh timestamp does not verify.
   */
  #authenticate(
    request: IncomingMessage,
    body: string,
    secret: string,
    scope: string,
  ): AuthResult {
    const timestamp = header(request, "x-orb-timestamp");
    const nonce = header(request, "x-orb-nonce");
    const signature = header(request, "x-orb-signature");

    if (!timestamp || !nonce || !signature) {
      return { ok: false, status: 401, error: "x-orb-timestamp, x-orb-nonce and x-orb-signature are required" };
    }
    if (nonce.length < 8 || nonce.length > 128) {
      return { ok: false, status: 401, error: "nonce must be 8-128 characters" };
    }

    const now = this.#options.now();
    const sent = Number(timestamp);
    if (!Number.isFinite(sent)) return { ok: false, status: 401, error: "timestamp must be numeric" };

    const skew = Math.abs(now - sent);
    if (skew > this.#options.maxSkewMs) {
      return { ok: false, status: 401, error: `timestamp is ${skew}ms out, limit is ${this.#options.maxSkewMs}ms` };
    }

    const expected = createHmac("sha256", secret).update(`${timestamp}.${nonce}.${body}`, "utf8").digest("hex");
    if (!secretEquals(signature, expected)) {
      return { ok: false, status: 401, error: "signature does not verify" };
    }

    // Rate limiting happens *after* authentication so an unauthenticated caller
    // cannot exhaust a legitimate caller's budget.
    if (!this.#limiter.allow(scope, now)) {
      return { ok: false, status: 429, error: "rate limit exceeded" };
    }

    if (!this.#nonces.accept(`${scope}:${nonce}`, now)) {
      return { ok: false, status: 409, error: "nonce has already been used" };
    }

    return { ok: true };
  }

  async #readBody(request: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = chunk as Buffer;
      size += buffer.length;
      if (size > this.#options.maxBodyBytes) {
        // Stop reading, but do not destroy the socket: the caller still has to
        // send a 413, and a destroyed socket would surface as a transport error
        // rather than the refusal we mean.
        break;
      }
      chunks.push(buffer);
    }
    if (size > this.#options.maxBodyBytes) {
      throw new Error(`body exceeds ${this.#options.maxBodyBytes} bytes`);
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  #send(response: ServerResponse, status: number, body: unknown): void {
    const text = JSON.stringify(body);
    response.writeHead(status, {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(text),
      // This API is not for browsers, and should never be reachable from one.
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    response.end(text);
  }
}

function header(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function parseField(body: string, field: string): string | undefined {
  try {
    const parsed = JSON.parse(body || "{}") as Record<string, unknown>;
    const value = parsed[field];
    return typeof value === "string" && value.length > 0 && value.length <= 512 ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Signs a request the way the API expects.
 *
 * Exported so a provider integration and the tests use the same code path —
 * a signing helper that disagrees with the verifier is its own class of bug.
 */
export function signRequest(
  secret: string,
  body: string,
  timestamp: number,
  nonce: string,
): Record<string, string> {
  return {
    "x-orb-timestamp": String(timestamp),
    "x-orb-nonce": nonce,
    "x-orb-signature": createHmac("sha256", secret)
      .update(`${timestamp}.${nonce}.${body}`, "utf8")
      .digest("hex"),
    "content-type": "application/json",
  };
}
