/**
 * The vectors the phone's Kotlin `Handles` is held to: the hand-written cases, serialised.
 *
 * They are **not computed from the implementation** — they are the answers a person wrote down
 * (`handle-cases.ts`), so the TypeScript and the Kotlin are each checked against the spec and
 * not against each other. The test only compares the committed file with these, so a stale file fails.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CASES } from "./handle-cases.js";

const here = dirname(fileURLToPath(import.meta.url));

/** `runtime/brain/tests/vectors/handles.json`, from the compiled test's directory. */
export const handleVectorsPath = join(here, "../../../brain/tests/vectors/handles.json");

export function buildHandleVectors(): { readonly note: string; readonly cases: typeof CASES } {
  return {
    note: "Hand-written in runtime/entities/tests/handle-cases.ts; written by scripts/write-brain-vectors.mjs. Do not edit.",
    cases: CASES,
  };
}
