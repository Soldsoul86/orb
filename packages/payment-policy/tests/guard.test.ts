/**
 * The shell around the engine.
 *
 * Two behaviours carry this file. The first is the concurrency test: ten
 * callers racing for a budget that fits three, which only passes because
 * `authorize` never suspends between reading the ledger and writing the
 * reservation. The second is what happens when an operation throws — the
 * guard refuses to guess whether the money moved, because a connection reset
 * before the call left and a lost response after the vendor charged look
 * identical from here.
 */
import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";

import type { Decision, GuardOutcome, SpendPolicy, SpendRequest } from "../src/index.js";
import {
  ANY_REQUESTER,
  ManualClock,
  MemoryLedgerStore,
  SpendGuard,
  singlePolicy,
} from "../src/index.js";

const ACCOUNT = "acct:research-agent";
const TOKENS = "anthropic:tokens";
const T0 = Date.UTC(2026, 8, 16, 4, 0, 0);

/** Budget for three calls of 1,000 tokens each, per hour. */
const policy: SpendPolicy = {
  account: ACCOUNT,
  version: 7,
  rules: [
    { id: "assets", kind: "ASSET_ALLOWLIST", scope: ANY_REQUESTER, assets: [TOKENS] },
    {
      id: "hourly",
      kind: "WINDOW_BUDGET",
      scope: ANY_REQUESTER,
      asset: TOKENS,
      windowMs: 3_600_000,
      maxTotal: 3_000n,
    },
  ],
};

function build(overrides: Partial<{ onDecision: (d: Decision, r: SpendRequest) => void }> = {}) {
  const store = new MemoryLedgerStore();
  const clock = new ManualClock(T0);
  const guard = new SpendGuard({
    store,
    clock,
    policyFor: singlePolicy(policy),
    ...(overrides.onDecision === undefined ? {} : { onDecision: overrides.onDecision }),
  });
  return { store, clock, guard };
}

const draft = (requestId: string, amount = 1_000n) => ({
  requestId,
  account: ACCOUNT,
  requester: { kind: "AGENT", agentId: "researcher" } as const,
  asset: TOKENS,
  amount,
  destination: "vendor:api",
});

describe("the critical section", () => {
  it("ten racing callers cannot overspend a budget that fits three", async () => {
    const { guard } = build();

    // Every call suspends inside its operation. If `authorize` suspended too,
    // all ten would observe an empty budget and all ten would be allowed.
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        guard.run(draft(`req-${i}`), async () => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          return "done";
        }),
      ),
    );

    const completed = results.filter((r) => r.outcome === "COMPLETED");
    const refused = results.filter((r) => r.outcome === "REFUSED");
    strictEqual(completed.length, 3);
    strictEqual(refused.length, 7);
  });

  it("a refusal names the budget it hit", async () => {
    const { guard } = build();
    await guard.run(draft("a", 3_000n), async () => "done");
    const blocked = await guard.run(draft("b"), async () => "done");

    strictEqual(blocked.outcome, "REFUSED");
    if (blocked.outcome !== "REFUSED") return;
    strictEqual(blocked.decision.outcome, "DENY");
    if (blocked.decision.outcome !== "DENY") return;
    strictEqual(blocked.decision.reason, "BUDGET_EXHAUSTED");
    strictEqual(blocked.decision.ruleId, "hourly");
  });
});

describe("recording what actually happened", () => {
  it("settles at the reported figure, not the estimate", async () => {
    const { guard, store } = build();
    const result = await guard.run(draft("a", 1_000n), async (grant) => {
      grant.report(742n);
      return "done";
    });

    strictEqual(result.outcome, "COMPLETED");
    if (result.outcome !== "COMPLETED") return;
    strictEqual(result.reserved, 1_000n);
    strictEqual(result.actual, 742n);
    strictEqual(result.overage, 0n);
    strictEqual((await store.find("a"))?.amount, 742n);
  });

  it("records an overage rather than pretending it did not happen", async () => {
    const { guard, store } = build();
    const result = await guard.run(draft("a", 1_000n), async (grant) => {
      grant.report(1_400n);
      return "done";
    });

    strictEqual(result.outcome, "COMPLETED");
    if (result.outcome !== "COMPLETED") return;
    strictEqual(result.actual, 1_400n);
    strictEqual(result.overage, 400n);
    strictEqual((await store.find("a"))?.amount, 1_400n);
  });

  it("the next decision sees the true figure, so the budget self-corrects", async () => {
    const { guard } = build();
    // Two calls estimated at 1,000 that each really cost 1,400 leave only 200
    // of the 3,000 budget, not 1,000.
    for (const id of ["a", "b"]) {
      await guard.run(draft(id, 1_000n), async (grant) => {
        grant.report(1_400n);
        return "done";
      });
    }
    const third = await guard.run(draft("c", 1_000n), async () => "done");
    strictEqual(third.outcome, "REFUSED");
  });

  it("settles at the estimate when the operation reports nothing", async () => {
    const { guard, store } = build();
    await guard.run(draft("a", 900n), async () => "done");
    strictEqual((await store.find("a"))?.amount, 900n);
    strictEqual((await store.find("a"))?.state, "SETTLED");
  });
});

describe("when the operation fails", () => {
  it("holds the reservation when it cannot know whether money moved", async () => {
    const { guard, store } = build();
    const result = await guard.run(draft("a"), async () => {
      throw new Error("socket hang up");
    });

    strictEqual(result.outcome, "INDETERMINATE");
    // Still open, still consuming budget. Guessing would be the expensive
    // kind of wrong.
    strictEqual((await store.find("a"))?.state, "PENDING");
  });

  it("settles at zero when the operation proves nothing was spent", async () => {
    const { guard, store } = build();
    const result = await guard.run(draft("a"), async (grant) => {
      grant.report(0n);
      throw new Error("rejected before dispatch");
    });

    strictEqual(result.outcome, "FAILED");
    if (result.outcome !== "FAILED") return;
    strictEqual(result.actual, 0n);
    strictEqual((await store.find("a"))?.state, "SETTLED");
    strictEqual((await store.find("a"))?.amount, 0n);
  });

  it("a zero-cost attempt still counts against a velocity limit", async () => {
    const store = new MemoryLedgerStore();
    const clock = new ManualClock(T0);
    const guard = new SpendGuard({
      store,
      clock,
      policyFor: singlePolicy({
        account: ACCOUNT,
        version: 1,
        rules: [
          { id: "rate", kind: "WINDOW_VELOCITY", scope: ANY_REQUESTER, windowMs: 3_600_000, maxCount: 1 },
        ],
      }),
    });

    await guard.run(draft("a"), async (grant) => {
      grant.report(0n);
      throw new Error("failed");
    });
    // It cost nothing, but it happened.
    strictEqual((await guard.run(draft("b"), async () => "done")).outcome, "REFUSED");
  });

  it("settles what a failing operation admits it spent", async () => {
    const { guard, store } = build();
    const result = await guard.run(draft("a", 1_000n), async (grant) => {
      grant.report(600n);
      throw new Error("parse error after the vendor charged");
    });

    strictEqual(result.outcome, "FAILED");
    if (result.outcome !== "FAILED") return;
    strictEqual(result.actual, 600n);
    strictEqual((await store.find("a"))?.amount, 600n);
  });

  it("surfaces held reservations for reconciliation", async () => {
    const { guard, clock } = build();
    await guard.run(draft("a"), async () => {
      throw new Error("socket hang up");
    });

    strictEqual((await guard.openReservations(60_000)).length, 0);
    clock.advance(61_000);
    const stale = await guard.openReservations(60_000);
    strictEqual(stale.length, 1);
    strictEqual(stale[0]?.requestId, "a");
  });
});

describe("retries", () => {
  it("a repeated request id never spends twice", async () => {
    const { guard } = build();
    const first = await guard.run(draft("same"), async () => "done");
    const second = await guard.run(draft("same"), async () => "done");

    strictEqual(first.outcome, "COMPLETED");
    strictEqual(second.outcome, "DUPLICATE");
    if (second.outcome !== "DUPLICATE") return;
    strictEqual(second.existing.requestId, "same");
  });

  it("a duplicate does not run the operation at all", async () => {
    const { guard } = build();
    let runs = 0;
    const op = async () => {
      runs += 1;
      return "done";
    };
    await guard.run(draft("same"), op);
    await guard.run(draft("same"), op);
    strictEqual(runs, 1);
  });
});

describe("policy source", () => {
  it("an unknown account has no policy, so nothing moves", async () => {
    const { guard } = build();
    const result = await guard.run({ ...draft("a"), account: "acct:unknown" }, async () => "done");

    strictEqual(result.outcome, "REFUSED");
    if (result.outcome !== "REFUSED") return;
    strictEqual(result.decision.outcome, "DENY");
    if (result.decision.outcome !== "DENY") return;
    strictEqual(result.decision.reason, "NO_POLICY");
  });
});

describe("the journal seam", () => {
  it("every decision is offered, allowed and refused alike", async () => {
    const seen: Decision[] = [];
    const { guard } = build({ onDecision: (decision) => seen.push(decision) });

    await guard.run(draft("a", 3_000n), async () => "done");
    await guard.run(draft("b"), async () => "done");

    deepStrictEqual(
      seen.map((d) => d.outcome),
      ["ALLOW", "DENY"],
    );
    // Every record carries the provenance a replay needs.
    for (const decision of seen) {
      strictEqual(decision.policyVersion, 7);
      strictEqual(decision.policyDigest.length, 64);
    }
  });

  it("a duplicate is not offered as a fresh decision", async () => {
    const seen: Decision[] = [];
    const { guard } = build({ onDecision: (decision) => seen.push(decision) });
    await guard.run(draft("same"), async () => "done");
    await guard.run(draft("same"), async () => "done");
    strictEqual(seen.length, 1);
  });
});

describe("the clock", () => {
  it("stamps the request, and a draft may override it", async () => {
    const { guard, clock } = build();
    clock.set(T0 + 5_000);
    const auth = await guard.authorize(draft("a"));
    ok(auth.granted);
    strictEqual(auth.request.requestedAt, T0 + 5_000);

    const fixed = await guard.authorize({ ...draft("b"), requestedAt: T0 });
    ok(fixed.granted);
    strictEqual(fixed.request.requestedAt, T0);
  });

  it("budget windows move with it", async () => {
    const { guard, clock } = build();
    await guard.run(draft("a", 3_000n), async () => "done");
    strictEqual((await guard.run(draft("b"), async () => "done")).outcome, "REFUSED");

    clock.advance(3_600_001);
    const later: GuardOutcome<string> = await guard.run(draft("c"), async () => "done");
    strictEqual(later.outcome, "COMPLETED");
  });
});
