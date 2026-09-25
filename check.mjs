/* check.mjs — the rules under test, and the tests under test.

     node check.mjs           runs every case against js/merge.js and js/refs.js; exit 0 only if all pass
     node check.mjs --break   breaks each rule in a copy of those files and requires the case written for it to fail

   Two sets of rules, both DOM-free, so node runs the same file the browser does.

   js/merge.js — why these rules get tests: the library lives in one file in a private repo and two browsers can both
   have written since the last sync, with no server to arbitrate. A merge that quietly drops a note, or resurrects one
   that was deleted on the other device, would look exactly like normal use until something went missing. The cases
   below are the rules stated as inputs and outputs; the ones named property_* are the two that make a merge safe to
   repeat: it does not matter which device merges first, and merging twice changes nothing.

   js/refs.js — the reading view claims that every section points back at what it was made from. That claim is one
   numbered list built from sources scattered across sections, and a renderer that numbered them wrongly would still
   render: the numbers beside the sections would simply stop matching the list they point into.

   --break exists because a green suite only means something if it can go red, and because "some test failed" is not
   enough: each break has to be caught by the case written for it, so a break that reddens the suite for an unrelated
   reason is reported as not caught. */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const NOW = '2026-09-17T00:00:00.000Z';
const note = (id, savedAt, extra = {}) => ({ id, savedAt, title: 'note ' + id, ...extra });
const doc = (o = {}) => ({ version: 1, updatedAt: null, notes: [], deleted: [], compilations: [], deletedComps: [], ...o });
const ids = (list) => list.map((n) => n.id);
const sec = (heading, sources = []) => ({ heading, content: heading + ' body', sources });
const src = (title, url = '') => ({ title, url });
const comp = (o = {}) => ({ id: 'c1', title: 'a compilation', summary: '', sections: [], sourceUrls: [], ...o });

/* Every case: [name, fn]. fn throws (via t.eq / t.ok) when the rule does not hold. */
function cases(M, R) {
  const t = {
    eq(actual, expected, what) {
      const a = JSON.stringify(actual), b = JSON.stringify(expected);
      if (a !== b) throw new Error(`${what}\n    expected ${b}\n    got      ${a}`);
    },
    ok(cond, what) { if (!cond) throw new Error(what); }
  };
  return [
    ['empty_documents_merge_to_an_empty_document', () => {
      const m = M.mergeDocs(doc(), doc(), NOW);
      t.eq([m.notes, m.deleted, m.compilations, m.deletedComps], [[], [], [], []], 'nothing in, nothing out');
    }],
    ['disjoint_notes_are_unioned', () => {
      const m = M.mergeDocs(doc({ notes: [note('a', '2026-01-01')] }), doc({ notes: [note('b', '2026-01-02')] }), NOW);
      t.eq(ids(m.notes).sort(), ['a', 'b'], 'a note saved on either device survives');
    }],
    ['the_newer_version_of_the_same_note_wins_from_the_left', () => {
      const m = M.mergeDocs(doc({ notes: [note('a', '2026-03-01', { title: 'newer' })] }),
                            doc({ notes: [note('a', '2026-01-01', { title: 'older' })] }), NOW);
      t.eq(m.notes.map((n) => n.title), ['newer'], 'the later savedAt wins whichever side it is on');
    }],
    ['the_newer_version_of_the_same_note_wins_from_the_right', () => {
      const m = M.mergeDocs(doc({ notes: [note('a', '2026-01-01', { title: 'older' })] }),
                            doc({ notes: [note('a', '2026-03-01', { title: 'newer' })] }), NOW);
      t.eq(m.notes.map((n) => n.title), ['newer'], 'the later savedAt wins whichever side it is on');
    }],
    ['an_identical_timestamp_keeps_the_second_side', () => {
      const m = M.mergeDocs(doc({ notes: [note('a', '2026-01-01', { title: 'first' })] }),
                            doc({ notes: [note('a', '2026-01-01', { title: 'second' })] }), NOW);
      t.eq(m.notes.map((n) => n.title), ['second'], 'a tie is decided by order, and the rule is written that way');
    }],
    ['a_tombstone_on_one_device_deletes_the_note_on_the_other', () => {
      const m = M.mergeDocs(doc({ notes: [note('a', '2026-01-01')], deleted: [] }),
                            doc({ notes: [], deleted: ['a'] }), NOW);
      t.eq(ids(m.notes), [], 'delete wins over a copy that still has the note');
      t.eq(m.deleted, ['a'], 'and the tombstone is kept, or the next sync would bring it back');
    }],
    ['a_note_re_saved_after_a_delete_stays_deleted', () => {
      const m = M.mergeDocs(doc({ notes: [note('a', '2030-01-01', { title: 'much newer' })] }),
                            doc({ notes: [], deleted: ['a'] }), NOW);
      t.eq(ids(m.notes), [], 'a tombstone outranks any timestamp — deleting is the one action that cannot be undone by a merge');
    }],
    ['tombstones_from_both_sides_are_kept', () => {
      const m = M.mergeDocs(doc({ deleted: ['a'] }), doc({ deleted: ['b'] }), NOW);
      t.eq(m.deleted.slice().sort(), ['a', 'b'], 'both devices\' deletions survive');
    }],
    ['a_tombstone_is_not_repeated', () => {
      const m = M.mergeDocs(doc({ deleted: ['a'] }), doc({ deleted: ['a'] }), NOW);
      t.eq(m.deleted, ['a'], 'the same deletion on both sides is one tombstone');
    }],
    ['items_without_an_id_are_dropped', () => {
      const m = M.mergeDocs(doc({ notes: [{ savedAt: '2026-01-01', title: 'no id' }] }), doc(), NOW);
      t.eq(ids(m.notes), [], 'an item with no id cannot be merged, deleted or de-duplicated');
    }],
    ['null_entries_are_ignored', () => {
      const m = M.mergeDocs(doc({ notes: [null, note('a', '2026-01-01')] }), doc({ notes: [undefined] }), NOW);
      t.eq(ids(m.notes), ['a'], 'a hole in the list does not stop the merge');
    }],
    ['the_result_is_newest_first', () => {
      const m = M.mergeDocs(doc({ notes: [note('old', '2026-01-01'), note('new', '2026-05-01')] }),
                            doc({ notes: [note('middle', '2026-03-01')] }), NOW);
      t.eq(ids(m.notes), ['new', 'middle', 'old'], 'the library reads newest first without the caller sorting');
    }],
    ['a_note_without_a_timestamp_sorts_last', () => {
      const m = M.mergeDocs(doc({ notes: [{ id: 'nodate' }, note('dated', '2026-01-01')] }), doc(), NOW);
      t.eq(ids(m.notes), ['dated', 'nodate'], 'a note with no savedAt goes to the end rather than to the top');
    }],
    ['compilations_merge_by_their_own_rules', () => {
      const m = M.mergeDocs(doc({ compilations: [{ id: 'c1', savedAt: '2026-01-01' }] }),
                            doc({ compilations: [{ id: 'c2', savedAt: '2026-02-01' }], deletedComps: ['c1'] }), NOW);
      t.eq(ids(m.compilations), ['c2'], 'a deleted compilation goes, the other stays');
      t.eq(m.deletedComps, ['c1'], 'with its own tombstone list');
    }],
    ['a_compilation_tombstone_does_not_delete_a_note_with_the_same_id', () => {
      const m = M.mergeDocs(doc({ notes: [note('x', '2026-01-01')], compilations: [{ id: 'x' }] }),
                            doc({ deletedComps: ['x'] }), NOW);
      t.eq(ids(m.notes), ['x'], 'the two lists have separate tombstones');
      t.eq(ids(m.compilations), [], 'and the compilation is the one that goes');
    }],
    ['a_document_with_the_wrong_types_is_normalised', () => {
      const m = M.mergeDocs({ notes: 'not a list', deleted: null }, doc({ notes: [note('a', '2026-01-01')] }), NOW);
      t.eq(ids(m.notes), ['a'], 'a file that is not shaped like a document does not throw');
    }],
    ['a_file_whose_list_field_has_the_wrong_type_is_refused', () => {
      t.eq(M.shapeProblems({ version: 1, notes: { a: { id: 'a' } }, deleted: [] }), ['notes'],
           'read as empty, the notes held there would be written over by the next save');
      t.eq(M.shapeProblems({ compilations: 'x', deletedComps: 3 }), ['compilations', 'deletedComps'], 'every list field is checked');
      t.eq(M.shapeProblems([]), ['(the file is not a JSON object)'], 'a top-level list is not a library');
    }],
    ['a_file_that_lacks_a_field_is_accepted', () => {
      t.eq(M.shapeProblems({ version: 1, notes: [note('a', '2026-01-01')] }), [], 'a missing field starts empty');
      t.eq(M.shapeProblems({}), [], 'so does an empty object');
    }],
    ['fields_this_version_does_not_know_are_kept', () => {
      const m = M.mergeDocs(doc({ future: { x: 1 } }), doc({ notes: [note('a', '2026-01-01')] }), NOW);
      t.eq(m.future, { x: 1 }, 'a field written by another version survives the save');
      t.eq(ids(m.notes), ['a'], 'and the merge itself is unchanged');
    }],
    ['merging_stamps_the_time_it_was_merged', () => {
      t.eq(M.mergeDocs(doc(), doc(), NOW).updatedAt, NOW, 'updatedAt says when, and a test can pin it');
    }],
    ['the_signature_ignores_order', () => {
      const a = doc({ notes: [note('a', '2026-01-01'), note('b', '2026-02-01')] });
      const b = doc({ notes: [note('b', '2026-02-01'), note('a', '2026-01-01')] });
      t.eq(M.sig(a), M.sig(b), 'the same library in a different order is the same library');
    }],
    ['the_signature_ignores_when_it_was_merged', () => {
      t.eq(M.sig(doc({ updatedAt: '2020-01-01' })), M.sig(doc({ updatedAt: '2030-01-01' })),
           'otherwise every sync would write a commit that changes nothing');
    }],
    ['the_signature_changes_when_a_note_changes', () => {
      t.ok(M.sig(doc({ notes: [note('a', '2026-01-01', { title: 'one' })] }))
           !== M.sig(doc({ notes: [note('a', '2026-01-01', { title: 'two' })] })),
           'an edit must be written, so it has to change the signature');
    }],
    ['the_signature_changes_when_something_is_deleted', () => {
      t.ok(M.sig(doc({ deleted: [] })) !== M.sig(doc({ deleted: ['a'] })), 'a deletion is a change like any other');
    }],
    ['legacy_files_are_tagged_with_the_platform_they_came_from', () => {
      const c = M.combineLegacy({ notes: [{ id: 'x1' }] }, { notes: [{ id: 'b1' }] });
      t.eq(c.notes.map((n) => n.platform), ['xhs', 'bili'], 'the first run tags each item with where it came from');
    }],
    ['an_item_that_already_says_where_it_came_from_keeps_it', () => {
      const c = M.combineLegacy({ notes: [{ id: 'x1', platform: 'bili' }] }, { notes: [] });
      t.eq(c.notes.map((n) => n.platform), ['bili'], 'the tag is a default, not an override');
    }],
    ['property_merging_is_the_same_in_either_direction', () => {
      const a = doc({ notes: [note('a', '2026-03-01'), note('b', '2026-01-01')], deleted: ['z'] });
      const b = doc({ notes: [note('a', '2026-01-01'), note('c', '2026-02-01')], deleted: ['b'] });
      t.eq(M.sig(M.mergeDocs(a, b, NOW)), M.sig(M.mergeDocs(b, a, NOW)),
           'two devices must reach the same library whichever one syncs first');
    }],
    ['property_merging_twice_changes_nothing', () => {
      const a = doc({ notes: [note('a', '2026-03-01')], deleted: ['z'] });
      const b = doc({ notes: [note('b', '2026-01-01')] });
      const once = M.mergeDocs(a, b, NOW);
      t.eq(M.sig(M.mergeDocs(a, once, NOW)), M.sig(once), 'syncing again must not add, drop or resurrect anything');
    }],

    /* ----- js/refs.js: one numbered source list for the whole piece ----- */
    ['one_post_cited_by_two_sections_is_one_source', () => {
      const r = R.bind(comp({ sections: [sec('A', [src('Kyoto', 'u/1')]), sec('B', [src('Kyoto', 'u/1')])] }));
      t.eq(r.sources.map((s) => s.n), [1], 'the list is of sources, not of citations');
      t.eq(r.sections.map((s) => s.refs), [[1], [1]], 'and both sections point at the same number');
    }],
    ['sources_are_numbered_in_reading_order', () => {
      const r = R.bind(comp({ sections: [sec('A', [src('zzz', 'u/z')]), sec('B', [src('aaa', 'u/a')])] }));
      t.eq(r.sources.map((s) => s.title), ['zzz', 'aaa'], '[1] is the first source the reader meets, not the first alphabetically');
      t.eq(r.sections.map((s) => s.refs), [[1], [2]], 'and the sections cite those numbers');
    }],
    ['the_same_url_under_two_titles_is_one_source', () => {
      const r = R.bind(comp({ sections: [sec('A', [src('Kyoto in 3 days', 'u/1')]), sec('B', [src('Kyoto', 'u/1')])] }));
      t.eq(r.sources.length, 1, 'the link is the identity; the title is what the AI happened to call it that time');
      t.eq(r.sources[0].title, 'Kyoto in 3 days', 'and the first title met is the one shown');
    }],
    ['a_source_with_no_url_is_identified_by_its_title', () => {
      const r = R.bind(comp({ sections: [sec('A', [src('pasted by hand')]), sec('B', [src('pasted by hand')])] }));
      t.eq(r.sources.length, 1, 'a note pasted by hand has no link, and two sections citing it are still one source');
    }],
    ['a_source_with_neither_url_nor_title_is_dropped', () => {
      const r = R.bind(comp({ sections: [sec('A', [src('', ''), src('real', 'u/1')])] }));
      t.eq(r.sources.map((s) => s.title), ['real'], 'a number has to point at something');
      t.eq(r.sections[0].refs, [1], 'and the section keeps the reference that does');
    }],
    ['a_section_with_no_sources_has_no_references', () => {
      const r = R.bind(comp({ sections: [sec('A', [src('x', 'u/1')]), sec('Bridge', [])] }));
      t.eq(r.sections.map((s) => s.refs), [[1], []], 'the AI may write a section that draws on nothing in particular');
    }],
    ['a_consolidated_note_no_section_cites_still_appears', () => {
      const r = R.bind(comp({ sections: [sec('A', [src('cited', 'u/1')])], sourceUrls: ['u/1', 'u/2'] }));
      t.eq(r.sources.map((s) => [s.url, s.cited]), [['u/1', true], ['u/2', false]],
           'it went into the piece; it is listed after the cited ones and marked as uncited');
    }],
    ['a_source_cited_twice_in_one_section_is_one_reference', () => {
      const r = R.bind(comp({ sections: [sec('A', [src('x', 'u/1'), src('x', 'u/1')])] }));
      t.eq(r.sections[0].refs, [1], 'a section does not print [1] [1]');
    }],
    ['binding_does_not_touch_the_compilation_it_was_given', () => {
      const c = comp({ sections: [sec('A', [src('x', 'u/1')])], sourceUrls: ['u/2'] });
      const before = JSON.stringify(c);
      R.bind(c);
      t.eq(JSON.stringify(c), before, 'the stored compilation is what syncs to the repo; rendering must not edit it');
    }],
    ['a_compilation_with_no_sections_binds_to_nothing', () => {
      const r = R.bind({});
      t.eq([r.sources, r.sections], [[], []], 'an older compilation, or a half-written one, renders empty rather than throwing');
    }],
    ['only_http_and_https_links_are_rendered_as_links', () => {
      t.eq(['https://x.test/1', 'http://x.test/1'].map(R.isWebUrl), [true, true], 'a web address is a link');
      t.eq(['javascript:alert(1)', ' JavaScript:alert(1)', 'java\tscript:alert(1)', 'data:text/html,x', '/relative', '', null]
             .map(R.isWebUrl), [false, false, false, false, false, false, false],
           'anything else a file holds is shown as text, including a scheme the browser would read through spaces and tabs');
    }],
    ['a_source_without_a_title_is_labelled_by_its_link', () => {
      t.eq(R.label({ title: '', url: 'https://www.xiaohongshu.com/explore/abc/' }), 'xiaohongshu.com/explore/abc',
           'the scheme and the www say nothing to a reader');
      t.eq(R.label({ title: 'Kyoto', url: 'https://x.test/1' }), 'Kyoto', 'a title beats a link');
    }],
  ];
}

function run(mods) {
  const results = [];
  for (const [name, fn] of cases(mods.merge, mods.refs)) {
    try { fn(); results.push([name, true, '']); }
    catch (e) { results.push([name, false, e.message]); }
  }
  return results;
}

/* [name, which file, the line as it stands, the line broken, the case that has to fail] */
const BREAKS = [
  ['tombstones are ignored', 'merge', 'if (!n || !n.id || delSet[n.id]) return;', 'if (!n || !n.id) return;',
   'a_tombstone_on_one_device_deletes_the_note_on_the_other'],
  ['the older version wins', 'merge', "if (!ex || String(n.savedAt || '') >= String(ex.savedAt || '')) byId[n.id] = n;",
   "if (!ex || String(n.savedAt || '') <= String(ex.savedAt || '')) byId[n.id] = n;",
   'the_newer_version_of_the_same_note_wins_from_the_left'],
  ['the result is not sorted', 'merge', ".sort(function (x, y) { return String(y.savedAt || '').localeCompare(String(x.savedAt || '')); });", ';',
   'the_result_is_newest_first'],
  ['the signature includes the merge time', 'merge', "return s(doc.notes) + '##'", "return String(doc.updatedAt) + s(doc.notes) + '##'",
   'the_signature_ignores_when_it_was_merged'],
  ['the platform tag overrides what the item says', 'merge', "d.notes.forEach(function (n) { if (n && !n.platform) n.platform = p; });",
   "d.notes.forEach(function (n) { if (n) n.platform = p; });",
   'an_item_that_already_says_where_it_came_from_keeps_it'],
  ['the title decides identity before the link does', 'refs',
   "var key = url ? 'u:' + String(url) : (title ? 't:' + String(title) : '');",
   "var key = title ? 't:' + String(title) : (url ? 'u:' + String(url) : '');",
   'the_same_url_under_two_titles_is_one_source'],
  ['a source with nothing to point at is numbered anyway', 'refs', 'if (!key) return 0;', "if (!key) key = 'blank';",
   'a_source_with_neither_url_nor_title_is_dropped'],
  ['the notes no section cites are dropped', 'refs',
   "(comp.sourceUrls || []).forEach(function (u) { if (u) add('', u, false); });", '',
   'a_consolidated_note_no_section_cites_still_appears'],
  ['a section prints the same reference twice', 'refs',
   'if (n && refs.indexOf(n) === -1) refs.push(n);', 'if (n) refs.push(n);',
   'a_source_cited_twice_in_one_section_is_one_reference'],
  ['the list is alphabetised after the numbers are handed out', 'refs',
   'return { sources: sources, sections: sections };',
   'return { sources: sources.slice().sort(function (a, b) { return a.url.localeCompare(b.url); }), sections: sections };',
   'sources_are_numbered_in_reading_order'],
  ['a list field of the wrong type is read as empty', 'merge',
   "LISTS.forEach(function (k) { if (d[k] != null && !Array.isArray(d[k])) bad.push(k); });", '',
   'a_file_whose_list_field_has_the_wrong_type_is_refused'],
  ['unknown fields are dropped by the merge', 'merge',
   'return Object.assign(unknownFields(b), unknownFields(a), {', 'return Object.assign({}, {',
   'fields_this_version_does_not_know_are_kept'],
  ['any scheme is rendered as a link', 'refs', "return p === 'http:' || p === 'https:';", 'return true;',
   'only_http_and_https_links_are_rendered_as_links'],
];

const SOURCES = { merge: path.join(HERE, 'js', 'merge.js'), refs: path.join(HERE, 'js', 'refs.js') };
/* Both modules, with any one of them swapped for a broken copy. */
function load(swap) {
  return { merge: require((swap && swap.merge) || SOURCES.merge), refs: require((swap && swap.refs) || SOURCES.refs) };
}

function main() {
  if (!process.argv.includes('--break')) {
    const results = run(load());
    for (const [name, ok, why] of results) console.log(`${ok ? 'pass' : 'FAIL'} ${name}${ok ? '' : '\n    ' + why}`);
    const bad = results.filter(([, ok]) => !ok).length;
    console.log(`RESULT: ${results.length - bad}/${results.length} cases pass`);
    return bad ? 1 : 0;
  }

  const caught = [];
  for (const [name, file, before, after, expect] of BREAKS) {
    const source = SOURCES[file];
    const text = fs.readFileSync(source, 'utf8');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'co-break-'));
    const copy = path.join(dir, path.basename(source));
    if (text.split(before).length - 1 !== 1) {
      console.log(`NOT APPLIED  ${name} — the line it edits is not in js/${file}.js exactly once`);
      caught.push(false);
      continue;
    }
    fs.writeFileSync(copy, text.replace(before, after));
    const results = run(load({ [file]: copy }));
    const failed = results.filter(([, ok]) => !ok).map(([n]) => n);
    const ok = failed.includes(expect);
    console.log(`${ok ? 'CAUGHT     ' : 'NOT CAUGHT '} ${name}\n             expected ${expect} to fail; failing: ${failed.join(', ') || 'none'}`);
    caught.push(ok);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const n = caught.filter(Boolean).length;
  console.log(`RESULT: ${n}/${BREAKS.length} breaks caught by the case written for them`);
  return n === BREAKS.length ? 0 : 1;
}

process.exit(main());
