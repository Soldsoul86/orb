#!/usr/bin/env node
/**
 * Regenerates `runtime/brain/tests/vectors/observations.json` (the translation) and `graph.json` (the Evidence
 * Graph) from the TypeScript implementations.
 *
 *   npm run build && node scripts/write-brain-vectors.mjs
 *
 * The vectors are computed by TypeScript and checked by the phone's Kotlin; the test in
 * `packages/device-watch/tests/brain-vectors.test.ts` only compares, so a stale file fails.
 */
import { writeFile } from "node:fs/promises";
import { buildVectors, vectorsPath } from "../packages/device-watch/dist/tests/brain-vectors-build.js";
import { buildGraphVectors, graphVectorsPath } from "../packages/device-watch/dist/tests/graph-vectors-build.js";

await writeFile(vectorsPath, JSON.stringify(await buildVectors(), null, 1) + "\n");
console.log(`wrote ${vectorsPath}`);
await writeFile(graphVectorsPath, JSON.stringify(await buildGraphVectors(), null, 1) + "\n");
console.log(`wrote ${graphVectorsPath}`);
