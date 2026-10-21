// Browser-origin storage, not a remote backup. Never silently create a replacement session.
export async function storage() {
  const db = await new Promise((resolve,reject)=> {
    const r=indexedDB.open('veil-pilot-v1',1);
    r.onupgradeneeded=()=>r.result.createObjectStore('conversations');
    r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(Error('Browser storage is unavailable. Enable storage to message here.'));
    r.onblocked=()=>reject(Error('Close other Veil tabs before continuing.'));
  });
  async function transaction(mode, op) {
    return new Promise((resolve,reject)=> {
      const t=db.transaction('conversations',mode,{durability:'strict'}), r=op(t.objectStore('conversations'));
      t.oncomplete=()=>resolve(r?.result); t.onerror=t.onabort=()=>reject(Error('Could not save this conversation. Do not clear browser data; close other tabs and retry.'));
    });
  }
  return { get:id=>transaction('readonly',s=>s.get(id)), put:(id,value,index)=>transaction('readwrite',s=>{s.put(value,id);if(index)s.put(id,index);}), close:()=>db.close() };
}
export async function exclusive(id,operation) {
  if (!navigator.locks) throw Error('This browser cannot safely save a private conversation. Use a supported browser.');
  return navigator.locks.request('veil-pilot:'+id,{ifAvailable:true},async lock=> {
    if(!lock)throw Error('This conversation is open in another tab. Close that tab, then refresh here.');
    return operation();
  });
}
