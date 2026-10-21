// Test-only browser owner. Never included unless serve.mjs --test is explicitly selected.
import {CryptoEndpoint} from '../integration/crypto-endpoint.mjs';
import {identity,sign,now,hash,random,card,verify,require} from './protocol.mjs';
let login,key,client,own,enrolled;const messages=[];
async function api(path,method='GET',body){const r=await fetch(path,{method,headers:{'Content-Type':'application/json',...(login?{Authorization:'Bearer '+login.access_token}:{})},body:body===undefined?undefined:JSON.stringify(body)});require(r.ok,'HTTP '+r.status);return r.json();}
async function init(account) {
 login=await api('/_matrix/client/v3/login','POST',{type:'m.login.password',identifier:{type:'m.id.user',user:account.username},password:account.password,device_id:account.device});
 key=await identity();client=await CryptoEndpoint.open({userId:login.user_id,deviceId:login.device_id,request:api,onMessage:async p=>{
 if(p.message.type!=='chat.veil.pilot')return;
 const cs=await api('/pilot/inbox');for(const c of cs.conversations){const g=c.policy.guest,e=(await card(g,g.id)).endpoint;if(e.user_id!==p.message.sender)continue;require(p.encryptionInfo.senderVerified);const m=await verify(p.message.content.jws,g.id,'pi-matrix-message+jws');if(!messages.some(x=>x.id===m.id))messages.push(m);}
 }});
 const policy={display_name:'TEST Alex',description:'Design help',discovery_mode:'UNLISTED',contact_request_mode:'REQUEST_APPROVAL',allowed_content_types:['text'],schedule:{timezone:'UTC',weekdays:[1,2,3,4,5,6,7],start:0,end:1440},outside_hours_behavior:'REJECT',first_contact_message_limit:1,inactivity_days:7,expires_at:now()+3600,notification_behavior:'SILENT_IN_APP',status:'ACTIVE',policy_version:1};
 const state=await sign({v:1,id:key.id,device:key.pub,revision:1,issued:now(),epoch:random().slice(0,32),route:'https://veil.test',policy},'pi-state+jws',key);
 own={id:key.id,state,binding:await sign({v:1,iss:key.id,state_hash:await hash(state),endpoint:{user_id:login.user_id,device_id:login.device_id,...client.keys}},'pi-matrix-binding+jws',key)};
 enrolled={v:1,iss:key.id,invite:random(),revision:1,issued:now(),expires:now()+3600,owner:own};
 await api('/pilot/enroll','POST',{owner:key.id,token:await sign(enrolled,'pi-matrix-enrollment+jws',key)});
 return '/contact#'+new URLSearchParams({owner:key.id,invite:enrolled.invite});
}
async function sync(){const cs=await api('/pilot/inbox');for(const c of cs.conversations)await client.pin((await card(c.policy.guest,c.policy.guest.id)).endpoint);if(!window.started){await client.start();window.started=true;}return cs.conversations;}
async function decide(id,status){const p=(await api('/pilot/inbox')).conversations.find(c=>c.id===id).policy;p.revision++;p.status=status;return api('/veil/policy','POST',{owner:key.id,token:await sign(p,'pi-matrix-policy+jws',key)});}
async function reply(id,text){const p=(await api('/pilot/inbox')).conversations.find(c=>c.id===id).policy;const peer=(await card(p.guest,p.guest.id)).endpoint;const jws=await sign({v:1,iss:key.id,recipient:p.guest.id,invitation:id,id:random(),expires:p.expires,text},'pi-matrix-message+jws',key);const body=await client.encrypt(peer,'chat.veil.pilot',{jws});await api('/_matrix/client/v3/sendToDevice/m.room.encrypted/'+random(),'PUT',body);}
window.fixture={init,sync,decide,reply,messages,api};
