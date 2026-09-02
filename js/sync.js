/* Cloud sync: the unified library is stored as content.json in a private GitHub repo
   (Xiaohongshu + Bilibili in one file, each note tagged with `platform`).
   On first run, if content.json does not exist it is bootstrapped by merging the legacy
   xhs.json + bilibili.json (the originals are left untouched as backups).
   Owner / repo / token live in localStorage (`pha-config`) on this machine only and are never
   written to any repo. Only the data files inside the repo are touched. */
window.XHS = window.XHS || {};
(function (X) {
  'use strict';
  var T = (window.XHS.i18n && window.XHS.i18n.T) || function (zh, en) { return en; };

  var PHA_KEY = 'pha-config';           // localStorage key holding owner / repo / token
  var DATA_PATH = 'content.json';       // the unified library file
  var LEGACY = [                        // first-run bootstrap: per-platform files → tagged and merged
    { platform: 'xhs',  file: 'xhs.json' },
    { platform: 'bili', file: 'bilibili.json' }
  ];
  var DEFAULTS = { owner: '', repo: 'content-organizer-data', token: '' };   // owner is filled in from the token on first connect

  // ---------- config (preserve the existing pha-config fields, especially repo) ----------
  function getConfig(){
    try {
      var raw = localStorage.getItem(PHA_KEY);
      return raw ? Object.assign({}, DEFAULTS, JSON.parse(raw)) : Object.assign({}, DEFAULTS);
    } catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function isConfigured(cfg){ cfg = cfg || getConfig(); return Boolean(cfg.owner && cfg.token); }

  function saveToken(token, owner){
    var cur = getConfig();
    var next = Object.assign({}, cur, { token: token });
    if (owner) next.owner = owner;
    localStorage.setItem(PHA_KEY, JSON.stringify(next));
    return next;
  }
  function dataLabel(){ var c = getConfig(); return c.owner + '/' + c.repo + ' → ' + DATA_PATH; }

  // ---------- helpers ----------
  function headers(token){
    return {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }
  function b64encode(str){
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function b64decode(b64){
    var bin = atob(String(b64).replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function emptyDoc(){ return { version: 1, updatedAt: null, notes: [], deleted: [], compilations: [], deletedComps: [] }; }
  function normalizeDoc(d){
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
  function contentsUrl(cfg, file){
    return 'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + (file || DATA_PATH);
  }

  // ---------- validate the token (read-only GET /user, touches no repo) ----------
  async function validate(token){
    var r = await fetch('https://api.github.com/user', { headers: headers(token) });
    if (r.status === 401) throw new Error(T('令牌无效或已过期 (401)','Token invalid or expired (401)'));
    if (!r.ok) throw new Error(T('校验失败 HTTP ','Validation failed HTTP ') + r.status);
    var j = await r.json();
    return j.login;
  }

  // ---------- read / write the data file (file defaults to content.json) ----------
  async function getFile(cfg, file){
    var r = await fetch(contentsUrl(cfg, file), { headers: headers(cfg.token) });
    if (r.status === 404) return { doc: emptyDoc(), sha: null, missing: true };
    if (r.status === 401) throw new Error(T('令牌无效或已过期 (401)','Token invalid or expired (401)'));
    if (!r.ok) throw new Error(T('读取失败 HTTP ','Read failed HTTP ') + r.status);
    var j = await r.json();
    var doc;
    try { doc = normalizeDoc(JSON.parse(b64decode(j.content))); }
    catch (e) { doc = emptyDoc(); }
    return { doc: doc, sha: j.sha, missing: false };
  }
  async function putFile(cfg, doc, sha, message, file){
    var body = { message: message || 'content-organizer sync', content: b64encode(JSON.stringify(doc, null, 2)) };
    if (sha) body.sha = sha;
    var r = await fetch(contentsUrl(cfg, file), {
      method: 'PUT', headers: headers(cfg.token), body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(T('写入失败 HTTP ','Write failed HTTP ') + r.status + (r.status === 409 ? T('（版本冲突）',' (version conflict)') : ''));
    return r.json();
  }

  // ---------- first-run bootstrap: merge the two legacy libraries into one doc (tagging platform) ----------
  function combineLegacy(xhsDoc, biliDoc){
    function tag(doc, p){
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
  async function bootstrapFromLegacy(cfg){
    var docs = [];
    for (var i = 0; i < LEGACY.length; i++) {
      var f = await getFile(cfg, LEGACY[i].file);
      docs.push(f.doc);
    }
    return combineLegacy(docs[0], docs[1]);
  }

  // ---------- merge (safe under concurrent devices: union + tombstones + latest wins; platform travels with the object) ----------
  function mergeList(aItems, bItems, aDel, bDel){
    var deleted = Array.from(new Set((aDel || []).concat(bDel || [])));
    var delSet = {}; deleted.forEach(function (id) { delSet[id] = 1; });
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
  function mergeDocs(a, b){
    a = normalizeDoc(a); b = normalizeDoc(b);
    var n = mergeList(a.notes, b.notes, a.deleted, b.deleted);
    var c = mergeList(a.compilations, b.compilations, a.deletedComps, b.deletedComps);
    return {
      version: 1, updatedAt: new Date().toISOString(),
      notes: n.items, deleted: n.deleted,
      compilations: c.items, deletedComps: c.deleted
    };
  }
  function sig(doc){
    function s(list){
      return (list || []).slice()
        .sort(function (a, b) { return String(a.id).localeCompare(String(b.id)); })
        .map(function (x) { return JSON.stringify(x); }).join('|');
    }
    return s(doc.notes) + '##' + (doc.deleted || []).slice().sort().join(',') +
      '@@' + s(doc.compilations) + '##' + (doc.deletedComps || []).slice().sort().join(',');
  }

  function localDoc(){
    return {
      version: 1,
      notes: X.store.getAll(), deleted: X.store.getDeleted(),
      compilations: X.store.getComps(), deletedComps: X.store.getCompsDeleted()
    };
  }

  // ---------- one sync = pull (bootstrap from legacy if missing) + merge + write back (only if changed) ----------
  async function sync(){
    var cfg = getConfig();
    if (!isConfigured(cfg)) throw new Error(T('未连接：请先在设置里填入令牌','Not connected: enter a token in settings first'));

    var remote = await getFile(cfg);                    // content.json
    var base = remote.missing ? await bootstrapFromLegacy(cfg) : remote.doc;
    var merged = mergeDocs(base, localDoc());

    if (remote.missing || sig(base) !== sig(merged)) {
      try {
        await putFile(cfg, merged, remote.sha, remote.missing ? 'content-organizer: init from legacy' : 'content-organizer: sync');
      } catch (e) {
        var fresh = await getFile(cfg);                 // sha conflict → re-pull and merge again
        var fbase = fresh.missing ? await bootstrapFromLegacy(cfg) : fresh.doc;
        merged = mergeDocs(fbase, localDoc());
        await putFile(cfg, merged, fresh.sha, 'content-organizer: sync (retry)');
      }
    }
    X.store.replaceAll(merged.notes);
    X.store.setDeleted(merged.deleted);
    X.store.replaceAllComps(merged.compilations);
    X.store.setCompsDeleted(merged.deletedComps);
    return merged;
  }

  X.sync = {
    getConfig: getConfig, isConfigured: isConfigured, saveToken: saveToken,
    dataLabel: dataLabel, validate: validate, sync: sync,
    _merge: mergeDocs, _combineLegacy: combineLegacy, _b64: { enc: b64encode, dec: b64decode }
  };
})(window.XHS);
