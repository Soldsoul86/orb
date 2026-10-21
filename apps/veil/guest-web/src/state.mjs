// Presentation only: verified protocol events must be supplied by the future adapter.
export const copy=Object.freeze({
  unavailable:'Browser messaging is not available yet. Nothing has been sent.',
  first:'Write a message to start a conversation.',
  sending:'Sending… Keep this page open.',
  pending:'Message sent. Waiting for approval.',
  accepted:'You can now reply here.',
  declined:'Your request was declined. You cannot send more messages.',
  blocked:'This contact is unavailable. You cannot send more messages.',
  expired:'This contact has expired. Ask for a new invitation.',
  revoked:'This contact has ended. You cannot send more messages.',
  offline:'You are offline. Your message has not been confirmed as sent.',
  failed:'The message was not confirmed. Retry when you are connected.',
  lost:'This browser session is no longer available. Start a new request; earlier messages cannot be recovered here.',
  installTitle:'Keep this conversation in Veil',
  installDetail:'Protected photos and videos are available in the app. Moving this browser conversation and background notifications are not available yet.'
});
const terminal=new Set(['declined','blocked','expired','revoked','lost']);
const allowed={first:['sending','expired'],sending:['pending','offline','failed','expired'],pending:['accepted','declined','blocked','expired','revoked','offline'],accepted:['revoked','blocked','expired','offline'],offline:['first','pending','accepted','failed','expired','revoked'],failed:['sending','expired']};
export function initialState(){return Object.freeze({phase:'first',hasReply:false,dismissed:false});}
export function transition(state,event){
  if(event.type==='lost')return Object.freeze({...state,phase:'lost',hasReply:false});
  if(event.type==='dismiss')return Object.freeze({...state,dismissed:true});
  if(event.type==='reply') {
    if(state.phase!=='accepted'||event.authenticated!==true||event.decrypted!==true)throw new Error('UNVERIFIED_REPLY');
    return Object.freeze({...state,hasReply:true});
  }
  if(terminal.has(state.phase)||!allowed[state.phase]?.includes(event.type))throw new Error('INVALID_TRANSITION');
  if(['pending','accepted','declined','blocked','revoked'].includes(event.type)&&event.authenticated!==true)throw new Error('UNVERIFIED_EVENT');
  return Object.freeze({...state,phase:event.type});
}
export function installVisible(state){return state.phase==='accepted'&&state.hasReply&&!state.dismissed;}
export function normalizeMessage(value,max=4000){
  if(typeof value!=='string')throw new Error('INVALID_MESSAGE');
  const s=value.normalize('NFC').replaceAll('\r\n','\n').trim();
  if(!s||s.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s))throw new Error('INVALID_MESSAGE');
  return s;
}
