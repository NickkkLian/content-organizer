/* 抓取与解析小红书笔记（纯前端 + 公共代理，尽力而为）。
   主路径：Jina Reader 的 HTML 模式取原始 HTML → 解析内嵌 __INITIAL_STATE__（最干净，含标题/正文/图/标签/作者）。
   退路：Jina markdown / AllOrigins / 手动粘贴。抓到登录墙则报错，不存垃圾。 */
window.XHS = window.XHS || {};
(function (X) {
  'use strict';
  var T = (window.XHS.i18n && window.XHS.i18n.T) || function(zh,en){return zh;};

  function uniq(arr){ return Array.from(new Set(arr)); }

  // 从一段分享文案里提取第一个链接
  function extractUrl(text){
    if (!text) return '';
    var m = String(text).match(/https?:\/\/[^\s，。、）)】\]"']+/);
    return m ? m[0] : '';
  }

  // 解析话题标签：#xxx# 或 #xxx
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
    if (/sns-avatar|\/avatar\//i.test(u)) return false;          // 排除作者头像
    return /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u) ||
           /xhscdn\.com|xiaohongshu\.com|sns-webpic|sns-img|ci\.xiaohongshu/i.test(u);
  }

  // 站点默认标题（抓到这个 = 没拿到真内容）
  function isGenericTitle(t){
    t = (t || '').trim();
    return !t || /^小红书\s*[-—|]\s*你的生活兴趣社区/.test(t) || t === '小红书';
  }
  function cleanTitle(t){
    t = (t || '').replace(/\s*[-—|]\s*小红书\s*$/, '').trim();    // 去 " - 小红书" 后缀
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

  // 解析原始 HTML：优先内嵌 __INITIAL_STATE__，退回 og 标签
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
    } catch (e) { /* 结构变化则退回 og 标签 */ }

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

  // ---- Jina HTML 模式：取原始 HTML（含 __INITIAL_STATE__），主路径 ----
  async function fetchViaJinaHtml(url){
    var resp = await fetch('https://r.jina.ai/' + url, { headers: { 'x-return-format': 'html' } });
    if (!resp.ok) throw new Error('Jina(html) ' + resp.status);
    var html = await resp.text();
    if (!html || html.length < 200) throw new Error('Jina(html) 返回过短');
    return parseHtml(html, url);
  }

  // ---- Jina markdown 模式（退路） ----
  async function fetchViaJinaMd(url){
    var resp = await fetch('https://r.jina.ai/' + url);
    if (!resp.ok) throw new Error('Jina ' + resp.status);
    var text = await resp.text();
    if (!text || text.length < 20) throw new Error('Jina 返回为空');
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

  // ---- AllOrigins 退路（xhs 常被其挡，留作其它站点退路） ----
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

  // 主入口：Jina HTML(__INITIAL_STATE__) → Jina markdown → AllOrigins
  async function fetchNote(rawInput){
    var url = extractUrl(rawInput) || String(rawInput || '').trim();
    if (!/^https?:\/\//.test(url)) throw new Error(T('没有识别到有效链接','No valid link detected'));

    var note = null, err = null;
    try { note = await fetchViaJinaHtml(url); } catch (e) { err = e; }
    if (note && note.fromState && !isThin(note)) return note;     // 拿到干净结构化数据，直接用

    var md = null, ao = null;
    try { md = await fetchViaJinaMd(url); } catch (e) { if (!err) err = e; }
    if (isThin(note) && isThin(md)) { try { ao = await fetchViaAllOrigins(url); } catch (e) {} }

    // 取最好的（优先 state），再用其它补空缺
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
    if (looksLikeLoginWall(best)) throw new Error(T('被登录墙拦截：请用「完整分享链接」（带 xsec_token）或切到「手动粘贴」','Blocked by login wall: use the "full share link" (with xsec_token) or switch to "Manual paste"'));
    return best;
  }

  // 手动模式：粘贴文案 + 可选图片直链
  function buildManual(textBlob, imagesBlob){
    var text = String(textBlob || '');
    var lines = text.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    var images = String(imagesBlob || '').split(/[\s,，]+/)
      .map(function (s) { return s.trim(); }).filter(looksLikeImage);
    return {
      title: cleanTitle(lines[0]) || lines[0] || '未命名',
      author: '', body: text.trim(), images: uniq(images),
      tags: extractTags(text), url: extractUrl(text), source: 'manual'
    };
  }

  X.extractUrl = extractUrl;
  X.extractTags = extractTags;
  X.fetchNote = fetchNote;
  X.buildManual = buildManual;
})(window.XHS);
