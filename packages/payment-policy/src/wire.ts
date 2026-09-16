/**
 * The one encoding everything hashes and signs over.
 *
 * Three modules needed "canonical bytes for this object" and two of them had
 * grown their own copy. Art. IX §33 — never duplicate a source of truth —
 * applies to an encoding as much as to data: two encoders that agree today
 * will disagree after one of them is edited, and then a signature made by one
 * fails under the other for no visible reason.
 *
 * Amounts become decimal strings because `canonicalJson` refuses `bigint`,
 * and it is right to. JSON has no unambiguous encoding for one, and a
 * `Number` would silently round a large payment into a lie.
 */
import { canonicalJson } from "@orb/journal";
import { createHash } from "node:crypto";

/** Replaces every `bigint` with its decimal string, recursively. */
export function toWire(value: unknown): unknown {
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

/** Canonical text: keys sorted, no incidental whitespace, amounts as strings. */
export function canonicalText(value: unknown): string {
  return canonicalJson(toWire(value));
}

/** The bytes a signature is made over. */
export function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(canonicalText(value), "utf8");
}

/** SHA-256 hex over the canonical text. */
export function digestOf(value: unknown): string {
  return createHash("sha256").update(canonicalText(value), "utf8").digest("hex");
}
