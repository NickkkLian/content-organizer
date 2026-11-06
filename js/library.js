/* Pure view rules shared by the rendered library and its regression checks. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.XHS.library = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function search(note, query) {
    var q = String(query || '').trim().toLocaleLowerCase();
    if (!q) return { field: '', text: note.body || note.transcript || '' };
    var fields = ['title', 'body', 'transcript', 'author', 'tags', 'summary'];
    for (var field of fields) {
      var text = Array.isArray(note[field]) ? note[field].join(' ') : String(note[field] || '');
      var position = text.toLocaleLowerCase().indexOf(q);
      if (position >= 0) return { field: field, text: text.slice(Math.max(0, position - 24), position + q.length + 110) };
    }
    for (var section of note.sections || []) {
      var text = section.heading + '\n' + section.content;
      var position = text.toLocaleLowerCase().indexOf(q);
      if (position >= 0) return { field: 'body', text: text.slice(Math.max(0, position - 24), position + q.length + 110) };
    }
    return null;
  }
  function tags(notes) {
    var counts = new Map();
    notes.forEach(function (note) {
      new Set(note.tags || []).forEach(function (tag) { counts.set(tag, (counts.get(tag) || 0) + 1); });
    });
    return Array.from(counts, function (entry) { return { tag: entry[0], count: entry[1] }; })
      .sort(function (a, b) { return b.count - a.count || a.tag.localeCompare(b.tag); }).slice(0, 6);
  }
  function replaySet(notes) {
    var keys = notes.map(function (note) { return note.demoKey || ''; }).sort();
    for (var group of [{ key: 'kyoto', count: 12 }, { key: 'food', count: 8 }]) {
      var expected = Array.from({ length: group.count }, function (_, i) { return group.key + '-' + (i + 1); }).sort();
      if (JSON.stringify(keys) === JSON.stringify(expected)) return group.key;
    }
    return null;
  }
  return { search: search, tags: tags, replaySet: replaySet };
});
