// The export must carry the reading view's resolved references, without reading connections or making requests.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
const require = createRequire(import.meta.url);
const R = require('./js/refs.js');
const E = require('./js/export.js');
const tests = [];
const test = (name, run) => tests.push([name, run]);
const source = (title, url = '') => ({ title, url });
const fixture = {
  title: 'A portable compilation', summary: 'The saved summary', topic: 'Research', lang: 'en',
  model: 'saved-model', runAt: '2026-10-20T10:00:00Z', savedAt: '2026-10-27T10:00:00Z',
  sections: [
    { heading: 'First', content: 'First body', sources: [source('Beta', 'https://example.org/b'), source('Alpha', 'https://example.org/a')] },
    { heading: 'Second', content: 'Second body', sources: [source('Renamed Beta', 'https://example.org/b'), source('Pasted note'), source('', ''), source('', 'https://example.org/bare')] }
  ],
  sourceUrls: ['https://example.org/a', 'https://example.org/uncited']
};
test('section order, citation identity and source completeness match the reading resolver', () => {
  const md = E.markdown(fixture), bound = R.bind(fixture);
  assert.ok(md.indexOf('## First') < md.indexOf('## Second'));
  assert.deepEqual([...md.matchAll(/^From (.+)$/gm)].map(m => m[1]), ['[1] [2]', '[1] [3] [4]']);
  assert.deepEqual([...md.matchAll(/^(\d+)\. /gm)].map(m => +m[1]), bound.sources.map(s => s.n));
  for (const s of bound.sources) assert.ok(md.includes(s.title || R.label(s)) && (!s.url || md.includes(s.url)));
  assert.equal((md.match(/https:\/\/example.org\/b>/g) || []).length, 1);
  assert.match(md, /5\. .*uncited/);
});
test('saved language and generation metadata survive; saving does not reset the generation date', () => {
  const md = E.markdown(fixture, 'zh').replace(/\\([\-.])/g, '$1');
  for (const value of [fixture.model, fixture.runAt, fixture.lang, fixture.topic, fixture.summary]) assert.ok(md.includes(value));
  assert.ok(!md.includes(fixture.savedAt));
  const zh = E.markdown({ ...fixture, lang: 'zh', title: '中文合集', sections: [{ heading: '第一节', content: '原文不翻译。', sources: [] }] }, 'en');
  assert.match(zh, /# 中文合集/); assert.match(zh, /## 第一节/); assert.match(zh, /原文不翻译。/); assert.match(zh, /## 来源/); assert.match(zh, /未单独引用/);
  assert.ok(E.markdown({ savedAt: fixture.savedAt }).replace(/\\([\-.])/g, '$1').includes(fixture.savedAt));
});
test('connection fields and unknown fields are never read or serialized; no fetch', () => {
  const input = structuredClone(fixture);
  for (const key of ['settings', 'connection', 'token', 'apiKey', 'owner', 'repo', 'extra']) Object.defineProperty(input, key, { get() { throw Error('Read forbidden field: ' + key); } });
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = () => { throw Error('Export attempted a request'); };
  try { assert.equal(E.markdown(input), E.markdown(fixture)); } finally { globalThis.fetch = fetchBefore; }
});
test('Markdown syntax and HTML in displayed text stay literal, and non-web sources are not links', () => {
  const md = E.markdown({ title: '[unsafe] <img src=x>', sections: [{ heading: '# heading', content: '[click](javascript:alert(1))\n<script>bad</script>', sources: [source('bad ](javascript:alert(1))', 'javascript:alert(1)'), source('A [label]', 'https://example.org/a(b)?x=<tag>')] }] });
  assert.ok(!md.includes('<script>')); assert.ok(!md.includes('<img'));
  assert.ok(!md.includes('](javascript:')); assert.ok(md.includes('\\[label\\]'));
  assert.ok(md.includes('<https://example.org/a%28b%29?x=%3Ctag%3E>'));
  assert.ok(md.includes('javascript:alert\\(1\\)'));
});
test('empty and title-only sources follow the reading view defaults', () => {
  assert.match(E.markdown(), /# Untitled compilation/);
  assert.match(E.markdown({}), /This compilation has no sections yet/);
  const md = E.markdown({ sections: [{ sources: [source('Only a title'), source('', '')] }] });
  assert.match(md, /## Untitled section/); assert.match(md, /1\. Only a title/); assert.ok(!md.includes('2. '));
});
test('cached English and Chinese demos export without keys or regeneration', () => {
  for (const file of ['compilation.json', 'compilation.zh.json']) {
    const c = JSON.parse(readFileSync(new URL('./demo/' + file, import.meta.url)));
    const md = E.markdown(c);
    assert.ok(md.includes(c.title));
    assert.equal([...md.matchAll(/^From |^来源 /gm)].length, R.bind(c).sections.filter(s => s.refs.length).length);
  }
});
test('large compilation retains every section and source, including uncited sources', () => {
  const c = { sections: Array.from({ length: 2000 }, (_, i) => ({ heading: 'Section ' + i, content: 'Body '.repeat(100), sources: [source('Source ' + i, 'https://example.org/' + i)] })), sourceUrls: ['https://example.org/extra'] };
  const start = performance.now(), md = E.markdown(c);
  assert.equal([...md.matchAll(/^## Section /gm)].length, 2000);
  assert.match(md, /From \[2000\]/); assert.match(md, /2001\. .*uncited/);
  console.log('  large fixture:', md.length, 'characters in', Math.round(performance.now() - start), 'ms');
});
test('download filename keeps Unicode and removes path/control characters', () => {
  assert.equal(E.filename({ title: '../../a:b/中文\n' }), 'a-b-中文.md');
  assert.equal(E.filename({ title: '..' }), 'compilation.md');
  assert.ok(E.filename({ title: 'x'.repeat(300) }).length <= 83);
});
let failed = 0;
for (const [name, run] of tests) { try { run(); console.log('PASS', name); } catch (e) { failed++; console.error('FAIL', name, e); } }
console.log(`${tests.length - failed}/${tests.length} export cases passed`);
process.exitCode = failed ? 1 : 0;
