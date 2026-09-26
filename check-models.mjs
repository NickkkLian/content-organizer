/* check-models.mjs — every request js/ai.js sends names one of the two allowed models.

     node check-models.mjs

   The app offers exactly two models: claude-opus-5-5 and claude-sonnet-5. A model id saved by an older version of
   the page (Opus 4.8, Haiku 4.5) must not reach the API. Both models think on every request and the thinking counts
   toward max_tokens, and both reject budget_tokens, temperature and a forced tool_choice.
   fetch is replaced by a recorder, so no request leaves this machine. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ALLOWED = ['claude-opus-5-5', 'claude-sonnet-5'];
let failed = 0;
const ok = (cond, name) => { console.log((cond ? 'ok   ' : 'FAIL ') + name); if (!cond) failed++; };

function load(saved, reply) {
  const store = new Map(saved ? [['xhs_ai_config', JSON.stringify(saved)]] : []);
  const sent = [];
  const fetch = async (url, init) => {
    sent.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => reply, text: async () => JSON.stringify(reply) };
  };
  const context = {
    window: { XHS: { i18n: { lang: 'en' } } },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    fetch, console
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(HERE, 'js', 'ai.js'), 'utf8'), context, { filename: 'js/ai.js' });
  return { ai: context.window.XHS.ai, sent, store };
}

const compJson = JSON.stringify({ title: 't', topic: 'x', summary: 's', sections: [{ heading: 'h', content: 'c', source_indices: [1] }], keep_images: [] });
// thinking block first: the text has to be found by block type, not by position
const good = { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: compJson }] };
const posts = [{ title: 'a note', body: 'body', tags: [], url: '' }];

ok(JSON.stringify([...load().ai.MODELS.map((m) => m.id)]) === JSON.stringify(ALLOWED), 'the picker offers exactly Opus 5.5 and Sonnet 5');

for (const saved of [null, { apiKey: 'k' }, { apiKey: 'k', model: 'claude-opus-4-8' }, { apiKey: 'k', model: 'claude-haiku-4-5' }, { apiKey: 'k', model: 'claude-sonnet-5' }, { apiKey: 'k', model: 'claude-opus-5-5' }]) {
  const { ai, sent } = load(saved ? { apiKey: 'k', ...saved } : { apiKey: 'k' }, good);
  const res = await ai.consolidate(posts, null);
  await ai.judgeFrames(['AAAA']);
  const label = saved && saved.model ? 'saved ' + saved.model : 'nothing saved';
  ok(res.title === 't', `${label}: the compilation is read from the text block after a thinking block`);
  ok(sent.length === 2, `${label}: two requests sent (compilation, frame judging)`);
  for (const [i, s] of sent.entries()) {
    const what = i === 0 ? 'compilation' : 'frame judging';
    ok(ALLOWED.includes(s.body.model), `${label}: ${what} request names an allowed model (${s.body.model})`);
    ok(s.body.max_tokens >= 16000, `${label}: ${what} max_tokens >= 16000 (${s.body.max_tokens})`);
    ok(!('temperature' in s.body) && !('tool_choice' in s.body) && !('thinking' in s.body), `${label}: ${what} sends no temperature, tool_choice or thinking budget`);
  }
  if (saved && ALLOWED.includes(saved.model)) ok(sent[0].body.model === saved.model, `${label}: the chosen model is the one used`);
  if (saved && saved.model && !ALLOWED.includes(saved.model)) ok(sent[0].body.model === 'claude-opus-5-5', `${label}: an old saved model falls back to Opus 5.5`);
  ok(sent[1].body.model === 'claude-sonnet-5', `${label}: frame judging uses Sonnet 5`);
}

{ const { ai, store } = load({ apiKey: 'k' }, good);
  ai.saveConfig(null, 'claude-haiku-4-5');
  ok(JSON.parse(store.get('xhs_ai_config')).model === 'claude-opus-5-5', 'saving a model that is not offered stores Opus 5.5 instead'); }

for (const [stop, re] of [['refusal', /refused/], ['max_tokens', /cut off/]]) {
  const { ai } = load({ apiKey: 'k' }, { stop_reason: stop, content: [{ type: 'text', text: '{"title":' }] });
  let msg = '';
  try { await ai.consolidate(posts, null); } catch (e) { msg = e.message; }
  ok(re.test(msg), `stop_reason ${stop}: consolidate says so (${msg || 'no error'})`);
  ok((await ai.judgeFrames(['AAAA'])).length === 0, `stop_reason ${stop}: frame judging keeps nothing`);
}

console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
