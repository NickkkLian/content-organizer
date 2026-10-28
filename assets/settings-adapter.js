/* Clipbind: one Settings panel, source-scoped library cache and full four-collection recovery. */
(() => {
 const C=HubSettingsContract,R=HubSettingsRuntime,H=SuiteSettingsHelpers,X=XHS,kit=H.kitPreferences('content-organizer'),demo=new URLSearchParams(location.search).get('demo')==='1';
 const gear=document.getElementById('nl-settings-button'),notice=H.connectionNotice([document.getElementById('main')]);let backup;
 const tokenGroup=demo?null:SuiteFieldGroup({id:'suite-local-fetch',slot:'xhs_fetch_token',raw:true,fields:[{key:'token',secret:true,en:'Local fetch service token',zh:'本地抓取服务口令'}],removePrompt:{en:'Remove this browser’s local fetch service token? The service and its credential are not revoked.',zh:'移除此浏览器的本地抓取服务口令？这不会关闭服务或撤销口令。'},removeLabel:{en:'Remove local service token',zh:'移除本地服务口令'}});
 const adapter=window.settingsAdapter={
  ...kit,resetDescription:{en:' and reset the palette and single-key shortcuts',zh:'并恢复配色与单键快捷键'},resetLabel:{en:C.hosted?'Use hub theme and reset palette and shortcuts':'Use system theme and reset palette and shortcuts',zh:C.hosted?'使用 Hub 主题并恢复配色与快捷键':'跟随系统主题并恢复配色与快捷键'},app:'content-organizer',appSection:{en:"Your library",zh:"你的收藏库"},demo,isolatedCredentials:true,connectionSlot:'co_connection',
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
  backupHelp:{en:'Back up this browser’s whole library: saved notes, compilations, deletion records, extra saved details and image links, including saved changes that have not synced yet. Separate image files and open editor drafts are left out. When connected, restore replaces the repository’s content file and this browser’s copy; offline, it replaces only this browser’s copy. Later syncs still compare saved dates and deletion records. Notes-only JSON/Markdown exports stay beside the library.',zh:'备份此浏览器的完整收藏库，包含已保存的笔记、合集、删除记录、其他已存信息与图片链接，也包含尚未同步的已保存修改。不包含独立图片文件与打开的编辑草稿。已连接时恢复仓库的内容文件与本机副本；离线时仅恢复本机副本。以后同步仍会比较保存日期与删除记录。仅笔记的 JSON / Markdown 导出保留在收藏库旁。'},
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
   H.controls(container,X.i18n.T('在合集操作旁选择是否分析图片。如果浏览器无法保存收藏库，请先在这里重试，再更换连接。','Choose image analysis beside the compilation actions. If this browser cannot save your library, retry here before changing its connection.'),[
    {text:X.i18n.T('重试保存本机副本','Retry saving in this browser'),action:async()=>{try{await R.track(()=>X.store.retryPersistence());settings.refresh();}catch{}}},
    {text:X.i18n.T('重新读取已保存库（放弃本页草稿）','Reload saved library (discard page drafts)'),action:async()=>{if(demo||R.pending||!C.complete(adapter.connection()))return;if(!await settings.confirm('Discard this page’s unsynced saved edits and open drafts, then read content.json exactly as saved? Export the full backup first if you need recovery.','放弃此页尚未同步的已保存编辑与打开的草稿，再读取已保存的 content.json？如需恢复，请先导出完整备份。','Reload','重新加载'))return;adapter.pause(true);try{await R.track(async()=>{await X.store.selectSource(adapter.connection(),X.connection.carry);X.connection.carry=null;await X.sync.pullSaved();X.app.resetDrafts();adapter.pause(false);X.app.rerender();});}catch{}settings.refresh();}},
   ]);for(const id of ['suite-app-action-0','suite-app-action-1'])container.querySelector('#'+id).disabled=false;let palette=container.querySelector('#suite-palette');if(!palette){const label=document.createElement('label');label.htmlFor='suite-palette';palette=document.createElement('select');palette.id='suite-palette';container.append(label,palette);palette.onchange=()=>{try{R.write(adapter.app,{palette:palette.value});kit.setPalette(palette.value);SuiteSettings.refresh();}catch{SuiteHeaderEntry.announce(settingsAdapter.language()==='zh'?'无法保存配色，请重试。':'Could not save the palette. Try again.');}};}palette.disabled=false;palette.previousElementSibling.textContent=X.i18n.T('配色','Palette');palette.replaceChildren(...kit.palette.values.map(value=>{const option=document.createElement('option');option.value=value;option.textContent=X.i18n.T(kit.palette.labels[value].zh,kit.palette.labels[value].en);return option;}));palette.value=R.read(adapter.app).palette??kit.palette.legacy();kit.shortcuts(container);
  },
  install(settings){gear.onclick=()=>settings.open();H.gear(gear,X.i18n.T('设置','Settings'));},
 };
 X.settings=adapter;
 async function getBackup(){if(!backup)backup=await createClipbindBackup(adapter);return backup;}
})();
