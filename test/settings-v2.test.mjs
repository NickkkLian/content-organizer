import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const read=n=>fs.readFileSync(new URL('../assets/settings-standard/'+n,import.meta.url),'utf8');
test('v2 header owns immediate preferences',()=>{assert.ok(read('entry.js').includes('suite-theme-toggle'));assert.ok(read('entry.js').includes('suite-language-toggle'));});
test('v2 panel excludes preference rows and starts at app',()=>{assert.ok(!/id="suite-(?:language|theme|theme-mode|section-appearance)"/.test(read('panel.js')));assert.ok(read('panel.js').includes("section='app'"));});
test('pointer title focus is suppressed and keyboard focus remains',()=>{assert.ok(read('panel.css').includes('[data-open-input="pointer"] #suite-settings-title:focus'));assert.ok(read('panel.css').includes('#suite-settings-title:focus-visible'));});

import vm from 'node:vm';import {execFileSync} from 'node:child_process';
const app="content-organizer",base="7d96e6e16c6c658511992dd4f8f31bf76f099155",slot="co_connection";
test('preferences and connections written by the supplied runtime survive migration',()=>{
 const values=new Map(),store={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
 const ctx={localStorage:store,location:{origin:'https://example.test',protocol:'https:'},document:{querySelector:()=>null},URL,crypto,TextEncoder,queueMicrotask};ctx.window=ctx;
 const old=execFileSync('git',['show',base+':assets/settings-standard/core.js'],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
 vm.runInNewContext(old,ctx);
 ctx.HubSettingsRuntime.write(app,{themeMode:'app',theme:'dark',connectionMode:'override',future:{keep:true}});
 ctx.HubSettingsContract.preferencesWrite(store,{lang:'en',theme:'light'},{lang:null,theme:null});
 const connection={owner:'legacy-owner',repo:'LegacyRepo',token:'synthetic-old-token',branch:'legacy-branch',path:'custom.json',filesDir:'old-files',future:{keep:true}};
 if(slot)store.setItem(slot,JSON.stringify(connection)); // Exact local write used by the old panel.
 const before=new Map(values);vm.runInNewContext(read('core.js'),ctx);
 assert.equal(ctx.HubSettingsRuntime.read(app).theme,'dark');assert.equal(ctx.HubSettingsRuntime.read(app).themeMode,'app');
 assert.equal(ctx.HubSettingsRuntime.read(app).future.keep,true);
 assert.equal(ctx.HubSettingsContract.preferencesRead(store).lang,'en');
 assert.equal(ctx.HubSettingsContract.preferencesRead(store).theme,'light');
 if(slot){const result=ctx.HubSettingsRuntime.resolve(app,ctx.HubSettingsContract.object(store.getItem(slot)));assert.equal(JSON.stringify(result.config),JSON.stringify(connection));assert.equal(result.mode,'override');assert.equal(result.ready,true);}
 for(const [k,v]of before)assert.equal(store.getItem(k),v,'retained '+k);
 ctx.HubSettingsRuntime.write(app,{theme:'light'});assert.equal(ctx.HubSettingsRuntime.read(app).future.keep,true);
});
