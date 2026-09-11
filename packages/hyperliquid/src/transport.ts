/**
 * HTTP transport for the Hyperliquid REST endpoints.
 *
 * The transport is a port, not a hard dependency on `fetch`: tests drive the
 * whole adapter through an in-memory implementation, and a future runtime can
 * route requests through a device's own network policy.
 *
 * Failures are classified rather than thrown raw, because the executor's
 * failure policy depends on the distinction. A timeout might mean the order
 * *was* placed; a 400 means it certainly was not.
 */

/** Why a request failed, in the terms the executor reasons about. */
export type TransportFailureKind =
  /** No response at all: timeout, DNS, connection reset. The action may have landed. */
  | "unreachable"
  /** The exchange answered but rejected the request outright. The action did not land. */
  | "rejected"
  /** The exchange answered with a server-side error. Retryable; may have landed. */
  | "server_error"
  /** The exchange answered with something we cannot parse. */
  | "malformed";

export class TransportError extends Error {
  override readonly name = "TransportError";
  constructor(
    message: string,
    readonly kind: TransportFailureKind,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message);
  }

  /**
   * Whether the request definitely had no effect on the exchange.
   *
   * Only a clean rejection is definite. Everything else must be reconciled
   * against the exchange before the executor draws any conclusion.
   */
  get definitelyNotApplied(): boolean {
    return this.kind === "rejected";
  }
}

export interface HttpRequest {
  readonly url: string;
  readonly body: unknown;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

/** Performs one POST and returns the parsed JSON body. */
export type HttpTransport = (request: HttpRequest) => Promise<unknown>;

/** The default transport, over the platform `fetch`. */
export function fetchTransport(): HttpTransport {
  return async ({ url, body, timeoutMs, signal }) => {
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: combined,
      });
    } catch (cause) {
      const aborted = signal?.aborted === true;
      throw new TransportError(
        aborted ? "request cancelled" : `cannot reach ${url}: ${describe(cause)}`,
        "unreachable",
      );
    }

    const text = await response.text().catch(() => "");
    if (!response.ok) {
      throw new TransportError(
        `${url} responded ${response.status}`,
        response.status >= 500 ? "server_error" : "rejected",
        response.status,
        text.slice(0, 2000),
      );
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new TransportError(`${url} returned non-JSON`, "malformed", response.status, text.slice(0, 2000));
    }
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Wraps a transport with bounded retries and exponential backoff.
 *
 * Retries apply only to reads and to failures that are safe to repeat. The
 * exchange client never retries an order on its own: a duplicate order is far
 * worse than a failed one, and the executor resolves that ambiguity by
 * reconciling against the exchange instead.
 */
export function withRetry(
  transport: HttpTransport,
  options: { attempts?: number; baseDelayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): HttpTransport {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 150;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  return async (request) => {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        return await transport(request);
      } catch (error) {
        lastError = error;
        const retryable =
          error instanceof TransportError &&
          (error.kind === "unreachable" || error.kind === "server_error");
        if (!retryable || attempt === attempts - 1) throw error;
        await sleep(baseDelayMs * 2 ** attempt);
      }
    }
    throw lastError;
  };
}
