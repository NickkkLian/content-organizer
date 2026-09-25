/* The library's merge rules, DOM-free and dependency-free: what happens when two devices have both written.

   Two devices edit the same library in two browsers and sync through one file in a private repo, so every pull has
   to reconcile two versions without a server to arbitrate. The rules are:
     · union by id — an item present on either side is kept;
     · tombstones win over content — an id in either side's deleted list stays deleted, whatever the other side holds;
     · latest savedAt wins for an id present on both sides, compared as strings (ISO timestamps sort lexically);
     · the newest item comes first, so the library reads newest-first without the caller sorting.

   Loaded as a classic <script> in the browser (window.XHS.merge) and with require() in node (check.mjs), because the
   app has no build step: the file the browser runs is the file the tests run. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else {
    root.XHS = root.XHS || {};
    root.XHS.merge = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  function emptyDoc() {
    return { version: 1, updatedAt: null, notes: [], deleted: [], compilations: [], deletedComps: [] };
  }

  var LISTS = ['notes', 'deleted', 'compilations', 'deletedComps'];
  var KNOWN = ['version', 'updatedAt'].concat(LISTS);

  /* What is wrong with the shape of a document read from a file, as a list of field names ([] when it is fine).
     A field that is absent (or null) is fine: it starts empty. A field that is present with the wrong type is not:
     normalizeDoc would read it as empty and the next sync would write that empty value over whatever it held, so the
     caller refuses the file instead. */
  function shapeProblems(d) {
    if (d === null || typeof d !== 'object' || Array.isArray(d)) return ['(the file is not a JSON object)'];
    var bad = [];
    LISTS.forEach(function (k) { if (d[k] != null && !Array.isArray(d[k])) bad.push(k); });
    if (d.version != null && typeof d.version !== 'number') bad.push('version');
    if (d.updatedAt != null && typeof d.updatedAt !== 'string') bad.push('updatedAt');
    return bad;
  }

  /* Anything read from a file may be missing fields; every later rule assumes these six. Fields this version does
     not know about are carried along untouched, so a file written by a newer version keeps them. */
  function normalizeDoc(d) {
    d = d || {};
    var out = unknownFields(d);
    out.version = d.version || 1;
    out.updatedAt = d.updatedAt || null;
    LISTS.forEach(function (k) { out[k] = Array.isArray(d[k]) ? d[k] : []; });
    return out;
  }

  /* The fields normalizeDoc carried along without knowing what they are. */
  function unknownFields(d) {
    var out = {};
    if (!d || typeof d !== 'object' || Array.isArray(d)) return out;
    Object.keys(d).forEach(function (k) { if (KNOWN.indexOf(k) === -1) out[k] = d[k]; });
    return out;
  }

  /* One list: union by id, tombstones removed, latest savedAt wins, newest first. */
  function mergeList(aItems, bItems, aDel, bDel) {
    var deleted = Array.from(new Set((aDel || []).concat(bDel || [])));
    var delSet = {};
    deleted.forEach(function (id) { delSet[id] = 1; });
    var byId = {};
    (aItems || []).concat(bItems || []).forEach(function (n) {
      if (!n || !n.id || delSet[n.id]) return;
      var ex = byId[n.id];
      if (!ex || String(n.savedAt || '') >= String(ex.savedAt || '')) byId[n.id] = n;
    });
    var items = Object.keys(byId).map(function (k) { return byId[k]; })
      .sort(function (x, y) { return String(y.savedAt || '').localeCompare(String(x.savedAt || '')); });
    return { items: items, deleted: deleted };
  }

  /* Both lists of a document (notes and compilations) with their own tombstone lists. `now` is injectable so a test
     can pin updatedAt; the app passes nothing and gets the current time. */
  function mergeDocs(a, b, now) {
    a = normalizeDoc(a);
    b = normalizeDoc(b);
    var n = mergeList(a.notes, b.notes, a.deleted, b.deleted);
    var c = mergeList(a.compilations, b.compilations, a.deletedComps, b.deletedComps);
    // unknown fields survive the merge; where both sides have one, the first document (the file just read) wins
    return Object.assign(unknownFields(b), unknownFields(a), {
      version: 1,
      updatedAt: now || new Date().toISOString(),
      notes: n.items, deleted: n.deleted,
      compilations: c.items, deletedComps: c.deleted
    });
  }

  /* Content signature: two documents with the same items in a different order have the same signature, so a sync
     that changed nothing does not write a commit. updatedAt is deliberately not part of it. */
  function sig(doc) {
    function s(list) {
      return (list || []).slice()
        .sort(function (a, b) { return String(a.id).localeCompare(String(b.id)); })
        .map(function (x) { return JSON.stringify(x); }).join('|');
    }
    doc = normalizeDoc(doc);
    return s(doc.notes) + '##' + doc.deleted.slice().sort().join(',') +
      '@@' + s(doc.compilations) + '##' + doc.deletedComps.slice().sort().join(',');
  }

  /* First run only: the library used to be two files, one per platform. Each item is tagged with where it came from
     (an item that already carries a platform keeps it) and the two are concatenated — ids never collided, because
     they carry the platform's own note id. */
  function combineLegacy(xhsDoc, biliDoc) {
    function tag(doc, p) {
      var d = normalizeDoc(doc);
      d.notes.forEach(function (n) { if (n && !n.platform) n.platform = p; });
      d.compilations.forEach(function (c) { if (c && !c.platform) c.platform = p; });
      return d;
    }
    var x = tag(xhsDoc, 'xhs'), b = tag(biliDoc, 'bili');
    return {
      version: 1, updatedAt: null,
      notes: x.notes.concat(b.notes),
      deleted: x.deleted.concat(b.deleted),
      compilations: x.compilations.concat(b.compilations),
      deletedComps: x.deletedComps.concat(b.deletedComps)
    };
  }

  return { VERSION: VERSION, emptyDoc: emptyDoc, normalizeDoc: normalizeDoc, shapeProblems: shapeProblems, mergeList: mergeList,
           mergeDocs: mergeDocs, sig: sig, combineLegacy: combineLegacy };
});
