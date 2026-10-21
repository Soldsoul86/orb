import { generateKeyPair, exportJWK, importJWK, CompactSign, compactVerify } from 'jose';
import { strictJson } from '../../src/strict-json.mjs';
import { publicId } from '../../src/identity.mjs';
export const now = () => Math.floor(Date.now() / 1000);
export const require = (v, reason = 'This conversation could not be verified.') => { if (!v) throw Error(reason); };
export const random = () => [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2, '0')).join('');
export const hash = async text => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
export const hexHash = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(x => x.toString(16).padStart(2, '0')).join('');
export const same = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function canonical(x) { return Array.isArray(x) ? x.map(canonical) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, canonical(x[k])])) : x; }
export async function identity() {
  const pair = await generateKeyPair('ES256', { extractable: true });
  const secret = await exportJWK(pair.privateKey), key = await exportJWK(pair.publicKey);
  const pub = { kty:key.kty, crv:key.crv, x:key.x, y:key.y };
  return { secret, pub, id:await publicId(pub) };
}
export async function sign(value, type, key) {
  return new CompactSign(new TextEncoder().encode(JSON.stringify(value))).setProtectedHeader({alg:'ES256', typ:type, jwk:key.pub}).sign(await importJWK(key.secret, 'ES256'));
}
export async function verify(token, pin, type) {
  require(typeof token === 'string' && token.length <= 262144);
  const part = token.split('.')[0];
  const h = strictJson(new TextDecoder().decode(Uint8Array.from(atob(part.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0))));
  require(Object.keys(h).sort().join() === 'alg,jwk,typ' && h.alg==='ES256' && h.typ===type && await publicId(h.jwk)===pin);
  const result = await compactVerify(token, await importJWK(h.jwk,'ES256'), {algorithms:['ES256']});
  const value = strictJson(new TextDecoder().decode(result.payload));
  require(value.v === 1);
  return value;
}
export async function card(value, pin) {
  require(value.id===pin);
  const s=await verify(value.state,pin,'pi-state+jws'), b=await verify(value.binding,pin,'pi-matrix-binding+jws');
  require(s.id===pin && Number.isSafeInteger(s.revision) && s.revision>=1 && s.issued<=now()+60);
  require(b.iss===pin && b.state_hash===await hash(value.state));
  const e=b.endpoint;
  require(Object.keys(e).sort().join()==='curve25519,device_id,ed25519,user_id');
  require(/^@[a-z0-9_]+:veil\.test$/.test(e.user_id) && /^[A-Z0-9]+$/.test(e.device_id));
  require(['ed25519','curve25519'].every(k=>/^[A-Za-z0-9+/]{43}$/.test(e[k])));
  return {state:s, endpoint:e};
}
export async function enrollment(token,pin,invite) {
  const e=await verify(token,pin,'pi-matrix-enrollment+jws');
  require(e.iss===pin && e.invite===invite && /^[a-f0-9]{64}$/.test(invite));
  require(Number.isSafeInteger(e.revision) && e.revision>=1 && Number.isSafeInteger(e.expires) && e.expires<=e.issued+3600 && e.issued<=now()+30);
  await card(e.owner,pin);
  return e;
}
export function allowed(e) {
  require(e.expires>now(), 'Expired. Ask the owner for a new invitation.');
  const s=strictJson(new TextDecoder().decode(Uint8Array.from(atob(e.owner.state.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));
  const p=s.policy;
  require(p.status==='ACTIVE' && p.contact_request_mode==='REQUEST_APPROVAL' && (!p.expires_at || p.expires_at>now()), 'This invitation is no longer accepting messages.');
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:p.schedule.timezone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(v=>[v.type,v.value]));
  const day=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(parts.weekday)+1, minute=Number(parts.hour)*60+Number(parts.minute);
  require(p.schedule.weekdays.includes(day) && minute>=p.schedule.start && minute<p.schedule.end, 'Outside contact hours. Return during the owner’s listed hours.');
}
