/* 界面逻辑：抓取 → 展示 → 分类 → 收藏 / 导出 / 云同步 */
window.XHS = window.XHS || {};
(function (X) {
  'use strict';
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var T = X.i18n.T;   // 双语 T(zh,en)，中文原生、英文备选

  var els = {};
  var currentNote = null;   // 当前整理出、尚未收藏的笔记
  var activeFilter = 'all';
  var activePlatform = 'all';    // 平台筛选：all / xhs / bili
  var activeType = 'all';        // 类型筛选：all / post / video
  var selectedIds = new Set();   // 勾选用于「AI 整理成合集」的笔记 id
  var viewArchived = false;      // 归档视图开关：整理过的笔记自动归档到这里

  function setStatus(msg, type){
    els.status.textContent = msg || '';
    els.status.className = 'status' + (type ? ' status--' + type : '');
    els.status.style.display = msg ? 'block' : 'none';
  }

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  function catOf(note){
    if (note.category) return { name: note.category, emoji: note.categoryEmoji || (note.platform === 'bili' ? '📺' : '🗂️') };
    if (note.platform === 'bili') return { name: note.tname || 'B站', emoji: '📺' };
    return X.classify(note).primary;
  }
  function isVideo(note){
    return Boolean(note.platform === 'bili' || note.isVideo || note.source === 'xhs-video');
  }
  function fmtDur(sec){
    sec = parseInt(sec, 10) || 0; if (!sec) return '';
    var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function platBadge(note){
    return note.platform === 'bili'
      ? '<span class="badge badge--plat badge--bili">📺 ' + T('B站','Bilibili') + '</span>'
      : '<span class="badge badge--plat badge--xhs">📕 ' + T('小红书','XHS') + '</span>';
  }
  function typeBadge(note){
    if (!isVideo(note)) return '<span class="badge badge--soft">🖼 ' + T('图文','Post') + '</span>';
    var d = note.durationText || fmtDur(note.duration);
    return '<span class="badge badge--soft">🎬 ' + T('视频','Video') + (d ? ' ' + esc(d) : '') + '</span>';
  }
  function renderTranscript(note){
    var t = note.transcript || ''; if (!t) return '';
    return '<details class="note__ts"><summary>🗣 ' + T('语音转写','Transcript') + ' · ' + t.length + T(' 字',' chars') +
      '</summary><pre class="note__body note__ts-body">' + esc(t) + '</pre></details>';
  }

  function renderImages(note){
    var images = (note && note.images) || [];
    var repo = (note && note.imagesRepo) || [];
    var n = Math.max(images.length, repo.length);
    if (!n) return '';
    var items = [];
    for (var i = 0; i < n; i++) {
      var rp = repo[i];
      var u = images[i] ? X.images.httpsize(images[i]) : '';
      if (rp) {
        // 已归档：优先仓库图（hydrate 异步填 blob 地址），原链接作回退
        items.push('<a target="_blank" rel="noreferrer"><img data-repo="' + esc(rp) + '"' +
          (u ? ' data-orig="' + esc(u) + '"' : '') + ' loading="lazy" alt=""></a>');
      } else if (u) {
        // 未归档：直连（no-referrer）→ 失败退 weserv 代理 → 再失败标「已过期」
        items.push('<a href="' + esc(u) + '" target="_blank" rel="noreferrer">' +
          '<img src="' + esc(u) + '" loading="lazy" referrerpolicy="no-referrer" alt="" data-fb="' +
          esc(X.images.proxyUrl(u)) + '" onerror="XHS.images.imgFallback(this)"></a>');
      }
    }
    return '<div class="gallery">' + items.join('') + '</div>';
  }

  function renderTags(tags){
    if (!tags || !tags.length) return '';
    return '<div class="tags">' + tags.map(function (t) {
      return '<span class="tag">#' + esc(t) + '</span>';
    }).join('') + '</div>';
  }

  function noteCardHtml(note, actionsHtml, opts){
    opts = opts || {};
    var cat = catOf(note);
    var vid = isVideo(note);
    var secondary = '';
    if (note.platform !== 'bili' && !vid) {          // 仅小红书图文用 classify 的次级分类
      var cls = X.classify(note);
      secondary = cls.ranked.slice(note.category ? 0 : 1, 3)
        .filter(function (c) { return c.name !== cat.name; })
        .map(function (c) { return '<span class="badge badge--soft">' + c.emoji + ' ' + esc(X.catLabel(c.name)) + '</span>'; })
        .join('');
    }
    var sel = opts.selectable
      ? '<label class="note__sel"><input type="checkbox" class="selbox" data-id="' + note.id + '"' + (opts.selected ? ' checked' : '') + '> ' + T('选入合集','Add to compilation') + '</label>'
      : '';
    return '' +
      '<article class="card note' + (opts.selected ? ' is-sel' : '') + '">' + sel +
        '<div class="note__head">' +
          platBadge(note) +
          '<span class="badge">' + cat.emoji + ' ' + esc(X.catLabel(cat.name)) + '</span>' +
          typeBadge(note) + secondary +
        '</div>' +
        '<h3 class="note__title">' + esc(note.title || T('未命名','Untitled')) + '</h3>' +
        (note.author ? '<div class="note__author">@' + esc(note.author) + '</div>' : '') +
        renderTags(note.tags) +
        (note.body ? '<pre class="note__body">' + esc(note.body) + '</pre>' : '') +
        renderTranscript(note) +
        renderImages(note) +
        (note.url ? '<a class="note__link" href="' + esc(note.url) + '" target="_blank" rel="noreferrer">' + T('查看原文 ↗','View original ↗') + '</a>' : '') +
        '<div class="note__actions">' + actionsHtml + '</div>' +
      '</article>';
  }

  function showResult(note){
    currentNote = note;
    els.result.innerHTML = noteCardHtml(note,
      '<button class="btn btn--primary" data-act="save">' + T('★ 收藏到本地库','★ Save to library') + '</button>' +
      '<button class="btn" data-act="copy">' + T('复制为 Markdown','Copy as Markdown') + '</button>');
    els.result.style.display = 'block';
    X.images.hydrate(els.result);
    els.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function noteToMarkdown(note){
    var cat = catOf(note);
    var md = '## ' + (note.title || T('未命名','Untitled')) + '\n\n';
    md += T('- 分类：','- Category: ') + cat.emoji + ' ' + X.catLabel(cat.name) + '\n';
    if (note.author) md += T('- 作者：@','- Author: @') + note.author + '\n';
    if (note.url) md += T('- 链接：','- Link: ') + note.url + '\n';
    if (note.tags && note.tags.length) md += T('- 标签：','- Tags: ') + note.tags.map(function (t) { return '#' + t; }).join(' ') + '\n';
    md += '\n' + (note.body || '') + '\n';
    if (note.images && note.images.length) {
      md += T('\n图片：\n','\nImages:\n') + note.images.map(function (u) { return '![](' + u + ')'; }).join('\n') + '\n';
    }
    return md;
  }

  async function copyText(t){
    try { await navigator.clipboard.writeText(t); setStatus(T('已复制到剪贴板 ✓','Copied to clipboard ✓'), 'ok'); }
    catch (e) {
      var ta = document.createElement('textarea');
      ta.value = t; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove(); setStatus(T('已复制 ✓','Copied ✓'), 'ok');
    }
  }

  function download(name, content, type){
    var blob = new Blob([content], { type: type || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  // ---------- 收藏库 ----------
  function buildFilters(notes){
    var counts = {};
    notes.forEach(function (n) {
      var key = catOf(n).name;
      counts[key] = (counts[key] || 0) + 1;
    });
    var html = '<button class="chip' + (activeFilter === 'all' ? ' chip--on' : '') + '" data-cat="all">' + T('全部 ','All ') + notes.length + '</button>';
    Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).forEach(function (k) {
      html += '<button class="chip' + (activeFilter === k ? ' chip--on' : '') + '" data-cat="' + esc(k) + '">' + esc(X.catLabel(k)) + ' ' + counts[k] + '</button>';
    });
    els.catFilter.innerHTML = html;
  }

  // 平台 + 类型 两组筛选（渲染进 #platFilter）
  function ptChip(dim, val, zh, en, count, active){
    return '<button class="chip' + (active ? ' chip--on' : '') + '" data-dim="' + dim + '" data-val="' + val + '">' + T(zh, en) + ' ' + count + '</button>';
  }
  function buildPlatType(base){
    if (!els.platFilter) return;
    var xhsN = base.filter(function (n) { return (n.platform || 'xhs') !== 'bili'; }).length;
    var biliN = base.filter(function (n) { return n.platform === 'bili'; }).length;
    var vidN = base.filter(isVideo).length, postN = base.length - vidN;
    var h = ptChip('plat', 'all', '全部', 'All', base.length, activePlatform === 'all');
    if (xhsN) h += ptChip('plat', 'xhs', '📕 小红书', '📕 XHS', xhsN, activePlatform === 'xhs');
    if (biliN) h += ptChip('plat', 'bili', '📺 B站', '📺 Bilibili', biliN, activePlatform === 'bili');
    h += '<span class="chips__sep"></span>';
    h += ptChip('type', 'all', '全部', 'All', base.length, activeType === 'all');
    if (postN) h += ptChip('type', 'post', '🖼 图文', '🖼 Posts', postN, activeType === 'post');
    if (vidN) h += ptChip('type', 'video', '🎬 视频', '🎬 Videos', vidN, activeType === 'video');
    els.platFilter.innerHTML = h;
  }

  function renderLibrary(){
    var all = X.store.getAll();
    var base = all.filter(function (n) { return viewArchived ? n.archived : !n.archived; });
    var archivedCount = all.filter(function (n) { return n.archived; }).length;
    if (els.archCount) els.archCount.textContent = archivedCount;
    if (els.archToggle) els.archToggle.classList.toggle('chip--on', viewArchived);
    buildPlatType(base);
    var ptBase = base.filter(function (n) {
      if (activePlatform !== 'all' && (n.platform || 'xhs') !== activePlatform) return false;
      if (activeType === 'video' && !isVideo(n)) return false;
      if (activeType === 'post' && isVideo(n)) return false;
      return true;
    });
    buildFilters(ptBase);
    var q = (els.search.value || '').trim().toLowerCase();
    var list = ptBase.filter(function (n) {
      if (activeFilter !== 'all' && catOf(n).name !== activeFilter) return false;
      if (!q) return true;
      var hay = ((n.title || '') + ' ' + (n.body || '') + ' ' + (n.transcript || '') + ' ' + (n.author || '') + ' ' + (n.tags || []).join(' ')).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
    els.libCount.textContent = list.length + ' / ' + ptBase.length + T(' 篇',' notes') + (viewArchived ? T('（已归档）',' (archived)') : '');
    if (!base.length) { els.libList.innerHTML = '<p class="empty">' + (viewArchived ? T('还没有已归档的笔记。整理成合集后，作为素材的笔记会自动归档到这里。','No archived notes yet. After you consolidate, the source notes are auto-archived here.') : T('还没有收藏。整理一篇笔记后点「收藏到本地库」。','No saved notes yet. Organize a note, then click "Save to library".')) + '</p>'; return; }
    if (!list.length) { els.libList.innerHTML = '<p class="empty">' + T('没有匹配的笔记。','No matching notes.') + '</p>'; return; }
    els.libList.innerHTML = list.map(function (n) {
      var needFix = (n.images || []).length > (n.imagesRepo || []).filter(Boolean).length;
      var fixBtn = needFix ? '<button class="btn btn--ghost" data-act="fiximg" data-id="' + n.id + '">' + T('🔧 修复图片','🔧 Fix images') + '</button>' : '';
      var actions = viewArchived
        ? '<button class="btn btn--ghost" data-act="copy-lib" data-id="' + n.id + '">' + T('复制 MD','Copy MD') + '</button>' +
          '<button class="btn btn--ghost" data-act="open" data-id="' + n.id + '">' + T('原文','Original') + '</button>' + fixBtn +
          '<button class="btn btn--primary" data-act="unarch" data-id="' + n.id + '">' + T('↩︎ 取出','↩︎ Restore') + '</button>' +
          '<button class="btn btn--danger" data-act="del" data-id="' + n.id + '">' + T('删除','Delete') + '</button>'
        : '<button class="btn btn--ghost" data-act="copy-lib" data-id="' + n.id + '">' + T('复制 MD','Copy MD') + '</button>' +
          '<button class="btn btn--ghost" data-act="open" data-id="' + n.id + '">' + T('原文','Original') + '</button>' + fixBtn +
          '<button class="btn btn--ghost" data-act="arch" data-id="' + n.id + '">' + T('📥 归档','📥 Archive') + '</button>' +
          '<button class="btn btn--danger" data-act="del" data-id="' + n.id + '">' + T('删除','Delete') + '</button>';
      return noteCardHtml(n, actions, { selectable: !viewArchived, selected: selectedIds.has(n.id) });
    }).join('');
    X.images.hydrate(els.libList);
  }

  // ---------- 图片修复（重抓原帖拿新链接 → 归档进私有仓库） ----------
  async function fixNoteImages(id, quiet){
    var note = X.store.getAll().find(function (n) { return n.id === id; });
    if (!note) return { ok: 0, fail: 0 };
    if (!X.images.ready()) {
      setStatus(T('请先在 ⚙️ 设置里连接 GitHub（归档图片需要令牌）','Connect GitHub in ⚙️ Settings first (archiving needs a token)'), 'err');
      throw new Error('no token');
    }
    // 链接已过期且有原帖地址 → 先重抓拿新签名链接
    var expired = (note.images || []).some(X.images.isExpired);
    if (note.url && (expired || !(note.images || []).length)) {
      try {
        var fresh = await X.fetchNote(note.url);
        if (fresh.images && fresh.images.length) {
          note = Object.assign({}, note, { images: fresh.images, imagesRepo: (note.imagesRepo || []).slice(0, fresh.images.length) });
        }
      } catch (e) { /* 重抓失败就用现有链接尽力归档 */ }
    }
    var res = await X.images.archiveNote(note, quiet ? null : function (i, n) {
      setStatus(T('归档图片 ','Archiving image ') + i + '/' + n + '…', 'loading');
    });
    X.store.update(note.id, { images: note.images, imagesRepo: res.repo });
    return res;
  }

  async function fixAllImages(){
    var todo = X.store.getAll().filter(function (n) {
      return (n.images || []).length > (n.imagesRepo || []).filter(Boolean).length;
    });
    if (!todo.length) { setStatus(T('所有图片都已归档 ✓','All images already archived ✓'), 'ok'); return; }
    if (!X.images.ready()) { setStatus(T('请先在 ⚙️ 设置里连接 GitHub（归档图片需要令牌）','Connect GitHub in ⚙️ Settings first (archiving needs a token)'), 'err'); return; }
    els.fixAllBtn.disabled = true;
    var ok = 0, fail = 0;
    try {
      for (var i = 0; i < todo.length; i++) {
        setStatus(T('修复中 ','Fixing ') + (i + 1) + '/' + todo.length + '：' + (todo[i].title || '').slice(0, 24) + '…', 'loading');
        try { var r = await fixNoteImages(todo[i].id, true); ok += r.ok; fail += r.fail; }
        catch (e) { if (e.message === 'no token') return; fail++; }
        await new Promise(function (res) { setTimeout(res, 400); });   // 限速，善待代理与 API
      }
      renderLibrary();
      scheduleSync();
      setStatus(T('修复完成：归档 ','Done: archived ') + ok + T(' 张','') + (fail ? T('，','; ') + fail + T(' 张失败（原帖可能已删除或需登录）',' failed (post deleted or login required)') : ' ✓'), fail ? 'err' : 'ok');
    } finally { els.fixAllBtn.disabled = false; }
  }

  // ---------- 多选 → AI 整理成合集 ----------
  function updateSelBar(){
    var n = selectedIds.size;
    els.selBar.style.display = n ? 'flex' : 'none';
    if (!n) return;
    els.selCount.textContent = T('已选 ','Selected ') + n + T(' 篇',' notes');
    var comps = X.store.getComps();
    els.addToComp.innerHTML = '<option value="">' + T('加入已有合集…','Add to existing compilation…') + '</option>' +
      comps.map(function (c) { return '<option value="' + c.id + '">' + esc(c.title || T('未命名合集','Untitled compilation')) + '</option>'; }).join('');
  }

  async function runConsolidate(existingComp){
    if (!X.ai || !X.ai.isReady()){
      setStatus(T('请先在 ⚙️ 设置里填入 Anthropic API 令牌','Enter your Anthropic API token in ⚙️ Settings first'), 'err');
      els.settingsPanel.style.display = 'block';
      els.settingsPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    var notes = X.store.getAll().filter(function (n) { return selectedIds.has(n.id); });
    if (!notes.length){ setStatus(T('请先勾选笔记','Select some notes first'), 'err'); return; }
    els.consolidateBtn.disabled = true; els.addToComp.disabled = true;
    setStatus(T('AI 整理中…（约 10–30 秒，请勿关闭页面）','AI consolidating… (~10–30s, keep this page open)'), 'loading');
    try {
      var posts = notes.map(function (n) { return { title: n.title, body: n.body, tags: n.tags, url: n.url, transcript: n.transcript, platform: n.platform, isVideo: isVideo(n) }; });
      // 可选：连图片一起分析——带上所选笔记的全部图片（Claude API 单请求上限 100 张，超出截断并提示）
      if (els.includeImgs && els.includeImgs.checked) {
        var MAXI = 100, total = 0, skippedCap = 0, skippedDead = 0;
        for (var pi = 0; pi < notes.length; pi++) {
          var n = notes[pi], blocks = [];
          var repo = n.imagesRepo || [], imgs = n.images || [];
          for (var ii = 0; ii < Math.max(repo.length, imgs.length); ii++) {
            if (total >= MAXI) { skippedCap++; continue; }
            if (repo[ii]) {
              try {
                setStatus(T('打包图片 ', 'Packing image ') + (total + 1) + '…', 'loading');
                var b64 = await X.images.repoImageB64(repo[ii]);
                var cap = await X.images.capB64(b64, 'image/webp', 1568);
                blocks.push({ type: 'image', source: { type: 'base64', media_type: cap.media_type, data: cap.data } });
                total++;
              } catch (e) { skippedDead++; }
            } else if (imgs[ii] && !X.images.isExpired(imgs[ii])) {
              blocks.push({ type: 'image', source: { type: 'url', url: X.images.visionUrl(imgs[ii]) } });
              total++;
            } else if (imgs[ii]) { skippedDead++; }
          }
          if (blocks.length) posts[pi].imgs = blocks;
        }
        var warn = [];
        if (skippedCap) warn.push(T('超过 100 张上限，' + skippedCap + ' 张未送入', skippedCap + ' over the 100-image cap'));
        if (skippedDead) warn.push(T(skippedDead + ' 张已过期且未归档（可先点「修复全部图片」）', skippedDead + ' expired & unarchived (run "Fix all images" first)'));
        setStatus(T('AI 整理中（含 ' + total + ' 张图，图多时需 1–3 分钟）…', 'AI consolidating (' + total + ' images — may take 1–3 min)…') + (warn.length ? ' · ' + warn.join('；') : ''), 'loading');
      }
      var res = await X.ai.consolidate(posts, existingComp || null);
      var sections = (res.sections || []).map(function (s) {
        var srcs = (s.source_indices || []).map(function (i) {
          var nn = notes[i - 1]; return nn ? { title: nn.title || T('未命名','Untitled'), url: nn.url || '' } : null;
        }).filter(Boolean);
        return { heading: s.heading, content: s.content, sources: srcs };
      });
      var prevIds = (existingComp && existingComp.sourceNoteIds) || [];
      var prevUrls = (existingComp && existingComp.sourceUrls) || [];
      var comp = {
        id: existingComp ? existingComp.id : undefined,
        title: res.title, topic: res.topic, summary: res.summary, sections: sections,
        sourceNoteIds: Array.from(new Set(prevIds.concat(notes.map(function (n) { return n.id; })))),
        sourceUrls: Array.from(new Set(prevUrls.concat(notes.map(function (n) { return n.url; }).filter(Boolean)))),
        model: X.ai.getConfig().model
      };
      X.store.saveComp(comp);
      X.store.archive(notes.map(function (n) { return n.id; }));   // 整理过的素材自动归档
      selectedIds.clear();
      renderLibrary(); renderComps(); updateSelBar();
      setStatus(T('整理完成 ✓ 已存入合集，原笔记已自动归档','Done ✓ Saved to a compilation; source notes auto-archived'), 'ok');
      scheduleSync();
      els.compsCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      setStatus(T('AI 整理失败：','AI consolidation failed: ') + e.message, 'err');
    } finally {
      els.consolidateBtn.disabled = false; els.addToComp.disabled = false;
    }
  }

  // ---------- 合集渲染 ----------
  function compToMarkdown(c){
    var md = '# ' + (c.title || T('未命名合集','Untitled compilation')) + '\n\n';
    if (c.topic) md += T('> 主题：','> Topic: ') + c.topic + '\n\n';
    if (c.summary) md += c.summary + '\n\n';
    (c.sections || []).forEach(function (s) {
      md += '## ' + s.heading + '\n\n' + s.content + '\n';
      if (s.sources && s.sources.length) {
        md += T('\n来源：','\nSources: ') + s.sources.map(function (x) {
          return x.url ? ('[' + (x.title || T('链接','link')) + '](' + x.url + ')') : (x.title || '');
        }).join(' · ') + '\n';
      }
      md += '\n';
    });
    return md;
  }
  function compCardHtml(c){
    var meta = '<span class="badge">🧩 ' + esc(c.topic || T('合集','Compilation')) + '</span>' +
      (c.model ? '<span class="badge badge--soft">' + esc(String(c.model).replace('claude-', '')) + '</span>' : '') +
      '<span class="src">' + ((c.sourceUrls && c.sourceUrls.length) || 0) + T(' 篇来源',' sources') + '</span>';
    var secs = (c.sections || []).map(function (s) {
      var src = (s.sources && s.sources.length)
        ? '<div class="comp__src">' + s.sources.map(function (x) {
            return x.url ? '<a href="' + esc(x.url) + '" target="_blank" rel="noreferrer">' + esc(x.title || T('链接','link')) + ' ↗</a>'
                         : '<a>' + esc(x.title || '') + '</a>';
          }).join('') + '</div>'
        : '';
      return '<div class="comp__sec"><h4>' + esc(s.heading) + '</h4><div class="body">' + esc(s.content) + '</div>' + src + '</div>';
    }).join('');
    return '<article class="card comp">' +
      '<div class="comp__meta">' + meta + '</div>' +
      '<h3 class="comp__title">' + esc(c.title || T('未命名合集','Untitled compilation')) + '</h3>' +
      (c.summary ? '<div class="comp__summary">' + esc(c.summary) + '</div>' : '') +
      secs +
      '<div class="note__actions">' +
        '<button class="btn btn--ghost" data-cact="copy" data-id="' + c.id + '">' + T('复制 MD','Copy MD') + '</button>' +
        '<button class="btn btn--danger" data-cact="del" data-id="' + c.id + '">' + T('删除','Delete') + '</button>' +
      '</div></article>';
  }
  function renderComps(){
    var comps = X.store.getComps();
    els.compCount.textContent = comps.length ? '· ' + comps.length + T(' 篇',' notes') : '';
    els.compList.innerHTML = comps.length
      ? comps.map(compCardHtml).join('')
      : '<p class="empty">' + T('还没有合集。在收藏库勾选几篇同主题的笔记，点「✨ AI 整理成合集」。','No compilations yet. Tick a few same-topic notes in the library, then click "✨ AI consolidate".') + '</p>';
  }

  // ---------- AI 设置 ----------
  function updateAIUI(){
    if (!X.ai) return;
    var cfg = X.ai.getConfig();
    if (els.aiModel) {
      els.aiModel.innerHTML = X.ai.MODELS.map(function (m) { return '<option value="' + m.id + '">' + (X.i18n.lang === 'en' ? m.nameEn : m.name) + '</option>'; }).join('');
    }
    if (els.aiModel) els.aiModel.value = cfg.model;
    if (els.aiStatus) els.aiStatus.textContent = X.ai.isReady()
      ? (T('AI 已就绪 · ','AI ready · ') + String(cfg.model).replace('claude-', ''))
      : T('AI 未设置：填入 Anthropic API Key 后即可「整理成合集」','AI not set: enter your Anthropic API Key to enable consolidation');
  }
  function onSaveAI(){
    var key = (els.aiKeyInput.value || '').trim();
    var model = els.aiModel.value;
    X.ai.saveConfig(key || null, model);   // 空令牌时只更新模型、保留已存令牌
    els.aiKeyInput.value = '';
    updateAIUI();
    els.aiStatus.textContent = X.ai.isReady()
      ? (T('✓ 已保存 · ','✓ Saved · ') + String(model).replace('claude-', ''))
      : T('已保存模型（仍未填令牌，整理功能不可用）','Model saved (still no token; consolidation unavailable)');
  }

  // ---------- 事件 ----------
  async function onFetch(){
    var v = els.urlInput.value.trim();
    if (!v) { setStatus(T('请输入小红书链接','Enter an XHS link'), 'err'); return; }
    els.fetchBtn.disabled = true;
    setStatus(T('正在抓取并整理…（首次较慢，约 5–15 秒）','Fetching & organizing… (first run is slower, ~5–15s)'), 'loading');
    try {
      var note = await X.fetchNote(v);
      setStatus(T('整理完成 ✓ 已自动分类','Done ✓ Auto-classified'), 'ok');
      showResult(note);
    } catch (e) {
      setStatus(T('抓取失败：','Fetch failed: ') + e.message, 'err');
    } finally {
      els.fetchBtn.disabled = false;
    }
  }

  function onParseManual(){
    var t = els.manualText.value.trim();
    if (!t) { setStatus(T('请粘贴笔记文案','Paste the note text first'), 'err'); return; }
    setStatus(T('整理完成 ✓ 已自动分类','Done ✓ Auto-classified'), 'ok');
    showResult(X.buildManual(t, els.manualImages.value));
  }

  function saveCurrent(){
    if (!currentNote) return;
    var cls = X.classify(currentNote);
    var rec = X.store.save(Object.assign({}, currentNote, {
      category: cls.primary.name, categoryEmoji: cls.primary.emoji
    }));
    setStatus(T('已收藏 ★','Saved ★'), 'ok');
    renderLibrary();
    scheduleSync();
    // 收藏后台自动归档图片（链接有签名时效，尽早存进自己仓库才永久有效）
    if ((rec.images || []).length && X.images.ready()) {
      X.images.archiveNote(rec).then(function (res) {
        if (!res.ok && !res.fail) return;
        X.store.update(rec.id, { imagesRepo: res.repo });
        renderLibrary();
        scheduleSync();
        if (res.ok) setStatus(T('已收藏 ★ 图片已永久归档（','Saved ★ Images archived permanently (') + res.ok + '/' + (rec.images || []).length + T('）',')'), 'ok');
      }).catch(function () { /* 未连接或失败：链接过期前可随时点「修复图片」补归档 */ });
    }
  }

  // ---------- 云同步（无令牌时全部静默跳过，纯本地工作） ----------
  var syncTimer = null;
  var syncing = false;

  function setSyncStatus(state, text, title){
    if (!els.syncStatus) return;
    els.syncStatus.className = 'sync-pill' + (state ? ' is-' + state : '');
    els.syncStatus.textContent = text;
    els.syncStatus.title = title || T('云同步状态（点击设置）','Cloud sync status (click to set up)');
  }

  function updateSyncUI(){
    if (!X.sync) return;
    if (els.repoLabel) els.repoLabel.textContent = X.sync.dataLabel();
    if (X.sync.isConfigured()) setSyncStatus('ok', '☁ ' + X.sync.getConfig().owner, T('已连接 ','Connected ') + X.sync.dataLabel() + T('（点击设置）',' (click to set up)'));
    else setSyncStatus('', T('● 本地','● Local'), T('未连接云同步，仅存本机（点击设置）','Not connected; local only (click to set up)'));
  }

  async function doSync(){
    if (!X.sync || !X.sync.isConfigured() || syncing) return;
    syncing = true;
    setSyncStatus('syncing', T('↻ 同步中…','↻ Syncing…'));
    try {
      await X.sync.sync();
      renderLibrary();
      renderComps();
      var t = new Date().toLocaleTimeString(X.i18n.lang === 'en' ? 'en-US' : 'zh-CN', { hour: '2-digit', minute: '2-digit' });
      setSyncStatus('ok', T('☁ 已同步','☁ Synced'), T('已同步于 ','Synced at ') + t + ' · ' + X.sync.dataLabel());
    } catch (e) {
      setSyncStatus('err', T('⚠ 同步失败','⚠ Sync failed'), e.message);
    } finally {
      syncing = false;
    }
  }

  function scheduleSync(){
    if (!X.sync || !X.sync.isConfigured()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(doSync, 800);   // 防抖：连续改动只触发一次
  }

  function toggleSettings(){
    var p = els.settingsPanel;
    p.style.display = (p.style.display === 'none') ? 'block' : 'none';
  }

  async function onSaveToken(){
    var token = (els.tokenInput.value || '').trim();
    if (!token) { els.settingsStatus.textContent = T('请输入令牌','Enter a token'); return; }
    els.saveTokenBtn.disabled = true;
    els.settingsStatus.textContent = T('正在校验令牌…','Validating token…');
    try {
      var login = await X.sync.validate(token);
      X.sync.saveToken(token, login);
      els.tokenInput.value = '';
      updateSyncUI();
      els.settingsStatus.textContent = T('已连接账号 ','Connected as ') + login + T('，正在同步…',', syncing…');
      await doSync();
      els.settingsStatus.textContent = T('✓ 已连接并同步（','✓ Connected & synced (') + X.sync.dataLabel() + T('）',')');
    } catch (e) {
      els.settingsStatus.textContent = T('连接失败：','Connection failed: ') + e.message;
      setSyncStatus('err', T('⚠ 未连接','⚠ Not connected'), e.message);
    } finally {
      els.saveTokenBtn.disabled = false;
    }
  }

  function bind(){
    $$('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        $$('.tab').forEach(function (t) { t.classList.remove('tab--on'); });
        tab.classList.add('tab--on');
        var mode = tab.getAttribute('data-mode');
        document.getElementById('mode-link').style.display = mode === 'link' ? 'block' : 'none';
        document.getElementById('mode-manual').style.display = mode === 'manual' ? 'block' : 'none';
        document.getElementById('mode-video').style.display = mode === 'video' ? 'block' : 'none';
        if (mode === 'video') refreshFetchStatus();
      });
    });

    els.fetchBtn.addEventListener('click', onFetch);
    els.urlInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') onFetch(); });
    els.parseManualBtn.addEventListener('click', onParseManual);

    // 🎬 抓视频
    if (els.fetchTokenInput) els.fetchTokenInput.value = X.fetchsvc.getToken();
    els.fetchVideoBtn.addEventListener('click', onFetchVideo);
    els.videoInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') onFetchVideo(); });
    els.saveFetchTokenBtn.addEventListener('click', function () {
      X.fetchsvc.setToken(els.fetchTokenInput.value);
      els.fetchTokenStatus.textContent = T('已保存 ✓','Saved ✓'); refreshFetchStatus();
    });
    els.testFetchBtn.addEventListener('click', async function () {
      els.fetchTokenStatus.textContent = T('测试中…','Testing…');
      var ok = await X.fetchsvc.health();
      els.fetchTokenStatus.textContent = ok ? T('✓ 本地服务在线','✓ Local service online')
        : T('✗ 连不上（菜单栏小程序启动了吗？）','✗ Unreachable (is the menu-bar app running?)');
      refreshFetchStatus();
    });

    els.result.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var act = b.getAttribute('data-act');
      if (act === 'save') saveCurrent();
      else if (act === 'copy') copyText(noteToMarkdown(currentNote));
    });

    els.catFilter.addEventListener('click', function (e) {
      var c = e.target.closest('[data-cat]'); if (!c) return;
      activeFilter = c.getAttribute('data-cat'); renderLibrary();
    });
    els.platFilter.addEventListener('click', function (e) {
      var c = e.target.closest('[data-dim]'); if (!c) return;
      var dim = c.getAttribute('data-dim'), val = c.getAttribute('data-val');
      if (dim === 'plat') activePlatform = val; else if (dim === 'type') activeType = val;
      activeFilter = 'all'; renderLibrary();
    });
    els.search.addEventListener('input', renderLibrary);

    els.libList.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var id = b.getAttribute('data-id');
      var note = X.store.getAll().find(function (n) { return n.id === id; });
      var act = b.getAttribute('data-act');
      if (act === 'del') { if (confirm(T('删除这篇收藏？','Delete this saved note?'))) { X.store.remove(id); renderLibrary(); scheduleSync(); } }
      else if (act === 'copy-lib') { copyText(noteToMarkdown(note)); }
      else if (act === 'open') { if (note && note.url) window.open(note.url, '_blank', 'noreferrer'); }
      else if (act === 'arch') { X.store.archive([id]); selectedIds.delete(id); renderLibrary(); updateSelBar(); scheduleSync(); }
      else if (act === 'unarch') { X.store.unarchive([id]); renderLibrary(); scheduleSync(); }
      else if (act === 'fiximg') {
        b.disabled = true;
        fixNoteImages(id).then(function (r) {
          renderLibrary(); scheduleSync();
          setStatus(r.ok ? T('已归档 ','Archived ') + r.ok + T(' 张图片 ✓',' images ✓') + (r.fail ? T('，','; ') + r.fail + T(' 张失败',' failed') : '')
                         : T('没有归档成功的图片（原帖可能已删除或需登录）','No images archived (post deleted or login required)'), r.ok ? 'ok' : 'err');
        }).catch(function (e) { if (e.message !== 'no token') setStatus(T('修复失败：','Fix failed: ') + e.message, 'err'); })
          .finally(function () { b.disabled = false; });
      }
    });
    els.fixAllBtn.addEventListener('click', fixAllImages);

    els.exportJson.addEventListener('click', function () {
      download('xhs-notes.json', JSON.stringify(X.store.getAll(), null, 2), 'application/json');
    });
    els.exportMd.addEventListener('click', function () {
      download('xhs-notes.md', X.store.getAll().map(noteToMarkdown).join('\n\n---\n\n'), 'text/markdown');
    });
    els.clearAll.addEventListener('click', function () {
      if (confirm(T('清空收藏库？连接云同步时本地与云端都会删除，不可恢复。','Clear the whole library? When cloud sync is on, both local and cloud copies are deleted, irreversibly.'))) { X.store.clear(); renderLibrary(); scheduleSync(); }
    });
    els.archToggle.addEventListener('click', function () { viewArchived = !viewArchived; activeFilter = 'all'; selectedIds.clear(); renderLibrary(); updateSelBar(); });

    els.settingsBtn.addEventListener('click', toggleSettings);
    els.syncStatus.addEventListener('click', toggleSettings);
    els.syncBtn.addEventListener('click', doSync);
    els.saveTokenBtn.addEventListener('click', onSaveToken);
    els.tokenInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') onSaveToken(); });

    els.libList.addEventListener('change', function (e) {
      var cb = e.target.closest('input.selbox'); if (!cb) return;
      var id = cb.getAttribute('data-id');
      if (cb.checked) selectedIds.add(id); else selectedIds.delete(id);
      var art = cb.closest('.note'); if (art) art.classList.toggle('is-sel', cb.checked);
      updateSelBar();
    });
    els.consolidateBtn.addEventListener('click', function () { runConsolidate(null); });
    els.addToComp.addEventListener('change', function () {
      var id = els.addToComp.value; els.addToComp.value = '';
      if (!id) return;
      var comp = X.store.getComps().find(function (c) { return c.id === id; });
      if (comp) runConsolidate(comp);
    });
    els.clearSel.addEventListener('click', function () { selectedIds.clear(); renderLibrary(); updateSelBar(); });
    els.compList.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cact]'); if (!b) return;
      var id = b.getAttribute('data-id');
      var act = b.getAttribute('data-cact');
      var comp = X.store.getComps().find(function (c) { return c.id === id; });
      if (act === 'copy') { if (comp) copyText(compToMarkdown(comp)); }
      else if (act === 'del') { if (confirm(T('删除这篇合集？','Delete this compilation?'))) { X.store.removeComp(id); renderComps(); updateSelBar(); scheduleSync(); } }
    });
    els.saveAiBtn.addEventListener('click', onSaveAI);
    if (els.langBtn) els.langBtn.addEventListener('click', X.i18n.toggleLang);
  }

  // ---------- 🎬 抓视频（本地后端 + AI 判图） ----------
  async function refreshFetchStatus(){
    if (!els.fetchStatus) return;
    var ok = await X.fetchsvc.health();
    els.fetchStatus.className = 'dot ' + (ok ? 'dot--on' : 'dot--off');
    els.fetchStatus.title = ok ? T('本地服务在线','Local service online') : T('本地服务未启动','Local service offline');
  }
  async function onFetchVideo(){
    var url = (els.videoInput.value || '').trim();
    if (!url) { setStatus(T('粘一条视频链接','Paste a video link'), 'err'); return; }
    if (!(await X.fetchsvc.health())) {
      refreshFetchStatus();
      setStatus(T('连不上本地抓取服务 — 先启动菜单栏小程序，并在 ⚙️ 里填口令','Local fetch service unreachable — start the menu-bar app and set the token in ⚙️'), 'err');
      return;
    }
    els.fetchVideoBtn.disabled = true;
    try {
      var res = await X.fetchsvc.fetchVideo(url, function (line) { setStatus(line, 'loading'); });
      var note = res.note || {}, frames = res.frames || [];
      var kept = [];
      if (frames.length) {
        setStatus(T('AI 判断截图有没有用…','AI judging which screenshots are useful…'), 'loading');
        var idx = await X.ai.judgeFrames(frames);
        kept = idx.map(function (i) { return frames[i]; });
      }
      var imagesRepo = [];
      if (kept.length && X.images.ready()) {
        setStatus(T('存截图…','Saving screenshots…'), 'loading');
        try { imagesRepo = await X.images.saveFrames(note.key || ('v' + Date.now()), kept); } catch (e) {}
      }
      note.platform = note.platform || (/bilibili\.com|\/video\/BV/i.test(note.url || '') ? 'bili' : 'xhs');
      note.isVideo = true;
      note.imagesRepo = imagesRepo;
      note.images = imagesRepo.map(function () { return note.cover || ''; });
      delete note.key;
      showResult(note);
      setStatus(T('抓取完成 — 转写 ' + ((note.transcript || '').length) + ' 字，有用截图 ' + kept.length + ' 张。点「★ 收藏」入库。',
        'Done — ' + ((note.transcript || '').length) + ' transcript chars, ' + kept.length + ' useful screenshots. Click Save.'), 'ok');
      els.videoInput.value = '';
    } catch (e) {
      setStatus(T('抓取失败：','Fetch failed: ') + e.message, 'err');
    } finally { els.fetchVideoBtn.disabled = false; }
  }

  function init(){
    ['status','result','urlInput','fetchBtn','manualText','manualImages','parseManualBtn',
     'catFilter','platFilter','search','libList','libCount','exportJson','exportMd','clearAll',
     'syncStatus','syncBtn','settingsBtn','settingsPanel','tokenInput','saveTokenBtn','settingsStatus','repoLabel',
     'selBar','selCount','consolidateBtn','addToComp','clearSel','compsCard','compCount','compList',
     'aiKeyInput','aiModel','saveAiBtn','aiStatus','archToggle','archCount','langBtn','fixAllBtn','includeImgs',
     'videoInput','fetchVideoBtn','fetchStatus','fetchTokenInput','saveFetchTokenBtn','testFetchBtn','fetchTokenStatus'
    ].forEach(function (id) { els[id] = document.getElementById(id); });
    X.i18n.applyStatic();
    bind();
    renderLibrary();
    renderComps();
    updateAIUI();
    setStatus('');
    updateSyncUI();
    if (X.sync && X.sync.isConfigured()) doSync();   // 进入页面即拉取云端，多设备同步
  }

  // 供 i18n.toggleLang 在切换语言后重渲染所有动态内容
  X.app = { rerender: function () { renderLibrary(); renderComps(); updateSelBar(); updateAIUI(); updateSyncUI(); if (currentNote) showResult(currentNote); } };

  document.addEventListener('DOMContentLoaded', init);
})(window.XHS);
