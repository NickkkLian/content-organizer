/* Cloud sync: the unified library is stored as content.json in a private GitHub repo
   (Xiaohongshu + Bilibili in one file, each note tagged with `platform`).
   On first run, if content.json does not exist it is bootstrapped by merging the legacy
   xhs.json + bilibili.json (the originals are left untouched as backups).
   Owner / repo / token live in localStorage (`pha-config`; `pha-config:content-organizer` on GitHub Pages) on
   this machine only and are never
   written to any repo. Only the data files inside the repo are touched. */
window.XHS = window.XHS || {};
(function (X) {
  'use strict';
  var T = (window.XHS.i18n && window.XHS.i18n.T) || function (zh, en) { return en; };

  // localStorage key holding owner / repo / token. On GitHub Pages every public demo shares the origin
  // nickkklian.github.io, so a shared key would let a token entered in one demo connect the others: there this demo
  // keeps its own key (a trailing dot in the host name is the same site). Elsewhere the product family shares one
  // connection on purpose.
  var PHA_KEY = /\.github\.io\.?$/.test(location.hostname) ? 'pha-config:content-organizer' : 'pha-config';
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
  // Files over 1 MiB come back from the contents API with encoding "none" and no content;
  // the same bytes are readable through the git blobs API.
  function blobUrl(cfg, sha){
    return 'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo + '/git/blobs/' + sha;
  }
  async function getFile(cfg, file){
    var r = await fetch(contentsUrl(cfg, file), { headers: headers(cfg.token), cache: 'no-store' });
    if (r.status === 404) return { doc: emptyDoc(), sha: null, missing: true };
    if (r.status === 401) throw new Error(T('令牌无效或已过期 (401)','Token invalid or expired (401)'));
    if (!r.ok) throw new Error(T('读取失败 HTTP ','Read failed HTTP ') + r.status);
    var j = await r.json();
    var text = j.content ? b64decode(j.content) : '';
    if (!text && j.sha && j.size > 0) {
      var br = await fetch(blobUrl(cfg, j.sha), { headers: headers(cfg.token), cache: 'no-store' });
      if (!br.ok) throw new Error(T('读取大文件失败 HTTP ','Reading the large file failed HTTP ') + br.status);
      text = b64decode((await br.json()).content);
    }
    // A file that exists but cannot be read stops the sync. Treating it as an empty library
    // would write this device's copy over everything the other devices saved.
    var parsed;
    try { parsed = JSON.parse(text); }
    catch (e) {
      throw new Error(T('读不懂仓库里的 ','Cannot read ') + (file || DATA_PATH) +
        T('，已停止同步，没有覆盖任何内容','; sync stopped and nothing was overwritten'));
    }
    // Valid JSON of the wrong shape stops it too: a list field holding something else would be read as empty and
    // the save would write that empty list over it. A field that is simply missing is fine and starts empty.
    var bad = shapeProblems(parsed);
    if (bad.length) {
      throw new Error((file || DATA_PATH) + T(' 的格式不对（',' has the wrong shape (') + bad.join(', ') +
        T('），已停止同步，没有覆盖任何内容',' is not what this app expects); sync stopped and nothing was overwritten'));
    }
    return { doc: normalizeDoc(parsed), sha: j.sha, missing: false };
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

  // ---------- the merge rules live in js/merge.js: DOM-free, and the same file the tests in check.mjs run ----------
  var M = (window.XHS && window.XHS.merge) || (typeof require === 'function' ? require('./merge.js') : null);
  var emptyDoc = M.emptyDoc, normalizeDoc = M.normalizeDoc, shapeProblems = M.shapeProblems, mergeDocs = M.mergeDocs, sig = M.sig, combineLegacy = M.combineLegacy;

  async function bootstrapFromLegacy(cfg){
    var docs = [];
    for (var i = 0; i < LEGACY.length; i++) {
      var f = await getFile(cfg, LEGACY[i].file);
      docs.push(f.doc);
    }
    return combineLegacy(docs[0], docs[1]);
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
