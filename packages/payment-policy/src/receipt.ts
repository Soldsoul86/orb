/**
 * A spend receipt: evidence that does not ask to be trusted.
 *
 * Most audit trails are an assertion. *"Our system authorised this; here is
 * our log."* A reader who does not already trust the issuer learns nothing
 * from it, because the log and the claim have the same author.
 *
 * A receipt here is different, and the difference is the whole point of
 * everything under it being pure and deterministic: it carries the request,
 * the policy, and the ledger the decision was made against — so **a reader
 * can re-run the decision themselves and check it comes out the same.** Not
 * "trust my answer" but "here is the input and the rule; compute it yourself."
 *
 * That property is only available because `evaluate` reads no clock, performs
 * no I/O and consults nothing global. Determinism is usually defended as a
 * testing convenience. This is what it is actually for.
 *
 * ## The redaction trade-off, stated rather than hidden
 *
 * Full recomputation needs the ledger as it stood at decision time, and that
 * ledger contains other transactions. For a self-audit or a regulator that is
 * fine. For a receipt handed to a counterparty it may not be — you would be
 * disclosing your other spending to prove one payment.
 *
 * So both `policy` and `ledgerContext` may be omitted. A redacted receipt
 * still proves a great deal: that the events hash to their own contents, that
 * the outcome matches them, that the decision names a specific policy by
 * digest. It simply cannot prove the decision was *correct*. `verifyReceipt`
 * reports exactly which checks it could and could not perform — a verifier
 * that quietly downgraded would be worse than one that refuses.
 */
import { canonicalJson, verifyEvent, type OrbEvent } from "@orb/journal";
import { createHash } from "node:crypto";

import type { Amount, SpendRequest } from "./model.js";
import type { SpendPolicy } from "./policy.js";
import { policyDigest } from "./policy.js";
import type { Decision } from "./evaluate.js";
import { evaluate } from "./evaluate.js";
import type { LedgerEntry, LedgerState } from "./ledger.js";

export const RECEIPT_VERSION = 1;

export interface ReceiptOutcome {
  readonly state: LedgerState;
  /** What was really spent. Zero for a reversal. */
  readonly amount: Amount;
}

export interface SpendReceipt {
  readonly version: number;
  readonly issuedAt: number;
  readonly request: SpendRequest;
  readonly decision: Decision;
  /** The exact policy text. `null` when redacted. */
  readonly policy: SpendPolicy | null;
  /** The ledger as the decision saw it. `null` when redacted. */
  readonly ledgerContext: readonly LedgerEntry[] | null;
  /** The journal events behind this request, each self-verifying. */
  readonly facts: readonly OrbEvent[];
  readonly outcome: ReceiptOutcome;
}

export interface BuildReceiptInput {
  readonly request: SpendRequest;
  readonly decision: Decision;
  readonly outcome: ReceiptOutcome;
  readonly facts: readonly OrbEvent[];
  readonly issuedAt: number;
  /** Omit to redact. See the note on the trade-off above. */
  readonly policy?: SpendPolicy;
  /** Omit to redact. */
  readonly ledgerContext?: readonly LedgerEntry[];
}

export function buildReceipt(input: BuildReceiptInput): SpendReceipt {
  return {
    version: RECEIPT_VERSION,
    issuedAt: input.issuedAt,
    request: input.request,
    decision: input.decision,
    policy: input.policy ?? null,
    ledgerContext: input.ledgerContext ?? null,
    facts: input.facts,
    outcome: input.outcome,
  };
}

/* -- Wire form ------------------------------------------------------------ */

/**
 * Amounts become decimal strings on the wire.
 *
 * `canonicalJson` refuses `bigint`, and it is right to: JSON has no
 * unambiguous encoding for one, and a `Number` would silently round a receipt
 * for a large payment into a lie.
 */
function toWire(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString(10);
  if (Array.isArray(value)) return value.map(toWire);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, toWire(v)]),
    );
  }
  return value;
}

/** Canonical bytes for a receipt: key order fixed, amounts as decimal strings. */
export function encodeReceipt(receipt: SpendReceipt): string {
  return canonicalJson(toWire(receipt));
}

/** The receipt's content hash. Two receipts with the same facts hash alike. */
export function receiptDigest(receipt: SpendReceipt): string {
  return createHash("sha256").update(encodeReceipt(receipt), "utf8").digest("hex");
}

/* -- Verification --------------------------------------------------------- */

export type CheckStatus = "PASS" | "FAIL" | "SKIPPED";

export interface ReceiptCheck {
  readonly name: string;
  readonly status: CheckStatus;
  readonly detail: string;
}

export interface VerificationResult {
  /** True only when every check that ran passed and none was skipped. */
  readonly verified: boolean;
  /** True when everything checkable passed, but something was redacted. */
  readonly partial: boolean;
  readonly checks: readonly ReceiptCheck[];
}

const pass = (name: string, detail: string): ReceiptCheck => ({ name, status: "PASS", detail });
const fail = (name: string, detail: string): ReceiptCheck => ({ name, status: "FAIL", detail });
const skip = (name: string, detail: string): ReceiptCheck => ({ name, status: "SKIPPED", detail });

/**
 * Checks a receipt without trusting whoever issued it.
 *
 * Nothing here consults a network or the issuer's storage: everything is
 * recomputed from the receipt's own contents. Each check is reported
 * individually, and a check that could not run says so rather than being
 * silently dropped.
 */
export function verifyReceipt(receipt: SpendReceipt): VerificationResult {
  const checks: ReceiptCheck[] = [];

  /* 1. Is this a shape we understand? A future version may mean anything. */
  checks.push(
    receipt.version === RECEIPT_VERSION
      ? pass("VERSION", `receipt version ${receipt.version}`)
      : fail("VERSION", `unsupported receipt version ${receipt.version}`),
  );

  /* 2. Does each journal event still hash to its own contents? */
  if (receipt.facts.length === 0) {
    checks.push(skip("FACTS_INTACT", "receipt carries no journal events"));
  } else {
    const broken = receipt.facts.filter((event) => !verifyEvent(event));
    checks.push(
      broken.length === 0
        ? pass("FACTS_INTACT", `${receipt.facts.length} event(s) hash to their contents`)
        : fail("FACTS_INTACT", `${broken.length} event(s) have been altered`),
    );
  }

  /* 3. Do the events actually concern this request? */
  const foreign = receipt.facts.filter(
    (event) =>
      !(
        typeof event.payload === "object" &&
        event.payload !== null &&
        (event.payload as Record<string, unknown>)["requestId"] === receipt.request.requestId
      ),
  );
  checks.push(
    receipt.facts.length === 0
      ? skip("FACTS_MATCH_REQUEST", "no events to match")
      : foreign.length === 0
        ? pass("FACTS_MATCH_REQUEST", `all events name ${receipt.request.requestId}`)
        : fail("FACTS_MATCH_REQUEST", `${foreign.length} event(s) name a different request`),
  );

  /* 4. Was the decision made under the policy that is attached? */
  if (receipt.policy === null) {
    checks.push(skip("POLICY_BINDING", "policy redacted; decision names it only by digest"));
  } else {
    const digest = policyDigest(receipt.policy);
    checks.push(
      digest === receipt.decision.policyDigest
        ? pass("POLICY_BINDING", `policy matches digest ${digest.slice(0, 12)}`)
        : fail("POLICY_BINDING", "attached policy is not the one the decision names"),
    );
  }

  /* 5. The one that matters: re-run the decision and compare. */
  if (receipt.policy === null || receipt.ledgerContext === null) {
    checks.push(
      skip(
        "DECISION_REPRODUCES",
        receipt.policy === null ? "policy redacted" : "ledger context redacted",
      ),
    );
  } else {
    const recomputed = evaluate(receipt.request, receipt.policy, receipt.ledgerContext);
    const same = canonicalJson(toWire(recomputed)) === canonicalJson(toWire(receipt.decision));
    checks.push(
      same
        ? pass("DECISION_REPRODUCES", `recomputed independently: ${recomputed.outcome}`)
        : fail(
            "DECISION_REPRODUCES",
            `recomputing gives ${recomputed.outcome}, receipt claims ${receipt.decision.outcome}`,
          ),
    );
  }

  /* 6. Does the stated outcome match what the events say happened? */
  checks.push(outcomeCheck(receipt));

  const ran = checks.filter((c) => c.status !== "SKIPPED");
  const failed = ran.some((c) => c.status === "FAIL");
  const skipped = checks.some((c) => c.status === "SKIPPED");

  return { verified: !failed && !skipped, partial: !failed && skipped, checks };
}

function outcomeCheck(receipt: SpendReceipt): ReceiptCheck {
  const last = receipt.facts.at(-1);
  if (last === undefined) return skip("OUTCOME_CONSISTENT", "no events to compare against");

  const expected: Record<string, LedgerState> = {
    "payment.reserved": "PENDING",
    "payment.settled": "SETTLED",
    "payment.reversed": "REVERSED",
  };
  const impliedState = expected[last.type];
  if (impliedState === undefined) {
    return fail("OUTCOME_CONSISTENT", `final event ${last.type} is not a ledger fact`);
  }
  if (impliedState !== receipt.outcome.state) {
    return fail(
      "OUTCOME_CONSISTENT",
      `events end in ${impliedState}, receipt claims ${receipt.outcome.state}`,
    );
  }

  if (last.type === "payment.settled") {
    const payload = last.payload as Record<string, unknown>;
    const settled = payload["actualAmount"];
    if (typeof settled !== "string" || BigInt(settled) !== receipt.outcome.amount) {
      return fail(
        "OUTCOME_CONSISTENT",
        `settlement event says ${String(settled)}, receipt claims ${receipt.outcome.amount}`,
      );
    }
  }

  return pass("OUTCOME_CONSISTENT", `events and outcome agree on ${impliedState}`);
}

/** A short human-readable verification report. */
export function explainVerification(result: VerificationResult): string {
  const header = result.verified
    ? "VERIFIED — every check passed"
    : result.partial
      ? "PARTIAL — everything checkable passed, but some evidence was redacted"
      : "FAILED";
  const mark: Record<CheckStatus, string> = { PASS: "ok  ", FAIL: "FAIL", SKIPPED: "  - " };
  const body = result.checks
    .map((c) => `  ${mark[c.status]}  ${c.name}\n        ${c.detail}`)
    .join("\n");
  return `${header}\n${body}`;
}
