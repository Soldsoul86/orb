/**
 * The relation a zero-knowledge circuit would enforce — written in plain code.
 *
 * ## THIS IS NOT ZERO-KNOWLEDGE
 *
 * `IS_ZERO_KNOWLEDGE` is exported as `false` so a caller can assert on it.
 * A {@link BudgetProofBundle} **contains its witness in the clear**. Anyone
 * holding one sees the policy, the request and the ledger entries. Handing one
 * to a counterparty discloses exactly what a real proof would hide.
 *
 * So why build it? Because the cryptography is not the hard part, and it is
 * not the part that has to come first.
 *
 * A circuit is useless without a **statement** — a precise split of what is
 * public from what is private, and a relation between them expressible as
 * arithmetic. Getting that wrong produces a proof of the wrong thing, which is
 * worse than no proof. And a circuit needs a **test oracle**: you write the
 * relation twice, once in the constraint system and once in ordinary code, and
 * check they agree on every input. Ordinary code is the half that can exist
 * today, and it is the half a cryptographer needs in order to write the other.
 *
 * ## The statement
 *
 * Public — what a counterparty, auditor or regulator sees:
 *
 *   policyDigest     which rules were in force (not what they say)
 *   ledgerRoot       a commitment to the payer's ledger (not its contents)
 *   requestDigest    which payment (the counterparty already knows this one)
 *   requestedAt      when
 *   claimedOutcome   ALLOW
 *
 * Private — the witness a real circuit keeps:
 *
 *   policy           including the limits, which stay secret
 *   request          the amount and destination
 *   windowEntries    the payer's *other* transactions, which is the point
 *
 * The valuable property is that **the limit itself stays private.** You prove
 * "this was within my budget" without revealing what the budget is, or what
 * else you spent it on.
 *
 * ## The constraints
 *
 * C1  hash(policy) == policyDigest                    binds the rules
 * C2  hash(request) == requestDigest                  binds the payment
 * C3  request.requestedAt == statement.requestedAt    binds the time
 * C4  each witness entry is included under ledgerRoot Merkle path check
 * C5  each witness entry lies inside the window       two comparisons
 * C6  sum(entries) + amount <= maxTotal               addition, one comparison
 *
 * C4 dominates the cost. A SHA-256 Merkle path is tens of thousands of
 * constraints per step; a real circuit swaps in a hash built for the field
 * (Poseidon, Rescue) and the tree here would be rebuilt with it. C1–C3 are
 * also SHA-256 today and would move for the same reason. C5 and C6 are
 * integer comparisons and are nearly free.
 *
 * ## What this relation cannot do, and no circuit written against it could
 *
 * **It cannot prove the witness is complete.** A prover who omits an in-window
 * entry produces a smaller sum, and every constraint above still passes. A
 * Merkle tree proves membership; it does not prove that nothing else exists.
 *
 * That is a property of the commitment, not of the proving system, so no
 * amount of cryptography bolted on later fixes it. The fix is a different
 * commitment: commit to a **running total per (account, asset, window)**
 * rather than to individual entries, so the circuit proves inclusion of one
 * aggregate leaf and completeness becomes the committer's responsibility —
 * discharged by the journal's hash chain, which already exists.
 *
 * {@link checkBudgetRelation} reports this as an *assumption*, separately from
 * the constraints it actually checks, because a result that quietly folded an
 * unchecked assumption in with six checked constraints would be a lie told by
 * a data structure.
 */
import type { LedgerEntry } from "./ledger.js";
import type { SpendRequest } from "./model.js";
import type { SpendPolicy } from "./policy.js";
import { policyDigest } from "./policy.js";
import { consumesBudget } from "./ledger.js";
import { digestOf } from "./wire.js";
import type { InclusionProof } from "./commitment.js";
import { verifyInclusion } from "./commitment.js";

/**
 * Exported as a constant so a caller can assert on it, and so this claim
 * appears in a type-checked place rather than only in prose.
 */
export const IS_ZERO_KNOWLEDGE = false;

/** A circuit is fixed-size; the witness must be bounded before it is written. */
export const MAX_WINDOW_ENTRIES = 64;

export interface BudgetStatement {
  readonly policyDigest: string;
  readonly ledgerRoot: string;
  readonly requestDigest: string;
  readonly requestedAt: number;
  readonly claimedOutcome: "ALLOW";
}

export interface WitnessEntry {
  readonly entry: LedgerEntry;
  readonly inclusion: InclusionProof;
}

/** Everything a real circuit would hide. Present here, in the clear. */
export interface BudgetWitness {
  readonly policy: SpendPolicy;
  readonly request: SpendRequest;
  /** The rule being proven against; must be a `WINDOW_BUDGET` in `policy`. */
  readonly ruleId: string;
  readonly windowEntries: readonly WitnessEntry[];
}

/**
 * A statement and the witness for it.
 *
 * Named a bundle rather than a proof on purpose: a proof is the thing you can
 * hand over *instead of* the witness, and this is not that.
 */
export interface BudgetProofBundle {
  readonly statement: BudgetStatement;
  readonly witness: BudgetWitness;
}

export type ConstraintId = "C1" | "C2" | "C3" | "C4" | "C5" | "C6";

export interface ConstraintResult {
  readonly id: ConstraintId;
  readonly name: string;
  readonly satisfied: boolean;
  readonly detail: string;
}

export interface RelationResult {
  /** True when every constraint above holds. Says nothing about completeness. */
  readonly satisfied: boolean;
  readonly constraints: readonly ConstraintResult[];
  /**
   * Things the relation takes on trust.
   *
   * Reported apart from `constraints` because folding an unchecked assumption
   * in with checked constraints would let a caller believe six things were
   * verified when only five were.
   */
  readonly assumptions: readonly string[];
  /** Always false here. See the file header. */
  readonly zeroKnowledge: boolean;
}

const ok = (id: ConstraintId, name: string, detail: string): ConstraintResult => ({
  id,
  name,
  satisfied: true,
  detail,
});
const bad = (id: ConstraintId, name: string, detail: string): ConstraintResult => ({
  id,
  name,
  satisfied: false,
  detail,
});

/**
 * Evaluates the relation exactly as a circuit would, over revealed values.
 *
 * Total: every failure is a `satisfied: false` constraint, never an exception.
 * A constraint system cannot throw, so neither can its reference
 * implementation — otherwise the two disagree on malformed input, which is
 * precisely where a circuit gets attacked.
 */
export function checkBudgetRelation(bundle: BudgetProofBundle): RelationResult {
  const { statement, witness } = bundle;
  const constraints: ConstraintResult[] = [];

  /* C1 — the rules in force are the ones named, without revealing them. */
  const computedPolicy = policyDigest(witness.policy);
  constraints.push(
    computedPolicy === statement.policyDigest
      ? ok("C1", "policy binding", `policy hashes to ${computedPolicy.slice(0, 12)}`)
      : bad("C1", "policy binding", "witness policy does not hash to the stated digest"),
  );

  /* C2 — the payment is the one named. */
  const computedRequest = digestOf(witness.request);
  constraints.push(
    computedRequest === statement.requestDigest
      ? ok("C2", "request binding", `request hashes to ${computedRequest.slice(0, 12)}`)
      : bad("C2", "request binding", "witness request does not hash to the stated digest"),
  );

  /* C3 — the instant is the one named. Windows are measured from it. */
  constraints.push(
    witness.request.requestedAt === statement.requestedAt
      ? ok("C3", "time binding", `evaluated at ${statement.requestedAt}`)
      : bad("C3", "time binding", "request time disagrees with the statement"),
  );

  const rule = witness.policy.rules.find(
    (r) => r.id === witness.ruleId && r.kind === "WINDOW_BUDGET",
  );
  if (rule === undefined || rule.kind !== "WINDOW_BUDGET") {
    constraints.push(bad("C4", "inclusion", `no WINDOW_BUDGET rule named ${witness.ruleId}`));
    constraints.push(bad("C5", "window", "no rule to bound the window"));
    constraints.push(bad("C6", "budget", "no rule to bound the total"));
    return finish(constraints);
  }

  if (witness.windowEntries.length > MAX_WINDOW_ENTRIES) {
    constraints.push(
      bad("C4", "inclusion", `witness holds ${witness.windowEntries.length}, circuit fits ${MAX_WINDOW_ENTRIES}`),
    );
    constraints.push(bad("C5", "window", "witness exceeds the circuit's fixed size"));
    constraints.push(bad("C6", "budget", "witness exceeds the circuit's fixed size"));
    return finish(constraints);
  }

  /* C4 — every entry in the witness really is in the committed ledger. */
  const seen = new Set<number>();
  let duplicated = false;
  const notIncluded = witness.windowEntries.filter((w) => {
    // A prover could otherwise present one entry twice — harmless for a sum
    // that must stay *under* a limit, but not for any other use of this
    // witness, so it is refused here rather than assumed benign.
    if (seen.has(w.inclusion.index)) duplicated = true;
    seen.add(w.inclusion.index);
    return !verifyInclusion(w.entry, w.inclusion, statement.ledgerRoot);
  });
  constraints.push(
    duplicated
      ? bad("C4", "inclusion", "witness presents the same leaf twice")
      : notIncluded.length === 0
        ? ok("C4", "inclusion", `${witness.windowEntries.length} entr(ies) proven under the root`)
        : bad("C4", "inclusion", `${notIncluded.length} entr(ies) are not under the stated root`),
  );

  /* C5 — every entry lies inside the window the rule defines. */
  const from = statement.requestedAt - rule.windowMs;
  const outside = witness.windowEntries.filter(
    (w) => w.entry.at < from || w.entry.at > statement.requestedAt,
  );
  constraints.push(
    outside.length === 0
      ? ok("C5", "window", `all entries within ${rule.windowMs}ms`)
      : bad("C5", "window", `${outside.length} entr(ies) fall outside the window`),
  );

  /* C6 — the sum, plus this payment, is inside the private limit. */
  let spent = 0n;
  for (const w of witness.windowEntries) {
    // Mirrors the engine exactly: same asset, still holding budget, and never
    // the request judging itself.
    if (w.entry.asset !== rule.asset) continue;
    if (!consumesBudget(w.entry)) continue;
    if (w.entry.requestId === witness.request.requestId) continue;
    spent += w.entry.amount;
  }
  const projected = spent + witness.request.amount;
  constraints.push(
    projected <= rule.maxTotal
      ? ok("C6", "budget", `${projected} within the limit`)
      : bad("C6", "budget", `${projected} exceeds the limit`),
  );

  return finish(constraints);
}

function finish(constraints: readonly ConstraintResult[]): RelationResult {
  return {
    satisfied: constraints.every((c) => c.satisfied),
    constraints,
    assumptions: [
      "COMPLETENESS: the witness is assumed to hold every in-window entry. " +
        "A Merkle tree proves membership, never that nothing else exists. " +
        "Fixed by committing to a running total per (account, asset, window) " +
        "instead of to individual entries.",
    ],
    zeroKnowledge: IS_ZERO_KNOWLEDGE,
  };
}

/** A short report that never lets the reader forget what this is. */
export function explainRelation(result: RelationResult): string {
  const header = result.satisfied
    ? "RELATION HOLDS  (not a zero-knowledge proof — the witness is revealed)"
    : "RELATION FAILS";
  const body = result.constraints
    .map((c) => `  ${c.satisfied ? "ok  " : "FAIL"}  ${c.id}  ${c.name}\n        ${c.detail}`)
    .join("\n");
  const assumed = result.assumptions.map((a) => `  ASSUMED  ${a}`).join("\n");
  return `${header}\n${body}\n${assumed}`;
}
