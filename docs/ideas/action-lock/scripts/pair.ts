// Pairs the phone by QR code and runs the first sync. One command, no typing.
//
//   npm run pair
//
// Phone: Settings → System → Developer options → Wireless debugging →
// "Pair device with QR code", then scan the code this prints.
import { spawnSync } from 'node:child_process';
import { randomInt } from 'node:crypto';

const adb = (...a: string[]) => {
  const r = spawnSync('adb', a, { encoding: 'utf8' });
  return `${r.stdout ?? ''}${r.stderr ?? ''}`;
};
const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

if (spawnSync('adb', ['version']).error) {
  console.error('adb is not installed. Mac: brew install android-platform-tools');
  process.exit(1);
}

const name = `orb-${randomInt(100_000, 999_999)}`;
const password = String(randomInt(100_000_000, 999_999_999));
adb('start-server');
console.log('\nPhone: Wireless debugging → "Pair device with QR code" → scan:\n');
const qr = spawnSync('npx', ['-y', 'qrcode-terminal', `WIFI:T:ADB;S:${name};P:${password};;`], { stdio: 'inherit' });
if (qr.status !== 0) {
  console.error('Could not draw the QR code (needs internet once for npx qrcode-terminal).');
  process.exit(1);
}

console.log('\nWaiting for the scan (2 minutes)…');
let paired = false;
for (let i = 0; i < 60 && !paired; i++) {
  const line = adb('mdns', 'services').split('\n').find((l) => l.includes(name) && l.includes('_adb-tls-pairing'));
  const address = line?.match(/(\d+\.\d+\.\d+\.\d+:\d+)/)?.[1];
  if (address !== undefined) {
    const r = adb('pair', address, password);
    console.log(r.trim());
    paired = /Successfully paired/i.test(r);
    if (!paired) process.exit(1);
  } else sleep(2_000);
}
if (!paired) {
  console.error('No scan seen. Check the Mac and phone are on the same Wi-Fi, then run npm run pair again.');
  process.exit(1);
}

// After pairing the phone announces the address to connect to; the sync finds it and remembers it.
console.log('\nConnecting and syncing…');
sleep(3_000);
const sync = spawnSync(process.execPath, ['scripts/sync.ts', ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(sync.status ?? 1);
