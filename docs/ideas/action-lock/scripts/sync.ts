// Pulls what the profile needs from your phone and rebuilds it.
//
//   npm run sync                       once
//   npm run sync -- --every 6          again every 6 hours while this runs
//   npm run sync -- --connect IP:PORT  connect over Wi-Fi first (after pairing)
//
// Reads over adb (USB or Wireless debugging), read-only: SMS, installed apps
// and their permissions, contacts, call log and screen time. Adds the Gmail
// summary from `npm run mail` if there is one. Everything stays in ./private
// on this computer.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatFeedback, formatReport, formatSummary, runImport, type ImportInput } from '../src/import/run.ts';
import { PHONE_SCRIPT } from '../src/import/phone.ts';
import { USAGE_MARKER } from '../src/import/people.ts';

const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const out = option('out') ?? 'private';

function adb(...a: string[]): { ok: boolean; out: string; err: string } {
  const r = spawnSync('adb', a, { encoding: 'utf8', maxBuffer: 1 << 30 });
  if (r.error) return { ok: false, out: '', err: r.error.message };
  return { ok: r.status === 0, out: r.stdout ?? '', err: r.stderr ?? '' };
}

const PAIRING = `
No phone connected. Connect it once, either way:

  USB:   plug in the Pixel, allow USB debugging on the phone.

  Wi-Fi (no cable afterwards; Mac and phone on the same Wi-Fi):
    1. Phone: Settings → System → Developer options → Wireless debugging → On
    2. Tap "Pair device with pairing code". It shows an IP:port and a 6-digit code.
    3. Mac:   adb pair <IP:port from the pairing popup> <code>
    4. Phone: close the popup; the main Wireless debugging screen shows
              "IP address & Port" (a different port).
    5. Mac:   npm run sync -- --connect <that IP:port>

  Then run npm run sync again. Later syncs find the phone by themselves while
  Wireless debugging is on; if not, repeat step 5 (the port changes when it restarts).
`;

function device(): string | undefined {
  const connect = option('connect');
  if (connect !== undefined) {
    const c = adb('connect', connect);
    console.log(c.out.trim() || c.err.trim());
  }
  let list = adb('devices');
  if (list.ok && connect === undefined && !/\tdevice$/m.test(list.out)) {
    // Paired over Wi-Fi before: the phone announces its current address.
    const found = adb('mdns', 'services').out.match(/_adb-tls-connect\._tcp\S*\s+(\S+:\d+)/)?.[1];
    if (found !== undefined) {
      console.log(adb('connect', found).out.trim());
      list = adb('devices');
    }
  }
  if (!list.ok) {
    console.error(list.err.includes('ENOENT') ? 'adb is not installed. Mac: brew install android-platform-tools' : list.err);
    return undefined;
  }
  const ready = list.out.split('\n').filter((l) => /\tdevice$/.test(l)).map((l) => l.split('\t')[0]!);
  if (ready.length === 0) {
    if (/\tunauthorized/.test(list.out)) console.error('The phone is connected but not allowed yet: unlock it and tap Allow.');
    else console.error(PAIRING);
    return undefined;
  }
  return option('serial') ?? ready[0];
}

function syncOnce(): boolean {
  const serial = device();
  if (serial === undefined) return false;
  console.log(`Reading from ${serial}…`);

  const sms = adb('-s', serial, 'shell', 'content', 'query', '--uri', 'content://sms/inbox', '--projection', 'address:date:body');
  if (!sms.ok || /Permission Denial|SecurityException/.test(sms.out + sms.err)) {
    console.error('The phone refused to share SMS over adb. Use the SMS Backup & Restore app instead (see README).');
    return false;
  }
  mkdirSync(join(out, 'usage'), { recursive: true });
  writeFileSync(join(out, 'sms.txt'), sms.out);
  const inputs: ImportInput[] = [{ name: 'sms.txt', text: sms.out }];
  const skipped: string[] = [];

  // Each is optional: a phone that refuses one still gives the rest.
  const pull = (file: string, what: string, ...cmd: string[]) => {
    const r = adb('-s', serial, 'shell', ...cmd);
    if (!r.ok || /Permission Denial|SecurityException/.test(r.out.slice(0, 500) + r.err)) {
      skipped.push(what);
      return;
    }
    writeFileSync(join(out, file), r.out);
    inputs.push({ name: file, text: r.out });
  };
  pull('apps.txt', 'installed apps', 'pm', 'list', 'packages');
  pull('phone.txt', 'app permissions', PHONE_SCRIPT);
  pull('contacts.txt', 'contacts', 'content', 'query', '--uri', 'content://com.android.contacts/data/phones', '--projection', 'data1:display_name');
  pull('calls.txt', 'call log', 'content', 'query', '--uri', 'content://call_log/calls', '--projection', 'number:date:duration:type');

  // Android keeps only a few days of screen time: keep one dump per day so history grows.
  const usage = adb('-s', serial, 'shell', 'dumpsys', 'usagestats');
  if (usage.ok) writeFileSync(join(out, 'usage', `${new Date().toISOString().slice(0, 10)}.txt`), `${USAGE_MARKER}\n${usage.out}`);
  else skipped.push('screen time');
  for (const f of readdirSync(join(out, 'usage')).filter((f) => f.endsWith('.txt')).sort()) {
    inputs.push({ name: `usage/${f}`, text: readFileSync(join(out, 'usage', f), 'utf8') });
  }
  if (existsSync(join(out, 'mail.json'))) inputs.push({ name: 'mail.json', text: readFileSync(join(out, 'mail.json'), 'utf8') });
  if (skipped.length > 0) console.log(`The phone did not share: ${skipped.join(', ')} (skipped).`);

  const result = runImport(inputs, Date.now());
  writeFileSync(join(out, 'profile.json'), JSON.stringify(result.profile, null, 2));
  writeFileSync(join(out, 'transactions.json'), JSON.stringify(result.txns, null, 2));
  writeFileSync(join(out, 'report.txt'), formatReport(result) + '\n');
  if (result.unreadAll.length > 0) writeFileSync(join(out, 'unread-alerts.txt'), result.unreadAll.join('\n') + '\n');

  console.log('\n' + formatSummary(result));
  writeFileSync(join(out, 'feedback.txt'), formatFeedback(result, inputs) + '\n');
  console.log(`\nProfile: ${join(out, 'profile.json')} · full report: ${join(out, 'report.txt')}`);
  const shareTo = option('share-to');
  if (shareTo !== undefined) {
    // Only the masked feedback leaves this folder, and only when asked.
    mkdirSync(shareTo, { recursive: true });
    copyFileSync(join(out, 'feedback.txt'), join(shareTo, 'feedback.txt'));
    console.log(`Copied the masked feedback to ${shareTo}.`);
  } else console.log(`To improve what it reads: paste ${join(out, 'feedback.txt')} into the chat (masked, safe to share).`);
  return true;
}

const every = Number(option('every') ?? 0);
const ok = syncOnce();
if (every > 0) {
  console.log(`\nSyncing again every ${every} h. Leave this window open; Ctrl+C to stop.`);
  setInterval(() => {
    console.log(`\n── ${new Date().toLocaleString()} ──`);
    syncOnce();
  }, every * 3_600_000);
} else if (!ok) {
  process.exit(1);
}
