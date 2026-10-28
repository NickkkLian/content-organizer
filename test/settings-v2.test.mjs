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

test('owned controls recover after busy renders and stay stable through 50 language refreshes',()=>{
 let language='en';
 function node(tag){const n={tag,children:[],style:{},disabled:false,textContent:'',setAttribute(){},addEventListener(){},after(){},append(...items){for(const child of items){const i=this.children.indexOf(child);if(i>=0)this.children.splice(i,1);child.parentElement=this;this.children.push(child)}},replaceChildren(...items){this.children=[];this.append(...items)},querySelector(selector){return this.querySelectorAll(selector)[0]||null},querySelectorAll(selector){const all=this.children.flatMap(c=>[c,...c.querySelectorAll('*')]);return all.filter(c=>selector==='*'||selector==='button,select'&&['button','select'].includes(c.tag)||selector===c.tag||selector==='#'+c.id)}};Object.defineProperty(n,'previousElementSibling',{get(){return this.parentElement?.children[this.parentElement.children.indexOf(this)-1]}});return n;}
 const header=node('header'),gear=node('button'),store={getItem:()=>null},ctx={document:{createElement:node,getElementById:()=>gear,querySelector:()=>header,documentElement:{}},localStorage:store,location:{search:''},URLSearchParams,Appearance:{},HubSettingsContract:{preferenceKey:k=>k,SettingsError:Error,hosted:false},HubSettingsRuntime:{read:()=>({}),pending:0},SuiteBackup:{},SuiteFieldGroup:()=>({mount(){},refresh(){},dirty:()=>false,discard(){}}),XHS:{i18n:{T:(zh,en)=>language==='zh'?zh:en}}};
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(read('adapter-helpers.js'),ctx);
 const source=fs.readFileSync(new URL('../assets/settings-adapter.js',import.meta.url),'utf8');vm.runInContext(source,ctx);

 const root=node('div'),render=()=>ctx.settingsAdapter.appControls(root,{}),samples={};
 render();
 for(let i=0;i<50;i++){language=i%2?'zh':'en';for(const element of root.querySelectorAll('button,select'))element.disabled=true;render();const controls=root.querySelectorAll('button,select');assert.ok(controls.length>=2);assert.ok(controls.every(e=>!e.disabled),'owned controls stay enabled after the busy flag clears');const ids=root.querySelectorAll('*').map(e=>e.id).filter(Boolean);assert.equal(ids.length,new Set(ids).size);const state=JSON.stringify(root.querySelectorAll('*').map(e=>({tag:e.tag,id:e.id,text:e.textContent})));if(samples[language])assert.equal(state,samples[language]);else samples[language]=state;}
 assert.notEqual(samples.en,samples.zh);
});
