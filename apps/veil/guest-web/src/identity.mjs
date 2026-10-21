// Verify the existing pi/1 RFC7515/ES256 profile. This does NOT encrypt messages.
import {bytes64,encode64,ID_PREFIX,origin} from './address.mjs';
import {strictJson} from './strict-json.mjs';
const encoder=new TextEncoder(), decoder=new TextDecoder('utf-8',{fatal:true});
function fields(value,keys) {if(!value||Array.isArray(value)||Object.keys(value).sort().join(',')!==keys.sort().join(','))throw new Error('INVALID_STATEMENT');}
export async function publicId(jwk) {
  fields(jwk,['kty','crv','x','y']);
  if(jwk.kty!=='EC'||jwk.crv!=='P-256'||bytes64(jwk.x).length!==32||bytes64(jwk.y).length!==32)throw new Error('INVALID_KEY');
  await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  const canonical=JSON.stringify({crv:jwk.crv,kty:jwk.kty,x:jwk.x,y:jwk.y});
  return ID_PREFIX+encode64(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(canonical))));
}
export async function verifyStatement(token,expectedId,type) {
  if(typeof token!=='string'||token.length>262144||!['pi-state+jws','pi-channel+jws','pi-grant+jws'].includes(type))throw new Error('INVALID_STATEMENT');
  const parts=token.split('.');if(parts.length!==3)throw new Error('INVALID_STATEMENT');
  const header=strictJson(decoder.decode(bytes64(parts[0])));fields(header,['alg','typ','jwk']);
  if(header.alg!=='ES256'||header.typ!==type||await publicId(header.jwk)!==expectedId)throw new Error('WRONG_IDENTITY');
  const signature=bytes64(parts[2]);if(signature.length!==64)throw new Error('INVALID_SIGNATURE');
  const key=await crypto.subtle.importKey('jwk',header.jwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,signature,encoder.encode(parts[0]+'.'+parts[1])))throw new Error('INVALID_SIGNATURE');
  const value=strictJson(decoder.decode(bytes64(parts[1])));
  if(!value||value.v!==1||typeof value!=='object'||Array.isArray(value))throw new Error('INVALID_STATEMENT');
  return value;
}
export async function verifyState(token,address,minimumRevision=1) {
  const s=await verifyStatement(token,address.controller,'pi-state+jws');
  fields(s,['v','id','device','revision','issued','epoch','route','policy']);
  if(!Number.isSafeInteger(minimumRevision)||minimumRevision<1||s.id!==address.controller||!Number.isSafeInteger(s.revision)||s.revision<minimumRevision||s.revision>1000000||!Number.isSafeInteger(s.issued)||s.issued<0||!/^\p{ASCII}+$/u.test(s.epoch)||! /^[a-f0-9]{32}$/.test(s.epoch)||origin(s.route)!==address.origin)throw new Error('INVALID_STATE');
  await publicId(s.device);
  // Full policy evaluation remains the provider's job; this is public metadata validation.
  const name=s.policy?.display_name;
  if(typeof name!=='string'||name.length<1||name.length>60||/[\u0000-\u001f\u007f]/.test(name))throw new Error('INVALID_STATE');
  if(address.kind==='reusable'&&!['LINK_ONLY','PUBLIC_SEARCHABLE'].includes(s.policy.discovery_mode))throw new Error('UNLISTED_PURPOSE');
  return s;
}
