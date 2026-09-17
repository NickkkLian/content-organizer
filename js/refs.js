/* Where a compilation came from: one numbered source list for the whole piece, and the numbers each section cites.

   The AI step folds several saved items into one write-up and tags every section with the items it drew on, so the
   same post is usually cited by more than one section. Turning that into something a reader can follow needs four
   decisions, and they are the reason this is a file with tests rather than three lines inside the renderer:
     · identity is the URL when there is one, and the title otherwise — two sections citing the same post under
       slightly different titles must not become two entries in the list;
     · numbering follows first appearance in reading order, so [1] is the first source the reader meets;
     · a source with neither URL nor title is dropped — there is nothing for the number to point at;
     · a note that was consolidated in but that no section cites still appears, after the cited ones and marked as
       uncited: it went into the piece, and the reader should be able to get back to it.

   Loaded as a classic <script> in the browser (window.XHS.refs) and with require() in node (check.mjs), because the
   app has no build step: the file the browser runs is the file the tests run. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else {
    root.XHS = root.XHS || {};
    root.XHS.refs = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  /* What a reader sees for a source with no title: the link without the parts that carry no meaning. */
  function label(src) {
    if (!src) return '';
    if (src.title) return String(src.title);
    return String(src.url || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  }

  function bind(comp) {
    comp = comp || {};
    var sources = [], seen = Object.create(null);

    /* Returns the number this source got — an existing one if it has been seen, a new one otherwise, 0 if there is
       nothing to point at. A source first met as uncited and later cited is promoted, not duplicated. */
    function add(title, url, cited) {
      var key = url ? 'u:' + String(url) : (title ? 't:' + String(title) : '');
      if (!key) return 0;
      if (seen[key]) {
        var ex = sources[seen[key] - 1];
        if (cited) ex.cited = true;
        if (!ex.title && title) ex.title = String(title);
        return ex.n;
      }
      sources.push({ n: sources.length + 1, title: String(title || ''), url: String(url || ''), cited: Boolean(cited) });
      seen[key] = sources.length;
      return sources.length;
    }

    var sections = (comp.sections || []).map(function (s) {
      s = s || {};
      var refs = [];
      (s.sources || []).forEach(function (x) {
        if (!x) return;
        var n = add(x.title, x.url, true);
        if (n && refs.indexOf(n) === -1) refs.push(n);   // one section citing the same post twice is one reference
      });
      return { heading: String(s.heading || ''), content: String(s.content || ''), refs: refs };
    });

    (comp.sourceUrls || []).forEach(function (u) { if (u) add('', u, false); });

    return { sources: sources, sections: sections };
  }

  return { VERSION: VERSION, bind: bind, label: label };
});
