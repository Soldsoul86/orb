#!/usr/bin/env node
/**
 * Regenerates `runtime/brain/tests/vectors/observations.json` from the TypeScript translation.
 *
 *   npm run build && node scripts/write-brain-vectors.mjs
 *
 * The vectors are computed by TypeScript and checked by the phone's Kotlin; the test in
 * `packages/device-watch/tests/brain-vectors.test.ts` only compares, so a stale file fails.
 */
import { writeFile } from "node:fs/promises";
import { buildVectors, vectorsPath } from "../packages/device-watch/dist/tests/brain-vectors-build.js";

await writeFile(vectorsPath, JSON.stringify(await buildVectors(), null, 1) + "\n");
console.log(`wrote ${vectorsPath}`);
