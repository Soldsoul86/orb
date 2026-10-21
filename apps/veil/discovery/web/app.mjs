import {verifyPublication,controllerOf,canonical} from './verify.mjs';
import {ID_PREFIX} from '/guest/src/address.mjs';
import {capabilities,sendGuestMessage} from '/guest/src/gate.mjs';
const main=document.querySelector('main');let config,epoch=0,draft={},loaded=null;
function el(tag,text,attrs={}){const n=document.createElement(tag);if(text!==null)n.textContent=text;for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;}
function add(parent,...nodes){parent.append(...nodes);return parent;}
function button(text,fn,secondary=false){const b=el('button',text,{type:'button',...(secondary?{class:'secondary'}:{})});b.addEventListener('click',fn);return b;}
function para(t,cls=''){return el('p',t,{class:cls});}
function field(parent,label,tag='input',attrs={}){const id='f'+Math.random().toString(36).slice(2),n=el(tag,null,{id,...attrs});add(parent,el('label',label,{for:id}),n);return n;}
function select(parent,label,choices,value){const n=field(parent,label,'select');for(const [v,t] of choices)add(n,el('option',t,{value:v}));n.value=value;return n;}
function download(name,value){const u=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=el('a',null,{href:u,download:name});a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
async function api(path,data){const r=await fetch(path,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});if(!r.ok)throw Error(r.status===429?'Too many requests. Please wait a minute.':r.status===409?'A newer revision exists. Sign a fresh update in Veil.':'The directory could not complete this request. Please retry.');return r.json();}
function fail(n,e){n.textContent=e.message;n.classList.add('error');}
function reset(){epoch++;main.replaceChildren();}
function status(){const n=para('', 'muted');n.setAttribute('role','status');main.append(n);return n;}
function summary(parent,p){add(parent,el('h2',p.alias),para(p.purpose));const tags=el('div',null,{class:'tags'});p.tags.forEach(t=>tags.append(el('span',t,{class:'tag'})));parent.append(tags);add(parent,para('Provided by professional · names, skills and examples are self-declared.','muted'));
 if(p.accepting!==undefined)parent.append(para(p.accepting?'Accepting enquiries':'Not accepting requests'));
 if(p.languages?.length)parent.append(para('Languages: '+p.languages.join(', ')));
 if(p.remote!==undefined)parent.append(para(p.remote?'Remote work offered':'In-person work offered'));
 if(p.locations?.length)parent.append(para('Location scope: '+p.locations.join(', ')));
 if(p.budget)parent.append(para(`Stated range: ${p.budget.currency} ${p.budget.min}–${p.budget.max} / ${p.budget.unit}. Confirm scope and price.`));
 if(p.lead_days!==undefined)parent.append(para(`Can start within ${p.lead_days} days — owner statement, not a commitment.`));
 for(const e of p.evidence||[])parent.append(add(el('p',null),el('a',e.title,{href:e.url,target:'_blank',rel:'noopener noreferrer'})));
}
function home(){reset();add(main,para('Purposeful connections','eyebrow'),el('h1','Find the right person for the task.'),para('Describe what you need. Explore people who chose to be found for that purpose.','lead'));
 const entrances=el('div',null,{class:'actions'});add(entrances,button('I need someone',()=>query.focus()),button('I want to be found',()=>location.hash='owner',true));main.append(entrances);
 const form=el('form',null,{class:'wide'}),query=field(form,'Tell us what you need help with.','input',{maxlength:240,placeholder:'Redesign the UI of my Android app',required:'required'}),submit=el('button','Find help',{type:'submit'});add(form,el('div',null,{class:'actions'}));form.lastChild.append(submit);main.append(form);
 const cats=el('div',null,{class:'grid'});config.categories.forEach(c=>cats.append(button(c,()=>search('',c),true)));main.append(cats);
 const examples=el('div',null,{class:'actions'});['Build a small business website','Improve Google search traffic','Learn Python from a tutor'].forEach(q=>examples.append(button(q,()=>{query.value=q;search(q);},true)));main.append(examples);
 const notice=status(),results=el('section',null,{'aria-label':'Search results'});main.append(results);
 async function search(q,c){const request=++epoch;notice.textContent='Finding opted-in profiles…';results.replaceChildren();submit.disabled=true;
  try{const response=await api('/api/search',{query:q,...(c?{category:c}:{})});if(request!==epoch)return;
   form.after(notice,results);
   notice.textContent=response.results.length?`${response.results.length} matching ${response.results.length===1?'profile':'profiles'}.`:'No matching profiles yet.';
   if(response.intent.blocked.length)results.append(para(response.intent.blocked.join(' '),'notice'));
   else if(!response.results.length)results.append(para(response.message||'No active, opted-in profiles match. Try one of the four categories.','notice'));
   const constraints=Object.entries(response.intent).filter(([k,v])=>['languages','remote','locations','budget','lead_days','accepting'].includes(k)&&v!==null).map(([k,v])=>k+': '+JSON.stringify(v));
   if(constraints.length)results.append(para('Applied constraints — '+constraints.join(' · '),'muted'));
   if(response.intent.unknown.length)results.append(para('Not specified: '+response.intent.unknown.join(', '),'muted'));
   if(response.limited)results.append(para('Candidate limit reached. Add a more specific service or constraint.','notice'));
   for(const r of response.results){const id=await controllerOf(r.publication),verified=await verifyPublication(r.publication,id,config);if(request!==epoch)return;
    const article=el('article',null,{class:'card result'});summary(article,verified.document.profile);add(article,para('Why it matched: '+r.why.join(' · '),'muted'),el('a','View profile & contact rules',{href:'#profile/'+id.slice(ID_PREFIX.length)}));results.append(article);}
  }catch(e){if(request===epoch)fail(notice,e);}finally{submit.disabled=false;}}
 form.addEventListener('submit',e=>{e.preventDefault();search(query.value);});
}
async function profile(suffix,contact=false){reset();const request=epoch,notice=status();notice.textContent='Checking the signed purpose…';
 try{const r=await api('/api/profile/'+suffix),v=await verifyPublication(r.publication,ID_PREFIX+suffix,config);if(request!==epoch)return;
  notice.textContent='Signature checked against this purpose address. This proves key control, not professional credentials.';
  add(main,para(v.document.profile.category,'eyebrow'),el('h1',contact?'Contact rules':'A purpose, with boundaries.'));const card=el('article',null,{class:'card wide'});summary(card,v.document.profile);main.append(card);
  card.append(para(`Owner statement signed ${new Date(v.document.issued*1000).toLocaleString()}. Contact permissions can change; this directory does not provide live provider status.`,'muted'));
  const policy=v.state.policy;add(card,el('h3','Contact rules'),para(`Owner approval required. Text only. One introduction. Purpose is ${policy.status.toLowerCase()}.`));
  const hours=policy.schedule,clock=m=>`${Math.floor(m/60).toString().padStart(2,'0')}:${(m%60).toString().padStart(2,'0')}`;
  add(card,para(`Declared contact hours: ${hours.weekdays.map(d=>['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][d-1]).join(', ')} · ${clock(hours.start)}–${clock(hours.end)} · ${hours.timezone}. This does not mean online now.`),para(policy.outside_hours_behavior==='REJECT'?'Requests outside these hours are refused.':'Encrypted requests would wait outside these hours.'),para(`Profile expires ${new Date(v.document.expires*1000).toLocaleString()}.`));
  const gate=para('Secure messaging is not available yet','notice');gate.setAttribute('role','status');card.append(gate);
  if(!contact)card.append(el('a','Review authenticated contact address',{class:'button',href:'#contact/'+suffix}));
  else {const disabled=button('Send unavailable',()=>sendGuestMessage());disabled.disabled=true;add(card,disabled,para('Nothing can be sent from this preview. No guest send endpoint is available.','muted'));}
  const advanced=el('details',null);add(advanced,el('summary','Purpose address & verification'),para('First discovery is trust on first use. Compare this purpose address through an independent channel before relying on identity.'),el('code',v.link),para('The route is signed by the same controller pinned in this profile URL. Route changes and directory updates are manual. This preview does not assert the remote provider hosts a working guest page.'));
  add(advanced,button('Copy purpose link',async()=>{try{await navigator.clipboard.writeText(v.link);notice.textContent='Purpose link copied.';}catch(e){fail(notice,e);}},true),button('Export signed profile',()=>download('veil-public-profile.json',r),true));card.append(advanced);advanced.append(el('img',null,{src:'/api/qr/'+suffix,alt:'QR for the authenticated purpose contact address',class:'qr'}));
  const report=el('details',null);add(report,el('summary','Report this listing'));const reason=select(report,'Reason',[['misleading','Misleading claims'],['abuse','Abuse'],['privacy','Privacy concern']],'misleading');report.append(button('Submit report',async()=>{try{await api('/api/report',{controller:v.document.controller,reason:reason.value});notice.textContent='Report recorded for operator review.';}catch(e){fail(notice,e);}},true));main.append(report);
 }catch(e){if(request===epoch){notice.textContent='This profile is unavailable, removed, expired, or could not be verified. Please retry.';notice.classList.add('error');}}
}
function owner(){reset();add(main,para('Your purpose. Your choice.','eyebrow'),el('h1','Be found for what you do.'),para('Create a private draft, review every public field, then authorize it with your existing Veil purpose on Android. Your private keys stay there.','lead'));
 const form=el('section',null,{class:'wide'});main.append(form);
 const purpose=field(form,'What should people find you for?','textarea',{maxlength:240});purpose.value=draft.purpose||'';
 const alias=field(form,'Public display alias','input',{maxlength:60});alias.value=draft.alias||'';
 const category=select(form,'Review the suggested category',config.categories.map(c=>[c,c]),draft.category||config.categories[0]);
 const tags=el('div',null,{class:'tags',role:'group','aria-label':'Services'});form.append(tags);let selected=new Set(draft.tags||[]);
 function tagsRender(){tags.replaceChildren();for(const t of config.tags[category.value]){const label=el('label',null,{class:'check'}),check=el('input',null,{type:'checkbox'});check.checked=selected.has(t);check.addEventListener('change',()=>check.checked?selected.add(t):selected.delete(t));add(label,check,document.createTextNode(t));tags.append(label);}}
 tagsRender();category.addEventListener('change',()=>{selected.clear();tagsRender();});
 const suggestion=button('Suggest category & services',async()=>{try{const q=purpose.value.toLowerCase(),matches=Object.keys(config.synonyms).filter(t=>config.synonyms[t].some(word=>new RegExp('(?:^|[^a-z])'+word+'(?:$|[^a-z])','u').test(q)));let proposed=config.categories.slice().sort((a,b)=>matches.filter(t=>config.tags[b].includes(t)).length-matches.filter(t=>config.tags[a].includes(t)).length)[0];if(matches.includes('ui')||matches.includes('ux'))proposed=config.categories[1];if(/learn|tutor|teach|lesson|coach|aprender|profesor/.test(q)&&matches.some(t=>config.tags[config.categories[3]].includes(t)))proposed=config.categories[3];if(matches.length){category.value=proposed;selected=new Set(matches.filter(t=>config.tags[proposed].includes(t)));tagsRender();notice.textContent='Suggested from your words. Review the category and services before continuing.';}else notice.textContent='Choose the category and services that describe your purpose.';}catch(e){fail(notice,e);}},true);form.insertBefore(suggestion,category.previousSibling);
 const optional=el('details',null);add(optional,el('summary','Optional details & work examples'),para('Every detail you include here is disclosed in the signed export and, if published, the public page. Leave anything private blank. Do not include phone numbers, email addresses or private addresses.','muted'));form.append(optional);
 const languages=field(optional,'Languages (comma-separated)','input',{placeholder:config.languages.join(', ')});languages.value=(draft.languages||[]).join(', ');
 const remote=select(optional,'Work scope',[['','Not stated'],['true','Remote'],['false','In person'] ],draft.remote===undefined?'':String(draft.remote));
 const locations=field(optional,'Cities or regions (comma-separated)','input',{maxlength:240});locations.value=(draft.locations||[]).join(', ');
 const accepting=select(optional,'Accepting new enquiries',[['','Not stated'],['true','Accepting enquiries'],['false','Not accepting requests']],draft.accepting===undefined?'':String(draft.accepting));
 const evidence=field(optional,'One portfolio link (HTTPS)','input',{type:'url',placeholder:'https://…'});evidence.value=draft.evidence?.[0]?.url||'';
 const evidenceTitle=field(optional,'Work example title','input',{maxlength:100});evidenceTitle.value=draft.evidence?.[0]?.title||'';
 const minimum=field(optional,'Approximate minimum budget','input',{type:'number',min:0,max:10000000});minimum.value=draft.budget?.min??'';
 const maximum=field(optional,'Approximate maximum budget','input',{type:'number',min:0,max:10000000});maximum.value=draft.budget?.max??'';
 const currency=select(optional,'Currency',['USD','EUR','GBP','INR'].map(c=>[c,c]),draft.budget?.currency||'USD'),unit=select(optional,'Budget unit',[['project','Per project'],['hour','Per hour']],draft.budget?.unit||'project');
 const lead=field(optional,'Can start within this many days (optional)','input',{type:'number',min:0,max:365});lead.value=draft.lead_days??'';
 const visibility=select(form,'Visibility',[['PRIVATE','Private — stays in this browser tab'],['LINK_ONLY','Link-only — share a signed export privately'],['PUBLIC','Public — searchable']], 'PRIVATE');
 add(form,para('Public profiles may be indexed and cached elsewhere. Unpublishing removes this directory’s copy; it cannot erase copies or third-party caches. Unlisted exports are not hosted by this preview.','muted'));
 const notice=status(),preview=el('section',null,{'aria-label':'Exact public preview'});main.append(preview);
 function read(){const p={alias:alias.value.trim().normalize('NFC'),purpose:purpose.value.trim().normalize('NFC'),category:category.value,tags:[...selected].sort()};if(!p.alias||!p.purpose||!p.tags.length)throw Error('Add an alias, purpose and at least one service.');
  for(const [k,n] of [['languages',languages],['locations',locations]])if(n.value.trim())p[k]=n.value.split(',').map(v=>v.trim().normalize('NFC'));
  if(p.languages?.some(l=>!config.languages.includes(l)))throw Error('Choose a supported language from the examples.');
  for(const [k,n] of [['remote',remote],['accepting',accepting]])if(n.value!=='')p[k]=n.value==='true';
  if(evidence.value){const u=new URL(evidence.value);if(u.protocol!=='https:'||u.username||u.password||!evidenceTitle.value.trim())throw Error('Use an HTTPS link and a work example title.');p.evidence=[{title:evidenceTitle.value.trim(),url:u.href}];}
  if(minimum.value!==''||maximum.value!==''){if(minimum.value===''||maximum.value===''||Number(maximum.value)<Number(minimum.value))throw Error('Provide both budget bounds in order.');p.budget={min:Number(minimum.value),max:Number(maximum.value),currency:currency.value,unit:unit.value};}
  if(lead.value!=='')p.lead_days=Number(lead.value);return p;}
 form.append(button('Review exact preview',()=>{try{draft=read();preview.replaceChildren();const card=el('article',null,{class:'card'});summary(card,draft);preview.append(card);
  if(visibility.value==='PRIVATE'){add(card,para('Private draft — nothing has been sent or published.'),button('Save private draft file',()=>download('veil-private-draft.json',draft),true));return;}
  const request={v:1,visibility:visibility.value,profile:draft};add(card,para('Next: in Veil Android, open Reach me → Be found. Select a purpose, paste this draft, review its existing contact rules, and authorize the signed export. Return here to review the authenticated route and publish.','notice'),button('Copy draft for Veil',async()=>{try{await navigator.clipboard.writeText(canonical(request));notice.textContent='Draft copied. Paste it into Veil’s Be found screen.';}catch(e){fail(notice,e);}}),button('Download draft for Veil',()=>download('veil-discovery-draft.json',request),true));
 }catch(e){fail(notice,e);}}));
 const signed=el('details',null,{open:'open'});add(signed,el('summary','Review an authorized profile or manage a listing'));const input=field(signed,'Signed profile exported by Veil','textarea',{maxlength:33000,placeholder:'Paste the signed export, not a recovery package.'});
 const file=field(signed,'Or select a signed profile file','input',{type:'file',accept:'.json,application/json'});file.addEventListener('change',async()=>{if(file.files[0]?.size>33000){notice.textContent='File too large.';return;}input.value=await file.files[0].text();});
 const verifiedPanel=el('div',null);add(signed,button('Verify & preview signed export',async()=>{try{const card=JSON.parse(input.value);if(Object.keys(card).join()!=='publication')throw Error('Choose a signed public profile export. Never paste private keys or recovery material.');const id=await controllerOf(card.publication),v=await verifyPublication(card.publication,id,config,{removed:true});loaded=v;verifiedPanel.replaceChildren();
  if(v.state){summary(verifiedPanel,v.document.profile);add(verifiedPanel,el('h3','All signed contact rules'),el('pre',JSON.stringify(v.state.policy,null,2),{class:'rules'}),para('Authenticated contact address: '+v.link));}else verifiedPanel.append(para('This signed command removes public content.'));
  add(verifiedPanel,para(`Visibility: ${v.document.visibility}. Revision: ${v.document.revision}. Signature proves control of this purpose only.`));
  const consent=el('label',null,{class:'check'}),check=el('input',null,{type:'checkbox'});add(consent,check,document.createTextNode('I approve every displayed field, contact rule and route for this publication or removal.'));verifiedPanel.append(consent);
  const publish=button(v.document.visibility==='PUBLIC'?'Publish approved profile':'Apply signed visibility change',async()=>{try{publish.disabled=true;await api('/api/publish',{controller:id,publication:card.publication});notice.textContent=v.document.visibility==='PUBLIC'?'Published. Your opted-in profile is now searchable.':'Directory visibility updated. Copied content elsewhere remains.';
   if(v.document.visibility==='PUBLIC')verifiedPanel.append(el('a','Open published profile',{href:'#profile/'+id.slice(ID_PREFIX.length)}));
  }catch(e){fail(notice,e);publish.disabled=!check.checked;}});publish.disabled=true;check.addEventListener('change',()=>publish.disabled=!check.checked);verifiedPanel.append(publish);
  if(v.state){const manage=el('div',null,{class:'actions'});add(manage,button('Edit draft',()=>{draft=v.document.profile;owner();},true),button('Pause enquiries',()=>change('PUBLIC',true),true),button('Unpublish',()=>change('PRIVATE'),true),button('Delete listing',()=>change('DELETED'),true));verifiedPanel.append(manage);verifiedPanel.append(para('Revoke purpose access in Veil’s existing identity controls. Directory removal alone does not revoke approved contacts.','muted'));}
  function change(visibility,pause=false){const req={v:1,visibility,profile:['PRIVATE','DELETED'].includes(visibility)?{}:{...v.document.profile,accepting:false},...(pause?{pause:true}:{})};download('veil-discovery-change.json',req);notice.textContent='Change prepared. Authorize it in Veil, then import the new signed export to apply it here.';}
 }catch(e){fail(notice,e);}}),verifiedPanel);main.append(signed);
 main.append(button('Delete local draft',()=>{draft={};loaded=null;owner();},true));
}
async function route(){try{if(!config){config=await api('/api/config');if(config.testMode)document.querySelector('#environment').append(el('div','TEST DIRECTORY · synthetic, explicitly opted-in fixtures · no real professionals',{class:'test'}));}
 if(capabilities.guestMessaging||config.guestMessaging)throw Error('Unexpected release gate; preview stopped.');
 const hash=location.hash.slice(1);if(hash==='owner')owner();else if(/^(profile|contact)\/[A-Za-z0-9_-]{43}$/.test(hash))profile(hash.split('/')[1],hash.startsWith('contact/'));else home();
 }catch(e){reset();add(main,el('h1','Directory unavailable'),para(e.message,'error'),button('Retry',route));}}
addEventListener('hashchange',route);route();
