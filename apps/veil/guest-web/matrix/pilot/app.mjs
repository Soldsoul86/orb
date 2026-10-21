import { CryptoEndpoint } from '../integration/crypto-endpoint.mjs';
import { storage, exclusive } from './storage.mjs';
import { require, random, now, hash, hexHash, same, identity, sign, verify, card, enrollment, allowed } from './protocol.mjs';

const $=id=>document.getElementById(id), params=new URLSearchParams(location.hash.slice(1));
const pathPin=/^\/g\/([A-Za-z0-9_-]{43})$/.exec(location.pathname);
const pin=pathPin?'urn:ietf:params:oauth:jwk-thumbprint:sha-256:'+pathPin[1]:params.get('owner'), resume=params.get('conversation');
let invite=params.get('invite');
let connected=false;
let db, data, endpoint, enrollmentValue, owner, active=false, fatal=false, busy=false, saving=Promise.resolve();
let status='Write a short introduction. The owner approves before you can continue.';
const fail=error=>{ status=error.message || 'Failed. Check your connection and retry.'; render(); };
async function save() {
  saving=saving.then(()=>db.put(data.localId,structuredClone(data),"index:"+invite+pin));
  try {await saving;} catch(error) {fatal=true;throw error;}
}
async function api(path,method='GET',body,authenticated=true) {
  require(!fatal,'Storage failed. Close this tab and reopen your saved conversation.');
  const r=await fetch(path,{method,cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json',...(authenticated && data?.login ? {Authorization:'Bearer '+data.login.access_token}: {})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error(r.status===403?'Unavailable. Permission may have ended; refresh to check.':'Failed to reach the service. Retry uses the same saved request.');
  return r.json();
}
async function metadata() {
  const result=data?.conversation ? await api('/pilot/conversation/'+data.conversation) : await api('/pilot/invite/'+invite);
  const e=await enrollment(result.enrollment,pin,invite);
  if(data?.enrollment) {
    const old=await enrollment(data.enrollment,pin,invite);
    require(e.revision>=old.revision && (e.revision!==old.revision || same(e,old)));
    require(same((await card(e.owner,pin)).endpoint,(await card(old.owner,pin)).endpoint));
  }
  enrollmentValue=e;owner=await card(e.owner,pin);
  if(data) {
    data.enrollment=result.enrollment;
    if(data.conversation) {
      const claim=await verify(result.claim,data.identity.id,'pi-matrix-claim+jws');
      require(claim.invite===invite && same(claim.guest,data.card));
      if(result.decision) {
        const p=await verify(result.decision,pin,'pi-matrix-policy+jws');
        require(p.iss===pin && p.invitation===data.conversation && p.expires===e.expires && p.issued===e.issued);
        require(same(p.guest,data.card) && same(p.owner,data.initialOwner));
        require(['approved','declined','blocked','revoked'].includes(p.status) && Number.isSafeInteger(p.revision) && p.revision>=2);
        if(data.decision) {const old=await verify(data.decision,pin,'pi-matrix-policy+jws');require(p.revision>=old.revision && (p.revision!==old.revision || same(p,old)));}
        const changed=data.permission!==p.status;
        data.decision=result.decision;data.permission=p.status;
        if(changed)status=p.status==='approved'?'Approved · you can continue':'This conversation is '+p.status+'.';
      } else require(!data.decision);
    }
    await save();
  }
  render();
}
function permission() {
  allowed(enrollmentValue);
  require(!data || ['pending','approved'].includes(data.permission),'This conversation is '+data?.permission+'.');
}
async function connect() {
  if(connected)return;
  if(!data.login) {
    const {nonce}=await api('/pilot/challenge','POST',{},false);
    const proof=await sign({v:1,iss:data.identity.id,invite,nonce},'pi-matrix-bootstrap+jws',data.identity);
    data.login=await api('/pilot/bootstrap','POST',{controller:data.identity.id,proof},false);await save();
  }
  if(!endpoint)endpoint=await CryptoEndpoint.open({userId:data.login.user_id,deviceId:data.login.device_id,request:api,
    storeName:'veil-crypto-'+data.localId,storePassphrase:data.passphrase,expectedKeys:data.keys,since:data.since,
    beforeSync:async hasEvents=>{if(hasEvents){data.cryptoPending=true;await save();}},
    checkpoint:async since=>{data.since=since;data.cryptoPending=false;await save();},
    onError:error=>{status=fatal?error.message:'Connection interrupted. Keep this page open or return here later.';render();},
    onMessage:async payload=>{
      try {
      const event=payload.message;
      if(event?.type!=='chat.veil.pilot')return;
      await metadata();permission();require(data.permission==='approved');
      require(event.sender===owner.endpoint.user_id && payload.encryptionInfo?.senderVerified && payload.encryptionInfo.senderDevice===owner.endpoint.device_id && payload.encryptionInfo.senderCurve25519KeyBase64===owner.endpoint.curve25519);
      const m=await verify(event.content.jws,pin,'pi-matrix-message+jws');
      require(m.iss===pin && m.recipient===data.identity.id && m.invitation===data.conversation && m.expires>now() && m.expires<=enrollmentValue.expires);
      require(typeof m.text==='string' && m.text.length<=4000 && typeof m.id==='string');
      if(data.messages.some(x=>x.id===m.id))return;
      require(data.messages.length<200,'Conversation limit reached.');
      data.messages.push({id:m.id,text:m.text,mine:false});await save();status='Replied';render();
      } catch(error) { if(fatal)throw error; status='An unverifiable message was refused.';render(); }
    }});
  if(!data.keys){data.keys=endpoint.keys;await save();}
  if(!data.card) {
    const state=await sign({v:1,id:data.identity.id,device:data.identity.pub,revision:1,issued:now(),epoch:random().slice(0,32),route:owner.state.route,
      policy:{...owner.state.policy,display_name:'Browser visitor',description:'',discovery_mode:'UNLISTED'}},'pi-state+jws',data.identity);
    data.card={id:data.identity.id,state,binding:await sign({v:1,iss:data.identity.id,state_hash:await hash(state),endpoint:{user_id:data.login.user_id,device_id:data.login.device_id,...data.keys}},'pi-matrix-binding+jws',data.identity)};
    await save();
  }
  await endpoint.pin(owner.endpoint);
  if(!data.conversation) {
    if(!data.claim){data.claim=await sign({v:1,iss:data.identity.id,invite,guest:data.card},'pi-matrix-claim+jws',data.identity);await save();}
    const r=await api('/pilot/claim','POST',{guest:data.identity.id,token:data.claim});
    require(r.conversation===await hexHash(invite+data.identity.id));
    data.conversation=r.conversation;data.initialOwner=enrollmentValue.owner;await save();
  }
  await metadata();
  await endpoint.start();connected=true;
}
async function flush() {
  await metadata();permission();
  const out=data.outbox;
  if(!out)return;
  require(out.expires>now(),'Expired. This saved message was not resent.');
  if(!out.body) {
    require(data.permission==='approved' || !data.sent,'Awaiting approval. You can send again once the owner accepts.');
    const jws=await sign({v:1,iss:data.identity.id,recipient:pin,invitation:data.conversation,id:out.id,expires:out.expires,text:out.text},'pi-matrix-message+jws',data.identity);
    out.body=await endpoint.encrypt(owner.endpoint,'chat.veil.pilot',{jws});await save();
  }
  status='Sending';render();
  await api('/_matrix/client/v3/sendToDevice/m.room.encrypted/'+out.id,'PUT',out.body);
  data.sent=true;
  if(!data.messages.some(x=>x.id===out.id))data.messages.push({id:out.id,text:out.text,mine:true});
  data.outbox=null;await save();
  status=data.permission==='pending'?'Received by service · awaiting approval':'Received by service';render();
}
async function send() {
  if(busy || fatal)return;
  busy=true;render();
  try {
    permission();
    if(!data) {
      data={localId:random(),identity:await identity(),passphrase:random(),owner:pin,invite,permission:'pending',messages:[],since:''};
      await save();
      params.set('conversation',data.localId);history.replaceState(null,'','#'+params.toString());
    }
    if(!data.outbox) {
      const text=$('message').value.trim();require(text.length>0 && text.length<=4000);
      require(data.permission==='approved' || !data.sent,'Awaiting approval.');
      data.outbox={id:random(),text,expires:Math.min(now()+3600,enrollmentValue.expires)};await save();
    }
    status='Sending';render();
    await connect();await flush();$('message').value='';
  } catch(error) {fail(error);}
  finally {busy=false;render();}
}
function render() {
  $('name').textContent=owner?.state.policy.display_name || 'Private message';
  $('purpose').textContent=owner?.state.policy.description || '';
  let ended=false;
  try {if(enrollmentValue && !fatal)permission();}catch(error){status=error.message;ended=true;}
  $('status').textContent=status;
  $('send').textContent=data?.outbox?'Retry saved message':data?.sent?'Send message':'Send request';
  $('send').disabled=!active || busy || fatal || ended || (data?.sent && data.permission!=='approved' && !data.outbox);
  $('refresh').disabled=fatal || busy;
  $('message').disabled=!!data?.outbox || ended || fatal;
  $('messages').replaceChildren(...(data?.messages || []).map(m=>{const el=document.createElement('p');el.className=m.mine?'mine':'theirs';el.textContent=(m.mine?'You: ':'Reply: ')+m.text;return el;}));
  $('install').hidden=!(data?.messages.some(m=>!m.mine));
}
$('send').addEventListener('click',send);
$('refresh').addEventListener('click',async()=>{try {await metadata();if(data){await connect();if(data.outbox)await flush();}status=data?.permission==='approved'?'Approved · you can continue':data?.sent?'Awaiting approval':'Ready';render();}catch(error){fail(error);}});
async function start() {
  if(pathPin && !invite) {
    const result=await api('/pilot/resolve/'+pathPin[1]);
    const candidate=await verify(result.enrollment,pin,'pi-matrix-enrollment+jws');
    const verified=await enrollment(result.enrollment,pin,candidate.invite);
    const state=(await card(verified.owner,pin)).state;
    require(['LINK_ONLY','PUBLIC_SEARCHABLE'].includes(state.policy.discovery_mode));
    invite=verified.invite;params.set('owner',pin);params.set('invite',invite);
    history.replaceState(null,'','/contact#'+params.toString());
  }
  require(pin?.startsWith('urn:ietf:params:oauth:jwk-thumbprint:sha-256:') && /^[a-f0-9]{64}$/.test(invite),'This link is incomplete. Ask the owner to share it again.');
  db=await storage();
  await exclusive(invite + pin,async()=> {
    const localId=resume || await db.get('index:'+invite+pin);
    if(localId) {
      require(/^[a-f0-9]{64}$/.test(localId));data=await db.get(localId);
      require(data && data.owner===pin && data.invite===invite,'Browser data was lost. This conversation cannot be restored. Ask the owner for a new invitation.');
      require(!data.cryptoPending,'Saving an encrypted message was interrupted. This session is locked to prevent silent message loss. Keep browser data and contact the pilot operator.');
      params.set('conversation',localId);history.replaceState(null,'','/contact#'+params.toString());
    }
    await metadata();active=true;render();
    if(data){await connect();status=data.outbox?'A saved message needs retry.':data.messages.some(m=>!m.mine)?'Replied':data.sent?'Awaiting approval':'Ready';render();}
    const timer=setInterval(()=>{if(active && !busy)metadata().catch(()=>{});},5000);
    await new Promise(resolve=>window.addEventListener('pagehide',()=>{active=false;clearInterval(timer);resolve();},{once:true}));
    await endpoint?.close();db.close();
  });
}
start().catch(error=>{active=false;fatal=true;fail(error);});
