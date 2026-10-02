/**
 * The vectors the phone's Kotlin `RelativeDays` is held to: the hand-written cases, serialised. Not computed from either
 * implementation — each is checked against an answer worked out on a calendar.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RELATIVE_CASES } from "./relative-cases.js";

const here = dirname(fileURLToPath(import.meta.url));

/** `runtime/brain/tests/vectors/relative.json`, from the compiled test's directory. */
export const relativeVectorsPath = join(here, "../../../brain/tests/vectors/relative.json");

export function buildRelativeVectors(): { readonly note: string; readonly cases: typeof RELATIVE_CASES } {
  return {
    note: "Hand-written in runtime/entities/tests/relative-cases.ts; written by scripts/write-brain-vectors.mjs. Do not edit.",
    cases: RELATIVE_CASES,
  };
}
