/**
 * The Hyperliquid `/exchange` endpoint — the only place Orb acts on the market.
 *
 * This is a Capability in the kernel's sense (CAPABILITY_MODEL.md): it declares
 * its effects, it is irreversible-tier, and it records nothing itself — the
 * caller appends the Action and the resulting Observation to the journal.
 *
 * Two rules are enforced here and nowhere else:
 *
 * 1. **Orders are never retried inside the client.** A retried order can double
 *    a position. When submission fails ambiguously, the caller reconciles
 *    against the exchange instead of guessing.
 * 2. **A `status: "ok"` envelope is not a filled order.** The per-order status
 *    is parsed and returned structurally so the caller cannot mistake an
 *    accepted request for an executed trade (Constitution Art. XI §42).
 */
import type { HttpTransport } from "./transport.js";
import { TransportError } from "./transport.js";
import type { Wallet } from "./keys.js";
import { signL1Action, createNonceSource, type HyperliquidNetwork, type L1Action } from "./signing.js";
import type { OrderGrouping, OrderResponse, OrderStatusEntry, OrderWire } from "./types.js";
import { MAINNET_API, TESTNET_API } from "./types.js";

export interface ExchangeClientOptions {
  readonly network: HyperliquidNetwork;
  readonly transport: HttpTransport;
  readonly wallet: Wallet;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  /** Trade on behalf of a vault or sub-account rather than the signer. */
  readonly vaultAddress?: `0x${string}`;
  readonly nonceSource?: () => number;
}

/** What actually happened to one submitted order, after parsing the envelope. */
export type OrderOutcome =
  | { readonly kind: "resting"; readonly oid: number; readonly cloid?: `0x${string}` }
  | {
      readonly kind: "filled";
      readonly oid: number;
      readonly totalSz: string;
      readonly avgPx: string;
      readonly cloid?: `0x${string}`;
    }
  | { readonly kind: "waiting"; readonly detail: "waitingForFill" | "waitingForTrigger" }
  | { readonly kind: "rejected"; readonly reason: string };

export class ExchangeClient {
  readonly #transport: HttpTransport;
  readonly #wallet: Wallet;
  readonly #network: HyperliquidNetwork;
  readonly #url: string;
  readonly #timeoutMs: number;
  readonly #vaultAddress: `0x${string}` | undefined;
  readonly #nonce: () => number;

  constructor(options: ExchangeClientOptions) {
    this.#transport = options.transport;
    this.#wallet = options.wallet;
    this.#network = options.network;
    const base = options.baseUrl ?? (options.network === "testnet" ? TESTNET_API : MAINNET_API);
    this.#url = `${base.replace(/\/$/, "")}/exchange`;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
    this.#vaultAddress = options.vaultAddress;
    this.#nonce = options.nonceSource ?? createNonceSource();
  }

  get address(): `0x${string}` {
    return this.#wallet.address;
  }

  /** The account whose positions these orders affect — the vault, if trading one. */
  get tradingAccount(): `0x${string}` {
    return this.#vaultAddress ?? this.#wallet.address;
  }

  async #submit(action: L1Action, signal?: AbortSignal): Promise<unknown> {
    const nonce = this.#nonce();
    const input = {
      action,
      nonce,
      ...(this.#vaultAddress ? { vaultAddress: this.#vaultAddress } : {}),
    };
    const signature = signL1Action(this.#wallet, input, this.#network);

    return this.#transport({
      url: this.#url,
      body: {
        action,
        nonce,
        signature,
        ...(this.#vaultAddress ? { vaultAddress: this.#vaultAddress } : {}),
      },
      timeoutMs: this.#timeoutMs,
      ...(signal ? { signal } : {}),
    });
  }

  /**
   * Places one or more orders.
   *
   * @returns one {@link OrderOutcome} per submitted order, in order.
   * @throws {TransportError} when the request itself failed. The caller must
   *   treat this as *unknown*, not as "no order was placed", unless
   *   {@link TransportError.definitelyNotApplied} says otherwise.
   */
  async placeOrders(
    orders: readonly OrderWire[],
    grouping: OrderGrouping = "na",
    signal?: AbortSignal,
  ): Promise<readonly OrderOutcome[]> {
    if (orders.length === 0) return [];

    // Key order is load-bearing: it is hashed exactly as written.
    const action: L1Action = { type: "order", orders: orders as never, grouping };
    const raw = await this.#submit(action, signal);
    return parseOrderResponse(raw, orders.length);
  }

  /** Cancels resting orders by exchange order id. */
  async cancelOrders(
    cancels: readonly { readonly asset: number; readonly oid: number }[],
    signal?: AbortSignal,
  ): Promise<void> {
    if (cancels.length === 0) return;
    const action: L1Action = {
      type: "cancel",
      cancels: cancels.map((c) => ({ a: c.asset, o: c.oid })),
    };
    const raw = await this.#submit(action, signal);
    assertOk(raw, "cancel");
  }

  /** Cancels resting orders by client order id. */
  async cancelOrdersByCloid(
    cancels: readonly { readonly asset: number; readonly cloid: `0x${string}` }[],
    signal?: AbortSignal,
  ): Promise<void> {
    if (cancels.length === 0) return;
    const action: L1Action = {
      type: "cancelByCloid",
      cancels: cancels.map((c) => ({ asset: c.asset, cloid: c.cloid })),
    };
    const raw = await this.#submit(action, signal);
    assertOk(raw, "cancelByCloid");
  }

  /** Sets cross or isolated leverage for one asset. */
  async updateLeverage(
    asset: number,
    leverage: number,
    isCross: boolean,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!Number.isInteger(leverage) || leverage < 1) {
      throw new RangeError(`leverage must be a positive integer, got ${leverage}`);
    }
    const action: L1Action = { type: "updateLeverage", asset, isCross, leverage };
    const raw = await this.#submit(action, signal);
    assertOk(raw, "updateLeverage");
  }
}

function assertOk(raw: unknown, what: string): void {
  const envelope = raw as { status?: string; response?: unknown };
  if (envelope?.status !== "ok") {
    throw new TransportError(`${what} rejected: ${JSON.stringify(raw).slice(0, 500)}`, "rejected");
  }
}

/** Turns the exchange's status union into outcomes the executor can act on. */
export function parseOrderResponse(raw: unknown, expected: number): readonly OrderOutcome[] {
  const envelope = raw as OrderResponse | undefined;
  if (envelope?.status !== "ok") {
    // A top-level error applies to the whole batch.
    const reason =
      typeof envelope?.response === "string"
        ? envelope.response
        : JSON.stringify(raw).slice(0, 500);
    return Array.from({ length: expected }, () => ({ kind: "rejected", reason }) as const);
  }

  const response = envelope.response;
  if (response.type !== "order" || !Array.isArray((response.data as { statuses?: unknown })?.statuses)) {
    throw new TransportError(`malformed order response: ${JSON.stringify(raw).slice(0, 500)}`, "malformed");
  }

  const statuses = (response.data as { statuses: readonly OrderStatusEntry[] }).statuses;
  return statuses.map(toOutcome);
}

function toOutcome(status: OrderStatusEntry): OrderOutcome {
  if (status === "waitingForFill" || status === "waitingForTrigger") {
    return { kind: "waiting", detail: status };
  }
  if ("resting" in status) {
    return {
      kind: "resting",
      oid: status.resting.oid,
      ...(status.resting.cloid ? { cloid: status.resting.cloid } : {}),
    };
  }
  if ("filled" in status) {
    return {
      kind: "filled",
      oid: status.filled.oid,
      totalSz: status.filled.totalSz,
      avgPx: status.filled.avgPx,
      ...(status.filled.cloid ? { cloid: status.filled.cloid } : {}),
    };
  }
  return { kind: "rejected", reason: status.error };
}
