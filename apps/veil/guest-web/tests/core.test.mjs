import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseAddress,encode64,ID_PREFIX} from '../src/address.mjs';
import {strictJson} from '../src/strict-json.mjs';
import {publicId,verifyStatement,verifyState} from '../src/identity.mjs';
import {initialState,transition,installVisible,normalizeMessage} from '../src/state.mjs';
import {capabilities,sendGuestMessage} from '../src/gate.mjs';
const host='https://guest.example',pin=encode64(new Uint8Array(32).fill(7)),ref=encode64(new Uint8Array(32).fill(9));
const address=host+'/g/'+pin+'#'+ref;
const encoder=new TextEncoder();
async function identity(){const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const k=await crypto.subtle.exportKey('jwk',keys.publicKey);const jwk={kty:k.kty,crv:k.crv,x:k.x,y:k.y};return {keys,jwk,id:await publicId(jwk)};}
async function sign(who,payload,type='pi-state+jws',extra={}){
 const head=encode64(encoder.encode(JSON.stringify({alg:'ES256',typ:type,jwk:who.jwk,...extra})));
 const body=encode64(encoder.encode(typeof payload==='string'?payload:JSON.stringify(payload)));
 const sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},who.keys.privateKey,encoder.encode(head+'.'+body));return head+'.'+body+'.'+encode64(new Uint8Array(sig));
}
function state(who){return {v:1,id:who.id,device:who.jwk,revision:2,issued:1000,epoch:'a'.repeat(32),route:host,policy:{display_name:'Home repairs',discovery_mode:'UNLISTED'}};}
test('strict public controller address distinguishes reusable and unlisted; reference grants nothing',()=>{
 assert.equal(parseAddress(address,host).controller,ID_PREFIX+pin);assert.equal(parseAddress(address,host).kind,'unlisted');assert.equal(parseAddress(host+'/g/'+pin,host).kind,'reusable');
});
test('malformed, normalized, cross-origin and legacy invitations cannot become pinned guest addresses',()=>{
 for(const value of [' '+address,address+' ',address+'?redirect=https://evil.example',address.replace('/g/','/x/../g/'),address.replace('/g/','/%67/'),address.replace('/g/','//g/'),address.replace('https:','http:'),address.replace('guest.example','evil.example'),address.replace('guest.example','guest.example:443'),address.replace('guest.example','user@guest.example'),address.replace('/g/','\\g/'),address.replace(pin,'Plombier-é'),host+'/i#'+ref,address+'=',address.replace(pin,pin.slice(0,-1)+'f'),address.replace('guest.example','guest.example.')]) assert.throws(()=>parseAddress(value,host));
});
test('duplicate JSON members, pollution, excessive nesting and invalid numeric forms rejected',()=>{
 for(const value of ['{"v":1,"v":2}','{"nested":{"x":1,"x":2}}','[01]','[1,]','{"a":1,}','1e999','{"x":"\n"}','['.repeat(26)+'0'+']'.repeat(26)])assert.throws(()=>strictJson(value));
 assert.equal(strictJson('{"__proto__":{"admin":true}}').__proto__.admin,true);assert.equal({}.admin,undefined);
 assert.deepEqual(JSON.parse(JSON.stringify(strictJson('{"a":[true,false,null,"é\\n",-1.5e2]}'))),{a:[true,false,null,'é\n',-150]});
});
test('ES256 state authenticates only the independently pinned controller',async()=>{
 const a=await identity(),b=await identity(),s=state(a),token=await sign(a,s),addr={controller:a.id,origin:host,kind:'unlisted'};
 assert.equal((await verifyState(token,addr)).policy.display_name,'Home repairs');await assert.rejects(verifyState(token,{...addr,controller:b.id}));
 const parts=token.split('.');parts[1]=encode64(encoder.encode(JSON.stringify({...s,policy:{display_name:'Mallory'}})));await assert.rejects(verifyState(parts.join('.'),addr));
});
test('wrong JOSE type, algorithm, external key URL and duplicate header claims fail closed',async()=>{
 const a=await identity(),s=state(a);
 for(const extra of [{alg:'none'},{jku:'https://evil.example/keys'},{crit:['x']},{jwk:{...a.jwk,d:ref}}])await assert.rejects(verifyStatement(await sign(a,s,'pi-state+jws',extra),a.id,'pi-state+jws'));
 await assert.rejects(verifyStatement(await sign(a,s,'pi-grant+jws'),a.id,'pi-state+jws'));
 await assert.rejects(verifyStatement(await sign(a,'{"v":1,"v":2}'),a.id,'pi-state+jws'));
});
test('state route substitution, known rollback, private keys and reusable unlisted scope rejected',async()=>{
 const a=await identity(),s=state(a),addr={controller:a.id,origin:host,kind:'unlisted'};
 await assert.rejects(verifyState(await sign(a,s),addr,3));
 for(const changes of [{route:'https://evil.example'},{device:{...a.jwk,d:ref}},{revision:1.5},{epoch:'wrong'},{id:ID_PREFIX+pin}])await assert.rejects(verifyState(await sign(a,{...s,...changes}),addr));
 await assert.rejects(verifyState(await sign(a,s),{...addr,kind:'reusable'}));
});
test('release remains disabled; no send fallback even when callers request enabling',async()=>{
 assert.equal(capabilities.guestMessaging,false);assert.throws(()=>{capabilities.guestMessaging=true;});
 await assert.rejects(sendGuestMessage({plaintext:'DO NOT SEND',enabled:true}),/BROWSER_CRYPTO_UNAVAILABLE/);
});
test('pending cannot send twice; unverified acceptance and reply cannot expose install offer',()=>{
 let s=transition(initialState(),{type:'sending'});s=transition(s,{type:'pending',authenticated:true});
 assert.throws(()=>transition(s,{type:'sending'}));assert.throws(()=>transition(s,{type:'accepted'}));assert.equal(installVisible(s),false);
 s=transition(s,{type:'accepted',authenticated:true});assert.equal(installVisible(s),false);assert.throws(()=>transition(s,{type:'reply',authenticated:true}));
 s=transition(s,{type:'reply',authenticated:true,decrypted:true});assert.equal(installVisible(s),true);assert.equal(installVisible(transition(s,{type:'dismiss'})),false);
 for(const type of ['blocked','revoked','expired']){const ended=transition(s,{type,authenticated:true});assert.throws(()=>transition(ended,{type:'accepted',authenticated:true}));assert.equal(installVisible(ended),false);}
});
test('lost session is terminal and never inferred recoverable from a URL',()=>{const s=transition(initialState(),{type:'lost'});assert.equal(installVisible(s),false);assert.throws(()=>transition(s,{type:'sending'}));});
test('Unicode text normalization, bounded input and literal HTML treatment',()=>{assert.equal(normalizeMessage('  cafe\u0301\r\nhello '),'café\nhello');assert.equal(normalizeMessage('<script>alert(1)</script>'),'<script>alert(1)</script>');for(const text of [' ', 'a'.repeat(4001),'secret\u0000'])assert.throws(()=>normalizeMessage(text));});
test('Nimbus Android identity-core signed fixture verifies in Web Crypto', {skip:!process.env.VEIL_PUBLIC_FIXTURE}, async()=>{
 const f=JSON.parse(await readFile(process.env.VEIL_PUBLIC_FIXTURE,'utf8'));
 assert.equal((await verifyState(f.state,{controller:f.id,origin:f.origin,kind:'unlisted'})).id,f.id);
 await assert.rejects(verifyState(f.state,{controller:ID_PREFIX+pin,origin:f.origin,kind:'unlisted'}));
});
