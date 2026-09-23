// Usage: npm run import -- <export files…> [--out private]
//
// Reads SMS and Google Pay exports on this machine, writes your profile to
// the output folder, and prints a report. Nothing is sent anywhere.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { formatReport, runImport } from '../src/import/run.ts';

const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const out = outAt >= 0 ? (args[outAt + 1] ?? 'private') : 'private';
const files = args.filter((_, i) => outAt < 0 || (i !== outAt && i !== outAt + 1));

if (files.length === 0) {
  console.error('Usage: npm run import -- <sms.txt | sms-backup.xml | MyActivity.json …> [--out private]');
  process.exit(1);
}

const result = runImport(
  files.map((f) => ({ name: basename(f), text: readFileSync(f, 'utf8') })),
  Date.now(),
);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'profile.json'), JSON.stringify(result.profile, null, 2));
writeFileSync(join(out, 'transactions.json'), JSON.stringify(result.txns, null, 2));
console.log(formatReport(result));
console.log(`\nSaved ${join(out, 'profile.json')} and ${join(out, 'transactions.json')} (keep this folder private).`);
