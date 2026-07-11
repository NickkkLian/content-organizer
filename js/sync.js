/* 云同步：统一收藏库存到私有仓库 NickkkLian/Database 的 content.json（含小红书+B站，每条带 platform）。
   首次运行若 content.json 不存在，自动从旧的 xhs.json + bilibili.json 合并生成（原文件不动，留作备份）。
   令牌与导航站共用 localStorage 键 pha-config，只存本机、绝不进仓库。只读写 Database 内数据文件，不碰其它。 */
window.XHS = window.XHS || {};
(function (X) {
  'use strict';
  var T = (window.XHS.i18n && window.XHS.i18n.T) || function(zh,en){return zh;};

  var PHA_KEY = 'pha-config';           // 与 personal-hub-admin / 其它 app 共享
  var DATA_PATH = 'content.json';       // 统一收藏库文件
  var LEGACY = [                        // 首次引导：旧的各平台文件 → 打平台标签合并
    { platform: 'xhs',  file: 'xhs.json' },
    { platform: 'bili', file: 'bilibili.json' }
  ];
  var DEFAULTS = { owner: 'NickkkLian', repo: 'Database', token: '' };

  // ---------- 配置（小心保留 pha-config 既有字段，尤其 repo） ----------
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
  function contentsUrl(cfg, file){
    return 'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + (file || DATA_PATH);
  }

  // ---------- 校验令牌（只读 GET /user，不碰任何仓库） ----------
  async function validate(token){
    var r = await fetch('https://api.github.com/user', { headers: headers(token) });
    if (r.status === 401) throw new Error(T('令牌无效或已过期 (401)','Token invalid or expired (401)'));
    if (!r.ok) throw new Error(T('校验失败 HTTP ','Validation failed HTTP ') + r.status);
    var j = await r.json();
    return j.login;
  }

  // ---------- 读 / 写 数据文件（file 缺省 = content.json） ----------
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

  // ---------- 首次引导：把旧的两个库合并成统一 doc（每条打 platform） ----------
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

  // ---------- 合并（多设备并发安全：并集 + 墓碑 + 最新者胜；platform 随对象保留） ----------
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

  // ---------- 一次同步 = 拉取(缺则从旧库引导) + 合并 + （有变化才）回写 ----------
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
        var fresh = await getFile(cfg);                 // sha 冲突 → 重新拉再合并
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
