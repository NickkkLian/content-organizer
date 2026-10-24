/* Clipbind: one Settings panel, source-scoped library cache and full four-collection recovery. */
(() => {
 const C=HubSettingsContract,R=HubSettingsRuntime,H=SuiteSettingsHelpers,X=XHS,kit=H.kitPreferences('content-organizer'),demo=new URLSearchParams(location.search).get('demo')==='1';
 const gear=document.getElementById('nl-settings-button'),notice=H.connectionNotice([document.getElementById('main')]);let backup;
 const tokenGroup=demo?null:SuiteFieldGroup({id:'suite-local-fetch',slot:'xhs_fetch_token',raw:true,fields:[{key:'token',secret:true,en:'Local fetch service token',zh:'本地抓取服务口令'}],removePrompt:{en:'Remove this browser’s local fetch service token? The service and its credential are not revoked.',zh:'移除此浏览器的本地抓取服务口令？这不会关闭服务或撤销口令。'},removeLabel:{en:'Remove local service token',zh:'移除本地服务口令'}});
 const adapter=window.settingsAdapter={
  ...kit,app:'content-organizer',demo,isolatedCredentials:true,connectionSlot:'co_connection',
  routing:'Fixed content.json, archived images in xhs-images/. The local fetch service address and transport stay unchanged.',
  language:()=>X.i18n.lang,setLanguage(value){X.i18n.setLanguage(value);H.gear(gear,X.i18n.T('设置','Settings'));},
  connection:()=>({...X.connection.current}),unsaved:()=>X.connection.pending||X.app.unsaved(),
  settingsDirty:()=>kit.settingsDirty()||Boolean(tokenGroup?.dirty()),discardSettings(){kit.discardSettings();tokenGroup?.discard();},
  canConnectDrafts(next){return !X.connection.pending&&!C.complete(adapter.connection())&&!X.app.hasEditingDrafts()&&(X.store.source()==='offline'||X.store.sourceScope(next)===X.store.source());},
  canRestoreDrafts(){return !X.connection.pending&&!X.app.hasEditingDrafts();},
  pause(value){X.connection.pending=value;X.app.cancelSync();notice(value);},
  adopt(next){
   const before=adapter.connection();if(R.sameConnection(before,next))return;
   const changed=X.store.sourceScope(before)!==X.store.sourceScope(next);
   if(changed){X.connection.carry=!C.complete(before)&&X.store.source()==='offline'?X.store.document():null;adapter.pause(true);X.app.resetDrafts();}
   X.connection.current={...next};X.images.clearCache();X.sync.resetBaseline();backup=null;
  },
  async initializeSource(){await X.store.selectSource(adapter.connection());X.connection.pending=false;notice(false);},
  async reload(){
   if(demo)return;if(!C.complete(adapter.connection()))throw new C.SettingsError('required');
   await X.store.selectSource(adapter.connection(),X.connection.carry);X.connection.carry=null;X.connection.pending=false;notice(false);
   await X.sync.sync();X.app.rerender();
  },
  effectiveModel:()=>X.ai.getConfig().model,refreshAI(){X.app.refreshAI?.();},
  backupHelp:{en:'Full private backup of this browser’s library, including unsynced saved notes, compilations, both deletion lists, unknown fields and image references. Separate image bytes and open editor drafts are excluded. Connected restore replaces content.json and this browser copy; offline restore replaces only this browser copy. A later sync merges using the existing timestamp and deletion rules. Notes-only JSON/Markdown exports stay beside the library.',zh:'本浏览器完整库的私有备份，含尚未同步的已收藏笔记、合集、两份删除列表、未知字段与图片引用；不含独立图片字节及尚未保存的编辑表单。已连接时恢复 content.json 与本机副本；离线时仅恢复本机副本。以后同步仍按原时间戳与删除规则合并。仅笔记的 JSON / Markdown 导出保留在收藏库旁。'},
  async backup(){return (await getBackup()).backup();},async stage(value){return (await getBackup()).stage(value);},async restore(value){return (await getBackup()).restore(value);},
  restorePrompt(stage){return stage.mode==='browser'?{en:'Replace this browser’s saved notes, compilations and both deletion lists? Unsynced saved edits will be replaced. No GitHub file is written. A later sync can bring back items not covered by deletion records.',zh:'替换本浏览器已收藏笔记、合集与两份删除列表？尚未同步的已保存编辑也会被替换。不会写入 GitHub；以后同步可能带回未被删除记录覆盖的条目。'}:{en:'Replace the connected content.json and this browser’s saved notes, compilations and both deletion lists? Unsynced saved edits will be replaced. Separate image files are unchanged.',zh:'替换连接仓库的 content.json，以及本浏览器已收藏笔记、合集与两份删除列表？尚未同步的已保存编辑也会被替换。独立图片文件保持原样。'};},
  connectionControls(container){
   if(demo)return;tokenGroup.mount(container);tokenGroup.refresh();
   let test=container.querySelector('#suite-local-service-test'),status=container.querySelector('#suite-local-service-status');
   if(!test){test=document.createElement('button');test.id='suite-local-service-test';status=document.createElement('p');status.id='suite-local-service-status';status.setAttribute('role','status');container.append(test,status);}
   test.textContent=X.i18n.T('测试本地服务（只读）','Test local service (read only)');test.onclick=async()=>{const ok=await R.track(()=>X.fetchsvc.health());status.textContent=ok?X.i18n.T('本地服务在线','Local service online'):X.i18n.T('本地服务无法连接','Local service unreachable');};
  },
  dataControls(container,settings){
   let clear=container.querySelector('#clearAll');if(!clear){clear=document.createElement('button');clear.id='clearAll';clear.className='btn btn--danger';container.append(clear);}
   clear.textContent=X.i18n.T('清空已收藏笔记（保留合集）','Clear saved notes (keep compilations)');clear.disabled=demo;
   clear.onclick=async()=>{if(R.pending||X.app.hasEditingDrafts())return;if(!await settings.confirm('Clear saved notes and record their deletions? Compilations stay. The deletions sync to the connected repository on the next sync. Export the full backup first if you need recovery.','清空已收藏笔记并记录删除？合集保留；下次同步会把删除记录同步到连接仓库。如需恢复，请先导出完整备份。','Clear notes','清空笔记'))return;try{await R.track(async()=>{X.store.clear();await X.store.flush();X.app.rerender();X.app.scheduleSync();});}catch{}};
  },
  appControls(container,settings){
   H.controls(container,X.i18n.T('图片分析开关仍位于合集操作旁；本地抓取后端没有迁移或改写。浏览器恢复错误会保留工作副本，并阻止更换来源。','The image-analysis toggle stays with compilation actions. The local fetch backend is unchanged. Browser persistence errors keep the working copy and block source changes.'),[
    {text:X.i18n.T('重试保存本机副本','Retry browser persistence'),action:async()=>{try{await R.track(()=>X.store.retryPersistence());settings.refresh();}catch{}}},
    {text:X.i18n.T('重新读取已保存库（放弃本页草稿）','Reload saved library (discard page drafts)'),action:async()=>{if(demo||R.pending||!C.complete(adapter.connection()))return;if(!await settings.confirm('Discard this page’s unsynced saved edits and open drafts, then read content.json exactly as saved? Export the full backup first if you need recovery.','放弃此页尚未同步的已保存编辑与打开的草稿，再读取已保存的 content.json？如需恢复，请先导出完整备份。','Reload','重新加载'))return;adapter.pause(true);try{await R.track(async()=>{await X.store.selectSource(adapter.connection(),X.connection.carry);X.connection.carry=null;await X.sync.pullSaved();X.app.resetDrafts();adapter.pause(false);X.app.rerender();});}catch{}settings.refresh();}},
   ]);kit.shortcuts(container);
  },
  install(settings){gear.onclick=()=>settings.open();H.gear(gear,X.i18n.T('设置','Settings'));},
 };
 X.settings=adapter;
 async function getBackup(){if(!backup)backup=await createClipbindBackup(adapter);return backup;}
})();
