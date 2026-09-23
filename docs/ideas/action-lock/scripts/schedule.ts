// Runs `npm run sync` on a schedule on a Mac (launchd), so there is nothing to type.
//
//   npm run schedule                         every 6 hours (and at login)
//   npm run schedule -- --every 12
//   npm run schedule -- --share-to <folder>  also copy the masked feedback.txt there
//   npm run schedule -- --pull               fetch the latest version of this tool first
//   npm run schedule -- --to-phone           also copy feedback.txt to the phone (Documents/Orb)
//   npm run schedule -- --remove             stop
//
// Log: private/sync.log. The phone must be on the same Wi-Fi with Wireless
// debugging on; when it isn't, that run is skipped and the next one tries again.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const LABEL = 'com.orb.action-lock.sync';
const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const plist = join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);

if (process.platform !== 'darwin') {
  console.error('This sets up a macOS schedule. On Linux use cron: 0 */6 * * * cd <this folder> && npm run sync');
  process.exit(1);
}

spawnSync('launchctl', ['unload', plist], { stdio: 'ignore' });
if (args.includes('--remove')) {
  if (existsSync(plist)) unlinkSync(plist);
  console.log('Stopped. Nothing will sync on its own any more.');
  process.exit(0);
}

const every = Number(option('every') ?? 6);
const shareTo = option('share-to');
const here = resolve('.');
const sh = existsSync('/bin/zsh') ? '/bin/zsh' : '/bin/sh';
const run = (cmd: string) => (spawnSync(sh, ['-lc', cmd], { encoding: 'utf8', cwd: resolve('.') }).stdout ?? '').trim().split('\n').pop()!.trim(); // last line: login shells may print banners
const adb = run('command -v adb');
if (adb === '') {
  console.error('adb not found. Install it first: brew install android-platform-tools');
  process.exit(1);
}
const git = run('git rev-parse --abbrev-ref HEAD');

const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
const steps = [
  `cd ${q(here)}`,
  'echo "── $(date)"',
  ...(args.includes('--pull') && git !== '' ? [`{ git pull --ff-only origin ${q(git)} || true; }`] : []),
  `${q(process.execPath)} scripts/sync.ts${shareTo !== undefined ? ` --share-to ${q(resolve(shareTo))}` : ''}${args.includes('--to-phone') ? ' --to-phone' : ''}`,
];
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

mkdirSync(dirname(plist), { recursive: true });
mkdirSync(join(here, 'private'), { recursive: true });
writeFileSync(
  plist,
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>${sh}</string><string>-c</string><string>${esc(steps.join(' && '))}</string></array>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>${esc([dirname(process.execPath), dirname(adb), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':'))}</string></dict>
  <key>StartInterval</key><integer>${Math.round(every * 3600)}</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${esc(join(here, 'private', 'sync.log'))}</string>
  <key>StandardErrorPath</key><string>${esc(join(here, 'private', 'sync.log'))}</string>
</dict>
</plist>
`,
);
const load = spawnSync('launchctl', ['load', '-w', plist], { encoding: 'utf8' });
if (load.status !== 0) {
  console.error(`launchctl refused: ${load.stderr.trim()}`);
  process.exit(1);
}
console.log(`Syncing every ${every} h, starting now (runs missed while the Mac sleeps happen on wake).`);
console.log(`Log: tail private/sync.log · stop: npm run schedule -- --remove`);
if (args.includes('--to-phone')) console.log('The masked feedback.txt is copied to the phone (Documents/Orb) after each sync.');
if (shareTo !== undefined) console.log(`The masked feedback.txt is copied to ${resolve(shareTo)} after each sync.`);
