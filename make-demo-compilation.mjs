/* make-demo-compilation.mjs — run the AI step once, with your own key, and keep the result.

     ANTHROPIC_API_KEY=sk-ant-… node make-demo-compilation.mjs

   ?demo=1 loads the three sample notes; this writes demo/compilation.json, the compilation they were consolidated
   into, so a visitor can open the reading view without a key of their own. It costs one API call — a few cents —
   and it is the only thing in this repository that needs a key at all.

   The prompt, the schema and the request are not repeated here: js/ai.js is loaded and called, the same file the
   browser runs, so what the demo shows is what the app does. js/ai.js is a classic script that expects a window and
   localStorage, so it is evaluated in a small context that supplies both — the alternative, copying the prompt into
   this file, is the kind of second copy that drifts and then quietly tells a different story than the product.

   Re-run it whenever the prompt or the sample notes change; the file records the model and the date, and the page
   shows both, so a stale cache is visible rather than silently passed off as current. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const key = process.env.ANTHROPIC_API_KEY;
if (!key) {
  console.error('Set ANTHROPIC_API_KEY first — this makes one call to the Claude API with your own key.\n' +
                '  ANTHROPIC_API_KEY=sk-ant-… node make-demo-compilation.mjs');
  process.exit(2);
}

/* js/ai.js reads its model and key out of localStorage and posts with fetch; both are supplied here, and nothing
   else of a browser is. If it ever needs more than this, that is worth knowing rather than papering over. */
const store = new Map([['xhs_ai_config', JSON.stringify({ apiKey: key, model: process.env.MODEL || 'claude-opus-4-8' })]]);
const context = {
  window: { XHS: {} },
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  },
  fetch, console, setTimeout, clearTimeout, TextDecoder, TextEncoder, URL, AbortController
};
context.self = context.window;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(HERE, 'js', 'ai.js'), 'utf8'), context, { filename: 'js/ai.js' });
const ai = context.window.XHS.ai;
if (!ai || typeof ai.consolidate !== 'function') {
  console.error('js/ai.js did not export consolidate — has its shape changed?');
  process.exit(1);
}

const notes = require('./js/samples.js').NOTES;
const refs = require('./js/refs.js');
console.log(`Consolidating ${notes.length} sample notes with ${ai.getConfig().model}…`);
const res = await ai.consolidate(notes.map((n) => ({ title: n.title, body: n.body, transcript: n.transcript, tags: n.tags, url: n.url || '', platform: n.platform, isVideo: n.isVideo })), null);

/* The same mapping js/app.js does when it stores a compilation: source_indices become the sources a section cites.
   The sample notes carry no URL — they are invented posts — so a source is identified by its title, which is the
   case js/refs.js calls out and check.mjs has a test for. */
const sections = (res.sections || []).map((s) => ({
  heading: s.heading,
  content: s.content,
  sources: (s.source_indices || []).map((i) => notes[i - 1]).filter(Boolean).map((n) => ({ title: n.title, url: n.url || '' }))
}));
const comp = {
  id: 'demo-compilation',
  title: res.title, topic: res.topic, summary: res.summary,
  sections,
  images: [], imagesRepo: [], archived: false,
  sourceNoteIds: [], sourceUrls: notes.map((n) => n.url).filter(Boolean),
  model: ai.getConfig().model,
  savedAt: new Date().toISOString()
};

const bound = refs.bind(comp);
fs.mkdirSync(path.join(HERE, 'demo'), { recursive: true });
fs.writeFileSync(path.join(HERE, 'demo', 'compilation.json'), JSON.stringify(comp, null, 2) + '\n');
console.log(`Wrote demo/compilation.json — “${comp.title}”, ${sections.length} sections, ${bound.sources.length} sources, ${comp.model}, ${comp.savedAt.slice(0, 10)}.`);
console.log('Commit it, and ?demo=1 shows the reading view without a key.');
