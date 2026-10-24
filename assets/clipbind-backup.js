/* Full browser library package; connected restore also replaces content.json using a fresh revision check. */
window.createClipbindBackup=async adapter=>{
 const C=HubSettingsContract,B=SuiteBackup,X=XHS;
 const validate=(p,value)=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||X.merge.shapeProblems(value).length)throw new C.SettingsError('invalid');
  for(const name of ['notes','deleted','compilations','deletedComps'])if(!Array.isArray(value[name]))throw new C.SettingsError('invalid');
  for(const name of ['notes','compilations'])for(const record of value[name]){
   if(!record||typeof record!=='object'||Array.isArray(record))throw new C.SettingsError('invalid');
   for(const field of ['images','imagesRepo','tags','sections','sourceUrls'])if(record[field]!==undefined&&!Array.isArray(record[field]))throw new C.SettingsError('invalid');
   for(const section of record.sections||[])if(!section||typeof section!=='object'||Array.isArray(section)||section.sources!==undefined&&!Array.isArray(section.sources))throw new C.SettingsError('invalid');
  }
  for(const name of ['deleted','deletedComps'])if(value[name].some(id=>typeof id!=='string'&&typeof id!=='number'))throw new C.SettingsError('invalid');
 };
 const counts=value=>value.notes.length+' '+(adapter.language()==='zh'?'条笔记、':'notes, ')+value.compilations.length+' '+(adapter.language()==='zh'?'篇合集、':'compilations, ')+(value.deleted.length+value.deletedComps.length)+' '+(adapter.language()==='zh'?'条删除记录':'deletions');
 const local=await B.localJSON({
  app:adapter.app,path:'content.json',scope:'Complete current-browser Clipbind library: notes, compilations, both tombstone lists and unknown fields; image references, not image bytes.',
  snapshot:()=>X.store.document(),identity:()=>X.store.source()+'|'+Boolean(C.complete(adapter.connection())),validate,
  summary:(value,bytes)=>(adapter.language()==='zh'?'仅替换本浏览器副本：':'Replace this browser copy only: ')+counts(value)+' ('+bytes+' bytes). '+(adapter.language()==='zh'?'不会写入 GitHub；以后同步会按原合并规则合并。':'No GitHub write; a later sync uses the existing merge rules.'),
  replace:async value=>{await X.store.replaceSnapshot(value);X.sync.resetBaseline();X.app.resetDrafts();X.app.rerender();},
 });
 const remote=await B.create({
  ...adapter,connection(){const {owner,repo,token}=adapter.connection();return {owner,repo,token};},roots:['content.json'],allowed:p=>p==='content.json',scope:'Full private Clipbind content.json; image files excluded',validate,
  complete:files=>{if(files.length!==1||files[0].path!=='content.json')throw new C.SettingsError('invalid');},
  summary:(n,bytes)=>(adapter.language()==='zh'?'替换连接仓库中的 content.json 及本浏览器完整库；':'Replace connected content.json and this browser’s complete library; ')+bytes+' bytes. '+(adapter.language()==='zh'?'不包含独立图片文件。':'Separate image files are excluded.'),
  partial:SuiteSettingsHelpers.partial,
  async reload(){await X.sync.pullSaved();X.app.resetDrafts();X.app.rerender();},
 });
 return {
  async backup(){validate('content.json',X.store.document());return local.backup();},
  async stage(pkg){
   if(X.connection.pending)throw new C.SettingsError('pending');
   const connected=C.complete(adapter.connection()),stage=await (connected?remote:local).stage(pkg);
   return {...stage,mode:connected?'repository':'browser',wasConnected:connected,browserBaseline:await C.digest(JSON.stringify(X.store.document()))};
  },
  async restore(stage){
   if(X.connection.pending||stage.wasConnected!==C.complete(adapter.connection())||stage.browserBaseline!==await C.digest(JSON.stringify(X.store.document())))throw new C.SettingsError('conflict');
   adapter.pause(true);
   try{await (stage.mode==='repository'?remote:local).restore(stage);adapter.pause(false);}
   catch(error){adapter.pause(Boolean(error.completed?.length)||error.code==='reload');throw error;}
  },
 };
};
