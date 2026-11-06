/* Repository write receipts. Reads never acknowledge a save. */
const SaveStatus=(()=>{
 const store=SuiteSaveStatus.create(),revisions=new Map();let mount;
 let localRevision=0,localState={state:'ready',at:null,reason:''},localRetry=null;
 const source=()=>XHS.store.source();
 const key=p=>source()+'::'+p;
 function pending(p,retry){const s=source(),k=key(p),revision=store.pending(k,()=>{if(source()!==s)throw Error('conflict');return retry();});if(p==="content.json")XHS.store.flush().then(()=>store.retained(k,true),()=>store.retained(k,false));revisions.set(k,revision);return {key:k,revision};}
 function start(p,retry,q){q=q||{key:key(p),revision:revisions.get(key(p))};if(!q.revision)q=pending(p,retry);return store.start(q.key,q.revision);}
 async function run(p,retry,fn){const t=start(p,retry,pending(p,retry));try{const r=await fn();store.succeed(t,r?.wrote===false?null:new Date());return r;}catch(e){store.fail(t,e);throw e;}}
 function reset(){revisions.clear();localRevision++;localState={state:'ready',at:null,reason:''};store.reset();refresh();}
 function paintOwned(){
  const el=document.querySelector('[data-save-status]'),label=el?.querySelector('[role=status]'),button=el?.querySelector('button');if(!label)return;
  const zh=XHS.i18n.lang==='zh';
  if(XHS.sync.isConfigured()&&innerWidth<900){const snapshot=store.snapshot(),full=SuiteSaveStatus.describe(snapshot,XHS.i18n.lang),short={ready:zh?'已载入':'Loaded',saved:zh?'已保存':'Saved',saving:zh?'保存中…':'Saving…',draft:zh?'未保存':'Not saved'};label.textContent=short[snapshot.state]||full;label.title=full;label.setAttribute('aria-label',full);return;}
  if(!XHS.sync.isConfigured()){
   if(localState.state==='ready'){const dates=XHS.store.getAll().concat(XHS.store.getComps()).map(item=>new Date(item.savedAt)).filter(date=>Number.isFinite(+date));if(dates.length)localState={state:'saved',at:new Date(Math.max(...dates.map(Number))),reason:''};}
   const time=localState.at?.toLocaleTimeString(zh?'zh-CN':'en-CA',{hour:'2-digit',minute:'2-digit'})||'';
   const draft=!['saving','error'].includes(localState.state)&&XHS.app?.hasContentDrafts();
   el.dataset.saveState=navigator.onLine===false?'offline':draft?'draft':localState.state;
   const full=(navigator.onLine===false?(zh?'离线 · ':'Offline · '):'')+(draft?(zh?'未保存，请完成编辑':'Not saved. Finish editing'):localState.state==='saving'?(zh?'保存中…':'Saving…'):localState.state==='error'?(zh?'没保存上。':'Not saved. ')+(localState.reason==='full'?(zh?'浏览器存储空间不足':'Browser storage is full'):(zh?'浏览器无法保存这份副本':'Browser storage is unavailable')):localState.state==='ready'?(zh?'没有待保存更改':'No changes to save'):(zh?'已保存 ':'Saved ')+time);
   label.textContent=innerWidth<900&&draft?(zh?'未保存':'Not saved'):innerWidth<900&&localState.state==='saved'?(navigator.onLine===false?(zh?'离线':'Offline'):(zh?'已保存':'Saved')):full;label.title=full;label.setAttribute('aria-label',full);
   if(button){button.hidden=localState.state!=='error';button.textContent=zh?'重试':'Retry';button.onclick=()=>localRetry?.();}
  }
 }
 function refresh(){store.connection({online:navigator.onLine!==false,connected:XHS.sync.isConfigured()});if(!mount){const el=document.querySelector('[data-save-status]');if(el){mount=SuiteSaveStatus.mount(el,store,{language:()=>XHS.i18n.lang});store.subscribe(paintOwned);}}mount?.refresh();store.draft('forms',!!XHS.app?.hasEditingDrafts());paintOwned();}
 function localSave(promise,retry){const revision=++localRevision;localRetry=retry;localState={...localState,state:'saving'};refresh();Promise.resolve(promise).then(()=>{if(revision!==localRevision)return;localState={state:'saved',at:new Date(),reason:''};refresh();},error=>{if(revision!==localRevision)return;localState={...localState,state:'error',reason:error?.quota?'full':'unavailable'};refresh();});}
 function backup(){const original=SuiteBackup.create;SuiteBackup.create=async function(options){const b=await original(options),restore=b.restore;b.restore=async staged=>{const retry=async()=>{HubSettingsRuntime.beginRestore();try{return await b.restore(staged);}finally{if(HubSettingsRuntime.restoring)HubSettingsRuntime.endRestore();}},tokens=new Map((staged.restorePaths||[]).map(p=>[p,start('restore/'+p,retry,pending('restore/'+p,retry))]));try{const done=await restore(staged);for(const [p,t]of tokens)store.succeed(t,done.includes(p)?new Date():null);return done;}catch(e){for(const [p,t]of tokens)(e.completed||[]).includes(p)||e.code==='reload'?store.succeed(t):store.fail(t,e);throw e;}};return b;};}
 addEventListener('online',refresh);addEventListener('offline',refresh);addEventListener('resize',paintOwned);addEventListener('DOMContentLoaded',()=>{backup();refresh();setInterval(refresh,500);});
 return {store,key,pending,start,run,reset,refresh,localSave};
})();
