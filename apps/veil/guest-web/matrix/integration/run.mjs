import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';

const mode = process.argv[2] ?? 'browser';
const results = [];
const pass = name => { results.push({ name, status: 'PASS' }); console.log('PASS ' + name); };
await mkdir('evidence', { recursive: true });
await mkdir('web', { recursive: true });
await build({ entryPoints: ['browser.mjs'], bundle: true, format: 'esm', splitting: true, outdir: 'web', loader: { '.wasm': 'file' }, logLevel: 'warning' });
async function copyWasm(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const file = resolve(dir, e.name);
    if (e.isDirectory()) await copyWasm(file);
    else if (e.name.endsWith('.wasm')) await copyFile(file, 'web/' + basename(file));
  }
}
await copyWasm('node_modules/@matrix-org/matrix-sdk-crypto-wasm');
const server = createServer(async (req, res) => {
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta charset="utf-8"><script type="module" src="/browser.js"></script>'); return; }
  try {
    const name = basename(new URL(req.url, 'http://127.0.0.1:8766').pathname);
    assert(/^[a-zA-Z0-9_-]+\.(js|wasm)$/.test(name));
    res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
    res.end(await readFile('web/' + name));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(8766, '127.0.0.1', r));
const browser = await chromium.launch({ headless: true });
const accounts = JSON.parse(await readFile('runtime/accounts.json', 'utf8'));
const call = (page, name, ...args) => page.evaluate(async ({ name, args }) => window.interop[name](...args), { name, args });
async function make(index, purposeOverrides = {}) {
  const context = await browser.newContext();
  const page = await context.newPage();
  // No console, screenshots, trace, HAR or browser profile artifacts: these contain secrets.
  page.on('pageerror', error => console.error('browser runtime error:', error.name, error.message.slice(0, 220)));
  await page.goto('http://127.0.0.1:8766');
  await page.waitForFunction(() => window.interop);
  const card = await call(page, 'init', accounts[index], purposeOverrides);
  return { page, card };
}
async function pair(i, ownerOverrides = {}) {
  const guest = await make(i);
  const owner = await make(i + 1, ownerOverrides);
  await call(guest.page, 'pinPeer', owner.card, owner.card.id);
  await call(owner.page, 'pinPeer', guest.card, guest.card.id);
  return { guest, owner };
}
async function received(page, text) {
  await page.waitForFunction(text => window.interop.received(text), text, { timeout: 60000 });
  assert.equal(await call(page, 'rejected'), 0);
}
async function absence() {
  const wire = await readFile('runtime/wire.jsonl', 'utf8');
  const database = await readFile('runtime/homeserver.db');
  for (const sentinel of ['VEIL_REQUEST_CANARY_8a19', 'VEIL_REPLY_CANARY_53c2']) {
    assert(!wire.includes(sentinel));
    assert(!database.includes(Buffer.from(sentinel)));
  }
  assert(wire.includes('m.olm.v1.curve25519-aes-sha2'));
  const yaml = await readFile('runtime/homeserver.yaml', 'utf8');
  assert(!/^\s+port:/m.test(yaml), 'Synapse must have no TCP listener');
  pass('wire/server database contain SDK ciphertext, no request/reply canaries; upstream Unix-only');
}
async function browserTest() {
  const { guest, owner } = await pair(0);
  pass('two isolated Chromium contexts initialized Rust-backed Matrix SDK encryption');
  assert(await call(guest.page, 'wrongPin', owner.card));
  pass('independent purpose identity pin rejects substitution');
  const substituted = await call(owner.page, 'substitutedDevice');
  await assert.rejects(call(guest.page, 'pinPeer', substituted, owner.card.id), /device key mismatch/);
  pass('valid purpose signature cannot substitute mismatched SDK device keys');
  const pending = await call(owner.page, 'setPolicy', 'pending');
  await call(guest.page, 'loadPolicy', pending.invitation, owner.card.id);
  const premature = await call(owner.page, 'encrypted', 'not delivered');
  assert.equal(await call(owner.page, 'raw', premature), 403);
  pass('direct API owner reply denied before approval');
  await call(guest.page, 'send', 'VEIL_REQUEST_CANARY_8a19');
  await received(owner.page, 'VEIL_REQUEST_CANARY_8a19');
  pass('browser to browser encrypted introduction decrypted and purpose signature verified in recipient browser');
  const second = await call(guest.page, 'encrypted', 'not delivered');
  const denied = await Promise.all([call(guest.page, 'raw', second), call(guest.page, 'raw', second)]);
  assert.deepEqual(denied, [403, 403]);
  pass('direct API concurrent second introductions denied before approval');
  for (const [path, method, body] of [
    ['/_matrix/client/v3/createRoom', 'POST', {}],
    ['/_matrix/client/v3/rooms/fake/send/m.room.message/txn', 'PUT', { body: 'blocked' }],
    ['/_matrix/client/r0/sendToDevice/m.room.encrypted/txn', 'PUT', second],
    ['/_matrix/client/v3/sendToDevice/chat.veil.interop/txn', 'PUT', second],
    ['/_matrix/client/v3/sendToDevice/m.room.encrypted/txn', 'PUT', { messages: { '@bad:veil.test': { '*': {} } } }],
    ['/veil/policy', 'POST', { owner: owner.card.id, token: pending.token }],
  ]) assert.equal(await call(guest.page, 'raw', body, path, method), 403);
  pass('direct API room/plaintext/legacy/wildcard and guest approval bypasses denied');
  const approved = await call(owner.page, 'setPolicy', 'approved');
  await call(guest.page, 'loadPolicy', pending.invitation, owner.card.id);
  await call(owner.page, 'send', 'VEIL_REPLY_CANARY_53c2');
  await received(guest.page, 'VEIL_REPLY_CANARY_53c2');
  pass('signed approval permits genuine encrypted browser reply');
  await call(owner.page, 'setPolicy', 'revoked');
  assert.equal(await call(guest.page, 'raw', second), 403);
  assert.equal(await call(owner.page, 'raw', premature), 403);
  assert.equal(await call(owner.page, 'raw', { owner: owner.card.id, token: approved.token }, '/veil/policy', 'POST'), 403);
  pass('revocation denies both directions and signed policy rollback at direct API');
  const exp = await pair(2);
  const short = await call(exp.owner.page, 'setPolicy', 'pending', 4);
  await call(exp.guest.page, 'loadPolicy', short.invitation, exp.owner.card.id);
  const body = await call(exp.guest.page, 'encrypted', 'expired');
  await new Promise(r => setTimeout(r, 4500));
  assert.equal(await call(exp.guest.page, 'raw', body), 403);
  pass('server-time invitation expiration denies direct SDK ciphertext submission');
  const closedWeekday = (new Date().getUTCDay() + 2) % 7 + 1;
  const closed = await pair(4, { schedule: { timezone: 'UTC', weekdays: [closedWeekday], start: 0, end: 1440 } });
  const closedPolicy = await call(closed.owner.page, 'setPolicy', 'pending');
  await call(closed.guest.page, 'loadPolicy', closedPolicy.invitation, closed.owner.card.id);
  const closedMessage = await call(closed.guest.page, 'encrypted', 'closed hours');
  assert.equal(await call(closed.guest.page, 'raw', closedMessage), 403);
  pass('signed purpose schedule enforced at direct Matrix API boundary');
  await absence();
}
async function androidTest() {
  const guest = await make(0);
  await mkdir('android/app/src/androidTest/assets', { recursive: true });
  await writeFile('android/app/src/androidTest/assets/runtime.json', JSON.stringify({ account: accounts[1], guest: guest.card, guestPin: guest.card.id }));
  console.log('Android instrumentation build/run starting');
  const gradle = spawn('gradle', ['-p', 'android', ':app:connectedDebugAndroidTest', '--console=plain'], { stdio: 'inherit' });
  const completed = new Promise(resolve => gradle.on('exit', code => resolve(code)));
  let gradleExit;
  completed.then(code => { gradleExit = code; });
  const file = async name => {
    for (let i = 0; i < 600; i++) {
      try { return JSON.parse(execFileSync('adb', ['exec-out', 'run-as', 'chat.veil.matrix.interop', 'cat', 'files/' + name], { stdio: ['ignore', 'pipe', 'ignore'] }).toString()); } catch {}
      assert(gradleExit === undefined, 'Android exited before ' + name);
      await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error('Android timed out waiting for ' + name);
  };
  const owner = await file('public.json');
  await call(guest.page, 'pinPeer', owner, owner.id);
  const ready = await file('ready.json');
  await call(guest.page, 'loadPolicy', ready.invitation, owner.id);
  await call(guest.page, 'send', 'VEIL_REQUEST_CANARY_8a19');
  await received(guest.page, 'VEIL_REPLY_CANARY_53c2');
  pass('Chromium received and authenticated native Android SDK encrypted reply');
  execFileSync('adb', ['shell', 'run-as', 'chat.veil.matrix.interop', 'touch', 'files/revoke']);
  const result = await file('result.json');
  assert.equal(result.requestDecrypted, true);
  assert.equal(result.replyEncrypted, true);
  assert.equal(result.revoked, true);
  assert.equal(await completed, 0);
  pass('Android instrumentation passed real SDK request decryption, identity signature, approval, reply encryption and revocation');
  const blocked = await call(guest.page, 'encrypted', 'revoked');
  assert.equal(await call(guest.page, 'raw', blocked), 403);
  pass('browser direct API cannot bypass Android owner revocation');
  await absence();
}
try {
  if (mode === 'android') await androidTest(); else await browserTest();
} catch (error) {
  results.push({ name: 'experiment completion', status: 'FAIL', error: error.message.slice(0, 500) });
  console.error(error.stack);
  process.exitCode = 1;
} finally {
  await writeFile('evidence/' + mode + '.json', JSON.stringify({ mode, revision: process.env.GITHUB_SHA ?? 'local', results }, null, 2));
  await browser.close();
  await new Promise(r => server.close(r));
}
