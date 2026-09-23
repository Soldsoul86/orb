// Pulls what the profile needs from your phone and rebuilds it.
//
//   npm run sync                       once
//   npm run sync -- --every 6          again every 6 hours while this runs
//   npm run sync -- --connect IP:PORT  connect over Wi-Fi first (after pairing)
//
// Reads SMS and the list of installed apps over adb (USB or Wireless
// debugging). Everything stays in ./private on this computer.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatReport, formatSummary, runImport } from '../src/import/run.ts';

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

  Then run npm run sync again. Later syncs usually reconnect by themselves;
  if not, repeat step 5 (the port changes when Wireless debugging restarts).
`;

function device(): string | undefined {
  const connect = option('connect');
  if (connect !== undefined) {
    const c = adb('connect', connect);
    console.log(c.out.trim() || c.err.trim());
  }
  const list = adb('devices');
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
  const apps = adb('-s', serial, 'shell', 'pm', 'list', 'packages');

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'sms.txt'), sms.out);
  if (apps.ok) writeFileSync(join(out, 'apps.txt'), apps.out);

  const result = runImport(
    [{ name: 'sms.txt', text: sms.out }, ...(apps.ok ? [{ name: 'apps.txt', text: apps.out }] : [])],
    Date.now(),
  );
  writeFileSync(join(out, 'profile.json'), JSON.stringify(result.profile, null, 2));
  writeFileSync(join(out, 'transactions.json'), JSON.stringify(result.txns, null, 2));
  writeFileSync(join(out, 'report.txt'), formatReport(result) + '\n');
  if (result.unreadAll.length > 0) writeFileSync(join(out, 'unread-alerts.txt'), result.unreadAll.join('\n') + '\n');

  console.log('\n' + formatSummary(result));
  console.log(`\nProfile: ${join(out, 'profile.json')} · full report: ${join(out, 'report.txt')}`);
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
