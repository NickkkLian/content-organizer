/* Repository write receipts. Reads never acknowledge a save. */
const SaveStatus=(()=>{
 const store=SuiteSaveStatus.create(),revisions=new Map();let mount;
 const source=()=>XHS.store.source();
 const key=p=>source()+'::'+p;
 function pending(p,retry){const s=source(),k=key(p),revision=store.pending(k,()=>{if(source()!==s)throw Error('conflict');return retry();});if(p==="content.json")XHS.store.flush().then(()=>store.retained(k,true),()=>store.retained(k,false));revisions.set(k,revision);return {key:k,revision};}
 function start(p,retry,q){q=q||{key:key(p),revision:revisions.get(key(p))};if(!q.revision)q=pending(p,retry);return store.start(q.key,q.revision);}
 async function run(p,retry,fn){const t=start(p,retry,pending(p,retry));try{const r=await fn();store.succeed(t,r?.wrote===false?null:new Date());return r;}catch(e){store.fail(t,e);throw e;}}
 function reset(){revisions.clear();store.reset();refresh();}
 function refresh(){store.connection({online:navigator.onLine!==false,connected:XHS.sync.isConfigured()});if(!mount){const el=document.querySelector('[data-save-status]');if(el)mount=SuiteSaveStatus.mount(el,store,{language:()=>XHS.i18n.lang});}mount?.refresh();store.draft('forms',!!XHS.app?.hasEditingDrafts());}
 function backup(){const original=SuiteBackup.create;SuiteBackup.create=async function(options){const b=await original(options),restore=b.restore;b.restore=async staged=>{const retry=async()=>{HubSettingsRuntime.beginRestore();try{return await b.restore(staged);}finally{if(HubSettingsRuntime.restoring)HubSettingsRuntime.endRestore();}},tokens=new Map((staged.restorePaths||[]).map(p=>[p,start('restore/'+p,retry,pending('restore/'+p,retry))]));try{const done=await restore(staged);for(const [p,t]of tokens)store.succeed(t,done.includes(p)?new Date():null);return done;}catch(e){for(const [p,t]of tokens)(e.completed||[]).includes(p)||e.code==='reload'?store.succeed(t):store.fail(t,e);throw e;}};return b;};}
 addEventListener('online',refresh);addEventListener('offline',refresh);addEventListener('DOMContentLoaded',()=>{backup();refresh();setInterval(refresh,500);});
 return {store,key,pending,start,run,reset,refresh};
})();
