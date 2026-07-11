/* 本地抓取后端客户端：网页库 → http://127.0.0.1:8766（菜单栏小程序跑的 xhs_server.py）。
   后端只干重活（下视频→转写→抽候选帧），判图/存库都在网页里。口令存本机浏览器。 */
window.XHS = window.XHS || {};
(function (X) {
  'use strict';
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

  // SSE 抓取：onLog(line) 进度回调；成功 resolve({note, frames:[b64...]})，失败 reject(Error)
  function fetchVideo(url, onLog){
    return new Promise(function (resolve, reject) {
      if (!getToken()) { reject(new Error('未设置本地抓取口令（在 ⚙️ 设置里填，菜单栏小程序里能看到）')); return; }
      var q = BASE + '/fetch?token=' + encodeURIComponent(getToken()) + '&url=' + encodeURIComponent(url);
      var es, done = false;
      try { es = new EventSource(q); }
      catch (e) { reject(new Error('连不上本地抓取服务')); return; }
      es.addEventListener('log', function (e) { if (onLog) try { onLog(JSON.parse(e.data)); } catch (x) {} });
      es.addEventListener('done', function (e) { done = true; es.close(); try { resolve(JSON.parse(e.data)); } catch (x) { reject(new Error('返回解析失败')); } });
      es.addEventListener('fail', function (e) { done = true; es.close(); var m; try { m = JSON.parse(e.data); } catch (x) { m = '抓取失败'; } reject(new Error(m)); });
      es.onerror = function () { if (done) return; es.close(); reject(new Error('连不上本地抓取服务——菜单栏小程序没启动？或口令不对。')); };
    });
  }

  X.fetchsvc = { BASE: BASE, health: health, getToken: getToken, setToken: setToken, fetchVideo: fetchVideo };
})(window.XHS);
