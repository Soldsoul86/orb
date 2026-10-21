// Executed inside Chromium. Private purpose/Matrix keys stay in this context.
import { createClient, ClientEvent } from 'matrix-js-sdk';
import { logger } from 'matrix-js-sdk/lib/logger';
import { UserId } from '@matrix-org/matrix-sdk-crypto-wasm';
import { generateKeyPair, exportJWK, importJWK, CompactSign, compactVerify, calculateJwkThumbprintUri } from 'jose';
import { strictJson } from '../../src/strict-json.mjs';
import { publicId } from '../../src/identity.mjs';

logger.setLevel('silent');
const base = 'http://127.0.0.1:8765';
const enc = new TextEncoder();
const dec = new TextDecoder();
const typ = 'chat.veil.interop';
const now = () => Math.floor(Date.now() / 1000);
const hex = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), x => x.toString(16).padStart(2, '0')).join('');
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const hash = async text => b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text))));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
let client, signing, publicKey, self, peer, policy, accessToken;
const received = [];
const rejected = [];
const seen = new Set();

async function sign(payload, type) {
  return new CompactSign(enc.encode(JSON.stringify(payload))).setProtectedHeader({ alg: 'ES256', typ: type, jwk: publicKey }).sign(signing);
}
async function verify(token, id, type) {
  const header = strictJson(dec.decode(Uint8Array.from(atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))));
  assert(header.alg === 'ES256' && header.typ === type && !header.jwk.d && Object.keys(header).sort().join() === 'alg,jwk,typ', 'JOSE domain');
  assert(await publicId(header.jwk) === id, 'purpose pin mismatch');
  const result = await compactVerify(token, await importJWK(header.jwk, 'ES256'), { algorithms: ['ES256'] });
  const value = strictJson(dec.decode(result.payload));
  assert(value.v === 1, 'version');
  return value;
}
async function verifyCard(value, pin) {
  assert(value.id === pin, 'independent identity pin');
  const s = await verify(value.state, pin, 'pi-state+jws');
  const b = await verify(value.binding, pin, 'pi-matrix-binding+jws');
  assert(s.id === pin && s.revision === 1 && b.iss === pin && b.state_hash === await hash(value.state), 'binding state');
  return b.endpoint;
}
async function api(path, method = 'GET', body) {
  const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const value = await r.json();
  assert(r.ok, `provider ${r.status}`);
  return value;
}
async function pinPeer(value, pin) {
  const e = await verifyCard(value, pin);
  // Version-pinned spike adapter: Matrix JS's public getUserDeviceInfo(...,true)
  // does NOT populate the crypto store for a user outside an encrypted room.
  // Use the same genuine SDK request/response path as its room-key bundle code.
  // These two JS internals are an explicit product-release integration gate.
  const rust = client.getCrypto();
  const request = rust.olmMachine.queryKeysForUsers([new UserId(e.user_id)]);
  await rust.outgoingRequestProcessor.makeOutgoingRequest(request);
  const devices = await client.getCrypto().getUserDeviceInfo([e.user_id], true);
  const device = devices.get(e.user_id)?.get(e.device_id);
  assert(device && device.getFingerprint() === e.ed25519 && device.getIdentityKey() === e.curve25519, 'signed Matrix device key mismatch');
  await client.getCrypto().setDeviceVerified(e.user_id, e.device_id, true);
  peer = { ...value, endpoint: e };
  return true;
}
async function init(account, purposeOverrides = {}) {
  const login = await fetch(base + '/_matrix/client/v3/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'm.login.password', identifier: { type: 'm.id.user', user: account.username }, password: account.password, device_id: account.device }) }).then(r => r.json());
  assert(login.access_token, 'login: ' + String(login.errcode) + ' ' + String(login.error));
  accessToken = login.access_token;
  client = createClient({ baseUrl: base, userId: login.user_id, deviceId: login.device_id, accessToken, timelineSupport: false });
  await client.initRustCrypto();
  client.getCrypto().setTrustCrossSignedDevices(false);
  client.on(ClientEvent.ReceivedToDeviceMessage, async payload => {
    try {
      const event = payload.message;
      if (event?.type !== typ) return;
      assert(peer && payload.encryptionInfo && payload.encryptionInfo.senderCurve25519KeyBase64 === peer.endpoint.curve25519 && payload.encryptionInfo.senderVerified, 'authenticated SDK ciphertext required');
      assert(event.sender === peer.endpoint.user_id, 'sender binding');
      const m = await verify(event.content.jws, peer.id, 'pi-matrix-message+jws');
      assert(m.iss === peer.id && m.recipient === self.id && m.invitation === policy.invitation && m.expires > now() && !seen.has(m.id), 'message context/replay');
      seen.add(m.id);
      received.push(m.text);
    } catch { rejected.push('message refused'); }
  });
  await client.startClient({ initialSyncLimit: 0, lazyLoadMembers: false, pollTimeout: 1000 });
  await new Promise((resolve, reject) => {
    if (client.getSyncState() === 'PREPARED' || client.getSyncState() === 'SYNCING') return resolve();
    const timer = setTimeout(() => reject(new Error('initial browser sync timed out')), 60000);
    client.on(ClientEvent.Sync, state => { if (state === 'PREPARED' || state === 'SYNCING') { clearTimeout(timer); resolve(); } });
  });
  const pair = await generateKeyPair('ES256');
  signing = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  publicKey = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
  const id = await calculateJwkThumbprintUri(publicKey);
  const purposePolicy = { display_name: 'Home Repairs', description: '', discovery_mode: 'UNLISTED', contact_request_mode: 'REQUEST_APPROVAL', allowed_content_types: ['text'], schedule: { timezone: 'UTC', weekdays: [1, 2, 3, 4, 5, 6, 7], start: 0, end: 1440 }, outside_hours_behavior: 'REJECT', first_contact_message_limit: 1, inactivity_days: 7, expires_at: now() + 3600, notification_behavior: 'SILENT_IN_APP', status: 'ACTIVE', policy_version: 1 };
  Object.assign(purposePolicy, purposeOverrides);
  const state = await sign({ v: 1, id, device: publicKey, revision: 1, issued: now(), epoch: hex(16), route: 'https://veil.test', policy: purposePolicy }, 'pi-state+jws');
  const keys = await client.getCrypto().getOwnDeviceKeys();
  const endpoint = { user_id: login.user_id, device_id: login.device_id, ...keys };
  const binding = await sign({ v: 1, iss: id, state_hash: await hash(state), endpoint }, 'pi-matrix-binding+jws');
  self = { id, state, binding };
  return self;
}
async function setPolicy(status, expiresIn = 900) {
  if (!policy) policy = { v: 1, iss: self.id, invitation: hex(32), revision: 0, issued: now(), expires: now() + expiresIn, owner: self, guest: { id: peer.id, state: peer.state, binding: peer.binding } };
  policy = { ...policy, revision: policy.revision + 1, status };
  const token = await sign(policy, 'pi-matrix-policy+jws');
  await api('/veil/policy', 'POST', { owner: self.id, token });
  return { token, invitation: policy.invitation };
}
async function loadPolicy(invitation, ownerPin) {
  const { token } = await api('/veil/policy/' + invitation);
  const p = await verify(token, ownerPin, 'pi-matrix-policy+jws');
  assert(p.owner.id === ownerPin && p.guest.id === self.id && p.expires > now() && p.status !== 'revoked', 'policy context');
  await verifyCard(p.owner, ownerPin);
  assert(p.owner.binding === peer.binding && p.guest.binding === self.binding, 'policy device mismatch');
  policy = p;
  return true;
}
async function encrypted(text) {
  await pinPeer(peer, peer.id); // Recheck SDK device keys at every outbound boundary.
  const jws = await sign({ v: 1, iss: self.id, recipient: peer.id, invitation: policy.invitation, id: hex(16), expires: now() + 120, text }, 'pi-matrix-message+jws');
  const batch = await client.getCrypto().encryptToDeviceMessages(typ, [{ userId: peer.endpoint.user_id, deviceId: peer.endpoint.device_id }], { jws });
  assert(batch.eventType === 'm.room.encrypted' && batch.batch.length === 1, 'SDK encryption output');
  const item = batch.batch[0];
  return { messages: { [item.userId]: { [item.deviceId]: item.payload } } };
}
async function send(text) {
  const body = await encrypted(text);
  await client.sendToDevice('m.room.encrypted', new Map(Object.entries(body.messages).map(([u, d]) => [u, new Map(Object.entries(d))])), hex(16));
  return true;
}
// Negative calls intentionally bypass all application admission logic.
async function raw(body, path = '/_matrix/client/v3/sendToDevice/m.room.encrypted/' + hex(16), method = 'PUT') {
  const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.status;
}
window.interop = { init, pinPeer, setPolicy, loadPolicy, send, encrypted, raw,
  received: text => received.includes(text), rejected: () => rejected.length,
  wrongPin: async value => { try { await pinPeer(value, self.id); return false; } catch { return true; } },
  substitutedDevice: async () => {
    const endpoint = { ...(await verifyCard(self, self.id)), curve25519: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/=/g, '') };
    return { ...self, binding: await sign({ v: 1, iss: self.id, state_hash: await hash(self.state), endpoint }, 'pi-matrix-binding+jws') };
  },
  stop: () => client.stopClient() };
