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

  /* Anything read from a file may be missing fields or hold the wrong type; every later rule assumes these six. */
  function normalizeDoc(d) {
    d = d || {};
    return {
      version: d.version || 1,
      updatedAt: d.updatedAt || null,
      notes: Array.isArray(d.notes) ? d.notes : [],
      deleted: Array.isArray(d.deleted) ? d.deleted : [],
      compilations: Array.isArray(d.compilations) ? d.compilations : [],
      deletedComps: Array.isArray(d.deletedComps) ? d.deletedComps : []
    };
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
    return {
      version: 1,
      updatedAt: now || new Date().toISOString(),
      notes: n.items, deleted: n.deleted,
      compilations: c.items, deletedComps: c.deleted
    };
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

  return { VERSION: VERSION, emptyDoc: emptyDoc, normalizeDoc: normalizeDoc, mergeList: mergeList,
           mergeDocs: mergeDocs, sig: sig, combineLegacy: combineLegacy };
});
