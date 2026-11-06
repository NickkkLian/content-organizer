import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const library = require('./js/library.js'), refs = require('./js/refs.js');
const context = { window: { XHS: {} } };
context.self = context.window;
vm.runInNewContext(fs.readFileSync(new URL('./js/samples.js', import.meta.url), 'utf8'), context);
vm.runInNewContext(fs.readFileSync(new URL('./js/classify.js', import.meta.url), 'utf8'), context);
vm.runInNewContext(fs.readFileSync(new URL('./demo/data.js', import.meta.url), 'utf8'), context);
const demo = context.window.XHS.demo;
const cases = [
  ['Chinese tags outweigh a title-only topic hit', () => assert.equal(context.window.XHS.classify({ title: '旅行', tags: ['咖啡'], body: '' }).primary.name, '美食')],
  ['a Chinese travel note receives its topic without a folder question', () => assert.equal(context.window.XHS.classify({ title: '旅行攻略', tags: ['行程'], body: '' }).primary.name, '旅行')],
  ['unmatched content has an honest Other fallback', () => assert.equal(context.window.XHS.classify({ title: 'xyz', tags: [], body: '' }).primary.name, '其他')],
  ['search finds transcript-only text', () => assert.equal(library.search({ title: 'one', transcript: 'A hidden platform exit' }, 'platform').field, 'transcript')],
  ['search finds guide section text', () => assert.equal(library.search({ sections: [{ heading: 'Route', content: 'Bring an umbrella' }] }, 'umbrella').field, 'body')],
  ['search is case insensitive', () => assert.ok(library.search({ author: 'Handle' }, 'HANDLE'))],
  ['search excludes absent text', () => assert.equal(library.search({ title: 'one' }, 'two'), null)],
  ['tags count each note once and sort by frequency', () => assert.deepEqual(library.tags([{ tags: ['Kyoto', 'Kyoto'] }, { tags: ['Kyoto', 'Rain'] }]), [{ tag: 'Kyoto', count: 2 }, { tag: 'Rain', count: 1 }])],
  ['top tags stop at six', () => assert.equal(library.tags([{ tags: Array.from({ length: 12 }, (_, i) => String(i)) }]).length, 6)],
  ['each language carries 36 distinct fictional notes', () => { for (const language of ['zh', 'en']) { const notes = demo.notes(language); assert.equal(notes.length, 36); assert.equal(new Set(notes.map(n => n.id)).size, 36); assert.ok(notes.every(n => n.url.startsWith('https://example.com/'))); } }],
  ['both exact sets replay in any selection order', () => { for (const [key, count] of [['kyoto', 12], ['food', 8]]) { const notes = demo.notes('en').filter(n => n.group === key); assert.equal(notes.length, count); assert.equal(library.replaySet(notes.reverse()), key); } }],
  ['subsets, duplicates and mixed groups cannot replay', () => { const notes = demo.notes('en'); assert.equal(library.replaySet(notes.slice(0, 11)), null); assert.equal(library.replaySet(Array(12).fill(notes[0])), null); assert.equal(library.replaySet(notes.slice(1, 13)), null); }],
  ['Kyoto citation four opens a long video', () => { for (const language of ['zh', 'en']) { const guide = demo.guide('kyoto', language), source = refs.bind(guide).sources[3], note = demo.notes(language).find(n => n.url === source.url); assert.ok(note.isVideo); assert.ok(note.transcript.length >= 3000); } }],
  ['four guides cover all of their input notes', () => { for (const language of ['zh', 'en']) for (const key of ['kyoto', 'food']) { const guide = demo.guide(key, language); assert.equal(refs.bind(guide).sources.length, key === 'kyoto' ? 12 : 8); assert.equal(guide.sourceNoteIds.length, key === 'kyoto' ? 12 : 8); } }],
  ['language switch preserves sample identities and changes content', () => { const zh = demo.notes('zh'), en = demo.notes('en'); assert.deepEqual(zh.map(n => n.id), en.map(n => n.id)); assert.notEqual(zh[0].title, en[0].title); assert.notEqual(demo.guide('kyoto', 'zh').sections[0].content, demo.guide('kyoto', 'en').sections[0].content); }],
  ['demo copies are isolated from their fixture', () => { const notes = demo.notes('en'); notes[0].title = 'changed'; assert.notEqual(demo.notes('en')[0].title, 'changed'); }],
  ['every guide has its prompt, schema and output record', () => { for (const language of ['zh', 'en']) for (const key of ['kyoto', 'food']) { const record = JSON.parse(fs.readFileSync(new URL(`./demo/${key}.${language}.prompt-run.json`, import.meta.url))); assert.ok(record.system.includes('Remove noise, but do not delete substance')); assert.equal(record.rawOutput.sections.length, key === 'kyoto' ? 7 : 4); assert.equal(record.schema.type, 'object'); } }]
];
let failures = 0;
for (const [name, run] of cases) { try { run(); console.log('PASS', name); } catch (error) { failures++; console.error('FAIL', name, error.message); } }
console.log(`${cases.length - failures}/${cases.length} redesign cases passed`);
process.exitCode = failures ? 1 : 0;
