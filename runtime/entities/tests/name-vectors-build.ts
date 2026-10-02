/**
 * The vectors the phone's Kotlin `Names` is held to: the hand-written cases, serialised. Not computed from either implementation.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NAME_CASES } from "./name-cases.js";

const here = dirname(fileURLToPath(import.meta.url));

/** `runtime/brain/tests/vectors/names.json`, from the compiled test's directory. */
export const nameVectorsPath = join(here, "../../../brain/tests/vectors/names.json");

export function buildNameVectors(): { readonly note: string; readonly cases: typeof NAME_CASES } {
  return {
    note: "Hand-written in runtime/entities/tests/name-cases.ts; written by scripts/write-brain-vectors.mjs. Do not edit.",
    cases: NAME_CASES,
  };
}
