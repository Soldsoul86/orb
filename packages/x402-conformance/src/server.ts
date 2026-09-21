/**
 * A scriptable resource server and facilitator, in one `fetch`.
 *
 * Only the network and the signature are simulated. The 402 challenge, the
 * headers and their codecs are the real `@x402/core` ones, so a client cannot
 * pass by talking to a shape we invented.
 *
 * The facilitator settles each nonce exactly once. That is the single fact
 * every property here rests on: if the same purchase settles twice, two
 * authorizations were minted, and the client is the only thing that could
 * have minted them.
 */
import {
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
  decodePaymentSignatureHeader,
} from "@x402/core/http";
import type { Network } from "@x402/core/types";

/** How the server behaves on the next request carrying a signature. */
export type Fault =
  /** Settle, then lose the response. Indistinguishable, from the client, from a request that never left. */
  | { readonly kind: "lose-response-after-settling" }
  /** Settle, then answer 402 with a non-terminal code. The money moved; the wire says "pay". */
  | { readonly kind: "pending-402" }
  /** Settle, then answer 200 with no payment header at all. */
  | { readonly kind: "no-payment-header" }
  /** Settle, then answer 200 with bytes that are not a payment response. */
  | { readonly kind: "unreadable-header" }
  /** Refuse to settle, terminally. Nothing moves. */
  | { readonly kind: "settle-failed"; readonly reason?: string }
  /** Refuse a nonce that has already settled, as a replay-protecting facilitator does. */
  | { readonly kind: "reject-replay" }
  /** Quote different terms. A different price is a different purchase. */
  | { readonly kind: "reprice"; readonly amount: string };

export interface ScriptedServer {
  readonly fetch: typeof globalThis.fetch;
  /** Distinct nonces the facilitator has settled. The ground truth of this harness. */
  settlements(): number;
  /** Arms a fault for the next signed request. One shot unless `sticky`. */
  fault(f: Fault, sticky?: boolean): void;
}

export interface ServerOptions {
  readonly url?: string;
  /** CAIP-2, e.g. `eip155:8453`. */
  readonly network?: Network;
  readonly asset?: string;
  readonly amount?: string;
  readonly payTo?: string;
}

const DEFAULTS = {
  url: "https://data.example/quote",
  network: "eip155:8453" as Network,
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  amount: "10000",
  payTo: "0xSeller",
} as const;

export function scriptedServer(options: ServerOptions = {}): ScriptedServer {
  const o = { ...DEFAULTS, ...options };
  const settled = new Map<string, { transaction: string }>();
  let armed: Fault | null = null;
  let sticky = false;
  let price = o.amount;

  const terms = () => ({
    scheme: "exact",
    network: o.network,
    asset: o.asset,
    amount: price,
    payTo: o.payTo,
    maxTimeoutSeconds: 60,
    extra: {},
  });
  const challenge = (error?: string) => ({
    x402Version: 2,
    resource: { url: o.url },
    accepts: [terms()],
    ...(error === undefined ? {} : { error }),
  });

  const take = (): Fault | null => {
    const f = armed;
    if (!sticky) armed = null;
    return f;
  };

  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input as string | URL | Request, init);
    const signature = request.headers.get("PAYMENT-SIGNATURE");

    if (signature === null) {
      return new Response("", {
        status: 402,
        headers: { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(challenge()) },
      });
    }

    // The payload is `Record<string, unknown>` to the codec; the nonce is the
    // scheme's business. We only need its identity, so read it as a string
    // and let a scheme that omits one fail loudly rather than silently.
    const decoded = decodePaymentSignatureHeader(signature);
    const nonce = String((decoded.payload as Record<string, unknown>)["nonce"]);
    const fault = take();

    if (fault?.kind === "reprice") {
      price = fault.amount;
      return new Response("", {
        status: 402,
        headers: { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(challenge()) },
      });
    }

    if (fault?.kind === "reject-replay" && settled.has(nonce)) {
      return new Response("", {
        status: 402,
        headers: {
          "PAYMENT-REQUIRED": encodePaymentRequiredHeader(
            challenge("invalid_exact_evm_payload_authorization_nonce_used"),
          ),
        },
      });
    }

    if (fault?.kind === "settle-failed") {
      // Nothing is recorded: this is the one path where the money provably
      // did not move, and the only one where a client may free its budget.
      return new Response("", {
        status: 402,
        headers: {
          "PAYMENT-RESPONSE": encodePaymentResponseHeader({
            success: false,
            errorReason: fault.reason ?? "insufficient_funds",
            transaction: "",
            network: o.network,
          }),
        },
      });
    }

    // Everything below settles first. Whatever the response then does or
    // fails to do, the money has moved.
    if (!settled.has(nonce)) settled.set(nonce, { transaction: `0xtx${settled.size + 1}` });
    const receipt = {
      success: true,
      transaction: settled.get(nonce)!.transaction,
      network: o.network,
      payer: "0xAgent",
    };

    switch (fault?.kind) {
      case "lose-response-after-settling":
        throw new TypeError("fetch failed");
      case "pending-402":
        return new Response("", {
          status: 402,
          headers: {
            "PAYMENT-RESPONSE": encodePaymentResponseHeader({
              success: false,
              errorReason: "settlement_pending",
              transaction: receipt.transaction,
              network: o.network,
            }),
          },
        });
      case "no-payment-header":
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      case "unreadable-header":
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "PAYMENT-RESPONSE": "not-a-payment-response" },
        });
      default:
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "PAYMENT-RESPONSE": encodePaymentResponseHeader(receipt) },
        });
    }
  };

  return {
    fetch,
    settlements: () => settled.size,
    fault: (f, s = false) => {
      armed = f;
      sticky = s;
    },
  };
}
