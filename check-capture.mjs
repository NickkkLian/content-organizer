/* Exercise the app's normal Save form with real parsing and classification, synthetic storage and offline services. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function element() {
  const values = { value: '', innerHTML: '', textContent: '', dataset: {}, style: {}, __listeners: {} };
  return new Proxy(function () {}, {
    get(target, name) {
      if (name in values) return values[name];
      if (name === 'then') return undefined;
      if (name === Symbol.iterator) return [][Symbol.iterator];
      if (name === Symbol.toPrimitive) return () => '';
      if (name === 'length') return 0;
      if (name === 'querySelectorAll') return () => [];
      if (name === 'addEventListener') return (type, callback) => (values.__listeners[type] ||= []).push(callback);
      return element();
    },
    set(target, name, value) { values[name] = value; return true; },
    apply() { return element(); }
  });
}

async function page(options = {}) {
  const ids = new Map(), document = element(), listeners = new Map();
  document.getElementById = id => { if (!ids.has(id)) ids.set(id, element()); return ids.get(id); };
  document.querySelectorAll = () => [];
  document.addEventListener = (type, callback) => { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(callback); };
  let notes = structuredClone(options.notes || []), revision = 0, sequence = 0, fetches = 0;
  const stamp = () => new Date(1700000000000 + revision++).toISOString();
  const store = {
    init: async () => ({}), getAll: () => notes, getComps: () => [],
    save(note) {
      const index = note.url ? notes.findIndex(item => item.url === note.url) : -1;
      const saved = { ...note, id: index >= 0 ? notes[index].id : 'note-' + sequence++, savedAt: stamp() };
      if (index >= 0) notes[index] = { ...notes[index], ...saved }; else notes.unshift(saved);
      return saved;
    },
    update(id, patch) { notes = notes.map(note => note.id === id ? { ...note, ...patch, savedAt: stamp() } : note); },
    remove(id) { notes = notes.filter(note => note.id !== id); },
    flush: options.flush || (async () => {}), error: () => false,
    archive() {}, unarchive() {}, source: () => 'offline'
  };
  const X = {
    i18n: { T: (zh, en) => en, lang: 'en', applyStatic() {} }, store,
    refs: require('./js/refs.js'), library: require('./js/library.js'),
    settings: { initializeSource: async () => {}, pause() {} },
    sync: { isConfigured: () => false, queueSave() {}, hasUnsynced: () => false },
    images: { ready: () => Boolean(options.imagesReady), hydrate() {}, isExpired: () => false, saveFrames: options.saveFrames || (async () => []) },
    ai: { isReady: () => false, judgeFrames: async () => [0] },
    fetchsvc: { health: async () => Boolean(options.videoOnline), fetchVideo: options.fetchVideo || (async () => ({})) }
  };
  const context = {
    XHS: X, document, location: { search: '', hostname: 'localhost' }, navigator: { onLine: true },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    SaveStatus: { localSave(promise) { Promise.resolve(promise).catch(() => {}); }, store: { retained() {} }, key: path => path },
    Appearance: { shortcutsOn: () => true }, MutationObserver: class { observe() {} },
    addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: true }),
    innerWidth: 1230, innerHeight: 900, URL, URLSearchParams, setTimeout, clearTimeout, setInterval, clearInterval, confirm: () => false, console
  };
  context.window = context.self = context;
  vm.createContext(context);
  for (const file of ['classify.js', 'parse.js']) vm.runInContext(fs.readFileSync(new URL('./js/' + file, import.meta.url), 'utf8'), context);
  X.fetchNote = async text => { fetches++; return options.fetchNote ? options.fetchNote(text) : Promise.reject(Error('All readers are offline')); };
  vm.runInContext(fs.readFileSync(new URL('./js/app.js', import.meta.url), 'utf8'), context);
  for (const callback of listeners.get('DOMContentLoaded') || []) callback();
  await tick();
  assert.ok(X.app.ready, 'the real app must initialize before Save is exercised');
  const submit = text => { ids.get('urlInput').value = text; ids.get('captureForm').__listeners.submit[0]({ preventDefault() {} }); };
  const settle = async predicate => { for (let i = 0; i < 100; i++) { if (predicate()) return; await tick(); } throw Error('Capture did not settle'); };
  return { X, ids, submit, settle, fetches: () => fetches };
}

const cases = [
  ['text saves through the form without a preview or fetch', async () => {
    const p = await page(); p.submit('旅行清单\n带雨伞和现金');
    await p.settle(() => p.X.store.getAll().length === 1 && p.ids.get('status').innerHTML.includes('Saved to'));
    assert.match(p.X.store.getAll()[0].body, /带雨伞/); assert.equal(p.fetches(), 0); assert.equal(p.ids.get('urlInput').value, '');
    assert.match(p.ids.get('status').innerHTML, /Change topic/); assert.match(p.ids.get('status').innerHTML, /Undo/);
  }],
  ['two failed reads keep both share texts and links', async () => {
    const p = await page(); p.submit('First share https://example.com/one'); p.submit('Second share https://example.com/two');
    await p.settle(() => p.X.store.getAll().filter(note => note.captureState === 'thin').length === 2);
    assert.equal(new Set(p.X.store.getAll().map(note => note.url)).size, 2);
    assert.ok(p.X.store.getAll().some(note => note.body.includes('First share'))); assert.ok(p.X.store.getAll().some(note => note.body.includes('Second share')));
  }],
  ['a completed save keeps the next unsent draft in the field', async () => {
    let release; const pending = new Promise(resolve => { release = resolve; });
    const p = await page({ flush: () => pending }); p.submit('First note'); p.ids.get('urlInput').value = 'The next unsent draft'; release();
    await p.settle(() => p.X.store.getAll().length === 1 && p.ids.get('status').innerHTML.includes('Saved to'));
    assert.equal(p.ids.get('urlInput').value, 'The next unsent draft');
  }],
  ['saving a complete duplicate keeps its body and transcript', async () => {
    const p = await page({ notes: [{ id: 'existing', title: 'Original', url: 'https://example.com/kept', body: 'Keep this body', transcript: 'Keep this transcript', tags: [], images: [], savedAt: '2026-01-01' }] });
    p.submit('https://example.com/kept'); await tick();
    assert.equal(p.X.store.getAll().length, 1); assert.equal(p.X.store.getAll()[0].transcript, 'Keep this transcript'); assert.equal(p.X.store.getAll()[0].body, 'Keep this body'); assert.equal(p.fetches(), 0);
  }],
  ['a bare video ID is kept while the local service is offline', async () => {
    const p = await page(); p.submit('BV1xx411c7mD');
    await p.settle(() => p.X.store.getAll()[0]?.captureState === 'video-offline');
    assert.equal(p.X.store.getAll()[0].url, 'https://www.bilibili.com/video/BV1xx411c7mD'); assert.equal(p.X.store.getAll()[0].isVideo, true);
  }],
  ['failed frame storage keeps the fetched transcript', async () => {
    const p = await page({ videoOnline: true, imagesReady: true, fetchVideo: async () => ({ note: { title: 'Video', url: 'https://www.bilibili.com/video/BV1xx411c7mD', transcript: 'The useful transcript', body: 'Description' }, frames: ['synthetic-frame'] }), saveFrames: async () => { throw Error('Synthetic storage failure'); } });
    p.submit('https://www.bilibili.com/video/BV1xx411c7mD');
    await p.settle(() => p.X.store.getAll()[0]?.captureState === 'frames-missing'); assert.equal(p.X.store.getAll()[0].transcript, 'The useful transcript');
  }],
  ['a late fetch keeps text edited by another writer', async () => {
    let finish; const request = new Promise(resolve => { finish = resolve; });
    const p = await page({ fetchNote: () => request }); p.submit('Share https://example.com/slow'); await p.settle(() => p.fetches() === 1);
    p.X.store.update(p.X.store.getAll()[0].id, { body: 'Edited while fetching', captureState: '' }); finish({ title: 'Fetched', body: 'Older fetched text', url: 'https://example.com/slow', tags: [], images: [] });
    await tick(); await tick(); assert.equal(p.X.store.getAll()[0].body, 'Edited while fetching');
  }],
  ['retrying a thin capture updates the existing note', async () => {
    const p = await page({ notes: [{ id: 'thin', title: 'Share title', body: 'Share text', url: 'https://example.com/retry', captureState: 'thin', tags: [], images: [], savedAt: '2026-01-01' }], fetchNote: async () => ({ title: 'Full title', body: 'Recovered full body', url: 'https://example.com/retry', tags: [], images: [] }) });
    p.submit('https://example.com/retry'); await p.settle(() => p.X.store.getAll()[0]?.body === 'Recovered full body');
    assert.equal(p.X.store.getAll()[0].id, 'thin'); assert.equal(p.X.store.getAll().length, 1);
  }],
  ['a failed browser write keeps the capture and its input', async () => {
    const p = await page({ flush: async () => { throw Error('Synthetic browser storage failure'); } }); p.submit('Keep this unsaved paste');
    await p.settle(() => p.ids.get('status').innerHTML.includes('Could not save'));
    assert.equal(p.ids.get('urlInput').value, 'Keep this unsaved paste'); assert.equal(p.X.store.getAll().length, 1);
  }]
];
let failures = 0;
for (const [name, run] of cases) { try { await run(); console.log('PASS', name); } catch (error) { failures++; console.error('FAIL', name, error.message); } }
console.log(`${cases.length - failures}/${cases.length} capture cases passed`);
process.exitCode = failures ? 1 : 0;
