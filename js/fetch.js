/* Client for the local fetch service: browser → http://127.0.0.1:8766 (content_server.py, started by the toggle app).
   The service only does the heavy lifting (download → transcribe → candidate frames); frame judging and
   storage happen in the browser. The service token lives in this browser only. */
window.XHS = window.XHS || {};
(function (X) {
  'use strict';
  var T = (window.XHS.i18n && window.XHS.i18n.T) || function (zh, en) { return en; };
  var BASE = 'http://127.0.0.1:8766';
  var TKEY = 'xhs_fetch_token';

  function getToken(){ return localStorage.getItem(TKEY) || ''; }
  function setToken(t){ localStorage.setItem(TKEY, (t || '').trim()); }

  async function health(){
    try {
      var r = await fetch(BASE + '/health', { cache: 'no-store' });
      if (!r.ok) return false;
      var j = await r.json();
      return Boolean(j && j.ok);
    } catch (e) { return false; }
  }

  // SSE fetch: onLog(line) progress callback; resolves {note, frames:[b64...]}, rejects with Error
  function fetchVideo(url, onLog){
    return new Promise(function (resolve, reject) {
      if (!getToken()) { reject(new Error(T('未设置本地抓取口令（在 ⚙️ 设置里填，菜单栏小程序里能看到）', 'Local fetch token not set (enter it in ⚙️ Settings; the toggle app shows it)'))); return; }
      var q = BASE + '/fetch?token=' + encodeURIComponent(getToken()) + '&url=' + encodeURIComponent(url);
      var es, done = false;
      try { es = new EventSource(q); }
      catch (e) { reject(new Error(T('连不上本地抓取服务', 'Cannot reach the local fetch service'))); return; }
      es.addEventListener('log', function (e) { if (onLog) try { onLog(JSON.parse(e.data)); } catch (x) {} });
      es.addEventListener('done', function (e) { done = true; es.close(); try { resolve(JSON.parse(e.data)); } catch (x) { reject(new Error(T('返回解析失败', 'Failed to parse the response'))); } });
      es.addEventListener('fail', function (e) { done = true; es.close(); var m; try { m = JSON.parse(e.data); } catch (x) { m = T('抓取失败', 'Fetch failed'); } reject(new Error(m)); });
      es.onerror = function () { if (done) return; es.close(); reject(new Error(T('连不上本地抓取服务——菜单栏小程序没启动？或口令不对。', 'Cannot reach the local fetch service — is the toggle app running? Is the token right?'))); };
    });
  }

  X.fetchsvc = { BASE: BASE, health: health, getToken: getToken, setToken: setToken, fetchVideo: fetchVideo };
})(window.XHS);
