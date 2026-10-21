import {publicId,verifyState} from '/guest/src/identity.mjs';
import {bytes64,encode64,ID_PREFIX,parseAddress} from '/guest/src/address.mjs';
import {strictJson} from '/guest/src/strict-json.mjs';
export const canonical=v=>JSON.stringify(sort(v));
function sort(v){if(Array.isArray(v))return v.map(sort);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])]));return v;}
const decoder=new TextDecoder('utf-8',{fatal:true}),encoder=new TextEncoder();
function exact(v,keys){if(!v||Array.isArray(v)||Object.keys(v).sort().join()!==keys.sort().join())throw Error('Unexpected publication fields');}
export async function verifyPublication(token,expected,config,{removed=false}={}){
 if(typeof token!=='string'||token.length>32000)throw Error('Invalid publication');
 const parts=token.split('.');if(parts.length!==3)throw Error('Invalid signature');
 const h=strictJson(decoder.decode(bytes64(parts[0])));exact(h,['alg','typ','jwk']);
 if(h.alg!=='ES256'||h.typ!=='pi-discovery+jws'||await publicId(h.jwk)!==expected)throw Error('Wrong purpose identity');
 const key=await crypto.subtle.importKey('jwk',h.jwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
 if(bytes64(parts[2]).length!==64||!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,bytes64(parts[2]),encoder.encode(parts[0]+'.'+parts[1])))throw Error('Invalid signature');
 const raw=decoder.decode(bytes64(parts[1])),d=strictJson(raw),now=Math.floor(Date.now()/1000);
 exact(d,['v','controller','revision','created','issued','expires','visibility','consent','profile','state']);
 if(canonical(d)!==raw||d.v!==1||d.controller!==expected||!Number.isSafeInteger(d.revision)||d.revision<1||d.revision>1000000||
 ![d.created,d.issued,d.expires].every(Number.isSafeInteger)||d.created<1||d.created>d.issued||d.issued>now+60||d.expires<=now||d.expires<=d.issued||d.expires>d.issued+2592000||
 !['PRIVATE','LINK_ONLY','PUBLIC','DELETED'].includes(d.visibility)||d.consent!==(d.visibility==='PUBLIC'))throw Error('Invalid or expired publication');
 if(['PRIVATE','DELETED'].includes(d.visibility)){if(!removed||canonical(d.profile)!=='{}'||d.state!==null)throw Error('Removed listing');return {document:d,state:null,link:null};}
 const p=d.profile;
 if(!p||!config.categories.includes(p.category)||!Array.isArray(p.tags)||!p.tags.length||p.tags.some(t=>!config.tags[p.category].includes(t)))throw Error('Unsupported service');
 if(Object.keys(p).some(k=>!['alias','purpose','category','tags','languages','locations','remote','evidence','accepting','budget','lead_days'].includes(k)))throw Error('Unexpected profile fields');
 for(const [k,max] of [['alias',60],['purpose',240]])if(typeof p[k]!=='string'||!p[k].trim()||p[k].length>max)throw Error('Invalid profile text');
 for(const e of p.evidence||[]){const u=new URL(e.url);if(u.protocol!=='https:'||u.username||u.password)throw Error('Unsafe evidence URL');}
 // Extract route only to construct the address. verifyState authenticates it against expected.
 const untrusted=strictJson(decoder.decode(bytes64(d.state.split('.')[1])));
 const link=untrusted.route+'/g/'+expected.slice(ID_PREFIX.length),address=parseAddress(link,untrusted.route);
 const s=await verifyState(d.state,address);
 if(s.policy.discovery_mode!==(d.visibility==='PUBLIC'?'PUBLIC_SEARCHABLE':'LINK_ONLY')||!['ACTIVE','PAUSED'].includes(s.policy.status)||
 (s.policy.expires_at&&d.expires>s.policy.expires_at)||!['REQUEST_APPROVAL','DISABLED'].includes(s.policy.contact_request_mode)||
 (p.accepting===true&&(s.policy.status!=='ACTIVE'||s.policy.contact_request_mode!=='REQUEST_APPROVAL')))throw Error('Purpose rules do not authorize this listing');
 return {document:d,state:s,link};
}
export function controllerOf(token){const h=strictJson(decoder.decode(bytes64(token.split('.')[0])));return publicId(h.jwk);}
