/**
 * The relation a circuit would enforce.
 *
 * Two groups matter. The soundness group forges each constraint in turn and
 * checks it is caught — a relation that cannot be broken by a test is one
 * nobody has tried to break. The honesty group asserts the things this
 * deliberately does *not* provide, so that if someone later makes it look like
 * a zero-knowledge proof, these tests fail.
 */
import { ok, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";

import type { BudgetProofBundle, LedgerEntry, SpendPolicy, SpendRequest } from "../src/index.js";
import {
  ANY_REQUESTER,
  IS_ZERO_KNOWLEDGE,
  LedgerCommitment,
  checkBudgetRelation,
  digestOf,
  policyDigest,
} from "../src/index.js";

const T0 = Date.UTC(2026, 8, 16, 4, 0, 0);
const ACCOUNT = "acct:research-agent";
const TOKENS = "anthropic:tokens";

const policy: SpendPolicy = {
  account: ACCOUNT,
  version: 5,
  rules: [
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

const entry = (id: string, amount: bigint, at = T0 - 60_000): LedgerEntry => ({
  requestId: id,
  account: ACCOUNT,
  asset: TOKENS,
  amount,
  destination: "vendor:api",
  requester: { kind: "AGENT", agentId: "researcher" },
  at,
  state: "SETTLED",
});

const request: SpendRequest = {
  requestId: "call-9",
  account: ACCOUNT,
  requester: { kind: "AGENT", agentId: "researcher" },
  asset: TOKENS,
  amount: 2_000n,
  destination: "vendor:api",
  requestedAt: T0,
  approvals: [],
  attestations: [],
  memo: null,
};

/** Builds an honest bundle over a ledger the payer would rather not reveal. */
function bundle(ledger: readonly LedgerEntry[] = [entry("a", 3_000n), entry("b", 4_000n)]): BudgetProofBundle {
  const commitment = new LedgerCommitment(ledger);
  return {
    statement: {
      policyDigest: policyDigest(policy),
      ledgerRoot: commitment.root,
      requestDigest: digestOf(request),
      requestedAt: T0,
      claimedOutcome: "ALLOW",
    },
    witness: {
      policy,
      request,
      ruleId: "daily",
      windowEntries: ledger.map((e, i) => ({ entry: e, inclusion: commitment.prove(i)! })),
    },
  };
}

const constraint = (b: BudgetProofBundle, id: string) =>
  checkBudgetRelation(b).constraints.find((c) => c.id === id);

describe("an honest bundle", () => {
  it("satisfies every constraint", () => {
    const result = checkBudgetRelation(bundle());
    strictEqual(result.satisfied, true, JSON.stringify(result.constraints, null, 2));
    strictEqual(result.constraints.length, 6);
  });

  it("proves compliance without the statement carrying the limit", () => {
    // The whole point: 10,000 appears nowhere in the public half.
    const { statement } = bundle();
    const publicText = JSON.stringify(statement);
    ok(!publicText.includes("10000"));
    ok(!publicText.includes("3000"));
    ok(!publicText.includes("4000"));
  });
});

describe("soundness — each constraint catches its own forgery", () => {
  it("C1 catches a swapped policy", () => {
    const b = bundle();
    const looser: SpendPolicy = {
      ...policy,
      rules: [{ ...policy.rules[0]!, maxTotal: 10_000_000n } as SpendPolicy["rules"][number]],
    };
    strictEqual(constraint({ ...b, witness: { ...b.witness, policy: looser } }, "C1")?.satisfied, false);
  });

  it("C2 catches a swapped request", () => {
    const b = bundle();
    const bigger = { ...request, amount: 9_000n };
    strictEqual(constraint({ ...b, witness: { ...b.witness, request: bigger } }, "C2")?.satisfied, false);
  });

  it("C3 catches a shifted evaluation time", () => {
    const b = bundle();
    const shifted = { ...b, statement: { ...b.statement, requestedAt: T0 + 1 } };
    strictEqual(constraint(shifted, "C3")?.satisfied, false);
  });

  it("C4 catches an entry that is not in the committed ledger", () => {
    const b = bundle();
    const invented = { ...b.witness.windowEntries[0]!, entry: entry("ghost", 1n) };
    const forged = {
      ...b,
      witness: { ...b.witness, windowEntries: [invented, b.witness.windowEntries[1]!] },
    };
    strictEqual(constraint(forged, "C4")?.satisfied, false);
  });

  it("C4 catches the same leaf presented twice", () => {
    const b = bundle();
    const doubled = {
      ...b,
      witness: { ...b.witness, windowEntries: [b.witness.windowEntries[0]!, b.witness.windowEntries[0]!] },
    };
    strictEqual(constraint(doubled, "C4")?.satisfied, false);
  });

  it("C5 catches an entry dragged in from outside the window", () => {
    const stale = [entry("a", 3_000n), entry("old", 4_000n, T0 - 86_400_001)];
    strictEqual(constraint(bundle(stale), "C5")?.satisfied, false);
  });

  it("C6 catches a payment that does not fit", () => {
    const heavy = [entry("a", 5_000n), entry("b", 4_000n)];
    const b = bundle(heavy);
    strictEqual(constraint(b, "C6")?.satisfied, false);
    strictEqual(checkBudgetRelation(b).satisfied, false);
  });

  it("refuses a rule that is not a window budget, rather than guessing", () => {
    const b = bundle();
    const result = checkBudgetRelation({ ...b, witness: { ...b.witness, ruleId: "nonexistent" } });
    strictEqual(result.satisfied, false);
  });
});

describe("mirrors the engine, not an approximation of it", () => {
  it("a reversed entry gives its budget back, exactly as evaluate does", () => {
    // 7,000 + a reversed 5,000 + the 2,000 request = 9,000 of a 10,000 limit.
    // Counting the reversal would push it to 14,000 and fail.
    const ledger = [entry("a", 7_000n), { ...entry("b", 5_000n), state: "REVERSED" as const }];
    strictEqual(checkBudgetRelation(bundle(ledger)).satisfied, true);
  });

  it("a different asset does not consume this budget", () => {
    // The USDC entry is huge on purpose: counting it would blow the limit.
    const ledger = [entry("a", 7_000n), { ...entry("b", 90_000n), asset: "USDC" }];
    strictEqual(checkBudgetRelation(bundle(ledger)).satisfied, true);
  });

  it("the request never counts against itself", () => {
    const ledger = [entry("call-9", 9_000n), entry("b", 100n)];
    // Same requestId as the request under proof, so it is excluded — the
    // idempotency rule the engine follows.
    strictEqual(checkBudgetRelation(bundle(ledger)).satisfied, true);
  });
});

describe("honesty", () => {
  it("does not claim to be zero-knowledge", () => {
    strictEqual(IS_ZERO_KNOWLEDGE, false);
    strictEqual(checkBudgetRelation(bundle()).zeroKnowledge, false);
  });

  it("carries the witness in the clear, and says so", () => {
    const b = bundle();
    // If this ever stops being true, the type has changed and the docs must too.
    ok(b.witness.policy !== undefined);
    ok(b.witness.windowEntries.length > 0);
  });

  it("reports completeness as an assumption, not a constraint", () => {
    const result = checkBudgetRelation(bundle());
    strictEqual(result.constraints.some((c) => c.name.includes("complete")), false);
    ok(result.assumptions.some((a) => a.startsWith("COMPLETENESS")));
  });

  it("an omitted entry still satisfies every constraint — which is the gap", () => {
    const full = [entry("a", 3_000n), entry("b", 4_000n), entry("c", 9_000n)];
    const commitment = new LedgerCommitment(full);
    // The prover simply leaves out the entry that would break the budget.
    const dishonest: BudgetProofBundle = {
      statement: {
        policyDigest: policyDigest(policy),
        ledgerRoot: commitment.root,
        requestDigest: digestOf(request),
        requestedAt: T0,
        claimedOutcome: "ALLOW",
      },
      witness: {
        policy,
        request,
        ruleId: "daily",
        windowEntries: [0, 1].map((i) => ({ entry: full[i]!, inclusion: commitment.prove(i)! })),
      },
    };

    // Every constraint holds. The relation is satisfied. The claim is false.
    // A Merkle tree proves membership; it cannot prove nothing else exists.
    strictEqual(checkBudgetRelation(dishonest).satisfied, true);
    ok(checkBudgetRelation(dishonest).assumptions.length > 0);
  });
});
