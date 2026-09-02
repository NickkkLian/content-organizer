/* Local library. Cloud sync lives in sync.js; both share this data.

   ⚠️ Storage moved to IndexedDB, away from localStorage. Why:
   localStorage quota is **per origin** (~5 MB) and shared with anything else served from the
   same origin. Video notes carry full transcripts and can easily push it over (observed
   2026-08-04: the Save button "did nothing" — the write was being refused by the quota).
   IndexedDB offers hundreds of MB, and on first start the old data is migrated over and
   **removed from localStorage**, handing the quota back.

   The public API stays synchronous (getAll() returns an array): a working copy lives in
   memory, reads come from memory, writes update memory then persist asynchronously.
   Call await init() at startup; if something calls in before init, it temporarily falls
   back to reading localStorage rather than showing a blank page. */
window.XHS = window.XHS || {};
(function (X) {
  'use strict';
  var T = (window.XHS.i18n && window.XHS.i18n.T) || function (zh, en) { return en; };
  var KEY = 'xhs_notes_v1';
  var DKEY = 'xhs_deleted_v1';   // tombstones: deleted ids, so multi-device sync can't "resurrect" them
  var DB = 'xhs_store', STORE = 'kv';
  var mem = null;                // { key: value } in-memory working copy; null = not initialised yet
  var idbOk = false;

  function openDB(){
    return new Promise(function (res) {
      var r;
      try { r = indexedDB.open(DB, 1); } catch (e) { return res(null); }
      r.onupgradeneeded = function () { try { r.result.createObjectStore(STORE); } catch (e) {} };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { res(null); };
      r.onblocked = function () { res(null); };
    });
  }
  /* ⚠️ put and get must stay separate. A previous shared helper used
     `result === undefined ? true : result` so that put could report success — which made a
     missing key on get also return true; callers believed they had data, skipped the fallback,
     and the whole chain failed silently. */
  function idbGet(db, key){
    return new Promise(function (res) {
      try {
        var r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        r.onsuccess = function () { res(r.result === undefined ? null : r.result); };
        r.onerror = function () { res(null); };
      } catch (e) { res(null); }
    });
  }
  function idbPut(db, key, val){
    return new Promise(function (res) {
      try {
        var r = db.transaction(STORE, 'readwrite').objectStore(STORE).put(val, key);
        r.onsuccess = function () { res(true); };
        r.onerror = function () { res(false); };
      } catch (e) { res(false); }
    });
  }
  function lsRead(key){
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  var ALL_KEYS = [KEY, DKEY, 'xhs_comps_v1', 'xhs_comps_deleted_v1'];
  var dbHandle = null;

  /** Call once at startup: load data into memory; on first run, migrate from localStorage. */
  function init(){
    return openDB().then(function (db) {
      dbHandle = db; idbOk = !!db; mem = {};
      if (!db) {                                  // no IndexedDB (private mode etc.) → keep using localStorage
        ALL_KEYS.forEach(function (k) { mem[k] = lsRead(k); });
        return { migrated: 0, idb: false };
      }
      return Promise.all(ALL_KEYS.map(function (k) { return idbGet(db, k); })).then(function (vals) {
        var migrated = 0, moves = [];
        ALL_KEYS.forEach(function (k, i) {
          if (vals[i] != null) { mem[k] = vals[i]; return; }
          var fromLS = lsRead(k);                 // not in IndexedDB → migrate from localStorage
          mem[k] = fromLS;
          if (fromLS != null) moves.push(idbPut(db, k, fromLS).then(function (ok) {
            // ⚠️ Remove from localStorage only **after** the write succeeded, or one failure loses the data
            if (ok) { try { localStorage.removeItem(k); migrated++; } catch (e) {} }
          }));
        });
        return Promise.all(moves).then(function () { return { migrated: migrated, idb: true }; });
      });
    }).catch(function () { mem = mem || {}; return { migrated: 0, idb: false }; });
  }

  /** Persist: IndexedDB first; fall back to localStorage only without it (keeping "throw when full") */
  function persist(key, val){
    if (mem) mem[key] = val;
    if (idbOk && dbHandle) {
      idbPut(dbHandle, key, val).then(function (ok) {
        if (!ok) console.warn('IndexedDB write failed; data is still in memory and in the cloud:', key);
      });
      return;
    }
    writeKey(key, JSON.stringify(val));
  }
  function readKey(key){
    if (mem && mem[key] != null) return mem[key];
    if (mem && key in mem) return mem[key] == null ? [] : mem[key];
    var v = lsRead(key);                          // called before init
    return v == null ? [] : v;
  }

  function getAll(){
    var v = readKey(KEY);
    return Array.isArray(v) ? v : [];
  }
  /* ⚠️ A failed write must be **thrown**, never swallowed.
     localStorage quota is per origin (~5 MB). This used to be a bare setItem: once the quota was full
     it threw, the caller (the Save button) died before showing "Saved ★", and the symptom was
     "clicking does nothing". Now the original error is attached and rethrown for the caller to show. */
  function writeKey(key, value){
    try { localStorage.setItem(key, value); }
    catch (e) {
      var full = e && (e.name === 'QuotaExceededError' || e.code === 22 || /quota/i.test(e.message || ''));
      var err = new Error(full
        ? T('本机存储已满（每个网址约 5MB）。数据没有丢，先点「同步到云端」把它存进仓库，再清理旧笔记。',
            'Local storage is full (~5 MB per origin). Nothing is lost — sync to the cloud first, then clear old notes.')
        : (T('写入本机存储失败：', 'Local storage write failed: ') + (e && e.message ? e.message : e)));
      err.quota = full; err.cause = e;
      throw err;
    }
  }
  function setAll(list){ persist(KEY, list); }

  function getDeleted(){ var v = readKey(DKEY); return Array.isArray(v) ? v : []; }
  function setDeleted(ids){ persist(DKEY, Array.from(new Set(ids))); }
  function addDeleted(ids){ setDeleted(getDeleted().concat(ids)); }

  function save(note){
    var list = getAll();
    var idx = note.url ? list.findIndex(function (n) { return n.url && n.url === note.url; }) : -1;
    var record = Object.assign({}, note, {
      id: note.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
      savedAt: new Date().toISOString()           // refreshed on every save: "latest wins" when merging
    });
    if (idx !== -1) list[idx] = Object.assign({}, list[idx], record, { id: list[idx].id });
    else list.unshift(record);
    setAll(list);
    return record;
  }

  function remove(id){
    setAll(getAll().filter(function (n) { return n.id !== id; }));
    addDeleted([id]);                              // tombstone, so the deletion syncs to the cloud / other devices
  }

  function clear(){
    addDeleted(getAll().map(function (n) { return n.id; }));
    setAll([]);
  }

  // After a sync, replace the local cache with the merged result
  function replaceAll(notes){ setAll(notes || []); }

  // Patch one note in place (by id); savedAt is refreshed so "latest wins" across devices
  function update(id, patch){
    setAll(getAll().map(function (n) {
      return n.id === id ? Object.assign({}, n, patch, { savedAt: new Date().toISOString() }) : n;
    }));
  }

  // Archive: flag the given ids and refresh savedAt (syncs with the note; latest wins)
  function setArchived(ids, flag){
    var set = {}; (Array.isArray(ids) ? ids : [ids]).forEach(function (id) { set[id] = 1; });
    setAll(getAll().map(function (n) { return set[n.id] ? Object.assign({}, n, { archived: !!flag, savedAt: new Date().toISOString() }) : n; }));
  }

  // ---------- Compilations (AI-consolidated long-form pieces) ----------
  var CKEY = 'xhs_comps_v1';
  var CDKEY = 'xhs_comps_deleted_v1';

  function getComps(){ var v = readKey(CKEY); return Array.isArray(v) ? v : []; }
  function setComps(list){ persist(CKEY, list); }
  function getCompsDeleted(){ var v = readKey(CDKEY); return Array.isArray(v) ? v : []; }
  function setCompsDeleted(ids){ persist(CDKEY, Array.from(new Set(ids))); }

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
    init: init, _idb: function(){ return idbOk; },
    getAll: getAll, save: save, update: update, remove: remove, clear: clear,
    getDeleted: getDeleted, setDeleted: setDeleted, replaceAll: replaceAll,
    archive: function (ids) { setArchived(ids, true); }, unarchive: function (ids) { setArchived(ids, false); },
    getComps: getComps, saveComp: saveComp, removeComp: removeComp, replaceAllComps: replaceAllComps,
    getCompsDeleted: getCompsDeleted, setCompsDeleted: setCompsDeleted
  };
})(window.XHS);
