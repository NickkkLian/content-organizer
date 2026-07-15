/* 图片永久归档：小红书 CDN 链接自带签名时效（URL 第一段是过期时间戳，如 /202607021008/…），
   过期后 403、任何代理都救不回。因此收藏时把图片经 weserv 代理取回（解决 CORS）、压到 1080px webp，
   存进私有仓库 xhs-images/<noteId>/<i>.webp；渲染时优先用归档图（带令牌经 API 取 blob），
   原链接只作来源备份。旧笔记链接已死时，「修复图片」会重新抓原帖拿新链接再归档。 */
window.XHS = window.XHS || {};
(function (X) {
  'use strict';
  var T = (window.XHS.i18n && window.XHS.i18n.T) || function (zh, en) { return zh; };

  var DIR = 'xhs-images';        // 私有仓库里的图片目录
  var MAX_PER_NOTE = 18;         // 单篇最多归档张数（小红书上限 18 图）
  var blobCache = {};            // repoPath -> objectURL（本页会话内缓存）

  function cfg(){ return X.sync.getConfig(); }
  function ready(){ return X.sync.isConfigured(); }
  function ghHeaders(extra){
    var h = {
      Authorization: 'Bearer ' + cfg().token,
      'X-GitHub-Api-Version': '2022-11-28'
    };
    return Object.assign(h, extra || {});
  }
  function contentsUrl(path){
    var c = cfg();
    return 'https://api.github.com/repos/' + c.owner + '/' + c.repo + '/contents/' + path;
  }

  // URL 第一段时间戳（UTC+8）判断签名是否已过期（留 30 分钟余量）
  function isExpired(u){
    var m = String(u || '').match(/xhscdn\.com\/(\d{12})\//);
    if (!m) return false;                          // 无时间戳的按未过期处理，交给加载失败回退
    var t = m[1];
    var exp = Date.UTC(+t.slice(0,4), +t.slice(4,6)-1, +t.slice(6,8), +t.slice(8,10)-8, +t.slice(10,12));
    return exp - Date.now() < 30 * 60 * 1000;
  }

  function httpsize(u){ return String(u || '').replace(/^http:\/\//, 'https://'); }

  // weserv 图片代理：服务端抓取（无 CORS 限制）+ 转码压缩，只用于取字节与显示回退
  function proxyUrl(u, w){
    return 'https://images.weserv.nl/?url=' + encodeURIComponent(httpsize(u).replace(/^https?:\/\//, '')) +
      '&w=' + (w || 1080) + '&q=78&output=webp';
  }

  /* 送进 Claude 视觉的图片地址：weserv 代理并把「长边」限制到 max（默认 1568）。
     必须限双边——Anthropic 单请求 >20 张图时单图上限 2000×2000，长边>1568 也会先降采样；
     直接送原图 / 长图会因尺寸超限被 400（image dimensions exceed max）拒绝。
     fit=inside 保持比例、不裁剪，宽高都 ≤ max。 */
  function visionUrl(u, max){
    max = max || 1568;
    return 'https://images.weserv.nl/?url=' + encodeURIComponent(httpsize(u).replace(/^https?:\/\//, '')) +
      '&w=' + max + '&h=' + max + '&fit=inside&q=80&output=webp';
  }

  /* 归档图是 base64（webp），归档时按 1080 宽压过、但长图高度未限，仍可能 >2000 → 送前统一收口。
     在浏览器用 canvas 缩到长边 ≤ max。返回 {data, media_type}；失败/无需缩则原样返回。 */
  function capB64(b64, mediaType, max){
    max = max || 1568;
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, lo = Math.max(w, h);
        if (!lo || lo <= max) { resolve({ data: b64, media_type: mediaType }); return; }
        var s = max / lo, cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
        try {
          var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
          cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
          resolve({ data: cv.toDataURL('image/webp', 0.85).split(',')[1], media_type: 'image/webp' });
        } catch (e) { resolve({ data: b64, media_type: mediaType }); }
      };
      img.onerror = function () { resolve({ data: b64, media_type: mediaType }); };
      img.src = 'data:' + mediaType + ';base64,' + b64;
    });
  }

  function blobToB64(blob){
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).split(',')[1]); };
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }

  async function fetchImageBytes(u){
    var r = await fetch(proxyUrl(u), { mode: 'cors' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var blob = await r.blob();
    if (!blob.size) throw new Error('empty');
    return blob;
  }

  async function putRepoFile(path, b64){
    var body = { message: 'xhs-organizer: archive image ' + path, content: b64 };
    var r = await fetch(contentsUrl(path), { method: 'PUT', headers: ghHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
    if (r.status === 422 || r.status === 409) {
      // 已存在：取 sha 覆盖
      var g = await fetch(contentsUrl(path), { headers: ghHeaders() });
      if (g.ok) { body.sha = (await g.json()).sha; r = await fetch(contentsUrl(path), { method: 'PUT', headers: ghHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) }); }
    }
    if (!r.ok) throw new Error('GitHub ' + r.status);
    return path;
  }

  /* 把一篇笔记的图片归档进仓库。返回 { repo:[path|null,…], ok, fail }；
     跳过已归档与已过期取不到的，按索引与 note.images 对齐。 */
  async function archiveNote(note, onProgress){
    if (!ready()) throw new Error(T('未连接云同步（需 GitHub 令牌才能归档图片）', 'Cloud sync not connected (a GitHub token is required to archive images)'));
    var images = (note.images || []).slice(0, MAX_PER_NOTE);
    var repo = (note.imagesRepo || []).slice();
    var ok = 0, fail = 0;
    for (var i = 0; i < images.length; i++) {
      if (repo[i]) { continue; }                   // 已归档
      if (onProgress) onProgress(i + 1, images.length);
      try {
        var blob = await fetchImageBytes(images[i]);
        var b64 = await blobToB64(blob);
        var path = DIR + '/' + note.id + '/' + i + '.webp';
        await putRepoFile(path, b64);
        repo[i] = path; ok++;
      } catch (e) { repo[i] = repo[i] || null; fail++; }
    }
    return { repo: repo, ok: ok, fail: fail };
  }

  // 取归档图字节（带令牌）→ objectURL（缓存）
  async function repoImageUrl(path){
    if (blobCache[path]) return blobCache[path];
    var r = await fetch(contentsUrl(path), { headers: ghHeaders({ Accept: 'application/vnd.github.raw' }) });
    if (!r.ok) throw new Error('GitHub ' + r.status);
    var blob = await r.blob();
    var u = URL.createObjectURL(blob);
    blobCache[path] = u;
    return u;
  }

  // 取归档图 base64（喂给 Claude 视觉用）
  async function repoImageB64(path){
    var r = await fetch(contentsUrl(path), { headers: ghHeaders({ Accept: 'application/vnd.github.raw' }) });
    if (!r.ok) throw new Error('GitHub ' + r.status);
    return blobToB64(await r.blob());
  }

  // 给容器里所有 img[data-repo] 异步填 blob 地址（无令牌时静默跳过，onerror 回退接管）
  function hydrate(root){
    if (!root || !ready()) return;
    root.querySelectorAll('img[data-repo]:not([data-loaded])').forEach(function (img) {
      img.setAttribute('data-loaded', '1');
      var path = img.getAttribute('data-repo');
      repoImageUrl(path).then(function (u) {
        img.src = u;
        var a = img.closest('a');
        if (a) { a.href = u; }
      }).catch(function () {
        // 归档图取不到（令牌失效等）→ 回退原链接
        var fb = img.getAttribute('data-orig');
        if (fb) { img.removeAttribute('data-repo'); img.src = httpsize(fb); img.referrerPolicy = 'no-referrer'; }
        else imgDead(img);
      });
    });
  }

  function imgDead(img){
    var a = img.closest('a');
    var box = document.createElement('span');
    box.className = 'img-dead';
    box.textContent = T('⚠ 图片链接已过期', '⚠ Image link expired');
    if (a) a.replaceWith(box); else img.replaceWith(box);
  }

  // 直连 <img> 加载失败时的两级回退：weserv 代理 → 「已过期」占位
  function imgFallback(img){
    var fb = img.getAttribute('data-fb');
    if (fb && img.src !== fb) { img.src = fb; return; }
    imgDead(img);
  }

  // 把 AI 选中的 base64 帧存进仓库 xhs-images/<key>/，返回 repo 路径数组（给视频笔记的 imagesRepo）
  async function saveFrames(key, b64list, onProgress){
    var paths = [];
    for (var i = 0; i < (b64list || []).length; i++) {
      if (onProgress) onProgress(i + 1, b64list.length);
      var p = DIR + '/' + key + '/' + i + '.webp';
      await putRepoFile(p, b64list[i]);   // 失败就抛，让调用方报出来（别静默吞掉）
      paths.push(p);
    }
    return paths;
  }

  X.images = {
    isExpired: isExpired, httpsize: httpsize, proxyUrl: proxyUrl,
    visionUrl: visionUrl, capB64: capB64, saveFrames: saveFrames,
    archiveNote: archiveNote, hydrate: hydrate, imgFallback: imgFallback,
    repoImageB64: repoImageB64, ready: ready, MAX_PER_NOTE: MAX_PER_NOTE
  };
})(window.XHS);
