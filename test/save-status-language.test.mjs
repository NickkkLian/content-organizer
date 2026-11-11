import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root = process.env.APP_ROOT || fileURLToPath(new URL('..', import.meta.url));

// Timers never run: a language change must repaint before it returns.
function fixture({connected = false, width = 1440, notes = []} = {}) {
  const values = new Map();
  const document = {
    documentElement: {}, querySelectorAll: () => [], getElementById: () => null,
    createElement() { return {textContent: '', hidden: false, attributes: {}, setAttribute(k,v) {this.attributes[k]=v;}, addEventListener() {}}; }
  };
  const element = {
    ownerDocument: document, classList: {add() {}}, dataset: {}, children: [],
    replaceChildren(...children) {this.children=children;},
    querySelector(selector) {return this.children[selector === 'button' ? 1 : 0];}
  };
  document.querySelector = selector => selector === '[data-save-status]' ? element : null;
  const ctx = {
    document, navigator: {onLine: true}, innerWidth: width,
    localStorage: {getItem: k => values.get(k), setItem: (k,v) => values.set(k,v)},
    HubSettingsContract: {preferenceKey: k => k},
    addEventListener() {}, setInterval() {throw Error('Timers must not run in this test');},
    XHS: {store: {source: () => 'synthetic', getAll: () => notes, getComps: () => [], flush: () => Promise.resolve()},
      sync: {isConfigured: () => connected},
      app: {hasContentDrafts: () => false, hasEditingDrafts: () => false, rerender() {}}}
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const file of ['js/i18n.js', 'assets/settings-standard/save-status.js', 'assets/save-status-owned.js']) {
    vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
  }
  const save = vm.runInContext('SaveStatus',ctx);
  save.refresh();
  return {ctx, save, element, label: element.children[0], retry: element.children[1]};
}

function switches(f, expected, method = 'setLanguage') {
  const before = f.save.store.snapshot();
  for (const language of ['zh','en']) {
    if (method === 'toggleLang') f.ctx.XHS.i18n.toggleLang();
    else f.ctx.XHS.i18n.setLanguage(language);
    assert.match(f.label.textContent, expected[language], 'visible status switches synchronously');
    assert.match(f.label.title, expected[language], 'tooltip switches synchronously');
    assert.match(f.label.attributes['aria-label'], expected[language], 'accessible name switches synchronously');
    assert.equal(f.retry.textContent, language === 'zh' ? '重试' : 'Retry');
    assert.equal(f.save.store.snapshot().state, before.state, 'translation does not change save state');
    assert.equal(Number(f.save.store.snapshot().lastSavedAt), Number(before.lastSavedAt), 'translation does not invent a save time');
  }
}

for (const width of [390,1440]) {
  test(`local ready, saved, draft, saving, error and offline status at ${width}`, async () => {
    const f = fixture({width});
    switches(f,{en:/No changes to save/,zh:/没有未保存的更改/});
    f.save.localSave(Promise.resolve(), () => assert.fail('translation retried a save'));
    await new Promise(setImmediate);
    switches(f,{en:/Saved/,zh:/已保存/},'toggleLang');
    f.ctx.XHS.app.hasContentDrafts = () => true;
    f.save.refresh();
    switches(f,{en:/Not saved/,zh:/未保存/});
    f.ctx.XHS.app.hasContentDrafts = () => false;
    f.save.localSave(new Promise(() => {}), () => assert.fail('translation retried a save'));
    switches(f,{en:/Saving/,zh:/保存中/});
    f.save.localSave(Promise.reject({quota:true}), () => assert.fail('translation retried a save'));
    await new Promise(setImmediate);
    switches(f,{en:/Browser storage is full/,zh:/浏览器存储空间不足/});
    assert.equal(f.retry.hidden,false);
    f.ctx.navigator.onLine = false;
    f.save.refresh();
    switches(f,{en:/Offline/,zh:/离线/});
  });

  test(`connected ready, saved, draft, saving, error and offline status at ${width}`, () => {
    const f = fixture({connected:true,width});
    switches(f,{en:/No changes to save|Loaded/,zh:/没有未保存的更改|已载入/});
    const revision = f.save.store.pending('note',() => assert.fail('translation retried a save'));
    const receipt = f.save.store.start('note',revision);
    switches(f,{en:/Saving/,zh:/保存中|正在保存/});
    f.save.store.succeed(receipt,new Date('2026-01-02T03:04:00Z'));
    switches(f,{en:/Saved/,zh:/已保存/});
    f.ctx.XHS.app.hasEditingDrafts = () => true;
    f.save.refresh();
    switches(f,{en:/Not saved/,zh:/未保存/});
    f.ctx.XHS.app.hasEditingDrafts = () => false;
    const failed = f.save.store.start('note',f.save.store.pending('note',() => assert.fail('translation retried a save')));
    f.save.store.fail(failed,Error('403'));
    switches(f,{en:/check connection access/,zh:/请检查连接权限/});
    assert.equal(f.retry.hidden,false);
    f.ctx.navigator.onLine = false;
    f.save.refresh();
    switches(f,{en:/Offline/,zh:/离线/});
  });
}

test('connected status expands when resizing from phone to desktop without a timer', () => {
  const f = fixture({connected:true,width:390});
  const receipt = f.save.store.start('note',f.save.store.pending('note',() => {}));
  f.save.store.succeed(receipt,new Date('2026-01-02T03:04:00Z'));
  f.ctx.innerWidth = 1440;
  f.ctx.XHS.i18n.setLanguage('zh');
  assert.match(f.label.textContent,/已保存 \d\d:\d\d/);
  assert.equal(f.label.textContent,f.label.title);
  assert.equal(f.label.textContent,f.label.attributes['aria-label']);
});

for (const [name, response, en, zh] of [
  ['access', {ok:false,status:401}, /Token invalid/, /令牌无效/],
  ['read', {ok:false,status:500}, /Read failed HTTP 500/, /读取失败 HTTP 500/],
  ['parse', {ok:true,status:200,json:async()=>({content:btoa('{')})}, /Cannot read/, /读不懂/],
  ['shape', {ok:true,status:200,json:async()=>({content:btoa('{"notes":{}}')})}, /wrong shape/, /格式不对/],
]) {
  test(`${name} diagnostic repaints without another request`, async () => {
    const f=fixture();let calls=0;
    Object.assign(f.ctx,{location:{hostname:'example.test',search:''},URLSearchParams,TextDecoder,TextEncoder,atob,btoa,
      HubSettingsRuntime:{track:fn=>fn(),fileRead(){}},fetch:async()=>{calls++;return response;}});
    for(const file of ['js/merge.js','js/sync.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),f.ctx,{filename:file});
    f.ctx.XHS.connection.current={owner:'example-owner',repo:'ExampleLibrary',token:'synthetic-token'};
    f.ctx.XHS.connection.pending=false;
    let error;
    try{await f.ctx.XHS.sync.sync();}catch(e){error=e;}
    assert.match(error.message,en);
    for(const language of ['zh','en']){
      f.ctx.XHS.i18n.setLanguage(language);
      assert.match(error.localizedMessage(),language==='zh'?zh:en);
      assert.equal(calls,1);
    }
  });
}
