/* UI logic: fetch → show → classify → save / export / cloud sync */
window.XHS = window.XHS || {};
(function (X) {
  'use strict';
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var T = X.i18n.T;   // bilingual T(zh, en)

  var els = {};
  var currentNote = null;   // the note just organised, not yet saved
  var activeFilter = 'all';
  var activePlatform = 'all';    // platform filter: all / xhs / bili
  var activeType = 'all';        // type filter: all / post / video
  var selectedIds = new Set();   // notes ticked for "AI consolidate"
  var viewArchived = false;      // archive view: consolidated source notes land here automatically
  var viewCompArchived = false;  // compilation archive view (separate from the note archive)
  var editingCompId = null;      // compilation currently being edited by hand
  var readingCompId = null;      // compilation open in the reading view
  var readOpener = null;         // the button that opened it, to give the keyboard back to on close

  /* Runtime class names are spelled out in full rather than assembled from a prefix and a variable — a name built as
     'status--' + type is invisible to check-css.mjs, and the rules for all three states were once lost that way. */
  var STATUS_CLASS = { ok: 'status status--ok', err: 'status status--err', loading: 'status status--loading' };
  var SYNC_CLASS = { ok: 'sync-pill is-ok', err: 'sync-pill is-err', syncing: 'sync-pill is-syncing' };
  var DOT_CLASS = { on: 'dot dot--on', off: 'dot dot--off' };

  function setStatus(msg, type){
    els.status.textContent = msg || '';
    els.status.className = STATUS_CLASS[type] || 'status';
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
      ? '<span class="badge badge--plat badge--bili">' + T('B站','Bilibili') + '</span>'
      : '<span class="badge badge--plat badge--xhs">' + T('小红书','XHS') + '</span>';
  }
  function typeBadge(note){
    if (!isVideo(note)) return '<span class="badge badge--soft">' + T('图文','Post') + '</span>';
    var d = note.durationText || fmtDur(note.duration);
    return '<span class="badge badge--soft">' + T('视频','Video') + (d ? ' ' + esc(d) : '') + '</span>';
  }
  /* Card actions are icons; each one's name shows as a tooltip on hover, on keyboard focus and on a long press, and is
     the button's accessible name. The primary action on a card (Read, or Restore in the archive) keeps its word.
     Drawn like the family's gear: 24-unit grid, 2px stroke in the text colour, round caps and joins. */
  var ICON_PATH = {
    copy:    '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    open:    '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>',
    edit:    '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    reorg:   '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>',
    fix:     '<path d="M14.5 5.5a4 4 0 0 0-5 5L4 16v4h4l5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-3-3z"/>',
    del:     '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12"/><path d="M9 7V4h6v3"/>'
  };
  function iconBtn(attrs, zh, en, icon, danger){
    var name = T(zh, en);
    return '<button class="btn ' + (danger ? 'btn--danger' : 'btn--ghost') + ' btn-icon" ' + attrs + ' aria-label="' + esc(name) + '" data-tip="' + esc(name) + '">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      ICON_PATH[icon] + '</svg></button>';
  }
  function renderTranscript(note){
    var t = note.transcript || ''; if (!t) return '';
    return '<details class="note__ts"><summary>' + T('语音转写','Transcript') + ' · ' + t.length + T(' 字',' chars') +
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
        // archived: prefer the repo copy (hydrate fills the blob URL asynchronously), original link as fallback
        items.push('<a target="_blank" rel="noreferrer"><img data-repo="' + esc(rp) + '"' +
          (u ? ' data-orig="' + esc(u) + '"' : '') + ' loading="lazy" alt=""></a>');
      } else if (u) {
        // not archived: direct (no-referrer) → on failure the weserv proxy → then an "expired" placeholder
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
    if (note.platform !== 'bili' && !vid) {          // secondary categories from classify, XHS posts only
      var cls = X.classify(note);
      secondary = cls.ranked.slice(note.category ? 0 : 1, 3)
        .filter(function (c) { return c.name !== cat.name; })
        .map(function (c) { return '<span class="badge badge--soft">' + esc(X.catLabel(c.name)) + '</span>'; })
        .join('');
    }
    var sel = opts.selectable
      ? '<label class="note__sel"><input type="checkbox" class="selbox" data-id="' + note.id + '"' + (opts.selected ? ' checked' : '') + '> ' + T('选入合集','Add to compilation') + '</label>'
      : '';
    // Folded by default (badges + title + one-line peek); click the title/arrow to expand — so a card
    // doesn't fill the screen and the next one isn't half a scroll away
    var peek = esc(String(note.body || note.transcript || '').replace(/\s+/g, ' ').trim().slice(0, 70));
    var nImg = Math.max((note.images || []).length, (note.imagesRepo || []).length);
    var meta = [];
    if (nImg) meta.push(nImg + T(' 张图', nImg === 1 ? ' image' : ' images'));
    if (note.transcript) meta.push(T('转写 ', 'transcript ') + note.transcript.length + T(' 字', ' ch'));
    return '' +
      '<article class="card note' + (opts.expanded ? '' : ' is-fold') + (opts.selected ? ' is-sel' : '') + '">' + sel +
        '<div class="note__head">' +
          platBadge(note) +
          '<span class="badge">' + esc(X.catLabel(cat.name)) + '</span>' +
          typeBadge(note) + secondary +
          (meta.length ? '<span class="src">' + meta.join(' · ') + '</span>' : '') +
          '<button class="note__fold" data-fold title="' + T('展开 / 收起','Expand / collapse') + '">▾</button>' +
        '</div>' +
        '<h3 class="note__title" data-fold>' + esc(note.title || T('未命名','Untitled')) + '</h3>' +
        (note.author ? '<div class="note__author">@' + esc(note.author) + '</div>' : '') +
        (peek ? '<div class="note__peek" data-fold>' + peek + '…</div>' : '') +
        '<div class="note__more">' +
          renderTags(note.tags) +
          (note.body ? '<pre class="note__body">' + esc(note.body) + '</pre>' : '') +
          renderTranscript(note) +
          renderImages(note) +
          (note.url ? '<a class="note__link" href="' + esc(note.url) + '" target="_blank" rel="noreferrer">' + T('查看原文 ↗','View original ↗') + '</a>' : '') +
        '</div>' +
        '<div class="note__actions">' + actionsHtml + '</div>' +
      '</article>';
  }

  function showResult(note){
    currentNote = note;
    els.result.innerHTML = noteCardHtml(note,
      '<button class="btn btn--primary" data-act="save">' + T('★ 收藏到本地库','★ Save to library') + '</button>' +
      '<button class="btn" data-act="copy">' + T('复制为 Markdown','Copy as Markdown') + '</button>',
      { expanded: true });
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

  function seedSamples(){
    ((X.samples && X.samples.NOTES) || []).forEach(function (s) {
      var rec = Object.assign({ source: 'sample', url: '', images: [] }, s);
      if (!rec.category) { var cls = X.classify(rec); rec.category = cls.primary.name; rec.categoryEmoji = cls.primary.emoji; }
      X.store.save(rec);
    });
    renderLibrary();
    setStatus(T('已载入 3 篇示例笔记（可随时删除）','Loaded 3 sample notes (delete them any time)'), 'ok');
  }

  /* ?demo=1 on an empty library: the three sample notes, and the compilation they were consolidated into if this
     checkout carries one. That file is written by make-demo-compilation.mjs, which costs one API call, so a fork
     may well not have it — and the library on its own is still a complete demo. */
  function seedDemo(){
    if (X.store.getAll().length) return;
    seedSamples();
    if (X.store.getComps().length) return;
    /* One cached compilation per language: the model answers in the language the interface was in when the run was
       made, so a reader in English gets the English one. Falling back the other way is better than showing nothing —
       a compilation in the other language still shows what the reading view is — and the view prints the language
       and date the file records, so it is never passed off as something it is not. */
    var want = X.i18n.lang === 'zh' ? ['demo/compilation.zh.json', 'demo/compilation.json']
                                    : ['demo/compilation.json', 'demo/compilation.zh.json'];
    (function attempt(i){
      if (i >= want.length) return;
      fetch(want[i], { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (c) {
          if (!c || !Array.isArray(c.sections)) return attempt(i + 1);
          X.store.saveComp(c);
          renderComps();
        })
        .catch(function () { attempt(i + 1); });
    })(0);
  }

  // ---------- Library ----------
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

  // Platform + type filter groups (rendered into #platFilter)
  function ptChip(dim, val, zh, en, count, active){
    return '<button class="chip' + (active ? ' chip--on' : '') + '" data-dim="' + dim + '" data-val="' + val + '">' + T(zh, en) + ' ' + count + '</button>';
  }
  function buildPlatType(base){
    if (!els.platFilter) return;
    var xhsN = base.filter(function (n) { return (n.platform || 'xhs') !== 'bili'; }).length;
    var biliN = base.filter(function (n) { return n.platform === 'bili'; }).length;
    var vidN = base.filter(isVideo).length, postN = base.length - vidN;
    var h = ptChip('plat', 'all', '全部', 'All', base.length, activePlatform === 'all');
    if (xhsN) h += ptChip('plat', 'xhs', '小红书', 'XHS', xhsN, activePlatform === 'xhs');
    if (biliN) h += ptChip('plat', 'bili', 'B站', 'Bilibili', biliN, activePlatform === 'bili');
    h += '<span class="chips__sep"></span>';
    h += ptChip('type', 'all', '全部', 'All', base.length, activeType === 'all');
    if (postN) h += ptChip('type', 'post', '图文', 'Posts', postN, activeType === 'post');
    if (vidN) h += ptChip('type', 'video', '视频', 'Videos', vidN, activeType === 'video');
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
    els.libCount.textContent = list.length + ' / ' + ptBase.length + T(' 篇', ptBase.length === 1 ? ' note' : ' notes') + (viewArchived ? T('（已归档）',' (archived)') : '');
    if (!base.length) {
      els.libList.innerHTML = '<p class="empty">' + (viewArchived
        ? T('还没有已归档的笔记。整理成合集后，作为素材的笔记会自动归档到这里。','No archived notes yet. After you consolidate, the source notes are auto-archived here.')
        : T('还没有收藏。整理一篇笔记后点「收藏到本地库」。','No saved notes yet. Organize a note, then click "Save to library".') +
          '<br><button class="btn btn--primary" data-act="demo">' + T('载入示例笔记','Load sample notes') + '</button>') + '</p>';
      return;
    }
    if (!list.length) { els.libList.innerHTML = '<p class="empty">' + T('没有匹配的笔记。','No matching notes.') + '</p>'; return; }
    els.libList.innerHTML = list.map(function (n) {
      var needFix = (n.images || []).length > (n.imagesRepo || []).filter(Boolean).length;
      var fixBtn = needFix ? iconBtn('data-act="fiximg" data-id="' + n.id + '"', '修复图片', 'Fix images', 'fix') : '';
      var actions = viewArchived
        ? iconBtn('data-act="copy-lib" data-id="' + n.id + '"', '复制 MD', 'Copy MD', 'copy') +
          iconBtn('data-act="open" data-id="' + n.id + '"', '原文', 'Original', 'open') + fixBtn +
          '<button class="btn btn--primary" data-act="unarch" data-id="' + n.id + '">' + T('↩︎ 取出','↩︎ Restore') + '</button>' +
          iconBtn('data-act="del" data-id="' + n.id + '"', '删除', 'Delete', 'del', true)
        : iconBtn('data-act="copy-lib" data-id="' + n.id + '"', '复制 MD', 'Copy MD', 'copy') +
          iconBtn('data-act="open" data-id="' + n.id + '"', '原文', 'Original', 'open') + fixBtn +
          iconBtn('data-act="arch" data-id="' + n.id + '"', '归档', 'Archive', 'archive') +
          iconBtn('data-act="del" data-id="' + n.id + '"', '删除', 'Delete', 'del', true);
      return noteCardHtml(n, actions, { selectable: !viewArchived, selected: selectedIds.has(n.id) });
    }).join('');
    X.images.hydrate(els.libList);
  }

  // ---------- Image repair (re-fetch the post for fresh links → archive into the private repo) ----------
  async function fixNoteImages(id, quiet){
    var note = X.store.getAll().find(function (n) { return n.id === id; });
    if (!note) return { ok: 0, fail: 0 };
    if (!X.images.ready()) {
      setStatus(T('请先在「连接设置」里连接 GitHub（归档图片需要令牌）','Connect GitHub under Connections first (archiving needs a token)'), 'err');
      throw new Error('no token');
    }
    // Links expired and the post URL is known → re-fetch for freshly signed links first
    var expired = (note.images || []).some(X.images.isExpired);
    if (note.url && (expired || !(note.images || []).length)) {
      try {
        var fresh = await X.fetchNote(note.url);
        if (fresh.images && fresh.images.length) {
          note = Object.assign({}, note, { images: fresh.images, imagesRepo: (note.imagesRepo || []).slice(0, fresh.images.length) });
        }
      } catch (e) { /* re-fetch failed: archive whatever links we have, best-effort */ }
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
    if (!X.images.ready()) { setStatus(T('请先在「连接设置」里连接 GitHub（归档图片需要令牌）','Connect GitHub under Connections first (archiving needs a token)'), 'err'); return; }
    els.fixAllBtn.disabled = true;
    var ok = 0, fail = 0;
    try {
      for (var i = 0; i < todo.length; i++) {
        setStatus(T('修复中 ','Fixing ') + (i + 1) + '/' + todo.length + T('：', ': ') + (todo[i].title || '').slice(0, 24) + '…', 'loading');
        try { var r = await fixNoteImages(todo[i].id, true); ok += r.ok; fail += r.fail; }
        catch (e) { if (e.message === 'no token') return; fail++; }
        await new Promise(function (res) { setTimeout(res, 400); });   // throttle: be kind to the proxy and the API
      }
      renderLibrary();
      scheduleSync();
      setStatus(T('修复完成：归档 ','Done: archived ') + ok + T(' 张','') + (fail ? T('，','; ') + fail + T(' 张失败（原帖可能已删除或需登录）',' failed (post deleted or login required)') : ' ✓'), fail ? 'err' : 'ok');
    } finally { els.fixAllBtn.disabled = false; }
  }

  // ---------- Multi-select → AI consolidation ----------
  function updateSelBar(){
    var n = selectedIds.size;
    els.selBar.style.display = n ? 'flex' : 'none';
    if (!n) return;
    els.selCount.textContent = T('已选 ','Selected ') + n + T(' 篇', n === 1 ? ' note' : ' notes');
    var comps = X.store.getComps();
    els.addToComp.innerHTML = '<option value="">' + T('加入已有合集…','Add to an existing compilation…') + '</option>' +
      comps.map(function (c) { return '<option value="' + c.id + '">' + esc(c.title || T('未命名合集','Untitled compilation')) + '</option>'; }).join('');
  }

  async function runConsolidate(existingComp, reorgOnly){
    if (!X.ai || !X.ai.isReady()){
      setStatus(T('请先在「连接设置」里填入 Anthropic API 令牌','Enter your Anthropic API key under Connections first'), 'err');
      els.settingsPanel.style.display = 'block';
      els.settingsPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    var notes = reorgOnly ? [] : X.store.getAll().filter(function (n) { return selectedIds.has(n.id); });
    if (!notes.length && !existingComp){ setStatus(T('请先勾选笔记','Select some notes first'), 'err'); return; }
    els.consolidateBtn.disabled = true; els.addToComp.disabled = true;
    setStatus(reorgOnly ? T('AI 再整理中…（去重合并、剔除无效信息，请勿关闭页面）','Re-organizing… (dedupe & clean, keep this page open)') : T('AI 整理中…（约 10–30 秒，请勿关闭页面）','AI consolidating… (~10–30s, keep this page open)'), 'loading');
    try {
      var posts = notes.map(function (n) { return { title: n.title, body: n.body, tags: n.tags, url: n.url, transcript: n.transcript, platform: n.platform, isVideo: isVideo(n) }; });
      // Optional: analyse images too — attach every image of the selected notes (the Claude API allows 100 per request; beyond that we truncate and say so)
      var imgMap = {};   // "2-3" → {repo,url}: images are numbered for the AI, which names the ones worth keeping via keep_images
      if (els.includeImgs && els.includeImgs.checked) {
        var MAXI = 100, total = 0, skippedCap = 0, skippedDead = 0;
        for (var pi = 0; pi < notes.length; pi++) {
          var n = notes[pi], blocks = [];
          var repo = n.imagesRepo || [], imgs = n.images || [];
          for (var ii = 0; ii < Math.max(repo.length, imgs.length); ii++) {
            if (total >= MAXI) { skippedCap++; continue; }
            var label = (pi + 1) + '-' + (ii + 1);
            if (repo[ii]) {
              try {
                setStatus(T('打包图片 ', 'Packing image ') + (total + 1) + '…', 'loading');
                var b64 = await X.images.repoImageB64(repo[ii]);
                var cap = await X.images.capB64(b64, 'image/webp', 1568);
                blocks.push({ type: 'text', text: '[image ' + label + ']' });
                blocks.push({ type: 'image', source: { type: 'base64', media_type: cap.media_type, data: cap.data } });
                imgMap[label] = { repo: repo[ii], url: imgs[ii] || '' };
                total++;
              } catch (e) { skippedDead++; }
            } else if (imgs[ii] && !X.images.isExpired(imgs[ii])) {
              blocks.push({ type: 'text', text: '[image ' + label + ']' });
              blocks.push({ type: 'image', source: { type: 'url', url: X.images.visionUrl(imgs[ii]) } });
              imgMap[label] = { repo: null, url: imgs[ii] };
              total++;
            } else if (imgs[ii]) { skippedDead++; }
          }
          if (blocks.length) posts[pi].imgs = blocks;
        }
        var warn = [];
        if (skippedCap) warn.push(T('超过 100 张上限，' + skippedCap + ' 张未送入', skippedCap + ' over the 100-image cap'));
        if (skippedDead) warn.push(T(skippedDead + ' 张已过期且未归档（可先点「修复全部图片」）', skippedDead + ' expired & unarchived (run "Fix all images" first)'));
        setStatus(T('AI 整理中（含 ' + total + ' 张图，图多时需 1–3 分钟）…', 'AI consolidating (' + total + ' images — may take 1–3 min)…') + (warn.length ? ' · ' + warn.join(T('；', '; ')) : ''), 'loading');
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
      // Keep the necessary images: the AI names (via keep_images) the ones text can't replace; merge with the compilation's existing images, de-duplicated
      var seenI = {}, cImgs = [], cRepo = [];
      var addImg = function (u, r) { var k = r || u; if (!k || seenI[k]) return; seenI[k] = 1; cImgs.push(u || ''); cRepo.push(r || null); };
      var prevI = (existingComp && existingComp.images) || [], prevR = (existingComp && existingComp.imagesRepo) || [];
      for (var qi = 0; qi < Math.max(prevI.length, prevR.length); qi++) addImg(prevI[qi], prevR[qi]);
      (res.keep_images || []).forEach(function (lb) { var m = imgMap[String(lb)]; if (m) addImg(m.url, m.repo); });
      var comp = {
        id: existingComp ? existingComp.id : undefined,
        title: res.title, topic: res.topic, summary: res.summary, sections: sections,
        images: cImgs, imagesRepo: cRepo,
        archived: existingComp ? !!existingComp.archived : false,
        sourceNoteIds: Array.from(new Set(prevIds.concat(notes.map(function (n) { return n.id; })))),
        sourceUrls: Array.from(new Set(prevUrls.concat(notes.map(function (n) { return n.url; }).filter(Boolean)))),
        model: X.ai.getConfig().model
      };
      X.store.saveComp(comp);
      X.store.archive(notes.map(function (n) { return n.id; }));   // consolidated source notes are archived automatically
      selectedIds.clear();
      renderLibrary(); renderComps(); updateSelBar();
      setStatus(notes.length ? T('整理完成 ✓ 已存入合集，原笔记已自动归档','Done ✓ Saved to a compilation; source notes auto-archived') : T('再整理完成 ✓ 合集已更新（去重合并、清理无效信息）','Re-organized ✓ Compilation updated'), 'ok');
      scheduleSync();
      els.compsCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      setStatus(T('AI 整理失败：','AI consolidation failed: ') + e.message, 'err');
    } finally {
      els.consolidateBtn.disabled = false; els.addToComp.disabled = false;
    }
  }

  // ---------- Compilation rendering ----------
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
    var nSrc = X.refs.bind(c).sources.length;
    var meta = '<span class="badge badge--clip"' + (c.topic ? ' title="' + esc(c.topic) + '"' : '') +
        '><span>' + esc(c.topic || T('合集','Compilation')) + '</span></span>' +
      (c.model ? '<span class="badge badge--soft">' + esc(String(c.model).replace('claude-', '')) + '</span>' : '') +
      /* The same count the reading view shows, from the same place: js/refs.js binds the sources a compilation
         actually cites. Counting c.sourceUrls instead made the shipped demo say "0 sources" on a card whose
         three sections each cite one — that field only carries notes that had a link, and a pasted note has none. */
      '<span class="src">' + nSrc + T(' 篇来源', nSrc === 1 ? ' source' : ' sources') + '</span>';
    var secs = (c.sections || []).map(function (s) {
      var src = (s.sources && s.sources.length)
        ? '<div class="comp__src">' + s.sources.map(function (x) {
            return x.url ? '<a href="' + esc(x.url) + '" target="_blank" rel="noreferrer">' + esc(x.title || T('链接','link')) + ' ↗</a>'
                         : '<a>' + esc(x.title || '') + '</a>';
          }).join('') + '</div>'
        : '';
      return '<div class="comp__sec"><h4>' + esc(s.heading) + '</h4><div class="body">' + esc(s.content) + '</div>' + src + '</div>';
    }).join('');
    var arch = viewCompArchived
      ? '<button class="btn btn--primary" data-cact="unarch" data-id="' + c.id + '">' + T('↩︎ 取出','↩︎ Restore') + '</button>'
      : iconBtn('data-cact="arch" data-id="' + c.id + '"', '归档', 'Archive', 'archive');
    return '<article class="card comp is-fold">' +
      '<div class="comp__meta">' + meta +
        '<button class="note__fold" data-fold title="' + T('展开 / 收起','Expand / collapse') + '">▾</button>' +
      '</div>' +
      '<h3 class="comp__title" data-fold>' + esc(c.title || T('未命名合集','Untitled compilation')) + '</h3>' +
      (c.summary ? '<div class="comp__summary">' + esc(c.summary) + '</div>' : '') +
      '<div class="comp__more">' + secs + renderImages(c) + '</div>' +
      '<div class="note__actions">' +
        '<button class="btn btn--primary" data-cact="read" data-id="' + c.id + '">' + T('阅读','Read') + '</button>' +
        iconBtn('data-cact="reorg" data-id="' + c.id + '"', '重新整理', 'Re-organize', 'reorg') +
        iconBtn('data-cact="edit" data-id="' + c.id + '"', '编辑', 'Edit', 'edit') +
        iconBtn('data-cact="copy" data-id="' + c.id + '"', '复制 MD', 'Copy MD', 'copy') +
        arch +
        iconBtn('data-cact="del" data-id="' + c.id + '"', '删除', 'Delete', 'del', true) +
      '</div></article>';
  }

  // Manual compilation editing: title / summary / each section's heading and body
  function compEditHtml(c){
    var secs = (c.sections || []).map(function (s, i) {
      return '<div class="comp__sec">' +
        '<input class="comp__ed-h" data-i="' + i + '" value="' + esc(s.heading || '') + '" placeholder="' + T('板块标题','Section heading') + '">' +
        '<textarea class="comp__ed-c" data-i="' + i + '" rows="8">' + esc(s.content || '') + '</textarea></div>';
    }).join('');
    return '<article class="card comp is-editing">' +
      '<div class="comp__meta"><span class="badge">' + T('编辑中','Editing') + '</span></div>' +
      '<input class="comp__ed-title" value="' + esc(c.title || '') + '" placeholder="' + T('合集标题','Compilation title') + '">' +
      '<textarea class="comp__ed-sum" rows="2" placeholder="' + T('一句话概括','One-line summary') + '">' + esc(c.summary || '') + '</textarea>' +
      secs +
      '<div class="note__actions">' +
        '<button class="btn btn--primary" data-cact="save-edit" data-id="' + c.id + '">' + T('保存','Save') + '</button>' +
        '<button class="btn btn--ghost" data-cact="cancel-edit" data-id="' + c.id + '">' + T('取消','Cancel') + '</button>' +
      '</div></article>';
  }
  /* ---------- Reading view ----------
     A compilation is a piece of writing, and the card grid is a filing cabinet: four folded cards to a row, actions
     under each. So reading happens in its own surface — a modal dialog over the library, with the sections in reading
     order down the middle, a table of contents beside them, and one numbered list of everything the piece was made
     from. js/refs.js builds that list: the numbers under each section point into it. */
  function compById(id){
    return X.store.getComps().find(function (c) { return c.id === id; }) || null;
  }
  function reduceMotion(){
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function readCitesHtml(refs){
    if (!refs.length) return '';
    return '<p class="read__cites">' + T('来源','From') + ' ' + refs.map(function (n) {
      return '<a href="#read-src-' + n + '" data-read="src" data-n="' + n + '">[' + n + ']</a>';
    }).join(' ') + '</p>';
  }

  function compReadHtml(c){
    var b = X.refs.bind(c);
    var secs = b.sections.map(function (s, i) {
      return '<section class="read__sec" id="read-sec-' + (i + 1) + '">' +
        '<h2 tabindex="-1">' + esc(s.heading || T('无标题板块','Untitled section')) + '</h2>' +
        '<div class="read__text">' + esc(s.content) + '</div>' +
        readCitesHtml(s.refs) + '</section>';
    }).join('');
    var toc = b.sections.map(function (s, i) {
      return '<li><span class="read__n">' + (i + 1) + '</span>' +
        '<a href="#read-sec-' + (i + 1) + '" data-read="jump" data-i="' + (i + 1) + '">' +
        esc(s.heading || T('无标题板块','Untitled section')) + '</a></li>';
    }).join('');
    var sources = b.sources.map(function (x) {
      var text = esc(X.refs.label(x));
      return '<li id="read-src-' + x.n + '"' + (x.cited ? '' : ' class="is-uncited"') + '>' +
        '<span class="read__n">' + x.n + '</span>' +
        (x.url ? '<a href="' + esc(x.url) + '" target="_blank" rel="noreferrer">' + text + ' ↗</a>' : '<span>' + text + '</span>') +
        (x.cited ? '' : '<span class="read__tag" title="' +
          T('这篇被并进了正文，但没有哪一节单独标注它。','Folded into the piece, but no section cites it on its own.') + '">' +
          T('未单独引用','uncited') + '</span>') + '</li>';
    }).join('');
    var model = c.model ? '<span class="read__badge">' + esc(String(c.model).replace('claude-', '')) + '</span>' : '';
    /* runAt is when the model wrote this, which is the date worth showing; savedAt is when this browser stored it
       and js/store.js sets it on every save, because the merge rule between two devices is latest-savedAt-wins.
       Showing savedAt made a cached compilation look as though it had been made today, every day — the opposite of
       what the cache was supposed to make visible (found 2026-09-22). */
    var when = (c.runAt || c.savedAt) ? '<span>' + esc(String(c.runAt || c.savedAt).slice(0, 10)) + '</span>' : '';
    /* the language it was written in, when the file says: a compilation can be read in the other language */
    var inLang = c.lang ? '<span class="read__badge">' + esc(c.lang) + '</span>' : '';
    return '<div class="read__bar">' +
        '<button class="btn btn--ghost" data-read="close">' + T('← 回收藏库','← Back to the library') + '</button>' +
        '<span class="read__meta">' + model + inLang + when +
          '<span>' + b.sources.length + T(' 篇来源', b.sources.length === 1 ? ' source' : ' sources') + '</span></span>' +
        '<button class="btn btn--ghost" data-read="copy">' + T('复制 MD','Copy MD') + '</button>' +
      '</div>' +
      '<div class="read__grid">' +
        (toc ? '<nav class="read__toc" aria-label="' + T('板块','Sections') + '">' +
          '<p class="read__aside-h">' + T('板块','Sections') + '</p><ol>' + toc + '</ol></nav>' : '') +
        '<article class="read__body">' +
          '<h1 id="read-title">' + esc(c.title || T('未命名合集','Untitled compilation')) + '</h1>' +
          (c.summary ? '<p class="read__lede">' + esc(c.summary) + '</p>' : '') +
          (secs || '<p class="empty">' + T('这篇合集还没有板块。','This compilation has no sections yet.') + '</p>') +
          renderImages(c) +
        '</article>' +
        (sources ? '<aside class="read__sources" aria-label="' + T('来源','Sources') + '">' +
          '<p class="read__aside-h">' + T('来源','Sources') + '</p><ol>' + sources + '</ol></aside>' : '') +
      '</div>';
  }

  /* Built once, when it opens: while a modal dialog is up the rest of the page is inert, so neither the language
     button nor anything else can change what is under it. `opener` is the button that opened it — a dialog returns
     focus to whatever had it, and a compilation can also be opened from code, where that is the document body. */
  function openRead(id, opener){
    var c = compById(id); if (!c || !els.readDlg) return;
    readingCompId = id;
    readOpener = opener || null;
    els.readDlg.innerHTML = compReadHtml(c);
    if (!els.readDlg.open) els.readDlg.showModal();
    els.readDlg.scrollTop = 0;
    /* The bar is sticky and everything below it is scrolled to a position that has to clear it, so its height is
       measured here rather than written in the stylesheet: it wraps to two rows on a phone and to three when the
       model's name is long, and a number typed into CSS is right only for the case someone happened to look at.
       The stylesheet keeps a value for the frame before this runs. */
    var bar = els.readDlg.querySelector('.read__bar');
    if (bar) els.readDlg.style.setProperty('--read-bar-h', bar.getBoundingClientRect().height + 'px');
    X.images.hydrate(els.readDlg);   // images kept in the compilation are archived in the repo and load asynchronously
  }
  function closeRead(){
    var opener = readOpener;
    readingCompId = null; readOpener = null;
    if (els.readDlg && els.readDlg.open) els.readDlg.close();
    /* Closing puts the keyboard back on the button that opened the view. The browser does this by itself when the
       reader clicked or tabbed to that button; it does not when the view was opened from code, and then focus is
       left inside a dialog that is no longer displayed. */
    if (opener && opener.isConnected) opener.focus();
  }

  /* An in-page link has to take the keyboard with it, or the next Tab carries on from wherever the reader was. */
  function readJump(link, id){
    var target = els.readDlg.querySelector('#' + id);
    if (!target) return;
    /* the heading of a section, the link of a source entry, and the entry itself when it has no link to offer */
    var land = target.querySelector('h2, a') || target;
    if (land.tagName !== 'A' && !land.hasAttribute('tabindex')) land.setAttribute('tabindex', '-1');
    target.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
    land.focus({ preventScroll: true });
    if (link.getAttribute('data-read') === 'jump') {
      els.readDlg.querySelectorAll('.read__toc a[aria-current]').forEach(function (a) { a.removeAttribute('aria-current'); });
      link.setAttribute('aria-current', 'true');
    }
  }

  function renderComps(){
    var all = X.store.getComps();
    var archN = all.filter(function (c) { return c.archived; }).length;
    if (els.compArchCount) els.compArchCount.textContent = archN;
    if (els.compArchToggle) els.compArchToggle.classList.toggle('chip--on', viewCompArchived);
    var comps = all.filter(function (c) { return viewCompArchived ? c.archived : !c.archived; });
    els.compCount.textContent = comps.length
      ? '· ' + comps.length + T(' 篇', comps.length === 1 ? ' item' : ' items') + (viewCompArchived ? T('（已归档）',' (archived)') : '') : '';
    els.compList.innerHTML = comps.length
      ? comps.map(function (c) { return c.id === editingCompId ? compEditHtml(c) : compCardHtml(c); }).join('')
      : '<p class="empty">' + (viewCompArchived
          ? T('没有已归档的合集。','No archived compilations.')
          : T('还没有合集。在收藏库勾选几篇同主题的笔记，点「AI 整理成合集」。','No compilations yet. Tick a few same-topic notes in the library, then click "AI consolidate".')) + '</p>';
    X.images.hydrate(els.compList);   // images kept in compilations (archived in the repo) get blob URLs asynchronously
  }

  // ---------- AI settings ----------
  function updateAIUI(){
    if (!X.ai) return;
    var cfg = X.ai.getConfig();
    if (els.aiModel) {
      els.aiModel.innerHTML = X.ai.MODELS.map(function (m) { return '<option value="' + m.id + '">' + (X.i18n.lang === 'en' ? m.nameEn : m.name) + '</option>'; }).join('');
    }
    if (els.aiModel) els.aiModel.value = cfg.model;
    if (els.aiStatus) els.aiStatus.textContent = X.ai.isReady()
      ? (T('AI 已就绪 · ','AI ready · ') + String(cfg.model).replace('claude-', ''))
      : T('AI 未设置：填入 Anthropic API Key 后即可「整理成合集」','AI not set up: enter your Anthropic API key to enable consolidation');
  }
  function onSaveAI(){
    var key = (els.aiKeyInput.value || '').trim();
    var model = els.aiModel.value;
    X.ai.saveConfig(key || null, model);   // an empty key only updates the model and keeps the stored key
    els.aiKeyInput.value = '';
    updateAIUI();
    els.aiStatus.textContent = X.ai.isReady()
      ? (T('✓ 已保存 · ','✓ Saved · ') + String(model).replace('claude-', ''))
      : T('已保存模型（仍未填令牌，整理功能不可用）','Model saved (still no key; consolidation unavailable)');
  }

  // ---------- Events ----------
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
    if (!currentNote) { setStatus(T('没有待收藏的内容，先抓取或手动录入一条','Nothing to save — fetch or add a note first'), 'err'); return; }
    var cls = X.classify(currentNote);
    var rec;
    /* ⚠️ A failed save must be visible. There was no try here before: once local storage was full
       it threw, the function died before showing "Saved ★", and the user saw a button that did nothing. */
    try {
      rec = X.store.save(Object.assign({}, currentNote, {
        category: cls.primary.name, categoryEmoji: cls.primary.emoji
      }));
    } catch (e) {
      // A video fetch takes minutes and the content is still in the result box above — don't let it look lost
      setStatus(T('收藏失败：','Save failed: ') + (e && e.message ? e.message : e) +
                T('｜这条还在上面，腾出空间后再点一次就能存。','｜The note is still shown above — free some space and click again.'), 'err');
      return;
    }
    setStatus(T('已收藏 ★','Saved ★'), 'ok');
    renderLibrary();
    scheduleSync();
    // Archive images in the background right after saving (links are signed and expire; the sooner they're in your repo, the safer)
    if ((rec.images || []).length && X.images.ready()) {
      X.images.archiveNote(rec).then(function (res) {
        if (!res.ok && !res.fail) return;
        X.store.update(rec.id, { imagesRepo: res.repo });
        renderLibrary();
        scheduleSync();
        if (res.ok) setStatus(T('已收藏 ★ 图片已永久归档（','Saved ★ Images archived permanently (') + res.ok + '/' + (rec.images || []).length + T('）',')'), 'ok');
      }).catch(function () { /* not connected or failed: "Fix images" can archive any time before the links expire */ });
    }
  }

  // ---------- Cloud sync (silently skipped without a token; works purely locally) ----------
  var syncTimer = null;
  var syncing = false;

  function setSyncStatus(state, text, title){
    if (!els.syncStatus) return;
    els.syncStatus.className = SYNC_CLASS[state] || 'sync-pill';
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
    syncTimer = setTimeout(doSync, 800);   // debounce: a burst of edits triggers one sync
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

    // 🎬 Fetch video
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
        : T('✗ 连不上（菜单栏小程序启动了吗？）','✗ Unreachable (is the toggle app running?)');
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
      if (act === 'demo') { seedSamples(); scheduleSync(); }
      else if (act === 'del') { if (confirm(T('删除这篇收藏？','Delete this saved note?'))) { X.store.remove(id); renderLibrary(); scheduleSync(); } }
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
      if (act === 'read') { openRead(id, b); }
      else if (act === 'copy') { if (comp) copyText(compToMarkdown(comp)); }
      else if (act === 'reorg') { if (comp && confirm(T('对这篇合集再整理一次？会去重合并、剔除无效信息、精炼重排。','Re-organize this compilation? It will dedupe, clean and tighten.'))) runConsolidate(comp, true); }
      else if (act === 'edit') { editingCompId = id; renderComps(); }
      else if (act === 'cancel-edit') { editingCompId = null; renderComps(); }
      else if (act === 'save-edit') {
        var card = b.closest('.comp.is-editing');
        if (card && comp) {
          var val = function (sel) { var el = card.querySelector(sel); return el ? el.value : null; };
          X.store.saveComp(Object.assign({}, comp, {
            title: String(val('.comp__ed-title') != null ? val('.comp__ed-title') : (comp.title || '')).trim(),
            summary: String(val('.comp__ed-sum') || '').trim(),
            sections: (comp.sections || []).map(function (s, i) {
              var h = card.querySelector('.comp__ed-h[data-i="' + i + '"]');
              var cc = card.querySelector('.comp__ed-c[data-i="' + i + '"]');
              return Object.assign({}, s, { heading: h ? h.value.trim() : s.heading, content: cc ? cc.value : s.content });
            })
          }));
          editingCompId = null; renderComps(); scheduleSync();
          setStatus(T('合集已保存 ✓','Compilation saved ✓'), 'ok');
        }
      }
      else if (act === 'arch' || act === 'unarch') {
        if (comp) { X.store.saveComp(Object.assign({}, comp, { archived: act === 'arch' })); renderComps(); scheduleSync(); }
      }
      else if (act === 'del') { if (confirm(T('删除这篇合集？','Delete this compilation?'))) { X.store.removeComp(id); renderComps(); updateSelBar(); scheduleSync(); } }
    });
    /* Esc closes the dialog without going through closeRead(), so the two variables it would have cleared are
       cleared here instead. Best effort on purpose: whether a dialog fires `close` after Esc has turned out to vary
       between browser versions, so nothing depends on this — everything that matters reads dialog.open, and the
       opener is only focused if it is still connected. */
    if (els.readDlg) els.readDlg.addEventListener('close', function () { readingCompId = null; readOpener = null; });

    /* The reading view: close, copy, and the two kinds of in-page link (a section from the contents, a source from a
       section). */
    if (els.readDlg) els.readDlg.addEventListener('click', function (e) {
      var el = e.target.closest('[data-read]'); if (!el) return;
      var act = el.getAttribute('data-read');
      if (act === 'close') { closeRead(); return; }
      if (act === 'copy') { var c = compById(readingCompId); if (c) copyText(compToMarkdown(c)); return; }
      e.preventDefault();
      readJump(el, act === 'jump' ? 'read-sec-' + el.getAttribute('data-i') : 'read-src-' + el.getAttribute('data-n'));
    });

    // Card folding: click the title / arrow to expand or collapse (shared by note and compilation cards)
    document.addEventListener('click', function (e) {
      var f = e.target.closest('[data-fold]'); if (!f) return;
      var card = f.closest('.note, .comp'); if (card) card.classList.toggle('is-fold');
    });
    if (els.jumpComps) els.jumpComps.addEventListener('click', function () { els.compsCard.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    if (els.jumpLib) els.jumpLib.addEventListener('click', function () {
      var c = els.libList.closest('.card') || els.libList; c.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    if (els.compArchToggle) els.compArchToggle.addEventListener('click', function () {
      viewCompArchived = !viewCompArchived; editingCompId = null; renderComps();
    });
    els.saveAiBtn.addEventListener('click', onSaveAI);
    if (els.langBtn) els.langBtn.addEventListener('click', X.i18n.toggleLang);
  }

  // ---------- 🎬 Fetch video (local service + AI frame judging) ----------
  async function refreshFetchStatus(){
    if (!els.fetchStatus) return;
    var ok = await X.fetchsvc.health();
    els.fetchStatus.className = ok ? DOT_CLASS.on : DOT_CLASS.off;
    /* Offline should not read as "a dependency is missing". Running this step locally is a
       design decision: yt-dlp needs the browser's logged-in session, and transcription and
       frame extraction happen on the same machine, so neither the session nor the media
       ever leaves it. Saying so is the difference between "by design" and "unfinished". */
    els.fetchStatus.title = ok
      ? T('本地服务在线','Local service online')
      : T('本地服务未启动。转写和抽帧刻意放在你自己的电脑上跑——登录态和媒体文件都不出本机。启动方法见仓库 local/README.md',
          'Local service not running. Transcription and frame extraction run on your own machine by design — your login session and the media never leave it. See local/README.md to start it.');
  }
  async function onFetchVideo(){
    var url = (els.videoInput.value || '').trim();
    if (!url) { setStatus(T('粘一条视频链接','Paste a video link'), 'err'); return; }
    if (!(await X.fetchsvc.health())) {
      refreshFetchStatus();
      /* The line a first-time visitor is most likely to hit. Phrased as "go install something"
         it reads as unfinished; it should say why this step is local at all, and offer a way
         to see the output without installing anything. */
      setStatus(T('连不上本地抓取服务。转写和抽帧是在你自己的电脑上跑的（登录态和媒体文件不出本机），所以要先起这个服务：见仓库 local/README.md，起好后在「连接设置」里填口令。想先看它产出什么样：清空库后点「载入示例笔记」，里面有一条带完整转写的视频。',
                 'Cannot reach the local fetch service. Transcription and frame extraction run on your own machine by design — your login session and the media never leave it — so this step needs that service: see local/README.md, then paste its token under Connections. Want to see what it produces first? Load the sample notes (empty library) — one of them is a video with a full transcript.'), 'err');
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
      // Save screenshots: don't swallow errors — failures must be visible, and the status reports the number
      // actually saved, not the number the AI picked
      var imagesRepo = [], imgErr = '';
      if (kept.length) {
        if (!X.images.ready()) {
          imgErr = T('未连接 GitHub（在「连接设置」里填令牌）→ 截图没法归档，本次未保存图片',
                     'GitHub not connected (set the token under Connections) → screenshots were not archived');
        } else {
          setStatus(T('存截图 0/' + kept.length + '…','Saving screenshots 0/' + kept.length + '…'), 'loading');
          try {
            imagesRepo = await X.images.saveFrames(note.key || ('v' + Date.now()), kept, function (i, n) {
              setStatus(T('存截图 ' + i + '/' + n + '…','Saving screenshots ' + i + '/' + n + '…'), 'loading');
            });
          } catch (e) {
            imgErr = T('截图归档失败：','Saving screenshots failed: ') + (e && e.message ? e.message : e);
          }
        }
      }
      note.platform = note.platform || (/bilibili\.com|\/video\/BV/i.test(note.url || '') ? 'bili' : 'xhs');
      note.isVideo = true;
      note.imagesRepo = imagesRepo;
      note.images = imagesRepo.map(function () { return note.cover || ''; });
      delete note.key;
      showResult(note);
      var doneMsg = T('抓取完成 — 转写 ' + ((note.transcript || '').length) + ' 字，截图 ' + imagesRepo.length + '/' + kept.length + ' 张已存。点「★ 收藏」入库。',
        'Done — ' + ((note.transcript || '').length) + ' transcript chars, ' + imagesRepo.length + '/' + kept.length + ' screenshots saved. Click Save.');
      setStatus(imgErr ? (doneMsg + ' — ' + imgErr) : doneMsg, imgErr ? 'err' : 'ok');
      els.videoInput.value = '';
    } catch (e) {
      setStatus(T('抓取失败：','Fetch failed: ') + e.message, 'err');
    } finally { els.fetchVideoBtn.disabled = false; }
  }

  /* One tooltip for every [data-tip] control (the icon-only card actions). It is a single fixed layer placed by
     script, so it never pushes the page sideways at 375 and never sits on another button: above the control if there
     is room and nothing is there, otherwise below. It shows on hover after a short delay (so sweeping across a row does
     not flash every name), at once on keyboard focus, and on a long press on touch screens — where a long press shows
     the name instead of running the action; an ordinary tap still runs it. The text is the button's own aria-label,
     so it follows the interface language. */
  function initTips(){
    var tip = document.createElement('div');
    tip.className = 'tip'; tip.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tip);
    /* `via` is why the name is showing, and it decides what a scroll does. A keyboard focus keeps the name and moves it with
       its button: Tab scrolls the page to an off-screen button, and that scroll used to hide the name the moment it
       appeared (a real Tab walk, 2026-09-22). A hover or a long press hides it: the finger or pointer is no longer there. */
    var hoverTimer = null, pressTimer = null, pressClear = null, pressShown = false, current = null, via = null;
    function tipFor(el){ return el && el.closest ? el.closest('[data-tip]') : null; }
    function overlaps(a, b){ return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; }
    function place(btn){
      var r = btn.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight, gap = 6, pad = 8;
      var left = Math.min(Math.max(pad, r.left + r.width / 2 - w / 2), window.innerWidth - w - pad);
      var others = Array.prototype.filter.call(document.querySelectorAll('button, a, input, select'), function (o) { return o !== btn && o.offsetParent; })
        .map(function (o) { return o.getBoundingClientRect(); });
      /* the sticky top bar and the selection bar stay put while the page scrolls: a name drawn over them sits on the same
         dark band and reads as part of the bar (2026-09-23: an icon just under the top bar put its name over the
         "Your data" pill). They are no-go areas like the other controls, and they win over the other controls. */
      var bars = Array.prototype.filter.call(document.querySelectorAll('.topbar, .selbar'), function (b) { return b.offsetParent; })
        .map(function (b) { return b.getBoundingClientRect(); });
      function placeAt(top){ return { left: left, right: left + w, top: top, bottom: top + h }; }
      var above = placeAt(r.top - gap - h), below = placeAt(r.bottom + gap);
      var free = function (box) { return box.top >= pad && box.bottom <= window.innerHeight - pad && !bars.some(function (o) { return overlaps(box, o); }); };
      var clear = function (box) { return free(box) && !others.some(function (o) { return overlaps(box, o); }); };
      var box = clear(above) ? above : clear(below) ? below : free(above) ? above : free(below) ? below : (r.top - gap - h >= pad ? above : below);
      tip.style.left = Math.round(box.left) + 'px'; tip.style.top = Math.round(box.top) + 'px';
    }
    function show(btn, why){
      clearTimeout(hoverTimer);
      if (!btn.isConnected) return;   // re-rendered away while the hover delay ran
      current = btn; via = why;
      tip.textContent = btn.getAttribute('data-tip') || '';
      tip.classList.add('is-on');
      place(btn);
    }
    function hide(){ clearTimeout(hoverTimer); current = null; via = null; tip.classList.remove('is-on'); }
    function keyboardFocus(el){ try { return el.matches(':focus-visible'); } catch (err) { return true; } }
    function follow(){ if (via === 'focus' && current && document.activeElement === current) place(current); else hide(); }
    /* hover means a mouse or a pen. A tap sends pointerover with pointerType "touch" and then a compatibility mouseover,
       so a mouseover listener would name the button after every tap and leave the name on screen */
    document.addEventListener('pointerover', function (e) {
      if (e.pointerType === 'touch') return;
      var b = tipFor(e.target); if (!b || b === current) return;
      clearTimeout(hoverTimer); hoverTimer = setTimeout(function () { show(b, 'hover'); }, 120);
    });
    document.addEventListener('pointerout', function (e) {
      if (e.pointerType === 'touch') return;
      var b = tipFor(e.target); if (!b || b.contains(e.relatedTarget)) return;
      clearTimeout(hoverTimer); if (current === b && via === 'hover') hide();
    });
    /* keyboard focus only: a click or a tap focuses the button too, and :focus-visible is how the browser tells them apart */
    document.addEventListener('focusin', function (e) { var b = tipFor(e.target); if (b && keyboardFocus(b)) show(b, 'focus'); });
    document.addEventListener('focusout', function (e) { var b = tipFor(e.target); if (b && current === b && via === 'focus') hide(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    /* touch: a long press names the button; a tap runs the action and names nothing */
    document.addEventListener('touchstart', function (e) {
      clearTimeout(pressTimer); clearTimeout(pressClear); pressShown = false;
      var b = tipFor(e.target); if (!b) return;
      pressTimer = setTimeout(function () { pressShown = true; show(b, 'press'); }, 450);
    }, { passive: true });
    document.addEventListener('touchmove', function () { clearTimeout(pressTimer); }, { passive: true });
    document.addEventListener('touchend', function () {
      clearTimeout(pressTimer);
      if (!pressShown) return;
      setTimeout(function () { if (via === 'press') hide(); }, 1400);
      /* some browsers send a click when a long press ends (Chrome's touch emulation does) and some do not: the click
         listener below swallows it, and if none comes the flag is dropped rather than left to eat a later click */
      pressClear = setTimeout(function () { pressShown = false; }, 800);
    }, { passive: true });
    /* capture phase: runs before the card's own click handler, so a long press does not also run the action. Any other
       click hides the name: the action ran (it may have re-rendered the card away) or the click was somewhere else. */
    document.addEventListener('click', function (e) {
      if (pressShown && tipFor(e.target)) { e.preventDefault(); e.stopPropagation(); pressShown = false; clearTimeout(pressClear); return; }
      hide();
    }, true);
    X.tips = { show: show, hide: hide, el: tip };   // for the evidence probe
  }

  function init(){
    initTips();
    ['status','result','urlInput','fetchBtn','manualText','manualImages','parseManualBtn',
     'catFilter','platFilter','search','libList','libCount','exportJson','exportMd','clearAll',
     'syncStatus','syncBtn','settingsBtn','settingsPanel','tokenInput','saveTokenBtn','settingsStatus','repoLabel',
     'selBar','selCount','consolidateBtn','addToComp','clearSel','compsCard','compCount','compList',
     'aiKeyInput','aiModel','saveAiBtn','aiStatus','archToggle','archCount','langBtn','fixAllBtn','includeImgs',
     'videoInput','fetchVideoBtn','fetchStatus','fetchTokenInput','saveFetchTokenBtn','testFetchBtn','fetchTokenStatus',
     'jumpComps','jumpLib','compArchToggle','compArchCount','readDlg'
    ].forEach(function (id) { els[id] = document.getElementById(id); });
    X.i18n.applyStatic();
    bind();
    renderLibrary();
    renderComps();
    updateAIUI();
    setStatus('');
    updateSyncUI();
    if (X.sync && X.sync.isConfigured()) doSync();   // pull from the cloud on load: multi-device sync
    if (/[?&]demo=1\b/.test(location.search)) seedDemo();
  }

  // Lets i18n.toggleLang re-render everything dynamic after a language switch
  X.app = { rerender: function () { renderLibrary(); renderComps(); updateSelBar(); updateAIUI(); updateSyncUI(); if (currentNote) showResult(currentNote); } };

  /* Load the local library into memory first (the first run migrates it from localStorage to IndexedDB), then render.
     If the migration fails the app still starts — the store falls back to reading localStorage rather than going blank. */
  document.addEventListener('DOMContentLoaded', function () {
    var before = 0;
    try { for (var i = 0; i < localStorage.length; i++){ var k = localStorage.key(i);
      if (/^xhs_/.test(k)) before += (localStorage.getItem(k) || '').length; } } catch (e) {}
    X.store.init().then(function (r) {
      init();
      if (r && r.migrated) setStatus(T(
        '已把本地收藏库搬到浏览器数据库（腾出约 ' + Math.round(before / 1024) + ' KB）',
        'Moved the local library into IndexedDB (freed ~' + Math.round(before / 1024) + ' KB of localStorage)'), 'ok');
    }).catch(function (e) {
      init();
      setStatus(T('本地库载入异常：','Local library failed to load: ') + (e && e.message ? e.message : e), 'err');
    });
  });
})(window.XHS);
