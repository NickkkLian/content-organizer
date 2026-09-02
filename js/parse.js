/* Fetch and parse Xiaohongshu notes (front end only, via public proxies, best-effort).
   Main path: Jina Reader in HTML mode → parse the embedded __INITIAL_STATE__ (cleanest: title/body/images/tags/author).
   Fallbacks: Jina markdown / AllOrigins / manual paste. A login wall raises an error instead of saving junk. */
window.XHS = window.XHS || {};
(function (X) {
  'use strict';
  var T = (window.XHS.i18n && window.XHS.i18n.T) || function (zh, en) { return en; };

  function uniq(arr){ return Array.from(new Set(arr)); }

  // First link inside a block of share text
  function extractUrl(text){
    if (!text) return '';
    var m = String(text).match(/https?:\/\/[^\s，。、）)】\]"']+/);
    return m ? m[0] : '';
  }

  // Topic tags: #xxx# or #xxx
  function extractTags(text){
    if (!text) return [];
    var tags = [], m;
    var re1 = /#([^#\s]{1,30})#/g;
    var re2 = /#([^#\s\[\]()]{1,30})/g;
    while ((m = re1.exec(text))) tags.push(m[1].trim());
    while ((m = re2.exec(text))) tags.push(m[1].trim());
    return uniq(tags.filter(Boolean));
  }

  function looksLikeImage(u){
    if (!/^https?:\/\//.test(u)) return false;
    if (/sns-avatar|\/avatar\//i.test(u)) return false;          // skip author avatars
    return /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u) ||
           /xhscdn\.com|xiaohongshu\.com|sns-webpic|sns-img|ci\.xiaohongshu/i.test(u);
  }

  // The site's default title (getting it means we didn't get real content)
  function isGenericTitle(t){
    t = (t || '').trim();
    return !t || /^小红书\s*[-—|]\s*你的生活兴趣社区/.test(t) || t === '小红书';
  }
  function cleanTitle(t){
    t = (t || '').replace(/\s*[-—|]\s*小红书\s*$/, '').trim();    // strip the " - 小红书" suffix
    return isGenericTitle(t) ? '' : t;
  }
  function cleanBody(b){
    return (b || '').replace(/\[话题\]/g, '').replace(/\n{3,}/g, '\n\n').trim();
  }
  function imageFromItem(im){
    if (!im) return '';
    if (im.urlDefault) return im.urlDefault;
    if (im.urlPre) return im.urlPre;
    if (im.infoList) for (var i = 0; i < im.infoList.length; i++) if (im.infoList[i] && im.infoList[i].url) return im.infoList[i].url;
    return '';
  }

  // Parse raw HTML: embedded __INITIAL_STATE__ first, og: tags as fallback
  function parseHtml(html, url){
    var fromState = false, title = '', body = '', author = '', images = [], tags = [];

    try {
      var sm = html.match(/window\.__INITIAL_STATE__\s*=\s*([\s\S]*?)<\/script>/);
      if (sm) {
        var raw = sm[1].trim().replace(/;\s*$/, '').replace(/\bundefined\b/g, 'null');
        var state = JSON.parse(raw);
        var map = state && state.note && state.note.noteDetailMap;
        if (map) {
          var note = (map[Object.keys(map)[0]] || {}).note;
          if (note && (note.title || note.desc)) {
            fromState = true;
            title = note.title || '';
            body = note.desc || '';
            if (note.user && note.user.nickname) author = note.user.nickname;
            (note.imageList || []).forEach(function (im) { var u = imageFromItem(im); if (u) images.push(u); });
            tags = (note.tagList || []).map(function (t) { return t.name; }).filter(Boolean);
          }
        }
      }
    } catch (e) { /* structure changed → fall back to og: tags */ }

    if (!fromState) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var metaOf = function (prop) {
        var el = doc.querySelector('meta[property="' + prop + '"], meta[name="' + prop + '"]');
        return el ? el.getAttribute('content') : '';
      };
      var titleEl = doc.querySelector('title');
      title = metaOf('og:title') || (titleEl ? titleEl.textContent : '');
      body = metaOf('og:description') || metaOf('description') || '';
      author = metaOf('og:author') || '';
      doc.querySelectorAll('meta[property="og:image"], meta[name="og:image"]').forEach(function (el) {
        var c = el.getAttribute('content'); if (c) images.push(c);
      });
    }

    title = cleanTitle(title);
    body = cleanBody(body);
    if (!tags.length) tags = extractTags(title + ' ' + body);

    return {
      title: title, author: author, body: body,
      images: uniq(images.filter(looksLikeImage)),
      tags: uniq(tags), url: url,
      source: fromState ? 'state' : 'html', fromState: fromState
    };
  }

  // ---- Jina HTML mode: raw HTML (with __INITIAL_STATE__) — main path ----
  async function fetchViaJinaHtml(url){
    var resp = await fetch('https://r.jina.ai/' + url, { headers: { 'x-return-format': 'html' } });
    if (!resp.ok) throw new Error('Jina(html) ' + resp.status);
    var html = await resp.text();
    if (!html || html.length < 200) throw new Error('Jina(html) returned too little');
    return parseHtml(html, url);
  }

  // ---- Jina markdown mode (fallback) ----
  async function fetchViaJinaMd(url){
    var resp = await fetch('https://r.jina.ai/' + url);
    if (!resp.ok) throw new Error('Jina ' + resp.status);
    var text = await resp.text();
    if (!text || text.length < 20) throw new Error('Jina returned nothing');
    var title = '';
    var tm = text.match(/^Title:\s*(.+)$/m); if (tm) title = tm[1].trim();
    var content = text; var ci = text.indexOf('Markdown Content:');
    if (ci !== -1) content = text.slice(ci + 'Markdown Content:'.length);
    var images = [], m; var imgRe = /!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g;
    while ((m = imgRe.exec(content))) { if (looksLikeImage(m[1])) images.push(m[1]); }
    var body = content.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\n{3,}/g, '\n\n').trim();
    return {
      title: cleanTitle(title) || (body.split('\n')[0] || '').slice(0, 60),
      author: '', body: cleanBody(body), images: uniq(images),
      tags: extractTags(text), url: url, source: 'jina', fromState: false
    };
  }

  // ---- AllOrigins fallback (XHS usually blocks it; kept for other sites) ----
  async function fetchViaAllOrigins(url){
    var resp = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(url));
    if (!resp.ok) throw new Error('AllOrigins ' + resp.status);
    return parseHtml(await resp.text(), url);
  }

  function isThin(note){
    return !note || (!note.title && !note.body) ||
           ((note.images || []).length === 0 && (note.body || '').length < 20);
  }
  function looksLikeLoginWall(note){
    if (!note) return true;
    if (isGenericTitle(note.title) && !note.fromState) return true;
    return !note.fromState && /登录后推荐|扫码登录|手机号登录|获取验证码/.test(note.body || '');
  }

  // Entry point: Jina HTML (__INITIAL_STATE__) → Jina markdown → AllOrigins
  async function fetchNote(rawInput){
    var url = extractUrl(rawInput) || String(rawInput || '').trim();
    if (!/^https?:\/\//.test(url)) throw new Error(T('没有识别到有效链接','No valid link detected'));

    var note = null, err = null;
    try { note = await fetchViaJinaHtml(url); } catch (e) { err = e; }
    if (note && note.fromState && !isThin(note)) return note;     // clean structured data — use it directly

    var md = null, ao = null;
    try { md = await fetchViaJinaMd(url); } catch (e) { if (!err) err = e; }
    if (isThin(note) && isThin(md)) { try { ao = await fetchViaAllOrigins(url); } catch (e) {} }

    // Take the best (state first), then fill gaps from the others
    var best = (note && !isThin(note)) ? note : ((ao && !isThin(ao)) ? ao : md);
    [note, ao, md].forEach(function (o) {
      if (!o || o === best || !best) return;
      best.title = best.title || o.title;
      if ((best.body || '').length < 20 && o.body) best.body = o.body;
      best.author = best.author || o.author;
      best.images = uniq((best.images || []).concat(o.images || []));
      best.tags = uniq((best.tags || []).concat(o.tags || []));
    });

    if (!best || isThin(best)) throw (err || new Error(T('抓取到的内容过少，请改用「手动粘贴」','Too little content fetched — please use "Manual paste"')));
    if (looksLikeLoginWall(best)) throw new Error(T('被登录墙拦截：请用「完整分享链接」（带 xsec_token）或切到「手动粘贴」','Blocked by a login wall: use the full share link (with xsec_token) or switch to "Manual paste"'));
    return best;
  }

  // Manual mode: pasted text + optional direct image links
  function buildManual(textBlob, imagesBlob){
    var text = String(textBlob || '');
    var lines = text.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    var images = String(imagesBlob || '').split(/[\s,，]+/)
      .map(function (s) { return s.trim(); }).filter(looksLikeImage);
    return {
      title: cleanTitle(lines[0]) || lines[0] || T('未命名', 'Untitled'),
      author: '', body: text.trim(), images: uniq(images),
      tags: extractTags(text), url: extractUrl(text), source: 'manual'
    };
  }

  X.extractUrl = extractUrl;
  X.extractTags = extractTags;
  X.fetchNote = fetchNote;
  X.buildManual = buildManual;
})(window.XHS);
