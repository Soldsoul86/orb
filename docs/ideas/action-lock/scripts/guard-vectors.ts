// Writes test/guard-vectors.json: the pay-guard cases with the decisions the
// TypeScript guard makes, for the Kotlin guard's test to check against.
import { writeFileSync } from 'node:fs';
import { vectors } from '../test/guard-cases.ts';
import { messageVectors } from '../test/message-cases.ts';

writeFileSync(new URL('../test/guard-vectors.json', import.meta.url), JSON.stringify(vectors(), null, 2) + '\n');
writeFileSync(new URL('../test/message-vectors.json', import.meta.url), JSON.stringify(messageVectors(), null, 2) + '\n');
console.log('test/guard-vectors.json and test/message-vectors.json written');
