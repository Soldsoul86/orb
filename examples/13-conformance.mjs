#!/usr/bin/env node
/**
 * The same seven questions, asked of two clients.
 *
 *   node examples/13-conformance.mjs
 *
 * One is the reference x402 client as shipped. The other is the same client
 * behind the guard. Neither is a strawman: the reference client's own spend
 * controls are enabled, with an explicit per-payment cap.
 *
 * The point of the grid is not that one column is greener. It is that the
 * questions are askable at all -- every property here is a thing a client
 * either does or does not do when the settlement outcome is unknown, and
 * until you script the ambiguous paths, nobody finds out which.
 */
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { MemoryLedgerStore, SpendGuard, singlePolicy } from "@spendcap/policy";
import { guardX402 } from "@spendcap/x402";
import { runBattery, compare, format } from "@spendcap/x402-conformance";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const NETWORK = "eip155:8453";
const ASSET = `${NETWORK}/${USDC}`;

const newClient = (scheme) =>
  new x402Client()
    .register(NETWORK, scheme)
    // The client's own controls stay on, with the cap explicit.
    .setSpendControls({ allowedAssets: true, maxAmountPerPayment: "$1" });

/** The reference client, as shipped. No ledger, so the ledger properties are n/a. */
const reference = {
  paying: (scheme, serverFetch) => {
    const pay = wrapFetchWithPayment(serverFetch, newClient(scheme));
    return (url) => pay(url);
  },
};

/** The same client behind the guard. */
const guarded = () => {
  let store = null;
  return {
    paying: (scheme, serverFetch) => {
      store = new MemoryLedgerStore();
      const policy = {
        account: "acct",
        version: 1,
        rules: [
          { id: "cap", kind: "PER_TRANSACTION_LIMIT", scope: { kind: "ANY" }, asset: ASSET, maxAmount: 1_000_000n },
        ],
      };
      const guard = new SpendGuard({ store, policyFor: singlePolicy(policy) });
      const g = guardX402(newClient(scheme), {
        guard,
        account: "acct",
        requester: { kind: "AGENT", agentId: "buyer" },
      });
      const pay = g.fetch(serverFetch);
      return (url) => pay(url);
    },
    ledger: async () => (store === null ? [] : (await store.entries("acct")).map((e) => e.state)),
  };
};

const a = await runBattery("reference", reference);
const b = await runBattery("guarded", guarded());

console.log("\n" + compare([a, b]) + "\n");
console.log(format(a) + "\n");
console.log(format(b) + "\n");
