import {copy,installVisible} from './state.mjs';
function element(tag,text,attrs={}) {const e=document.createElement(tag);if(text)e.textContent=text;for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e;}
export function renderGuest(root,{state,displayName='',available=false,onDismiss=()=>{}}) {
  root.replaceChildren();
  root.append(element('p','VEIL',{class:'brand'}));
  root.append(element('h1',displayName?`Message ${displayName}`:'Message a Veil contact',{dir:'auto'}));
  const notice=element('p',available?copy[state.phase]:copy.unavailable,{role:'status','aria-live':'polite',class:'notice'});root.append(notice);
  const form=element('form','',{'aria-label':'Guest message',autocomplete:'off'});
  // This build never invokes transport, even if someone removes disabled attributes.
  form.addEventListener('submit',e=>{e.preventDefault();notice.textContent=copy.unavailable;});
  const name=element('input','',{id:'guest-name',name:'name',maxlength:'60',dir:'auto',autocomplete:'off',disabled:''});
  const message=element('textarea','',{id:'message',name:'message',maxlength:'4000',rows:'5',dir:'auto',placeholder:'Write a message…',disabled:''});
  form.append(element('label','Your name (optional)',{for:'guest-name'}),name,element('label','Your message',{for:'message'}),message,element('button','Send',{type:'submit',disabled:''}));root.append(form);
  root.append(element('p','No account or phone number needed.',{class:'muted'}));
  if(available&&installVisible(state)) {
    const offer=element('aside','',{'aria-label':'Optional app installation'});
    offer.append(element('h2',copy.installTitle),element('p',copy.installDetail));
    // No download CTA is wired before real two-way crypto exists. Test fixtures only show copy.
    for(const text of ['Continue here','Dismiss']) {const b=element('button',text,{type:'button',class:'secondary'});b.addEventListener('click',onDismiss);offer.append(b);}
    root.append(offer);
  }
}
