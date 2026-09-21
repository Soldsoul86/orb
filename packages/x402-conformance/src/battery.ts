/**
 * The properties a client must satisfy when it cannot tell what happened.
 *
 * Every one is about **uncertainty**. A client that only ever meets a server
 * that answers clearly needs none of this; the properties exist because the
 * ambiguous paths are where money is lost, and because they are the paths
 * nobody exercises.
 *
 * The harness never asks the client what it thinks happened. It reads the
 * facilitator's settlement count and the client's own ledger, because a
 * client that is wrong about what happened will report that wrongness
 * confidently.
 */
import { scriptedServer, type ScriptedServer } from "./server.js";

/**
 * A scheme stub the harness owns, so it can count authorizations.
 *
 * Signing is where the double-spend happens, so the count has to be taken at
 * the point of signature rather than inferred from traffic.
 */
export interface CountingScheme {
  readonly scheme: string;
  createPaymentPayload(
    x402Version: number,
    requirements: { amount: string },
  ): Promise<{ x402Version: number; payload: { nonce: string; amount: string } }>;
  /** Authorizations minted since the last reset. */
  count(): number;
}

/** What a client under test must expose. Deliberately small. */
export interface ClientUnderTest {
  /**
   * Builds a paying fetch over the scripted server.
   *
   * Given the harness's scheme so signatures are counted, and a fresh state
   * per property so one scenario cannot leak into the next.
   */
  readonly paying: (
    scheme: CountingScheme,
    serverFetch: typeof globalThis.fetch,
  ) => (url: string) => Promise<Response>;
  /**
   * Reservations the client is holding without resolution, if it holds any.
   *
   * Optional: a client with no ledger simply cannot satisfy the properties
   * that name it, and the report says so rather than failing silently.
   */
  readonly held?: () => number;
  /** Ledger entry states, if the client keeps a ledger. */
  readonly ledger?: () => Promise<readonly string[]>;
}

export interface Property {
  readonly id: string;
  readonly title: string;
  /** Why this matters, in one sentence, for the report. */
  readonly because: string;
  run(server: ScriptedServer, client: ClientUnderTest, scheme: CountingScheme): Promise<Verdict>;
}

export type Verdict =
  | { readonly ok: true; readonly detail: string }
  | { readonly ok: false; readonly detail: string }
  /** The client does not expose what this property needs. Not a failure. */
  | { readonly ok: null; readonly detail: string };

const URL_ = "https://data.example/quote";

/**
 * Held means held: neither settled nor reversed.
 *
 * The first draft of P5 and P7 only rejected `REVERSED`, which let a client
 * pass by making the opposite mistake -- recording a settlement on evidence it
 * could not read. A negative control caught it. Both errors cost money; a
 * property that only names one of them is half a property.
 */
function stillHeld(states: readonly string[]): boolean {
  return states.every((s) => s !== "SETTLED" && s !== "REVERSED");
}
const swallow = async (p: Promise<Response>): Promise<Response | Error> =>
  p.catch((e: unknown) => (e instanceof Error ? e : new Error(String(e))));

export const PROPERTIES: readonly Property[] = [
  {
    id: "P1",
    title: "a lost response does not become a second payment",
    because:
      "A response lost after settlement is indistinguishable from a request that never left; a client that answers both by signing again has paid twice.",
    async run(server, client, scheme) {
      const pay = client.paying(scheme, server.fetch);
      server.fault({ kind: "lose-response-after-settling" });
      await swallow(pay(URL_));
      await swallow(pay(URL_));
      const s = server.settlements();
      return s === 1
        ? { ok: true, detail: `settled once across a lost response and a retry (signatures: ${scheme.count()})` }
        : { ok: false, detail: `settled ${s} times for one purchase (signatures: ${scheme.count()})` };
    },
  },
  {
    id: "P2",
    title: "settlement_pending is not a fresh challenge",
    because:
      "`settlement_pending` is non-terminal: the transaction may still confirm. Re-signing on it obtains a second authorization while the first is still live.",
    async run(server, client, scheme) {
      const pay = client.paying(scheme, server.fetch);
      server.fault({ kind: "pending-402" });
      await swallow(pay(URL_));
      const after = scheme.count();
      await swallow(pay(URL_));
      const s = server.settlements();
      return s === 1
        ? { ok: true, detail: `settled once; ${scheme.count()} authorization(s) minted (${after} before the retry)` }
        : { ok: false, detail: `settled ${s} times: the pending 402 was read as a demand to pay again` };
    },
  },
  {
    id: "P3",
    title: "a response with no payment header is unresolved",
    because:
      "Silence about the outcome is not a report of failure. The money may have moved and the client has no evidence either way.",
    async run(server, client, scheme) {
      const pay = client.paying(scheme, server.fetch);
      server.fault({ kind: "no-payment-header" });
      await swallow(pay(URL_));
      if (client.ledger === undefined) {
        return { ok: null, detail: "client keeps no ledger, so it cannot record an unresolved spend" };
      }
      const states = await client.ledger();
      return stillHeld(states)
        ? { ok: true, detail: `held as ${states.join(",") || "(nothing)"} — neither settled nor reversed` }
        : { ok: false, detail: `resolved to ${states.join(",")} on no evidence at all` };
    },
  },
  {
    id: "P4",
    title: "a terminal failure frees the budget",
    because:
      "The opposite error is just as expensive: a client that holds budget against a payment that provably did not happen stops working for no reason.",
    async run(server, client, scheme) {
      const pay = client.paying(scheme, server.fetch);
      server.fault({ kind: "settle-failed" });
      await swallow(pay(URL_));
      if (server.settlements() !== 0) {
        return { ok: false, detail: "the harness settled something on a failure path (harness bug)" };
      }
      if (client.ledger === undefined) {
        return { ok: null, detail: "client keeps no ledger, so there is no budget to free" };
      }
      const states = await client.ledger();
      return states.every((s) => s === "REVERSED")
        ? { ok: true, detail: `reversed (${states.join(",")}) — nothing moved, budget returned` }
        : { ok: false, detail: `left as ${states.join(",")} though the facilitator settled nothing` };
    },
  },
  {
    id: "P5",
    title: "a refused re-presentation stays unresolved",
    because:
      "A facilitator that has already consumed the nonce refuses the replay with the same 402 it uses for a bad signature. Reading that as 'nothing moved' hands back budget for money that is gone.",
    async run(server, client, scheme) {
      const pay = client.paying(scheme, server.fetch);
      server.fault({ kind: "lose-response-after-settling" });
      await swallow(pay(URL_));
      server.fault({ kind: "reject-replay" }, true);
      await swallow(pay(URL_));
      if (client.ledger === undefined) {
        return { ok: null, detail: "client keeps no ledger" };
      }
      const states = await client.ledger();
      return stillHeld(states)
        ? { ok: true, detail: `held as ${states.join(",")} — the refusal proves nothing about the first presentation` }
        : { ok: false, detail: `resolved to ${states.join(",")}; a refused replay proves neither outcome` };
    },
  },
  {
    id: "P6",
    title: "different terms are a different purchase",
    because:
      "A server that quotes a new price is not retrying the old purchase. Absorbing that as a duplicate would pay the old price, or refuse a legitimate sale.",
    async run(server, client, scheme) {
      const pay = client.paying(scheme, server.fetch);
      server.fault({ kind: "reprice", amount: "20000" });
      await swallow(pay(URL_));
      await swallow(pay(URL_));
      return server.settlements() >= 1
        ? { ok: true, detail: `repriced terms produced a purchase judged afresh (${scheme.count()} authorization(s))` }
        : { ok: false, detail: "the repriced purchase was absorbed as a duplicate and never paid" };
    },
  },
  {
    id: "P7",
    title: "an unreadable settle response is unresolved",
    because:
      "Bytes a reader cannot parse carry no outcome. Defaulting them to failure is the same mistake as defaulting them to success, and costs the same.",
    async run(server, client, scheme) {
      const pay = client.paying(scheme, server.fetch);
      server.fault({ kind: "unreadable-header" });
      await swallow(pay(URL_));
      if (client.ledger === undefined) {
        return { ok: null, detail: "client keeps no ledger" };
      }
      const states = await client.ledger();
      return stillHeld(states)
        ? { ok: true, detail: `held as ${states.join(",")} — unreadable bytes carry no outcome` }
        : { ok: false, detail: `resolved to ${states.join(",")} from bytes it could not read` };
    },
  },
];

export { scriptedServer };
