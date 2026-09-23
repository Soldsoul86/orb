// How would the lock treat this payment, given your profile?
//
//   npm run check -- 5000 goa-trips@okxyz
//   npm run check -- 500 ravi.k@okaxis --name "RAVIKUMAR M"
//   npm run check -- "upi://pay?pa=shop@ybl&pn=Shop&am=2500"
//   options: --hour 23   --call (on a call with an unknown number)   --autopay   --profile private/profile.json
import { existsSync, readFileSync } from 'node:fs';
import { judge } from '../src/judge.ts';
import type { Profile } from '../src/profile.ts';
import { parseUpiLink } from '../src/upi.ts';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = args.filter((a, i) => !a.startsWith('--') && !['--hour', '--name', '--profile'].includes(args[i - 1] ?? ''));

let to: string | undefined;
let amount: number | undefined;
let name = option('name');
const link = positional.find((p) => p.startsWith('upi:'));
if (link !== undefined) {
  const r = parseUpiLink(link);
  if (!r.ok) throw new Error(r.reason);
  to = r.payment.pa;
  amount = r.payment.am !== undefined ? Number(r.payment.am) : undefined;
  name ??= r.payment.pn;
} else {
  amount = Number(positional.find((p) => /^\d+(\.\d+)?$/.test(p)));
  to = positional.find((p) => p.includes('@') || !/^\d/.test(p));
}
if (to === undefined || amount === undefined || Number.isNaN(amount)) {
  console.error('Usage: npm run check -- <amount> <upi-id> [--name "Payee Name"] [--hour 23] [--call] [--autopay]');
  process.exit(1);
}

const profilePath = option('profile') ?? 'private/profile.json';
const profile = existsSync(profilePath) ? (JSON.parse(readFileSync(profilePath, 'utf8')) as Profile) : null;
const hour = Number(option('hour') ?? new Date().getHours());

const j = judge(profile, {
  kind: flag('autopay') ? 'mandate' : 'payment',
  to,
  ...(name !== undefined ? { name } : {}),
  amount,
  localHour: hour,
  onCallWithUnknown: flag('call'),
});

const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const MODE = { pass: 'no wait', countdown: 'countdown', unlock: 'fingerprint', second_person: 'second person', block: 'blocked' } as const;
const wait = j.gate.mode === 'pass' ? 'opens your UPI app at once' : `${MODE[j.gate.mode]} + ${j.gate.holdSeconds} s buffer`;

console.log(`\n${flag('autopay') ? 'Autopay' : 'Pay'} ${rupees(amount)} → ${to}${name ? ` (${name})` : ''} at ${String(hour).padStart(2, '0')}:00`);
console.log(`  Judged against: ${profile ? `your profile (${profilePath})` : 'generic rules (no profile found)'}`);
console.log(`  Payee: ${j.payee ? `paid ${j.payee.count}× before, usual ${rupees(j.payee.median)}, max ${rupees(j.payee.max)}` : 'never paid before'}`);
console.log(`  Level ${j.analysis.level} → ${wait}`);
for (const f of j.analysis.feedback) console.log(`  · ${f}`);
console.log('');
