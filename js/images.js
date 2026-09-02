/* Permanent image archiving. Xiaohongshu CDN links carry a signed expiry (the first path segment
   is a timestamp, e.g. /202607021008/…); once expired they 403 and no proxy can recover them.
   So on save, images are fetched through the weserv proxy (solves CORS), compressed to 1080px webp,
   and stored in the private repo under xhs-images/<noteId>/<i>.webp. Rendering prefers the archived
   copy (fetched as a blob with the token); the original link is kept only as provenance.
   For old notes whose links are already dead, "Fix images" re-fetches the post for fresh links and archives those. */
window.XHS = window.XHS || {};
(function (X) {
  'use strict';
  var T = (window.XHS.i18n && window.XHS.i18n.T) || function (zh, en) { return en; };

  var DIR = 'xhs-images';        // image directory inside the private repo
  var MAX_PER_NOTE = 18;         // max archived images per note (Xiaohongshu's cap is 18)
  var blobCache = {};            // repoPath -> objectURL (cached for this page session)

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

  // The first path segment is a UTC+8 timestamp; treat the link as expired with a 30-minute margin
  function isExpired(u){
    var m = String(u || '').match(/xhscdn\.com\/(\d{12})\//);
    if (!m) return false;                          // no timestamp → assume valid; the load-failure fallback handles it
    var t = m[1];
    var exp = Date.UTC(+t.slice(0,4), +t.slice(4,6)-1, +t.slice(6,8), +t.slice(8,10)-8, +t.slice(10,12));
    return exp - Date.now() < 30 * 60 * 1000;
  }

  function httpsize(u){ return String(u || '').replace(/^http:\/\//, 'https://'); }

  // weserv image proxy: server-side fetch (no CORS) + transcode/compress; used for bytes and as a display fallback
  function proxyUrl(u, w){
    return 'https://images.weserv.nl/?url=' + encodeURIComponent(httpsize(u).replace(/^https?:\/\//, '')) +
      '&w=' + (w || 1080) + '&q=78&output=webp';
  }

  /* Image URL sent to Claude vision: weserv proxy with the long edge capped at max (default 1568).
     Both dimensions must be capped — with >20 images per request Anthropic limits each to 2000×2000,
     and a long edge over 1568 is downsampled anyway; sending originals / tall images gets a 400
     (image dimensions exceed max). fit=inside keeps the aspect ratio without cropping. */
  function visionUrl(u, max){
    max = max || 1568;
    return 'https://images.weserv.nl/?url=' + encodeURIComponent(httpsize(u).replace(/^https?:\/\//, '')) +
      '&w=' + max + '&h=' + max + '&fit=inside&q=80&output=webp';
  }

  /* Archived images are base64 webp, compressed to 1080 wide at archive time, but tall images were
     never height-capped and can exceed 2000 → normalise before sending. Scales in-browser via canvas
     to long edge ≤ max. Returns {data, media_type}; on failure / no need, returns the input unchanged. */
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
      /* Already exists → fetch the sha and overwrite. The cache:'no-store' on this GET is required:
         when rendering screenshots, repoImageUrl requested the same URL with Accept: vnd.github.raw,
         and Chrome cached the raw webp under that URL without keying on Accept (GitHub sends
         Vary: Accept, but the browser reports vary as null). On a cache hit g.json() received webp
         bytes and failed with "Unexpected token 'R', RIFF…" — re-fetching the same video lost every
         screenshot (this actually happened). An explicit Accept alone did not help; only no-store does. */
      var g = await fetch(contentsUrl(path), {
        headers: ghHeaders({ Accept: 'application/vnd.github+json' }), cache: 'no-store'
      });
      if (g.ok) {
        var meta = await g.json();
        body.sha = meta.sha;
        r = await fetch(contentsUrl(path), { method: 'PUT', headers: ghHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
      }
    }
    if (!r.ok) throw new Error('GitHub ' + r.status);
    return path;
  }

  /* Archive one note's images into the repo. Returns { repo:[path|null,…], ok, fail };
     skips already-archived and unreachable/expired ones, aligned by index with note.images. */
  async function archiveNote(note, onProgress){
    if (!ready()) throw new Error(T('未连接云同步（需 GitHub 令牌才能归档图片）', 'Cloud sync not connected (a GitHub token is required to archive images)'));
    var images = (note.images || []).slice(0, MAX_PER_NOTE);
    var repo = (note.imagesRepo || []).slice();
    var ok = 0, fail = 0;
    for (var i = 0; i < images.length; i++) {
      if (repo[i]) { continue; }                   // already archived
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

  // Archived image bytes (with token) → objectURL (cached)
  async function repoImageUrl(path){
    if (blobCache[path]) return blobCache[path];
    var r = await fetch(contentsUrl(path), { headers: ghHeaders({ Accept: 'application/vnd.github.raw' }) });
    if (!r.ok) throw new Error('GitHub ' + r.status);
    var blob = await r.blob();
    var u = URL.createObjectURL(blob);
    blobCache[path] = u;
    return u;
  }

  // Archived image as base64 (for Claude vision)
  async function repoImageB64(path){
    var r = await fetch(contentsUrl(path), { headers: ghHeaders({ Accept: 'application/vnd.github.raw' }) });
    if (!r.ok) throw new Error('GitHub ' + r.status);
    return blobToB64(await r.blob());
  }

  // Asynchronously fill blob URLs into every img[data-repo] in the container (silently skipped without a token; onerror fallback takes over)
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
        // archived copy unavailable (token expired etc.) → fall back to the original link
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

  // Two-step fallback when a direct <img> fails: weserv proxy → "expired" placeholder
  function imgFallback(img){
    var fb = img.getAttribute('data-fb');
    if (fb && img.src !== fb) { img.src = fb; return; }
    imgDead(img);
  }

  // Store the AI-selected base64 frames under xhs-images/<key>/; returns the repo paths (imagesRepo of the video note)
  async function saveFrames(key, b64list, onProgress){
    var paths = [], fails = [];
    for (var i = 0; i < (b64list || []).length; i++) {
      if (onProgress) onProgress(i + 1, b64list.length);
      var p = DIR + '/' + key + '/' + i + '.webp';
      try { await putRepoFile(p, b64list[i]); paths.push(p); }   // one failure must not sink the rest
      catch (e) { fails.push((e && e.message) || String(e)); }
    }
    if (!paths.length && fails.length) throw new Error(fails[0]); // throw only on total failure, so the caller can show why
    return paths;                                                 // partial failure: the caller shows M/N, the gap is visible
  }

  X.images = {
    isExpired: isExpired, httpsize: httpsize, proxyUrl: proxyUrl,
    visionUrl: visionUrl, capB64: capB64, saveFrames: saveFrames,
    archiveNote: archiveNote, hydrate: hydrate, imgFallback: imgFallback,
    repoImageB64: repoImageB64, ready: ready, MAX_PER_NOTE: MAX_PER_NOTE
  };
})(window.XHS);
