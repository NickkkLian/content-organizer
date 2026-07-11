/* 本地收藏库（localStorage 缓存）。云同步见 sync.js，二者共用此处数据。 */
window.XHS = window.XHS || {};
(function (X) {
  'use strict';
  var KEY = 'xhs_notes_v1';
  var DKEY = 'xhs_deleted_v1';   // 墓碑：记录已删除 id，避免多设备同步时被远端「复活」

  function getAll(){
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch (e) { return []; }
  }
  function setAll(list){ localStorage.setItem(KEY, JSON.stringify(list)); }

  function getDeleted(){
    try { return JSON.parse(localStorage.getItem(DKEY) || '[]'); }
    catch (e) { return []; }
  }
  function setDeleted(ids){ localStorage.setItem(DKEY, JSON.stringify(Array.from(new Set(ids)))); }
  function addDeleted(ids){ setDeleted(getDeleted().concat(ids)); }

  function save(note){
    var list = getAll();
    var idx = note.url ? list.findIndex(function (n) { return n.url && n.url === note.url; }) : -1;
    var record = Object.assign({}, note, {
      id: note.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
      savedAt: new Date().toISOString()           // 每次保存都刷新时间戳，合并时「最新者胜」
    });
    if (idx !== -1) list[idx] = Object.assign({}, list[idx], record, { id: list[idx].id });
    else list.unshift(record);
    setAll(list);
    return record;
  }

  function remove(id){
    setAll(getAll().filter(function (n) { return n.id !== id; }));
    addDeleted([id]);                              // 记墓碑，使删除可同步到云端 / 其它设备
  }

  function clear(){
    addDeleted(getAll().map(function (n) { return n.id; }));
    setAll([]);
  }

  // 同步后用合并结果整体替换本地缓存
  function replaceAll(notes){ setAll(notes || []); }

  // 就地更新一条笔记（按 id），刷新 savedAt 使多设备合并时「最新者胜」
  function update(id, patch){
    setAll(getAll().map(function (n) {
      return n.id === id ? Object.assign({}, n, patch, { savedAt: new Date().toISOString() }) : n;
    }));
  }

  // 归档：给指定 id 的笔记打 archived 标记并刷新 savedAt（随笔记一起同步、最新者胜）
  function setArchived(ids, flag){
    var set = {}; (Array.isArray(ids) ? ids : [ids]).forEach(function (id) { set[id] = 1; });
    setAll(getAll().map(function (n) { return set[n.id] ? Object.assign({}, n, { archived: !!flag, savedAt: new Date().toISOString() }) : n; }));
  }

  // ---------- 合集（AI 整理出的多篇综合长文） ----------
  var CKEY = 'xhs_comps_v1';
  var CDKEY = 'xhs_comps_deleted_v1';

  function getComps(){
    try { return JSON.parse(localStorage.getItem(CKEY) || '[]'); }
    catch (e) { return []; }
  }
  function setComps(list){ localStorage.setItem(CKEY, JSON.stringify(list)); }
  function getCompsDeleted(){
    try { return JSON.parse(localStorage.getItem(CDKEY) || '[]'); }
    catch (e) { return []; }
  }
  function setCompsDeleted(ids){ localStorage.setItem(CDKEY, JSON.stringify(Array.from(new Set(ids)))); }

  function saveComp(comp){
    var list = getComps();
    var rec = Object.assign({}, comp, {
      id: comp.id || ('c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
      savedAt: new Date().toISOString()
    });
    var idx = list.findIndex(function (c) { return c.id === rec.id; });
    if (idx !== -1) list[idx] = rec; else list.unshift(rec);
    setComps(list);
    return rec;
  }
  function removeComp(id){
    setComps(getComps().filter(function (c) { return c.id !== id; }));
    setCompsDeleted(getCompsDeleted().concat([id]));
  }
  function replaceAllComps(list){ setComps(list || []); }

  X.store = {
    getAll: getAll, save: save, update: update, remove: remove, clear: clear,
    getDeleted: getDeleted, setDeleted: setDeleted, replaceAll: replaceAll,
    archive: function (ids) { setArchived(ids, true); }, unarchive: function (ids) { setArchived(ids, false); },
    getComps: getComps, saveComp: saveComp, removeComp: removeComp, replaceAllComps: replaceAllComps,
    getCompsDeleted: getCompsDeleted, setCompsDeleted: setCompsDeleted
  };
})(window.XHS);
