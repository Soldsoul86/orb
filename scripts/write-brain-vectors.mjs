#!/usr/bin/env node
/**
 * Regenerates `runtime/brain/tests/vectors/observations.json` (the translation), `graph.json` (the Evidence
 * Graph) and `handles.json` (the hand-written handle cases) from the TypeScript side.
 *
 *   npm run build && node scripts/write-brain-vectors.mjs
 *
 * The vectors are computed by TypeScript and checked by the phone's Kotlin; the test in
 * `packages/device-watch/tests/brain-vectors.test.ts` only compares, so a stale file fails.
 */
import { writeFile } from "node:fs/promises";
import { buildVectors, vectorsPath } from "../packages/device-watch/dist/tests/brain-vectors-build.js";
import { buildGraphVectors, graphVectorsPath } from "../packages/device-watch/dist/tests/graph-vectors-build.js";
import { buildHandleVectors, handleVectorsPath } from "../runtime/entities/dist/tests/handle-vectors-build.js";
import { buildRelativeVectors, relativeVectorsPath } from "../runtime/entities/dist/tests/relative-vectors-build.js";
import { buildNameVectors, nameVectorsPath } from "../runtime/entities/dist/tests/name-vectors-build.js";

await writeFile(vectorsPath, JSON.stringify(await buildVectors(), null, 1) + "\n");
console.log(`wrote ${vectorsPath}`);
await writeFile(graphVectorsPath, JSON.stringify(await buildGraphVectors(), null, 1) + "\n");
console.log(`wrote ${graphVectorsPath}`);
await writeFile(handleVectorsPath, JSON.stringify(buildHandleVectors(), null, 1) + "\n");
console.log(`wrote ${handleVectorsPath}`);
await writeFile(relativeVectorsPath, JSON.stringify(buildRelativeVectors(), null, 1) + "\n");
console.log(`wrote ${relativeVectorsPath}`);
await writeFile(nameVectorsPath, JSON.stringify(buildNameVectors(), null, 1) + "\n");
console.log(`wrote ${nameVectorsPath}`);
