/**
 * Evidence that does not ask to be trusted.
 *
 * The test that carries this file is the tampering one: a receipt whose
 * numbers have been edited must fail verification even though it was issued by
 * the system itself. If a receipt can be quietly altered, it is a log with
 * extra steps.
 */
import { ok, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";

import { Journal, MemoryJournalStore } from "@orb/journal";

import type { SpendPolicy, SpendReceipt } from "../src/index.js";
import {
  ANY_REQUESTER,
  JournalLedgerStore,
  ManualClock,
  SpendGuard,
  buildReceipt,
  encodeReceipt,
  receiptDigest,
  singlePolicy,
  verifyReceipt,
} from "../src/index.js";

const ACCOUNT = "acct:research-agent";
const TOKENS = "anthropic:tokens";
const T0 = Date.UTC(2026, 8, 16, 4, 0, 0);

const policy: SpendPolicy = {
  account: ACCOUNT,
  version: 3,
  rules: [
    { id: "assets", kind: "ASSET_ALLOWLIST", scope: ANY_REQUESTER, assets: [TOKENS] },
    {
      id: "daily",
      kind: "WINDOW_BUDGET",
      scope: ANY_REQUESTER,
      asset: TOKENS,
      windowMs: 86_400_000,
      maxTotal: 10_000n,
    },
  ],
};

const draft = (requestId: string, amount = 4_000n) => ({
  requestId,
  account: ACCOUNT,
  requester: { kind: "AGENT", agentId: "researcher" } as const,
  asset: TOKENS,
  amount,
  destination: "vendor:messages-api",
});

/** Runs one real spend and issues a receipt for it, the way a caller would. */
async function spendAndReceipt(
  requestId = "call-1",
  amount = 4_000n,
  redact: { policy?: boolean; ledger?: boolean } = {},
): Promise<SpendReceipt> {
  const journal = await Journal.open({
    lane: "device-a",
    device: "device-a",
    store: new MemoryJournalStore(),
  });
  const store = await JournalLedgerStore.open({ journal });
  const clock = new ManualClock(T0);
  const guard = new SpendGuard({ store, clock, policyFor: singlePolicy(policy) });

  // The ledger as the decision will see it, captured before the reservation.
  const contextBefore = await store.entries(ACCOUNT);

  const auth = await guard.authorize(draft(requestId, amount));
  ok(auth.granted);
  await auth.settle(3_100n);

  return buildReceipt({
    request: auth.request,
    decision: auth.decision,
    outcome: { state: "SETTLED", amount: 3_100n },
    facts: store.factsFor(requestId),
    issuedAt: T0 + 1_000,
    ...(redact.policy === true ? {} : { policy }),
    ...(redact.ledger === true ? {} : { ledgerContext: contextBefore }),
  });
}

describe("a complete receipt", () => {
  it("verifies end to end", async () => {
    const result = verifyReceipt(await spendAndReceipt());
    strictEqual(result.verified, true, JSON.stringify(result.checks, null, 2));
    strictEqual(result.partial, false);
  });

  it("proves the decision by recomputing it, not by asserting it", async () => {
    const result = verifyReceipt(await spendAndReceipt());
    const reproduced = result.checks.find((c) => c.name === "DECISION_REPRODUCES");
    strictEqual(reproduced?.status, "PASS");
    ok(reproduced.detail.includes("recomputed independently"));
  });

  it("binds the decision to the exact policy text", async () => {
    const result = verifyReceipt(await spendAndReceipt());
    strictEqual(result.checks.find((c) => c.name === "POLICY_BINDING")?.status, "PASS");
  });
});

describe("tampering", () => {
  it("rejects an edited amount", async () => {
    const receipt = await spendAndReceipt("call-1", 4_000n);
    const forged: SpendReceipt = {
      ...receipt,
      request: { ...receipt.request, amount: 400_000n },
    };
    const result = verifyReceipt(forged);
    strictEqual(result.verified, false);
    strictEqual(result.checks.find((c) => c.name === "DECISION_REPRODUCES")?.status, "FAIL");
  });

  it("rejects a swapped policy", async () => {
    const receipt = await spendAndReceipt();
    const looser: SpendPolicy = {
      ...policy,
      rules: [
        { id: "assets", kind: "ASSET_ALLOWLIST", scope: ANY_REQUESTER, assets: [TOKENS] },
        {
          id: "daily",
          kind: "WINDOW_BUDGET",
          scope: ANY_REQUESTER,
          asset: TOKENS,
          windowMs: 86_400_000,
          maxTotal: 10_000_000n,
        },
      ],
    };
    const result = verifyReceipt({ ...receipt, policy: looser });
    strictEqual(result.verified, false);
    strictEqual(result.checks.find((c) => c.name === "POLICY_BINDING")?.status, "FAIL");
  });

  it("rejects an altered journal event", async () => {
    const receipt = await spendAndReceipt();
    const first = receipt.facts[0];
    ok(first !== undefined);
    const altered = {
      ...first,
      payload: { ...(first.payload as Record<string, unknown>), amount: "999999" },
    };
    const result = verifyReceipt({ ...receipt, facts: [altered, ...receipt.facts.slice(1)] });
    strictEqual(result.verified, false);
    strictEqual(result.checks.find((c) => c.name === "FACTS_INTACT")?.status, "FAIL");
  });

  it("rejects an outcome the events do not support", async () => {
    const receipt = await spendAndReceipt();
    const result = verifyReceipt({ ...receipt, outcome: { state: "SETTLED", amount: 99n } });
    strictEqual(result.verified, false);
    strictEqual(result.checks.find((c) => c.name === "OUTCOME_CONSISTENT")?.status, "FAIL");
  });

  it("rejects events belonging to a different request", async () => {
    const mine = await spendAndReceipt("call-1");
    const theirs = await spendAndReceipt("call-2");
    const result = verifyReceipt({ ...mine, facts: theirs.facts });
    strictEqual(result.checks.find((c) => c.name === "FACTS_MATCH_REQUEST")?.status, "FAIL");
  });

  it("rejects an unknown receipt version", async () => {
    const receipt = await spendAndReceipt();
    const result = verifyReceipt({ ...receipt, version: 99 });
    strictEqual(result.verified, false);
    strictEqual(result.checks.find((c) => c.name === "VERSION")?.status, "FAIL");
  });
});

describe("redaction", () => {
  it("a receipt without the ledger is partial, not verified", async () => {
    const result = verifyReceipt(await spendAndReceipt("call-1", 4_000n, { ledger: true }));
    strictEqual(result.verified, false);
    strictEqual(result.partial, true);
    strictEqual(result.checks.find((c) => c.name === "DECISION_REPRODUCES")?.status, "SKIPPED");
    // What survives redaction still matters.
    strictEqual(result.checks.find((c) => c.name === "FACTS_INTACT")?.status, "PASS");
    strictEqual(result.checks.find((c) => c.name === "POLICY_BINDING")?.status, "PASS");
  });

  it("a receipt without the policy cannot bind or reproduce", async () => {
    const result = verifyReceipt(await spendAndReceipt("call-1", 4_000n, { policy: true }));
    strictEqual(result.partial, true);
    strictEqual(result.checks.find((c) => c.name === "POLICY_BINDING")?.status, "SKIPPED");
    strictEqual(result.checks.find((c) => c.name === "DECISION_REPRODUCES")?.status, "SKIPPED");
    strictEqual(result.checks.find((c) => c.name === "OUTCOME_CONSISTENT")?.status, "PASS");
  });

  it("a redacted receipt still fails when its evidence is forged", async () => {
    const receipt = await spendAndReceipt("call-1", 4_000n, { ledger: true, policy: true });
    const result = verifyReceipt({ ...receipt, outcome: { state: "REVERSED", amount: 0n } });
    strictEqual(result.verified, false);
    strictEqual(result.partial, false);
  });
});

describe("the wire form", () => {
  it("encodes bigints losslessly and hashes stably", async () => {
    const receipt = await spendAndReceipt();
    const encoded = encodeReceipt(receipt);
    ok(encoded.includes('"3100"'), "amounts are decimal strings, never Numbers");
    strictEqual(receiptDigest(receipt), receiptDigest(receipt));
  });

  it("a different receipt hashes differently", async () => {
    const a = await spendAndReceipt("call-1");
    const b = await spendAndReceipt("call-2");
    ok(receiptDigest(a) !== receiptDigest(b));
  });
});
