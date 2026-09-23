// Reads a Gmail Takeout mailbox on this computer and saves a summary.
//
//   npm run mail -- ~/Downloads/Takeout/Mail/*.mbox
//
// Streams the file, so any size works. Saves private/mail.json (receipts,
// travel bookings, counts of confidential data: no mail text) and adds it to
// your profile; `npm run sync` includes it from then on.
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { mailCollector, MBOX_FROM } from '../src/import/mail.ts';
import { formatFeedback, formatReport, formatSummary, runImport, type ImportInput } from '../src/import/run.ts';

const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const out = outAt >= 0 ? (args[outAt + 1] ?? 'private') : 'private';
const file = args.filter((_, i) => outAt < 0 || (i !== outAt && i !== outAt + 1)).find((a) => !a.startsWith('--'));
if (file === undefined || !existsSync(file)) {
  console.error('Usage: npm run mail -- <path to the .mbox file from Google Takeout>');
  console.error('Get it: takeout.google.com → Deselect all → Mail → Next → Create export; unzip; Takeout/Mail/*.mbox');
  process.exit(1);
}

const MAX_MESSAGE = 3_000_000; // characters; attachments beyond this are not needed
const collector = mailCollector(Date.now());
const size = statSync(file).size;
let read = 0;
let lines: string[] | null = null;
let length = 0;
let lastShown = 0;

const flush = () => {
  if (lines !== null) collector.add(lines.join('\n'));
};

const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
for await (const line of rl) {
  read += Buffer.byteLength(line) + 1;
  if (MBOX_FROM.test(line)) {
    flush();
    lines = [];
    length = 0;
  } else if (lines !== null && length < MAX_MESSAGE) {
    lines.push(line.startsWith('>') ? line.replace(/^>(>*From )/, '$1') : line);
    length += line.length + 1;
  }
  if (read - lastShown > 50_000_000) {
    lastShown = read;
    process.stdout.write(`\r  read ${Math.round((read / size) * 100)}% of ${(size / 1e9).toFixed(1)} GB…`);
  }
}
flush();
if (lastShown > 0) process.stdout.write('\r' + ' '.repeat(40) + '\r');

const summary = collector.result();
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'mail.json'), JSON.stringify(summary, null, 2));

// Rebuild the profile with the mail added, when the last sync kept its raw
// copies; otherwise the next sync (manual or scheduled) adds it.
const inputs: ImportInput[] = [];
for (const f of ['sms.txt', 'apps.txt', 'phone.txt', 'contacts.txt', 'calls.txt']) {
  if (existsSync(join(out, f))) inputs.push({ name: f, text: readFileSync(join(out, f), 'utf8') });
}
if (inputs.length === 0) {
  console.log(`Saved ${join(out, 'mail.json')} (no mail text): ${summary.messages} mails, ${summary.receipts.length} receipts, ${summary.bookings.length} bookings.`);
  console.log('It joins your profile on the next sync: npm run sync (or wait for the scheduled one).');
  process.exit(0);
}
if (existsSync(join(out, 'usage'))) {
  for (const f of readdirSync(join(out, 'usage')).filter((f) => f.endsWith('.txt')).sort()) inputs.push({ name: `usage/${f}`, text: readFileSync(join(out, 'usage', f), 'utf8') });
}
inputs.push({ name: 'mail.json', text: JSON.stringify(summary) });
const result = runImport(inputs, Date.now());
writeFileSync(join(out, 'profile.json'), JSON.stringify(result.profile, null, 2));
writeFileSync(join(out, 'report.txt'), formatReport(result) + '\n');
writeFileSync(join(out, 'feedback.txt'), formatFeedback(result, inputs) + '\n');
console.log(formatSummary(result));
console.log(`\nSaved ${join(out, 'mail.json')} (no mail text) · profile: ${join(out, 'profile.json')} · full report: ${join(out, 'report.txt')}`);
