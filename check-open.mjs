/* check-open.mjs — the library's "Original" button opens only web addresses.

     node check-open.mjs    exit 0 only if every case passes

   A saved note's url comes from a file another device wrote, so it can hold anything. The button hands it to
   window.open, and a javascript: or data: address there would run in a window this page opened. This loads the real
   js/app.js (and js/refs.js, which decides what a web address is) into a stand-in page, lets the app bind its own
   click handler on the library list, and clicks the button through that handler with window.open stubbed to record
   what it was called with. Everything the app touches that this test is not about is a do-nothing stand-in. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/* An object that accepts any read, write or call and records event listeners: enough for app.js to start. */
function stand() {
  const own = {}, listeners = {};
  const p = new Proxy(function () {}, {
    get(_, k) {
      if (k in own) return own[k];
      if (k === 'then') return undefined;                 // not a promise
      if (k === Symbol.toPrimitive) return () => '';
      if (k === Symbol.iterator) return [][Symbol.iterator];
      if (k === 'length') return 0;
      if (k === 'addEventListener') return (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); };
      if (k === '__listeners') return listeners;
      return stand();
    },
    set(_, k, v) { own[k] = v; return true; },
    apply() { return stand(); },
  });
  return p;
}

async function openWith(url) {
  const opened = [];
  const byId = {};
  const note = { id: 'n1', platform: 'xhs', title: 't', savedAt: '2026-01-01', url };
  const document = stand();
  const docListeners = {};
  document.getElementById = (id) => (byId[id] = byId[id] || stand());
  document.querySelectorAll = () => [];
  document.addEventListener = (type, fn) => { (docListeners[type] = docListeners[type] || []).push(fn); };
  const window = {
    open: (...args) => { opened.push(args[0]); return null; },
    XHS: new Proxy({
      i18n: { T: (zh, en) => en, applyStatic() {}, lang: 'en' },
      store: new Proxy({ getAll: () => [note], init: () => Promise.resolve({}) }, { get: (o, k) => (k in o ? o[k] : () => []) }),
      sync: new Proxy({ isConfigured: () => false }, { get: (o, k) => (k in o ? o[k] : () => stand()) }),
      ai: Object.assign(stand(), { MODELS: [] }),
    }, { get: (o, k) => (k in o ? o[k] : (o[k] = stand())) }),   // any other module: a stand-in
  };
  // the page's global object is the window, as in a browser
  const ctx = Object.assign(window, { document, localStorage: { length: 0, key: () => null, getItem: () => null, setItem() {} },
    location: { search: '', hostname: 'localhost' }, navigator: {}, console, setTimeout, clearTimeout, URL, Promise,
    addEventListener() {}, removeEventListener() {}, matchMedia: () => stand(), confirm: () => false });
  ctx.window = ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(HERE, 'js', 'refs.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(HERE, 'js', 'app.js'), 'utf8'), ctx);
  for (const fn of docListeners.DOMContentLoaded || []) fn();
  await new Promise((r) => setTimeout(r, 0));             // store.init() resolves, then init() binds the handlers

  const clicks = byId.libList && byId.libList.__listeners.click;
  if (!clicks || !clicks.length) throw new Error('the app never bound a click handler on the library list');
  const button = { getAttribute: (a) => ({ 'data-id': 'n1', 'data-act': 'open' })[a] ?? null };
  for (const fn of clicks) fn({ target: { closest: (s) => (s === '[data-act]' ? button : null) } });
  return opened;
}

const CASES = [
  ['a_javascript_url_is_not_opened', 'javascript:alert(document.domain)', []],
  ['a_javascript_url_with_a_leading_space_is_not_opened', ' javascript:alert(1)', []],
  ['a_data_url_is_not_opened', 'data:text/html,<script>alert(1)</script>', []],
  ['an_https_url_is_opened', 'https://www.xiaohongshu.com/explore/abc', ['https://www.xiaohongshu.com/explore/abc']],
];

let bad = 0;
for (const [name, url, expected] of CASES) {
  let got;
  try { got = await openWith(url); } catch (e) { got = 'threw: ' + e.message; }
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (!ok) bad++;
  console.log(`${ok ? 'pass' : 'FAIL'} ${name}${ok ? '' : `\n    expected window.open calls ${JSON.stringify(expected)}\n    got      ${JSON.stringify(got)}`}`);
}
console.log(`RESULT: ${CASES.length - bad}/${CASES.length} cases pass`);
process.exit(bad ? 1 : 0);
