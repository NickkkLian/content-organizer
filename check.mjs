/* check.mjs — the merge rules under test, and the tests under test.

     node check.mjs           runs every case against js/merge.js; exit 0 only if all pass
     node check.mjs --break   breaks each rule in a copy of js/merge.js and requires the case written for it to fail

   Why these rules get tests: the library lives in one file in a private repo and two browsers can both have written
   since the last sync, with no server to arbitrate. A merge that quietly drops a note, or resurrects one that was
   deleted on the other device, would look exactly like normal use until something went missing. The cases below are
   the rules stated as inputs and outputs; the ones named property_* are the two that make a merge safe to repeat:
   it does not matter which device merges first, and merging twice changes nothing.

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

/* Every case: [name, fn]. fn throws (via t.eq / t.ok) when the rule does not hold. */
function cases(M) {
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
  ];
}

function run(M) {
  const results = [];
  for (const [name, fn] of cases(M)) {
    try { fn(); results.push([name, true, '']); }
    catch (e) { results.push([name, false, e.message]); }
  }
  return results;
}

const BREAKS = [
  ['tombstones are ignored', 'if (!n || !n.id || delSet[n.id]) return;', 'if (!n || !n.id) return;',
   'a_tombstone_on_one_device_deletes_the_note_on_the_other'],
  ['the older version wins', "if (!ex || String(n.savedAt || '') >= String(ex.savedAt || '')) byId[n.id] = n;",
   "if (!ex || String(n.savedAt || '') <= String(ex.savedAt || '')) byId[n.id] = n;",
   'the_newer_version_of_the_same_note_wins_from_the_left'],
  ['the result is not sorted', ".sort(function (x, y) { return String(y.savedAt || '').localeCompare(String(x.savedAt || '')); });", ';',
   'the_result_is_newest_first'],
  ['the signature includes the merge time', "return s(doc.notes) + '##'", "return String(doc.updatedAt) + s(doc.notes) + '##'",
   'the_signature_ignores_when_it_was_merged'],
  ['the platform tag overrides what the item says', "d.notes.forEach(function (n) { if (n && !n.platform) n.platform = p; });",
   "d.notes.forEach(function (n) { if (n) n.platform = p; });",
   'an_item_that_already_says_where_it_came_from_keeps_it'],
];

function main() {
  const source = path.join(HERE, 'js', 'merge.js');
  if (!process.argv.includes('--break')) {
    const results = run(require(source));
    for (const [name, ok, why] of results) console.log(`${ok ? 'pass' : 'FAIL'} ${name}${ok ? '' : '\n    ' + why}`);
    const bad = results.filter(([, ok]) => !ok).length;
    console.log(`RESULT: ${results.length - bad}/${results.length} cases pass`);
    return bad ? 1 : 0;
  }

  const text = fs.readFileSync(source, 'utf8');
  const caught = [];
  for (const [name, before, after, expect] of BREAKS) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'co-break-'));
    const copy = path.join(dir, 'merge.js');
    if (text.split(before).length - 1 !== 1) {
      console.log(`NOT APPLIED  ${name} — the line it edits is not in js/merge.js exactly once`);
      caught.push(false);
      continue;
    }
    fs.writeFileSync(copy, text.replace(before, after));
    const results = run(require(copy));
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
