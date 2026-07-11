/* 云同步：把收藏库存到私有仓库 NickkkLian/Database 的 xhs.json，支持多设备。
   令牌与导航站共用 localStorage 键 pha-config，只存本机、绝不进仓库。
   仅读写本 app 自己的数据文件 xhs.json，不碰仓库内其它任何文件。 */
window.XHS = window.XHS || {};
(function (X) {
  'use strict';
  var T = (window.XHS.i18n && window.XHS.i18n.T) || function(zh,en){return zh;};

  var PHA_KEY = 'pha-config';        // 与 personal-hub-admin / 其它 app 共享
  var DATA_PATH = 'xhs.json';        // 本 app 在 Database 仓库里的专属文件
  var DEFAULTS = { owner: 'NickkkLian', repo: 'Database', token: '' };

  // ---------- 配置（小心保留 pha-config 既有字段，尤其 repo） ----------
  function getConfig(){
    try {
      var raw = localStorage.getItem(PHA_KEY);
      return raw ? Object.assign({}, DEFAULTS, JSON.parse(raw)) : Object.assign({}, DEFAULTS);
    } catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function isConfigured(cfg){ cfg = cfg || getConfig(); return Boolean(cfg.owner && cfg.token); }

  // 写回令牌时整体合并，绝不改动 repo / 其它字段，避免影响导航站与其它 app
  function saveToken(token, owner){
    var cur = getConfig();
    var next = Object.assign({}, cur, { token: token });
    if (owner) next.owner = owner;
    localStorage.setItem(PHA_KEY, JSON.stringify(next));
    return next;
  }

  function dataLabel(){ var c = getConfig(); return c.owner + '/' + c.repo + ' → ' + DATA_PATH; }

  // ---------- 工具 ----------
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
  function contentsUrl(cfg){
    return 'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + DATA_PATH;
  }

  // ---------- 校验令牌（只读 GET /user，不碰任何仓库） ----------
  async function validate(token){
    var r = await fetch('https://api.github.com/user', { headers: headers(token) });
    if (r.status === 401) throw new Error(T('令牌无效或已过期 (401)','Token invalid or expired (401)'));
    if (!r.ok) throw new Error(T('校验失败 HTTP ','Validation failed HTTP ') + r.status);
    var j = await r.json();
    return j.login;
  }

  // ---------- 读 / 写 xhs.json ----------
  async function getFile(cfg){
    var r = await fetch(contentsUrl(cfg), { headers: headers(cfg.token) });
    if (r.status === 404) return { doc: emptyDoc(), sha: null, missing: true };
    if (r.status === 401) throw new Error(T('令牌无效或已过期 (401)','Token invalid or expired (401)'));
    if (!r.ok) throw new Error(T('读取失败 HTTP ','Read failed HTTP ') + r.status);
    var j = await r.json();
    var doc;
    try { doc = normalizeDoc(JSON.parse(b64decode(j.content))); }
    catch (e) { doc = emptyDoc(); }
    return { doc: doc, sha: j.sha, missing: false };
  }
  async function putFile(cfg, doc, sha, message){
    var body = { message: message || 'xhs-organizer sync', content: b64encode(JSON.stringify(doc, null, 2)) };
    if (sha) body.sha = sha;
    var r = await fetch(contentsUrl(cfg), {
      method: 'PUT', headers: headers(cfg.token), body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(T('写入失败 HTTP ','Write failed HTTP ') + r.status + (r.status === 409 ? T('（版本冲突）',' (version conflict)') : ''));
    return r.json();
  }

  // ---------- 合并（多设备并发安全：并集 + 墓碑 + 最新者胜） ----------
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

  // ---------- 一次同步 = 拉取 + 合并 + （有变化才）回写 ----------
  async function sync(){
    var cfg = getConfig();
    if (!isConfigured(cfg)) throw new Error(T('未连接：请先在设置里填入令牌','Not connected: enter a token in settings first'));

    var remote = await getFile(cfg);
    var merged = mergeDocs(remote.doc, localDoc());

    if (remote.missing || sig(remote.doc) !== sig(merged)) {
      try {
        await putFile(cfg, merged, remote.sha, 'xhs-organizer: sync notes');
      } catch (e) {
        // sha 过期等冲突 → 重新拉取再合并一次
        var fresh = await getFile(cfg);
        merged = mergeDocs(fresh.doc, localDoc());
        await putFile(cfg, merged, fresh.sha, 'xhs-organizer: sync notes (retry)');
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
    _merge: mergeDocs, _b64: { enc: b64encode, dec: b64decode }   // 暴露给测试
  };
})(window.XHS);
