/* Cover-led library, immediate capture and source-linked guide reader. */
window.XHS = window.XHS || {};
(function (X) {
  'use strict';
  var T = X.i18n.T;
  var els = {};
  var demo = new URLSearchParams(location.search).get('demo') === '1';
  var activePlace = 'saved', activeFilter = 'all', activeTag = '', activePlatform = 'all', activeType = 'all';
  var selectedIds = new Set(), focusedId = null, visibleNotes = [], lastSelectedId = null;
  var readingCompId = null, editingCompId = null, readOpener = null, peekOpener = null;
  var editingRevision = null;
  var binding = false, pendingCaptures = new Set(), toastActions = [], lastUndo = null;
  var bindStartedAt = 0, bindStep = '';
  var noteDrafts = new Map();
  var demoLanguage = '', railCollapsed = false, paneCollapsed = false;
  var renderedLanguage = null, pipelineStages = [];
  var STATUS_CLASS = { ok: 'status status--ok', err: 'status status--err', loading: 'status status--loading' };
  var SYNC_CLASS = { ok: 'sync-pill is-ok', err: 'sync-pill is-err', syncing: 'sync-pill is-syncing' };
  var ICON_PATH = {
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    chevron: '<path d="m8 5 7 7-7 7"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>',
    reorg: '<path d="M20 11a8 8 0 0 0-14-5L4 8m0-4v4h4M4 13a8 8 0 0 0 14 5l2-2m0 4v-4h-4"/>',
    fix: '<path d="M14.5 5.5a4 4 0 0 0-5 5L4 16v4h4l5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-3-3z"/>',
    del: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    back: '<path d="m10 5-7 7 7 7M3 12h18"/>',
    saved: '<path d="M6 3h12v18l-6-4-6 4z"/>',
    guide: '<path d="M4 4h14a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2zm3 0v16M4 16h16"/>',
    more: '<circle cx="4" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="20" cy="12" r="1"/>',
    post: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    video: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>',
    book: '<path d="M4 3h14l3 3v15H4zM8 3v18M6 6h4M6 10h4M6 14h4M6 18h4"/>'
  };
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function svg(name) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON_PATH[name] + '</svg>'; }
  function iconBtn(attrs, zh, en, name, danger) { var label = T(zh, en); return '<button class="btn btn-icon' + (danger ? ' btn--danger' : '') + '" ' + attrs + ' aria-label="' + esc(label) + '" title="' + esc(label) + '" data-tip="' + esc(label) + '">' + svg(name) + '</button>'; }
  function localDay(value) { var date = new Date(value); return isNaN(date) ? '' : date.toLocaleDateString(X.i18n.lang === 'zh' ? 'zh-CN' : 'en-CA', { month: 'short', day: 'numeric' }); }
  function catOf(note) {
    if (note.category) return { name: note.category, emoji: note.categoryEmoji || (note.platform === 'bili' ? '📺' : '🗂️') };
    if (note.platform === 'bili') return { name: note.tname || T('视频', 'Video'), emoji: '📺' };
    return X.classify(note).primary;
  }
  function isVideo(note) { return Boolean(note.platform === 'bili' || note.isVideo || note.source === 'xhs-video'); }
  function fmtDur(seconds) { seconds = parseInt(seconds, 10) || 0; return seconds ? Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') : ''; }
  function reduceMotion() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function animate(el, from, to, duration) { if (el && !reduceMotion()) el.animate([from, to], { duration: duration || 220, easing: 'cubic-bezier(.23,1,.32,1)' }); }
  function noteById(id) { return X.store.getAll().find(function (n) { return n.id === id; }); }
  function compById(id) { return X.store.getComps().find(function (c) { return c.id === id; }); }
  function coverUrl(note) { return note.demoCover || note.cover || (note.images || []).find(Boolean) || ''; }
  function safeImage(url) { return /^assets\/demo-covers\/[a-z0-9-]+\.(?:svg|webp)$/.test(url) || X.refs.isWebUrl(url) || /^blob:/.test(url); }
  function coverHtml(note) {
    var url = coverUrl(note), repo = (note.imagesRepo || []).find(Boolean);
    return '<span class="cover">' + (repo && !note.demoKey ? '<img data-repo="' + esc(repo) + '" alt="' + esc(note.title) + '" width="56" height="56">' : safeImage(url) ? '<img src="' + esc(url) + '" alt="' + esc(note.title) + '" width="56" height="56" loading="lazy" referrerpolicy="no-referrer">' : svg(isVideo(note) ? 'video' : 'post')) + (isVideo(note) ? '<span class="play-mark">' + svg('video') + '</span>' : '') + '</span>';
  }
  function renderImages(note) {
    var images = note.images || [], repo = note.imagesRepo || [], html = [];
    for (var i = 0; i < Math.max(images.length, repo.length); i++) {
      var url = images[i] || '', alt = esc((note.title || T('笔记', 'Note')) + ' ' + (i + 1));
      if (repo[i]) html.push('<a target="_blank" rel="noreferrer"><img data-repo="' + esc(repo[i]) + '" alt="' + alt + '" loading="lazy"></a>');
      else if (safeImage(url)) html.push('<a href="' + esc(url) + '" target="_blank" rel="noreferrer"><img src="' + esc(url) + '" alt="' + alt + '" loading="lazy" referrerpolicy="no-referrer"' + (X.refs.isWebUrl(url) ? ' data-fb="' + esc(X.images.proxyUrl(url)) + '"' : '') + '></a>');
    }
    return html.length ? '<div class="gallery">' + html.join('') + '</div>' : '';
  }
  function renderTranscript(note, open) {
    if (!note.transcript) return '';
    return '<details class="note__ts"' + (open ? ' open' : '') + '><summary>' + T('语音转写', 'Transcript') + ' · ' + note.transcript.length.toLocaleString() + T(' 字', ' characters') + '</summary><button class="btn" data-act="copy-transcript" data-id="' + esc(note.id) + '">' + T('复制转写', 'Copy transcript') + '</button><div class="note__body note__ts-body">' + esc(note.transcript) + '</div></details>';
  }
  function setStatus(message, type, actions) {
    if (binding && type === 'loading') { bindStep = message; paintBindProgress(); return; }
    var dialogs = Array.from(document.querySelectorAll('dialog[open]'));
    (dialogs[dialogs.length - 1] || document.body).append(els.status);
    els.status.hidden = !message;
    els.status.className = STATUS_CLASS[type] || 'status';
    toastActions = actions || [];
    els.status.innerHTML = (type === 'ok' ? svg('check') : '') + '<span>' + esc(message) + '</span>' + toastActions.map(function (action, i) { return '<button class="btn" data-toast="' + i + '">' + esc(action.label) + '</button>'; }).join('') + (message ? iconBtn('data-dismiss-toast', '关闭提示', 'Dismiss message', 'close') : '');
    if (message) animate(els.status, { opacity: 0 }, { opacity: 1 }, 150);
  }
  function rememberUndo(action) { lastUndo = action; return { label: T('撤销', 'Undo'), run: action }; }
  function topicPicker(id, container) {
    var note = noteById(id); if (!note) return;
    var topics = Array.from(new Set(X.store.getAll().map(function (n) { return catOf(n).name; }).concat(['旅行', '美食', '数码', '家居', '其他'])));
    container.querySelector('.topic-picker')?.remove();
    var picker = document.createElement('div'); picker.className = 'topic-picker';
    picker.innerHTML = topics.map(function (topic) { return '<button class="btn" data-topic-choice="' + esc(topic) + '" data-id="' + esc(id) + '">' + esc(X.catLabel(topic)) + '</button>'; }).join('');
    container.append(picker); picker.querySelector('button')?.focus();
  }
  function displayText(text, query) {
    if (!query) return esc(text);
    var start = text.toLowerCase().indexOf(query.toLowerCase());
    return start < 0 ? esc(text) : esc(text.slice(0, start)) + '<mark>' + esc(text.slice(start, start + query.length)) + '</mark>' + esc(text.slice(start + query.length));
  }
  function fieldLabel(field) { return { body: T('正文', 'Body'), transcript: T('转写', 'Transcript'), tags: T('标签', 'Tags'), author: T('作者', 'Author'), title: T('标题', 'Title'), summary: T('概述', 'Summary') }[field] || ''; }
  function rowHtml(note) {
    var query = els.search.value.trim(), match = X.library.search(note, query), video = isVideo(note);
    var expired = note.demoExpired || (note.images || []).some(X.images.isExpired), selected = selectedIds.has(note.id);
    var marker = pendingCaptures.has(note.id) ? T('读取中', 'Reading') : note.captureState === 'thin' ? T('待补正文', 'Text needed') : note.captureState === 'video-offline' ? T('视频服务离线', 'Video service offline') : expired ? T('图片待修复', 'Images expired') : video ? fmtDur(note.duration) + (note.transcript ? T(' · 有转写', ' · transcript') : T(' · 视频', ' · video')) : '';
    return '<article class="note-row' + (focusedId === note.id ? ' is-focused' : '') + (selected ? ' is-selected' : '') + '" data-note="' + esc(note.id) + '" data-id="' + esc(note.id) + '" tabindex="0" draggable="true" aria-label="' + esc(note.title) + '">' +
      (activePlace === 'archive' ? '<button class="btn" data-act="unarch" data-id="' + esc(note.id) + '">' + T('取出', 'Restore') + '</button>' : '<input class="selbox" type="checkbox" data-id="' + esc(note.id) + '" aria-label="' + esc(T('选择 ', 'Select ') + note.title) + '"' + (selected ? ' checked' : '') + '>') + coverHtml(note) +
      '<div class="row-content"><h2 class="row-title">' + displayText(note.title || T('未命名', 'Untitled'), query) + '</h2>' + (query ? '<div class="row-excerpt"><span>' + fieldLabel(match?.field) + ' · </span>' + displayText(String(match?.text || '').replace(/\s+/g, ' '), query) + '</div>' : '') + '<div class="row-meta"><span class="source-glyph" title="' + (note.platform === 'bili' ? 'Bilibili' : 'Xiaohongshu') + '">' + svg(video ? 'video' : 'post') + '</span><time>' + esc(localDay(note.capturedAt || note.savedAt)) + '</time>' + (marker ? '<span>· ' + esc(marker) + '</span>' : '') + '</div></div><button class="btn row-more" data-act="preview" data-id="' + esc(note.id) + '" aria-label="' + T('笔记操作', 'Note actions') + '">' + svg('more') + '</button>' + (pendingCaptures.has(note.id) ? '<span class="pending-bar"></span>' : '') + '</article>';
  }
  function captureMessage(note) {
    if (pendingCaptures.has(note.id)) return note.captureProgress || T('正在读取…', 'Reading…');
    if (note.captureState === 'video-offline') return T('已保存链接。转写需要本机视频服务，现在没开。', 'Link saved. Transcription needs the local video service, which is offline.');
    if (note.captureState === 'thin') return T('只存了分享文字和链接，网站挡住了读取。', 'Share text and link saved. The site blocked reading.');
    if (note.captureState === 'frames-missing') return T('转写已保存，截图没存上。检查仓库连接后可以重试。', 'Transcript saved. Frames could not be kept. Check the repository connection and retry.');
    return '';
  }
  function filteredNotes() {
    return X.store.getAll().filter(function (note) {
      return (activePlace === 'archive' ? note.archived : !note.archived) && (activePlatform === 'all' || (note.platform || 'xhs') === activePlatform) && (activeType === 'all' || (activeType === 'video') === isVideo(note)) && X.library.search(note, els.search.value);
    });
  }
  function renderRail(base) {
    var all = X.store.getAll(), guides = X.store.getComps();
    var places = [{ value: 'saved', label: T('收藏', 'Saved'), count: all.filter(function (n) { return !n.archived; }).length, icon: 'saved' }, { value: 'guides', label: T('合集', 'Guides'), count: guides.filter(function (c) { return !c.archived; }).length, icon: 'guide' }, { value: 'archive', label: T('归档', 'Archive'), count: all.filter(function (n) { return n.archived; }).length + guides.filter(function (c) { return c.archived; }).length, icon: 'archive' }];
    var html = places.map(function (place) { return '<button class="place" data-place="' + place.value + '" aria-current="' + (activePlace === place.value) + '">' + svg(place.icon) + esc(place.label) + (place.count ? '<span>' + place.count + '</span>' : '') + '</button>'; }).join('');
    els.places.innerHTML = html;
    var currentPlace = places.find(function (place) { return place.value === activePlace; });
    els.phonePlaces.innerHTML = '<details class="library-menu"><summary aria-label="' + T('切换收藏、合集或归档', 'Switch Saved, Guides or Archive') + '"><h1 class="phone-heading">' + currentPlace.label + '</h1>' + svg('chevron') + '</summary><div class="menu-items">' + html + '</div></details>';
    var counts = new Map(); base.forEach(function (n) { var key = catOf(n).name; counts.set(key, (counts.get(key) || 0) + 1); });
    var topics = [{ name: 'all', count: base.length }].concat(Array.from(counts, function (entry) { return { name: entry[0], count: entry[1] }; }).sort(function (a, b) { return b.count - a.count; }));
    var topicHtml = topics.map(function (topic) { return '<button class="topic" data-cat="' + esc(topic.name) + '" aria-pressed="' + (activeFilter === topic.name) + '">' + (topic.name === 'all' ? T('全部', 'All topics') : esc(X.catLabel(topic.name))) + (topic.name === 'all' ? '' : '<span>' + topic.count + '</span>') + '</button>'; }).join('');
    els.catFilter.innerHTML = topicHtml; els.phoneTopics.innerHTML = topicHtml;
    els.topicCaption.textContent = T('主题', 'Topics');
    els.platFilter.innerHTML = '<p class="filter-label">' + T('来源', 'Source') + '</p><div class="filter-segment">' + [['all', T('全部', 'All')], ['xhs', T('小红书', 'Xiaohongshu')], ['bili', T('B站', 'Bilibili')]].map(function (entry) { return '<button class="btn" data-dim="platform" data-val="' + entry[0] + '" aria-pressed="' + (activePlatform === entry[0]) + '">' + entry[1] + '</button>'; }).join('') + '</div><p class="filter-label">' + T('类型', 'Type') + '</p><div class="filter-segment">' + [['all', T('全部', 'All')], ['post', T('帖子', 'Posts')], ['video', T('视频', 'Videos')]].map(function (entry) { return '<button class="btn" data-dim="type" data-val="' + entry[0] + '" aria-pressed="' + (activeType === entry[0]) + '">' + entry[1] + '</button>'; }).join('') + '</div>';
    var countBase = all.filter(function (note) {
      return (activePlace === 'archive' ? note.archived : !note.archived) && (activeFilter === 'all' || catOf(note).name === activeFilter) && (!activeTag || (note.tags || []).includes(activeTag)) && X.library.search(note, els.search.value);
    });
    els.platFilter.querySelectorAll('[data-dim]').forEach(function (button) {
      var count = countBase.filter(function (note) {
        if (button.dataset.dim === 'platform') return (activeType === 'all' || (activeType === 'video') === isVideo(note)) && (button.dataset.val === 'all' || (note.platform || 'xhs') === button.dataset.val);
        return (activePlatform === 'all' || (note.platform || 'xhs') === activePlatform) && (button.dataset.val === 'all' || (button.dataset.val === 'video') === isVideo(note));
      }).length;
      button.title = count + T(' 篇笔记', ' notes');
    });
    els.railGuides.innerHTML = guides.filter(function (c) { return !c.archived; }).slice(0, 4).map(function (c) { return '<button class="rail-guide" data-cact="read" data-id="' + esc(c.id) + '" draggable="false">' + svg('guide') + '<span>' + esc(c.title) + '</span></button>'; }).join('');
    moveFilters();
    document.querySelector('[data-filter-label]').textContent = T('筛选', 'Filter') + ((activePlatform !== 'all' || activeType !== 'all' || activeTag) ? ' ·' : '');
    document.querySelector('[data-tags-label]').textContent = T('标签', 'Tags');
    els.archCount.textContent = all.filter(function (n) { return n.archived; }).length;
    els.compArchCount.textContent = guides.filter(function (c) { return c.archived; }).length;
  }
  function moveFilters() { var menu = document.getElementById('filterMenu'), parent = document.getElementById(innerWidth < 900 ? 'phoneFilters' : 'railFilters'); if (menu && parent && menu.parentElement !== parent) parent.append(menu); }
  function renderLibrary() {
    var previousFocus = document.activeElement;
    var previousRowId = previousFocus.closest?.('[data-note]')?.dataset.note;
    var focusedCheckbox = previousFocus.matches?.('.selbox');
    var base = filteredNotes();
    renderRail(base.filter(function (note) { return !activeTag || (note.tags || []).includes(activeTag); }));
    var pile = base.filter(function (n) { return activeFilter === 'all' || catOf(n).name === activeFilter; });
    visibleNotes = pile.filter(function (n) { return !activeTag || (n.tags || []).includes(activeTag); });
    var title = activePlace === 'guides' ? T('合集', 'Guides') : activePlace === 'archive' ? T('归档', 'Archive') : activeFilter === 'all' ? T('收藏', 'Saved') : X.catLabel(activeFilter);
    var query = els.search.value.trim();
    var matchingGuides = X.store.getComps().filter(function (c) { return (activePlace === 'archive' ? c.archived : !c.archived) && X.library.search(c, query); });
    els.pileTitle.innerHTML = '<h1>' + esc(query ? T('搜索「', 'Search “') + query + T('」', '”') : title) + '</h1><span>' + (activePlace === 'guides' ? matchingGuides.length + T(' 篇合集', ' guides') : visibleNotes.length + T(' 篇笔记', ' notes')) + (query ? ' · ' + matchingGuides.length + T(' 篇合集', ' guides') : '') + '</span>';
    els.pileTags.innerHTML = activePlace === 'guides' ? '' : X.library.tags(pile).map(function (tag) { return '<button class="tag-filter" data-tag="' + esc(tag.tag) + '" aria-pressed="' + (activeTag === tag.tag) + '">#' + esc(tag.tag) + ' ' + tag.count + '</button>'; }).join('');
    els.selectAll.hidden = activePlace !== 'saved' || !visibleNotes.length;
    els.selectAll.textContent = T('全选这 ', 'Select these ') + visibleNotes.length + T(' 篇', '');
    els.pileTitle.title = pile.length ? T('最近保存 ', 'Latest save ') + localDay(pile[0].savedAt) : '';
    var phoneAll = document.querySelector('[data-phone-select-all]'); if (phoneAll) phoneAll.textContent = T('全选', 'Select all');
    els.pileGuide.textContent = '';
    els.libCount.textContent = visibleNotes.length;
    els.libList.hidden = activePlace === 'guides';
    els.compsCard.hidden = !(activePlace === 'guides' || activePlace === 'archive' || query);
    if (activePlace !== 'guides') els.libList.innerHTML = visibleNotes.length ? visibleNotes.map(rowHtml).join('') : emptyHtml(query);
    els.compList.innerHTML = matchingGuides.length ? matchingGuides.map(guideRowHtml).join('') : activePlace === 'guides' ? '<div class="empty">' + svg('book') + '<h2>' + T('把同一主题的笔记装订在一起', 'Keep a topic together') + '</h2><p>' + T('选几篇同一主题的笔记，就能整理成一篇合集。', 'Select a few notes on one topic to bind them into a guide.') + '</p></div>' : '';
    els.compCount.textContent = matchingGuides.length;
    if (!focusedId || !noteById(focusedId)) focusedId = visibleNotes[0]?.id || null;
    renderPreview(); updateSelBar(); X.images.hydrate(els.libList);
    if (previousRowId && !document.querySelector('dialog[open]')) {
      var replacement = Array.from(els.libList.querySelectorAll('[data-note]')).find(function (row) { return row.dataset.note === previousRowId; });
      (focusedCheckbox ? replacement?.querySelector('.selbox') : replacement)?.focus({ preventScroll: true });
    }
  }
  function renderComps() { renderLibrary(); }
  function emptyHtml(query) {
    if (query) return '<div class="empty"><p>' + esc(T('没有找到「', 'Nothing found for “') + query + T('」。正文、转写和标签都搜过了。', '”. Body text, transcripts and tags were searched.')) + '</p><button class="btn" data-clear-search>' + T('清除搜索', 'Clear search') + '</button></div>';
    if (activePlace === 'archive') return '<p class="empty">' + T('整理进合集的笔记会自动放到这里。', 'Notes move here after they are bound into a guide.') + '</p>';
    var guide = X.store.getComps().find(function (c) { return c.sourceNoteIds?.some(function (id) { return catOf(noteById(id) || {}).name === activeFilter; }); });
    if (guide) return '<div class="empty"><p>' + esc(T('这一堆都整理进《', 'This pile is bound into “') + guide.title + T('》了', '”')) + '</p><button class="btn btn--primary" data-cact="read" data-id="' + esc(guide.id) + '">' + T('打开合集', 'Open guide') + '</button></div>';
    return '<div class="empty"><h2>' + T('粘贴，就存好了', 'Paste it here to keep it') + '</h2><p>' + T('在小红书或B站点「分享」，复制链接，再粘到这里。视频转写需要本机服务，可以以后再开。', 'Copy a share link from Xiaohongshu or Bilibili, then paste it here. Video transcription uses an optional local service.') + '</p><button class="btn" data-act="demo">' + T('载入示例笔记', 'Load sample notes') + '</button></div>';
  }
  function guideRowHtml(c) {
    var sources = X.refs.bind(c).sources, notes = (c.sourceNoteIds || []).map(noteById).filter(Boolean);
    return '<article class="guide-row"><div class="guide-stack">' + notes.slice(0, 3).map(coverHtml).join('') + '</div><button data-cact="read" data-id="' + esc(c.id) + '"><span class="row-title">' + esc(c.title) + '</span>' + (els.search.value ? '<span class="row-excerpt">' + displayText(X.library.search(c, els.search.value)?.text || c.summary, els.search.value) + '</span>' : '') + '<span class="row-meta">' + sources.length + T(' 篇来源', ' sources') + ' · ' + esc(localDay(c.runAt || c.savedAt)) + '</span></button>' + (c.archived ? '<button class="btn" data-cact="unarch" data-id="' + esc(c.id) + '">' + T('取出', 'Restore') + '</button>' : '') + '</article>';
  }
  function previewHtml(note, source) {
    if (!note) return '<div class="empty">' + svg('post') + '<p>' + T('选中一篇笔记，在这里查看正文和图片。', 'Choose a note to see its text and images here.') + '</p></div>';
    var draft = noteDrafts.get(note.id);
    var secondary = '', id = esc(note.id), actions = (source ? iconBtn('data-act="open" data-id="' + id + '"', '打开原帖', 'Open original', 'open') : '') + iconBtn('data-act="copy-lib" data-id="' + id + '"', '复制 Markdown', 'Copy Markdown', 'copy');
    if (!source) secondary += iconBtn('data-act="topic" data-id="' + id + '"', '改主题', 'Change topic', 'edit') + ((note.images || []).some(X.images.isExpired) || note.demoExpired ? iconBtn('data-act="fiximg" data-id="' + id + '"', '修复图片', 'Fix images', 'fix') : '') + iconBtn('data-act="' + (note.archived ? 'unarch' : 'arch') + '" data-id="' + id + '"', note.archived ? '取出' : '归档', note.archived ? 'Restore' : 'Archive', 'archive') + iconBtn('data-act="del" data-id="' + id + '"', '删除', 'Delete', 'del', true);
    if (!source && note.captureState && !pendingCaptures.has(note.id)) secondary += '<button class="btn" data-act="retry-fetch" data-id="' + id + '">' + T('再读取一次', 'Try reading again') + '</button>';
    var body = '<div class="note__body">' + esc(note.body) + '</div>';
    var metadata = '<div class="preview-meta">' + esc((note.platform === 'bili' ? 'Bilibili' : 'Xiaohongshu') + (note.author ? ' · @' + note.author : '')) + '</div><div class="tags">' + (note.tags || []).map(function (tag) { return '<span>#' + esc(tag) + '</span>'; }).join('') + '</div>';
    var editor = '<details class="note-editor"' + (note.captureState === 'thin' ? ' open' : '') + '><summary>' + T('修改正文与图片', 'Edit text and images') + '</summary><label>' + T('正文', 'Text') + '<textarea data-note-text rows="6">' + esc(draft ? draft.text : note.body) + '</textarea></label><label>' + T('图片链接', 'Image links') + '<textarea data-note-images rows="2">' + esc(draft ? draft.images : (note.images || []).filter(X.refs.isWebUrl).join('\n')) + '</textarea></label><button class="btn btn--primary" data-act="save-text" data-id="' + id + '">' + T('保存', 'Save') + '</button></details>';
    return '<div class="preview-inner"><div class="preview-toolbar">' + actions + (secondary ? '<details class="library-menu"><summary aria-label="' + T('更多笔记操作', 'More note actions') + '">' + svg('more') + '</summary><div class="menu-items">' + secondary + '</div></details>' : '') + '</div>' + renderImages(note) + '<h2 class="preview-title">' + esc(note.title) + '</h2>' + (note.captureState ? '<p class="capture-notice">' + esc(captureMessage(note)) + (note.captureState === 'video-offline' ? '<button class="btn" data-local-help>' + T('怎么开启', 'How to start it') + '</button>' : '') + '</p>' : '') + (source ? metadata + body : innerWidth >= 900 ? metadata + body + editor : '<p class="preview-short">' + esc(String(note.body || '').slice(0, 180)) + '</p><details class="note-full"><summary>' + T('阅读全文', 'Read full note') + '</summary>' + metadata + body + (note.captureState === 'thin' ? '' : editor) + '</details>' + (note.captureState === 'thin' ? editor : '')) + renderTranscript(note, source && isVideo(note)) + (note.url ? X.refs.isWebUrl(note.url) ? '<a class="btn btn--ghost note__link" href="' + esc(note.url) + '" target="_blank" rel="noreferrer">' + svg('open') + T('打开原帖', 'Open original') + '</a>' : '<span class="note__link">' + esc(note.url) + '</span>' : '') + '</div>';
  }
  function renderPreview() { els.preview.innerHTML = previewHtml(noteById(focusedId)); X.images.hydrate(els.preview); }
  function showNote(id) {
    focusedId = id; renderPreview();
    if (innerWidth < 900) { els.noteDlg.classList.remove('tray-sheet'); els.noteDlg.innerHTML = '<div class="sheet-bar"><button class="btn" data-close-note>' + svg('back') + T('回到收藏', 'Back') + '</button></div>' + previewHtml(noteById(id)); els.noteDlg.showModal(); focusDialogHeading(els.noteDlg); X.images.hydrate(els.noteDlg); }
  }
  function selectNote(id, value, range, keyboardInput) {
    if (activePlace !== 'saved' || binding) return;
    if (range && lastSelectedId) {
      var a = visibleNotes.findIndex(function (n) { return n.id === lastSelectedId; }), b = visibleNotes.findIndex(function (n) { return n.id === id; });
      if (a >= 0 && b >= 0) visibleNotes.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(function (n) { selectedIds.add(n.id); });
    } else if (value) selectedIds.add(id); else selectedIds.delete(id);
    lastSelectedId = id; focusedId = id;
    var row = Array.from(els.libList.querySelectorAll('[data-note]')).find(function (el) { return el.dataset.note === id; });
    var cover = row?.querySelector('.cover'), start = cover?.getBoundingClientRect();
    updateSelBar();
    els.libList.querySelectorAll('[data-note]').forEach(function (el) { var selected = selectedIds.has(el.dataset.note); el.classList.toggle('is-selected', selected); el.querySelector('input').checked = selected; });
    if (value && start && innerWidth >= 900 && !reduceMotion() && !keyboardInput) {
      var endEl = Array.from(els.selectedStack.querySelectorAll('[data-stack]')).find(function (el) { return el.dataset.stack === id; })?.querySelector('.cover');
      var end = endEl?.getBoundingClientRect();
      if (end) {
        var flight = cover.cloneNode(true);
        flight.setAttribute('aria-hidden', 'true');
        Object.assign(flight.style, { position: 'fixed', left: start.x + 'px', top: start.y + 'px', width: start.width + 'px', height: start.height + 'px', zIndex: 50, pointerEvents: 'none', transformOrigin: 'top left' });
        document.body.append(flight);
        flight.animate([{ transform: 'none', opacity: .9 }, { transform: 'translate(' + (end.x - start.x) + 'px,' + (end.y - start.y) + 'px) scale(' + end.width / start.width + ')', opacity: .6 }], { duration: 220, easing: 'cubic-bezier(.23,1,.32,1)' }).finished.finally(function () { flight.remove(); });
      }
    }
  }
  function updateSelBar() {
    selectedIds.forEach(function (id) { if (!noteById(id)) selectedIds.delete(id); });
    var notes = Array.from(selectedIds).map(noteById).filter(Boolean), count = notes.length;
    els.selBar.hidden = !count; els.preview.hidden = Boolean(count);
    document.body.classList.toggle('has-selection', Boolean(count));
    els.mobileSelection.hidden = !count; els.mobileSelection.querySelector('span').textContent = T('已选 ', 'Selected ') + count;
    if (!count) return;
    paneCollapsed = false; els.main.classList.remove('pane-collapsed');
    els.selCount.textContent = T('整理 ', 'Bind ') + count + T(' 篇成合集', ' notes into a guide');
    els.selectedStack.innerHTML = notes.map(function (note) { return '<div class="stack-item" data-stack="' + esc(note.id) + '">' + coverHtml(note) + '<span>' + esc(note.title) + '</span>' + iconBtn('data-remove-selection="' + esc(note.id) + '"', '移出选择', 'Remove from selection', 'close') + '</div>'; }).join('');
    var images = notes.reduce(function (sum, note) { return sum + Math.max((note.images || []).length, (note.imagesRepo || []).length); }, 0);
    if (els.includeImgs.dataset.selection !== Array.from(selectedIds).join(',')) { els.includeImgs.checked = images > 0; els.includeImgs.dataset.selection = Array.from(selectedIds).join(','); }
    els.imageOptionText.textContent = T('读图片里的文字 · ', 'Read image text · ') + images + T(' 张', ' images') + (images > 100 ? T('，最多读取 100 张', ', the first 100 can be read') : '');
    els.bindConsequence.textContent = T('整理后，这 ', 'After binding, these ') + count + T(' 篇会移到归档，合集里保留它们的链接。', ' notes move to the archive. The guide keeps links to them.');
    els.guideMenu.innerHTML = X.store.getComps().filter(function (c) { return !c.archived; }).map(function (c) { return '<button class="btn" data-target-guide="' + esc(c.id) + '">' + esc(c.title) + '</button>'; }).join('') || '<p>' + T('还没有合集，可以先建一篇。', 'Create your first guide here.') + '</p>';
    els.bindNotice.innerHTML = demo ? '<p>' + T('演示：回放事先整理好的结果', 'Demo: replay a prepared guide') + '</p>' + (!X.library.replaySet(notes) ? '<p>' + T('演示版只为这两组准备了结果。', 'The demo has results for these two sets.') + '</p><button class="btn" data-demo-set="kyoto">' + T('选京都 12 篇', 'Select 12 Kyoto notes') + '</button><button class="btn" data-demo-set="food">' + T('选美食 8 篇', 'Select 8 food notes') + '</button>' : '') : !X.ai.isReady() ? '<p>' + T('需要先在设置里填 Anthropic 密钥。', 'Add your Anthropic key in Settings first.') + '</p><button class="btn" data-open-ai>' + T('打开设置', 'Open Settings') + '</button>' : '';
    els.consolidateBtn.disabled = binding || (demo && (!X.library.replaySet(notes) || Boolean(els.addToComp.value)));
  }
  function openTray() {
    els.noteDlg.classList.add('tray-sheet');
    els.noteDlg.replaceChildren();
    var close = document.createElement('div'); close.className = 'sheet-bar'; close.innerHTML = '<button class="btn" data-close-note>' + svg('back') + T('回到选择', 'Back to selection') + '</button>';
    els.noteDlg.append(close, els.selBar); els.noteDlg.showModal(); focusDialogHeading(els.noteDlg);
  }
  function chooseDemoSet(key) { selectedIds.clear(); activePlace = 'saved'; activeFilter = key === 'food' ? '美食' : '旅行'; activeTag = ''; X.store.getAll().filter(function (n) { return n.demoKey?.startsWith(key + '-'); }).forEach(function (note) { X.store.unarchive([note.id]); selectedIds.add(note.id); }); renderLibrary(); }
  function onFetch(raw) {
    return typeof HubSettingsRuntime === 'undefined' ? captureNote(raw) : HubSettingsRuntime.track(function () { return captureNote(raw); });
  }
  async function captureNote(raw) {
    var text = (raw == null ? els.urlInput.value : raw).trim(); if (!text) return;
    var url = X.extractUrl(text), bv = text.match(/\bBV[a-zA-Z0-9]{10}\b/);
    if (!url && bv) url = 'https://www.bilibili.com/video/' + bv[0];
    var existing = url && X.store.getAll().find(function (note) { return note.url === url; });
    if (existing && (!existing.captureState || pendingCaptures.has(existing.id))) {
      if (raw == null) els.urlInput.value = '';
      showNote(existing.id);
      setStatus(T('这条已经存好了', 'This note is already saved'), 'ok');
      return;
    }
    var previous = existing ? Object.assign({}, existing) : null;
    var fallback = existing ? Object.assign({}, existing) : X.buildManual(text, ''), video = /bilibili\.com|b23\.tv/i.test(url) || Boolean(bv) || isVideo(fallback);
    fallback.url = url || fallback.url; fallback.platform = video ? 'bili' : fallback.platform || 'xhs'; fallback.isVideo = video;
    fallback.capturedAt = new Date().toISOString();
    var classification = X.classify(fallback); fallback.category = classification.primary.name;
    var rec;
    try {
      rec = X.store.save(Object.assign({}, fallback, { captureState: url ? 'pending' : '', captureProgress: T('正在读取…', 'Reading…') }));
      scheduleSync(); await X.store.flush();
    } catch (error) {
      if (!els.urlInput.value.trim()) els.urlInput.value = text;
      renderLibrary();
      setStatus(T('没保存上，请在页头重试。粘贴内容保留在本页。', 'Could not save. Retry in the header. Your capture is kept on this page.') + ' ' + error.message, 'err');
      return;
    }
    if (raw == null && els.urlInput.value.trim() === text) els.urlInput.value = '';
    activePlace = rec.archived ? 'archive' : 'saved'; activeFilter = 'all'; activeTag = ''; focusedId = rec.id;
    if (url) pendingCaptures.add(rec.id);
    renderLibrary();
    animate(els.libList.querySelector('[data-note]'), { opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }, 200);
    try {
      var note = fallback;
      if (demo && text === X.demo.captureText(X.i18n.lang)) {
        await new Promise(function (resolve) { setTimeout(resolve, 500); });
        X.store.update(rec.id, { captureProgress: T('演示回放 · 识别主题…', 'Demo replay · Finding the topic…') }); renderLibrary();
        await new Promise(function (resolve) { setTimeout(resolve, 500); });
        note = X.demo.captureNote(X.i18n.lang); note.captureState = '';
      } else if (url && video) note = await captureVideo(url, fallback, rec.id);
      else if (url) {
        try { note = await X.fetchNote(text); if (isVideo(note)) note = await captureVideo(note.url || url, Object.assign({}, fallback, note), rec.id); }
        catch (error) { note = Object.assign({}, fallback, { captureState: 'thin', fetchReason: error.message }); }
      }
      if (!noteById(rec.id)) return;
      classification = X.classify(note);
      var chosen = noteById(rec.id);
      if (url && chosen.captureState !== 'pending') { setStatus(T('读取时这篇笔记又改过了，已保留修改后的内容。', 'This note changed while it was being read. Your edited copy is kept.'), 'ok'); return; }
      X.store.update(rec.id, Object.assign({}, note, { id: rec.id, capturedAt: rec.capturedAt, category: chosen.topicChosen ? chosen.category : note.category || classification.primary.name, captureState: note.captureState === 'pending' ? '' : note.captureState || '', captureProgress: '' }));
      scheduleSync();
      var latest = noteById(rec.id);
      var captureRevision = latest.savedAt;
      var undo = function () {
        if (noteById(rec.id)?.savedAt !== captureRevision) { setStatus(T('笔记后来又改过了，请打开它检查。', 'This note changed after capture. Open it to review the changes.'), 'err'); return; }
        if (previous) X.store.update(rec.id, previous); else X.store.remove(rec.id);
        selectedIds.delete(rec.id); renderLibrary(); scheduleSync(); setStatus(T('已撤销保存', 'Save undone'), 'ok');
      };
      setStatus((demo && text === X.demo.captureText(X.i18n.lang) ? T('演示回放 · ', 'Demo replay · ') : '') + T('已保存到「', 'Saved to ') + X.catLabel(catOf(latest).name) + T('」', ''), 'ok', [{ label: T('改主题', 'Change topic'), run: function () { showNote(rec.id); topicPicker(rec.id, innerWidth < 900 ? els.noteDlg : els.preview); } }, rememberUndo(undo)]);
      if (!demo && (latest.images || []).length && X.images.ready()) X.images.archiveNote(latest).then(function (result) { if (noteById(rec.id)) { X.store.update(rec.id, { imagesRepo: result.repo }); scheduleSync(); renderLibrary(); } }).catch(function () {});
    } catch (error) { if (noteById(rec.id)) X.store.update(rec.id, { captureState: video ? 'video-offline' : 'thin' }); setStatus(T('已保留粘贴文字和链接。', 'Your pasted text and link are kept.') + ' ' + error.message, 'err'); }
    finally { pendingCaptures.delete(rec.id); renderLibrary(); }
  }
  async function captureVideo(url, fallback, id) {
    if (!(await X.fetchsvc.health())) return Object.assign({}, fallback, { isVideo: true, captureState: 'video-offline' });
    var progress = function (line) { if (noteById(id)) X.store.update(id, { captureProgress: line }); renderLibrary(); };
    var result = await X.fetchsvc.fetchVideo(url, progress), frames = result.frames || [], note = result.note || fallback;
    var kept = [];
    if (frames.length) { progress(T('挑截图…', 'Choosing frames…')); var indices = await X.ai.judgeFrames(frames); kept = indices.map(function (i) { return frames[i]; }); }
    var repository = [];
    if (kept.length && X.images.ready()) {
      try { repository = await X.images.saveFrames(note.key || 'v' + Date.now(), kept, function (i, n) { progress(T('存截图 ', 'Saving frames ') + i + '/' + n); }); }
      catch (error) { note.captureState = 'frames-missing'; }
    }
    note.platform = note.platform || fallback.platform; note.isVideo = true; note.imagesRepo = repository; note.images = repository.map(function () { return note.cover || ''; }); delete note.key;
    if (kept.length && !repository.length) { note.captureState = 'frames-missing'; setStatus(T('转写已保留，截图未存入仓库。请在设置里检查私有仓库连接。', 'Transcript kept. Check the private repository connection in Settings to keep video frames.'), 'err'); }
    return note;
  }
  function compToMarkdown(c) { return X.export.markdown(c, X.i18n.lang); }
  async function runConsolidate(existing, reorgOnly) {
    if (binding) return;
    if (!demo) {
      binding = true; bindStartedAt = Date.now();
      var timer = setInterval(paintBindProgress, 1000);
      try { await runRealConsolidate(existing, reorgOnly); }
      finally { clearInterval(timer); binding = false; updateSelBar(); }
      return;
    }
    var notes = Array.from(selectedIds).map(noteById).filter(Boolean), key = X.library.replaySet(notes);
    if (!key || existing || reorgOnly) { setStatus(T('演示版只回放京都和美食两组的新合集。', 'The demo replays new guides for the Kyoto and food sets.'), 'ok'); return; }
    binding = true; updateSelBar();
    var start = Date.now();
    for (var step of [T('打包图片', 'Packing images'), T('整理中', 'Binding'), T('完成', 'Done')]) { els.bindProgress.textContent = T('演示回放 · ', 'Demo replay · ') + step + ' · ' + ((Date.now() - start) / 1000).toFixed(1) + T(' 秒。请保持页面打开。', ' seconds. Keep this page open.'); await new Promise(function (resolve) { setTimeout(resolve, 600); }); }
    var result = X.store.saveComp(X.demo.guide(key, X.i18n.lang));
    var ids = notes.map(function (n) { return n.id; }); X.store.archive(ids); selectedIds.clear();
    animate(els.selectedStack, { opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.8)' }, 240);
    await new Promise(function (resolve) { setTimeout(resolve, reduceMotion() ? 0 : 240); });
    binding = false; if (els.noteDlg.open) els.noteDlg.close(); renderLibrary(); openRead(result.id);
    var restore = function () { X.store.unarchive(ids); renderLibrary(); scheduleSync(); setStatus(T('原笔记已取出', 'Source notes restored'), 'ok'); };
    lastUndo = restore;
    setStatus(T('已存为合集《', 'Saved as “') + result.title + T('》，', '”, ') + ids.length + T(' 篇原笔记已归档', ' source notes archived'), 'ok', [{ label: T('撤销归档', 'Restore them'), run: restore }]);
  }
  function paintBindProgress() {
    els.bindProgress.textContent = bindStep + ' · ' + Math.floor((Date.now() - bindStartedAt) / 1000) + T(' 秒。请保持页面打开。', ' seconds. Keep this page open.');
  }
  function sourceNote(source, c) {
    return (c.sourceNoteIds || []).map(noteById).filter(Boolean).find(function (n) { return source.url ? n.url === source.url : n.title === source.title; }) || X.store.getAll().find(function (n) { return source.url ? n.url === source.url : n.title === source.title; });
  }
  function marginCard(source, c, section) {
    var note = sourceNote(source, c);
    return '<button class="margin-card" data-read="src" data-n="' + source.n + '" data-section="' + section + '">' + (note ? coverHtml(note) : '') + '<span><strong>[' + source.n + '] ' + esc(X.refs.label(source)) + '</strong></span></button>';
  }
  function compEditHtml(c) {
    return '<input class="comp__ed-title" aria-label="' + T('合集标题', 'Guide title') + '" value="' + esc(c.title) + '"><textarea class="comp__ed-sum" aria-label="' + T('概述', 'Summary') + '" rows="3">' + esc(c.summary) + '</textarea>' + (c.sections || []).map(function (section, i) { return '<section class="read__sec"><input class="comp__ed-h" data-i="' + i + '" aria-label="' + T('板块标题', 'Section heading') + '" value="' + esc(section.heading) + '"><textarea class="comp__ed-c" data-i="' + i + '" aria-label="' + T('板块正文', 'Section text') + '" rows="10">' + esc(section.content) + '</textarea></section>'; }).join('');
  }
  function sourceOverview(c) {
    var bound = X.refs.bind(c), videoCount = bound.sources.filter(function (source) { return isVideo(sourceNote(source, c) || {}); }).length;
    return '<div class="source-overview"><p>' + bound.sources.length + T(' 篇来源', ' sources') + '</p><p>' + T('小红书 ', 'Xiaohongshu ') + (bound.sources.length - videoCount) + ' · ' + T('B站视频 ', 'Bilibili videos ') + videoCount + '</p><div class="source-cover-grid">' + bound.sources.map(function (source) { var note = sourceNote(source, c); return '<button class="btn" data-read="src" data-n="' + source.n + '" aria-label="' + esc('[' + source.n + '] ' + X.refs.label(source)) + '">' + (note ? coverHtml(note) : svg('post')) + '</button>'; }).join('') + '</div></div>';
  }
  function compReadHtml(c) {
    var bound = X.refs.bind(c), editing = editingCompId === c.id;
    var toc = bound.sections.map(function (section, i) { return '<li><span class="read__n">' + (i + 1) + '</span><a href="#read-sec-' + (i + 1) + '" data-read="jump" data-i="' + (i + 1) + '">' + esc(section.heading) + '</a></li>'; }).join('');
    var body = '<h1 id="read-title">' + esc(c.title) + '</h1><p class="read-mobile-meta">' + bound.sources.length + T(' 篇来源 · ', ' sources · ') + esc(localDay(c.runAt || c.savedAt)) + '</p><p class="read__lede">' + esc(c.summary) + '</p>' + (c.images?.length ? '<div class="read__kept"><h2>' + T('合集里留下的图', 'Images kept in this guide') + '</h2>' + renderImages(c) + '</div>' : '') + bound.sections.map(function (section, i) { return '<section class="read__sec" id="read-sec-' + (i + 1) + '"><h2 tabindex="-1">' + esc(section.heading) + '</h2><div class="read__text">' + esc(section.content) + '</div><p class="read__cites">' + T('来源', 'Sources') + ' ' + section.refs.map(function (n) { return '<a href="#read-src-' + n + '" data-read="src" data-n="' + n + '">[' + n + ']</a>'; }).join(' ') + '</p></section>'; }).join('') + (!bound.sections.length ? '<p>' + T('这篇合集还没有板块。', 'This guide has no sections yet.') + '</p>' : '') + '<section class="read__all-sources"><h2>' + T('全部来源', 'All sources') + '</h2><ol>' + bound.sources.map(function (source) { return '<li id="read-src-' + source.n + '"><span class="read__n">[' + source.n + ']</span> <button class="btn" data-read="src" data-n="' + source.n + '"><span>' + esc(X.refs.label(source)) + '</span></button>' + (!source.cited ? '<span class="read__tag">' + T('并入了但没有单独标注', 'Folded in, not cited by a section') + '</span>' : '') + (!X.refs.isWebUrl(source.url) && source.url ? '<span class="note__link">' + esc(source.url) + '</span>' : '') + '</li>'; }).join('') + '</ol></section>';
    return '<div class="read__bar"><button class="btn" data-read="close">' + svg('back') + T('回到收藏', 'Back to library') + '</button><span class="read__bar-title">' + esc(c.title) + '</span><span class="read__meta"><span>' + bound.sources.length + T(' 篇来源', ' sources') + '</span><span>' + (c.lang === 'zh' || c.lang === 'Simplified Chinese' ? T('中文', 'Chinese') : T('英文', 'English')) + '</span><span>' + esc(localDay(c.runAt || c.savedAt)) + '</span></span>' + (editing ? '<button class="btn btn--primary" data-read="save-edit">' + T('保存', 'Save') + '</button><button class="btn" data-read="cancel-edit">' + T('取消', 'Cancel') + '</button>' : '<button class="btn read-main-action" data-read="copy">' + T('复制全文', 'Copy as text') + '</button><button class="btn read-main-action" data-read="export">' + T('下载 Markdown', 'Download Markdown') + '</button><button class="btn read-main-action" data-read="trace">' + T('整理记录', 'How it was made') + '</button><button class="btn phone-contents" data-read="contents">' + T('目录', 'Contents') + '</button><details class="reader-menu"><summary aria-label="' + T('合集操作', 'Guide actions') + '">' + svg('more') + '</summary><div class="menu-items">' + [['copy', T('复制全文', 'Copy as text')], ['export', T('下载 Markdown', 'Download Markdown')], ['trace', T('整理记录', 'How it was made')], ['edit', T('编辑', 'Edit')], ['reorg', T('再整理一次', 'Re-organize')], ['add', T('加入更多笔记', 'Add notes')], [c.archived ? 'unarch' : 'arch', c.archived ? T('取出', 'Restore') : T('归档', 'Archive')], ['del', T('删除', 'Delete')]].map(function (action) { return '<button class="btn" data-read="' + action[0] + '">' + action[1] + '</button>'; }).join('') + '</div></details>') + '</div><div class="read__grid"><nav class="read__toc" aria-label="' + T('目录', 'Contents') + '"><p class="read__aside-h">' + T('目录', 'Contents') + '</p><ol>' + toc + '</ol></nav><article class="read__body">' + (editing ? '<h1 id="read-title" class="sr-only">' + T('编辑合集', 'Edit guide') + '</h1>' + compEditHtml(c) : body) + '</article><aside class="read__sources">' + sourceOverview(c) + bound.sections.map(function (section, i) { return '<div class="margin-section" data-margin="' + (i + 1) + '">' + section.refs.map(function (n) { return marginCard(bound.sources[n - 1], c, i + 1); }).join('') + '</div>'; }).join('') + '</aside></div><aside id="sourcePeek" class="source-peek" hidden></aside>';
  }
  function alignMargins() {
    if (innerWidth < 900 || els.readDlg.classList.contains('trace-open')) return;
    var margin = els.readDlg.querySelector('.read__sources'); if (!margin) return;
    var top = margin.getBoundingClientRect().top, overview = margin.querySelector('.source-overview'), end = overview ? overview.getBoundingClientRect().bottom - top + 24 : 0;
    els.readDlg.querySelectorAll('[data-margin]').forEach(function (group) { var section = els.readDlg.querySelector('#read-sec-' + group.dataset.margin); if (!section) return; var position = section.getBoundingClientRect().top - top; var gap = Math.max(0, position - end); if (group.dataset.margin === '1') gap = Math.min(32, gap); group.style.marginTop = gap + 'px'; end = group.getBoundingClientRect().bottom - top + 24; });
  }
  function focusDialogHeading(dialog) { var heading = dialog.querySelector('h1,h2'); if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); } }
  function openRead(id, opener) {
    var c = compById(id); if (!c) return;
    readingCompId = id; readOpener = opener || document.activeElement; editingCompId = null;
    els.readDlg.classList.remove('trace-open', 'contents-open', 'is-scrolled'); els.readDlg.innerHTML = compReadHtml(c);
    if (!els.readDlg.open) els.readDlg.showModal(); els.readDlg.scrollTop = 0;
    els.readDlg.style.setProperty('--read-bar-h', els.readDlg.querySelector('.read__bar').getBoundingClientRect().height + 'px');
    focusDialogHeading(els.readDlg); X.images.hydrate(els.readDlg); document.fonts.ready.then(alignMargins);
  }
  function closeRead() { if (editingCompId && !confirm(T('放弃还没保存的修改？', 'Discard unsaved changes?'))) return; editingCompId = null; readingCompId = null; els.readDlg.close(); if (readOpener?.isConnected) readOpener.focus(); }
  function openSource(n, opener) {
    var c = compById(readingCompId), source = X.refs.bind(c).sources[n - 1]; if (!source) return;
    peekOpener = opener; var peek = els.readDlg.querySelector('#sourcePeek'), note = sourceNote(source, c);
    peek.hidden = false; peek.innerHTML = '<button class="btn" data-read="close-peek">' + svg('close') + T('关闭来源', 'Close source') + '</button>' + (note ? previewHtml(note, true) : '<div class="preview-inner"><h2 class="preview-title">' + esc(X.refs.label(source)) + '</h2><p>' + T('来源笔记已不在此库中，仍可打开原帖。', 'The source note is no longer in this library. Its original link is kept.') + '</p>' + (X.refs.isWebUrl(source.url) ? '<a href="' + esc(source.url) + '" target="_blank" rel="noreferrer">' + T('打开原帖', 'Open original') + '</a>' : '<span>' + esc(source.url) + '</span>') + '</div>');
    els.readDlg.querySelectorAll('.margin-card').forEach(function (card) { card.classList.toggle('is-active', Number(card.dataset.n) === n); });
    peek.setAttribute('tabindex', '-1'); peek.focus(); X.images.hydrate(peek); animate(peek, { opacity: 0, transform: innerWidth < 900 ? 'translateY(12px)' : 'translateX(12px)' }, { opacity: 1, transform: 'none' });
  }
  function closePeek() { els.readDlg.querySelector('#sourcePeek').hidden = true; if (peekOpener?.isConnected) peekOpener.focus(); }
  function traceHtml(c) {
    var sources = X.refs.bind(c), notes = (c.sourceNoteIds || []).map(noteById).filter(Boolean), videos = notes.filter(isVideo), chars = c.trace?.transcriptCharsUsed ?? videos.reduce(function (sum, note) { return sum + Math.min((note.transcript || '').length, 8000); }, 0);
    return '<div class="trace"><h2 class="read__aside-h">' + T('整理记录', 'How it was made') + '</h2><p>' + notes.length + T(' 篇笔记整理成 ', ' notes bound into ') + sources.sections.length + T(' 节', ' sections') + '</p><p>' + videos.length + T(' 段视频，转写共 ', ' videos, ') + chars.toLocaleString() + T(' 字用于整理', ' transcript characters used') + '</p><p>' + (c.trace?.imagesRead ?? T('未记录', 'Not recorded')) + T(' 张图送入，留下 ', ' images read, ') + Math.max((c.images || []).length, (c.imagesRepo || []).length) + T(' 张', ' kept') + '</p><p>' + esc(c.demoKey ? T('模型编写 · 示例回放', 'AI-authored · Demo replay') : (c.model || 'Claude').replace(/claude-.*/, 'Claude')) + ' · ' + esc(localDay(c.runAt || c.savedAt)) + '</p>' + (c.demoKey ? '<p>' + T('由 AI 模型按 Clipbind 自己的提示词编写；演示中回放，未现场请求模型。', 'Written by an AI model with Clipbind’s own prompt; replayed in the demo. No live model request.') + '</p>' : '') + '<div class="trace-matrix"><table><thead><tr><th>' + T('来源与节', 'Source / section') + '</th>' + sources.sections.map(function (section, i) { return '<th title="' + esc(section.heading) + '">' + (i + 1) + '</th>'; }).join('') + '</tr></thead><tbody>' + sources.sources.map(function (source) { var note = sourceNote(source, c); return '<tr><th><button class="btn" data-read="src" data-n="' + source.n + '">' + (note ? coverHtml(note) : '') + '<span>' + esc(X.refs.label(source)) + '</span></button>' + (!source.cited ? '<small>' + T('并入但未单独标注', 'Folded in, uncited') + '</small>' : '') + '</th>' + sources.sections.map(function (section) { return '<td aria-label="' + (section.refs.includes(source.n) ? T('引用', 'Cited') : T('未引用', 'Not cited')) + '">' + (section.refs.includes(source.n) ? '<span class="trace-dot"></span>' : '') + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div></div>';
  }
  function saveGuideEdit() {
    var c = compById(readingCompId); if (!c) return;
    if (c.savedAt !== editingRevision) {
      setStatus(T('这篇合集刚被另一处更新了。请先复制正在编辑的文字，再取消编辑并重新打开。', 'This guide changed elsewhere. Copy your draft, then cancel editing and open the updated guide.'), 'err');
      return;
    }
    var read = els.readDlg;
    X.store.saveComp(Object.assign({}, c, { title: read.querySelector('.comp__ed-title').value.trim(), summary: read.querySelector('.comp__ed-sum').value.trim(), sections: c.sections.map(function (section, i) { return Object.assign({}, section, { heading: read.querySelector('.comp__ed-h[data-i="' + i + '"]').value, content: read.querySelector('.comp__ed-c[data-i="' + i + '"]').value }); }) }));
    editingCompId = null; scheduleSync(); renderLibrary(); openRead(c.id, readOpener);
  }
  function seedSamples() { X.demo.notes(X.i18n.lang).forEach(function (note) { X.store.save(note); }); renderLibrary(); scheduleSync(); setStatus(T('已载入 36 篇虚构示例笔记', 'Loaded 36 fictional sample notes'), 'ok'); }
  function seedDemo() {
    var language = X.i18n.lang; if (demoLanguage === language) return; demoLanguage = language;
    var notes = X.demo.notes(language), previous = new Map(X.store.getAll().filter(function (n) { return n.demoKey; }).map(function (n) { return [n.id, n]; }));
    X.store.replaceAll(X.store.getAll().filter(function (n) { return !n.demoKey; }).concat(notes.map(function (note) { return Object.assign({}, note, { archived: previous.has(note.id) ? previous.get(note.id).archived : note.group === 'kyoto' }); })));
    var previousGuides = new Map(X.store.getComps().map(function (c) { return [c.id, c]; }));
    X.store.replaceAllComps(X.store.getComps().filter(function (c) { return !c.demoKey; }).concat((previousGuides.has('demo-guide-food') ? ['kyoto', 'food'] : ['kyoto']).map(function (key) { var c = X.demo.guide(key, language); return Object.assign(c, { archived: previousGuides.get(c.id)?.archived || false }); })));
    activeFilter = '美食'; focusedId = 'demo-food-1'; renderLibrary();
    if (!els.urlInput.value || els.urlInput.dataset.sample === 'true') { els.urlInput.value = ''; els.urlInput.dataset.sample = 'true'; }
  }
  function renderStatic() {
    if (renderedLanguage && renderedLanguage !== X.i18n.lang) {
      els.status.hidden = true;
      toastActions = [];
      if (binding) bindStep = T('正在整理，请保持页面打开。', 'Binding. Keep this page open.');
      else els.bindProgress.textContent = '';
    }
    renderedLanguage = X.i18n.lang;
    X.i18n.applyStatic();
    els.urlInput.placeholder = T('粘贴链接或分享文字', 'Paste a link or share text'); els.urlInput.setAttribute('aria-label', els.urlInput.placeholder);
    els.fetchBtn.textContent = T('保存', 'Save'); els.pasteBtn.textContent = T('粘贴', 'Paste');
    els.search.placeholder = T('搜索笔记和合集', 'Search notes and guides'); els.search.setAttribute('aria-label', els.search.placeholder); els.search.title = els.search.placeholder + ' (⌘K)';
    els.syncBtn.setAttribute('aria-label', T('同步', 'Sync')); els.searchToggle.setAttribute('aria-label', T('搜索', 'Search'));
    els.rail.setAttribute('aria-label', T('收藏库', 'Library')); els.detailPane.setAttribute('aria-label', T('笔记预览', 'Note preview'));
    document.querySelector('.list-column').setAttribute('aria-label', T('笔记和合集', 'Notes and guides'));
    els.phonePlaces.setAttribute('aria-label', T('收藏库', 'Library'));
    els.noteDlg.setAttribute('aria-label', T('笔记', 'Note'));
    els.aboutBtn.textContent = T('它是怎么做的', 'How it works'); els.aboutBtn.hidden = true;
    var settingsAbout = document.querySelector('#suite-app-controls [data-how]');
    if (settingsAbout && settingsAbout.textContent !== els.aboutBtn.textContent) settingsAbout.textContent = els.aboutBtn.textContent;
    els.newGuide.textContent = T('新合集', 'New guide'); els.existingGuide.textContent = compById(els.addToComp.value)?.title || T('并入已有合集', 'Add to a guide');
    els.consolidateBtn.textContent = T('整理成合集', 'Bind into a guide'); els.openTray.textContent = els.consolidateBtn.textContent;
    els.clearSel.setAttribute('aria-label', T('取消选择', 'Clear selection'));
    els.exportMd.textContent = T('下载笔记（Markdown）', 'Download notes (Markdown)'); els.exportJson.textContent = T('下载笔记（JSON）', 'Download notes (JSON)');
    els.fixAllBtn.textContent = T('修复所有图片', 'Fix all images'); els.fixAllBtn.title = T('把小红书会过期的图片存进你的私有仓库', 'Keep expiring Xiaohongshu images in your private repository');
    els.archToggle.firstChild.textContent = T('归档 ', 'Archive '); els.compArchToggle.firstChild.textContent = T('已归档合集 ', 'Archived guides ');
    document.querySelector('[data-toggle-rail]').textContent = railCollapsed ? T('显示侧栏', 'Show sidebar') : T('收起侧栏', 'Hide sidebar');
    document.querySelector('[data-toggle-pane]').textContent = paneCollapsed ? T('显示预览', 'Show preview') : T('收起预览', 'Hide preview');
    document.querySelector('.skip').textContent = T('跳到笔记', 'Skip to notes'); document.querySelector('.brand').setAttribute('aria-label', T('Clipbind 首页', 'Clipbind home'));
    document.querySelectorAll('summary[aria-label]').forEach(function (el) { if (el.closest('.library-menu')) el.setAttribute('aria-label', T('收藏库工具', 'Library tools')); });
    var sample = document.querySelector('[data-demo-capture]'); sample.hidden = !demo; sample.textContent = T('试存一条示例', 'Try a sample save');
    if (demo && !els.demoStrip.dataset.dismissed) { els.demoStrip.hidden = false; els.demoStrip.innerHTML = '<span>' + T('虚构示例', 'Fictional notes') + '</span><button class="btn" data-cact="read" data-id="demo-guide-kyoto">' + T('打开《京都五日》', 'Open Kyoto guide') + '</button><button class="btn" data-how>' + T('它是怎么做的', 'How it works') + '</button>' + iconBtn('data-dismiss-demo', '关闭示例提示', 'Dismiss demo strip', 'close'); }
  }
  function showInfo(shortcuts, localVideo) {
    var title = shortcuts ? T('键盘快捷键', 'Keyboard shortcuts') : localVideo ? T('本机视频服务', 'Local video service') : T('它是怎么做的', 'How it works');
    var stages = [
      ['parse.js', T('粘贴与读取', 'Paste and read'), T('Jina HTML、Jina Markdown、AllOrigins 依次尝试。网站拦截时保留分享文字和链接。', 'Try Jina HTML, Jina Markdown, then AllOrigins. Keep share text and links when reading is blocked.'), 'node check-capture.mjs'],
      ['classify.js', T('自动找主题', 'Find the topic'), T('按中文关键词评分，保存时不用选文件夹。主题随时能改。', 'Chinese keyword scoring finds a topic. Change it after saving.'), 'check-redesign.mjs'],
      ['store.js', T('保存在浏览器', 'Keep a browser copy'), T('正文、转写和图片链接放进 IndexedDB。完整备份在设置里。', 'Keep text, transcripts and image links in IndexedDB. Full backup is in Settings.'), 'settings-v2.test.mjs'],
      ['merge.js', T('两台设备一起用', 'Merge two devices'), T('同步到自己的私有仓库。合并两边记录，保留删除记录，冲突时重读再合并。', 'Sync to a private repository. Merge records and deletion lists, then retry revision conflicts.'), 'node check.mjs · 40 cases · --break'],
      ['ai.js', T('整理成一篇合集', 'Bind a guide'), T('Claude 去重、保留具体信息，把每一节与来源对应。图里的菜单与价目表也能读。', 'Claude de-duplicates, keeps concrete details and links each section to its sources. Image text can be included.'), 'node check-models.mjs'],
      ['refs.js', T('沿来源读回去', 'Follow the sources'), T('全文统一编号，点引用可看原笔记。复制与 Markdown 下载共用同一套来源逻辑。', 'Shared citation numbering opens the saved note. Text copy and Markdown download use the same source resolver.'), 'node check-export.mjs'],
      ['fetch.js', T('视频留在本机处理', 'Process video locally'), T('yt-dlp 下载，faster-whisper 转写，按画面差异取帧，再由 Claude 挑出有信息的截图。登录态和媒体留在本机。示例转写是虚构脚本。', 'yt-dlp downloads, faster-whisper transcribes, frame differences find candidates, then Claude selects useful frames. Sessions and media stay local. Demo transcripts are scripted.'), 'node check-capture.mjs']
    ];
    pipelineStages = [
      ['parse.js', T('粘贴', 'Paste'), T('先保留文字和链接，再读取原帖。失败也能继续编辑。', 'Keep text and its link before fetching. A failed read leaves an editable note.'), 'node check-capture.mjs'],
      ['fetch.js', T('读取', 'Read'), stages[0][2], stages[0][3]],
      stages[1],
      ['merge.js', T('保存与同步', 'Store and sync'), stages[2][2] + ' ' + stages[3][2], 'node check.mjs · 40 cases · --break'],
      stages[4], stages[5],
      ['app.js', T('阅读', 'Reader'), T('点编号回看原笔记，在阅读处编辑，或下载带来源的全文。', 'Follow a citation to the saved note, edit where you read, or download the full guide with its sources.'), 'node check-export.mjs']
    ];
    var keys = [['/', T('搜索', 'Search')], ['a', T('粘贴输入框', 'Capture field')], ['j / k', T('下一篇、上一篇', 'Next or previous note')], ['x', T('选择笔记', 'Select note')], ['⌘A', T('全选当前列表', 'Select current list')], ['b', T('整理所选笔记', 'Bind selection')], ['e', T('归档', 'Archive')], ['[ / ]', T('收起侧栏、预览', 'Collapse rail or preview')], ['n / p', T('阅读下一节、上一节', 'Next or previous section')], ['z', T('撤销', 'Undo')], ['Esc', T('关闭上层，再取消选择', 'Close top layer, then clear selection')]];
    els.infoDlg.innerHTML = '<button class="btn" data-close-info>' + svg('close') + T('关闭', 'Close') + '</button><h1 id="info-title">' + title + '</h1>' + (shortcuts ? '<div class="shortcut-list">' + keys.map(function (key) { return '<kbd>' + key[0] + '</kbd><span>' + key[1] + '</span>'; }).join('') + '</div>' : localVideo ? '<p>' + stages[6][2] + '</p><p>' + T('在电脑上按仓库 local/README.md 启动服务，然后到设置的连接部分保存本机服务口令。', 'Start the service following local/README.md, then save its local service token under Connections in Settings.') + '</p><button class="btn" data-open-ai>' + T('打开设置', 'Open Settings') + '</button>' : '<p>' + T('笔记进来，带着来源的合集出去。每一步都能在代码和测试里找到。', 'A saved pile becomes a guide with traceable sources. Follow each step in the code and its checks.') + '</p><div class="pipeline-flow" role="tablist">' + pipelineStages.map(function (stage, i) { return (i ? svg('chevron') : '') + '<button class="pipeline-node" role="tab" aria-selected="' + (i === 0) + '" data-pipeline-node="' + i + '">' + stage[1] + '</button>'; }).join('') + '</div><div class="pipeline-branch">' + svg('video') + '<button class="btn" data-pipeline-video>' + T('本机视频：下载、转写、挑截图，再接入读取','Local video: download, transcribe, select frames, then join Read') + '</button></div><section id="pipelineDetail" class="pipeline-detail" role="tabpanel"></section>');
    els.infoDlg.showModal(); focusDialogHeading(els.infoDlg); if (!shortcuts && !localVideo) renderPipelineDetail(0);
  }
  function renderPipelineDetail(index, video) {
    var stage = video ? ['fetch.js', T('本机视频', 'Local video'), T('本机下载和转写，按画面差异取帧，再由模型挑选有用截图。登录态和媒体留在本机；候选截图可发送给模型。', 'Download and transcribe locally, find frame changes, then ask the model to keep useful frames. Sessions and media stay local; candidate images may be sent to the model.'), 'node check-capture.mjs'] : pipelineStages[index];
    var detail = document.getElementById('pipelineDetail'); if (!detail || !stage) return;
    detail.innerHTML = '<h2>' + stage[1] + '</h2><p>' + stage[2] + '</p><a href="https://github.com/NickkkLian/content-organizer/blob/main/js/' + stage[0] + '" target="_blank" rel="noreferrer">' + stage[0] + '</a><p><code>' + stage[3] + '</code></p>';
    els.infoDlg.querySelectorAll('[data-pipeline-node]').forEach(function (button) { button.setAttribute('aria-selected', !video && Number(button.dataset.pipelineNode) === index); });
  }
  function handleNoteAction(button) {
    var id = button.dataset.id, note = noteById(id), action = button.dataset.act;
    if (action === 'demo') return seedSamples(); if (!note) return;
    if (action === 'preview' || action === 'paste-text') showNote(id);
    else if (action === 'retry-fetch') onFetch(note.url || note.body);
    else if (action === 'open') { if (X.refs.isWebUrl(note.url)) window.open(note.url, '_blank', 'noreferrer'); }
    else if (action === 'copy-lib') copyText(noteToMarkdown(note));
    else if (action === 'copy-transcript') copyText(note.transcript);
    else if (action === 'topic') topicPicker(id, button.closest('.preview-inner'));
    else if (action === 'arch' || action === 'unarch') { action === 'arch' ? X.store.archive([id]) : X.store.unarchive([id]); selectedIds.delete(id); renderLibrary(); scheduleSync(); setStatus(action === 'arch' ? T('已归档', 'Archived') : T('已取出', 'Restored'), 'ok', [rememberUndo(function () { action === 'arch' ? X.store.unarchive([id]) : X.store.archive([id]); renderLibrary(); scheduleSync(); })]); }
    else if (action === 'del' && confirm(T('删除这篇笔记？', 'Delete this note?'))) { X.store.remove(id); selectedIds.delete(id); if (els.noteDlg.open) els.noteDlg.close(); renderLibrary(); scheduleSync(); }
    else if (action === 'fiximg') { if (demo) { X.store.update(id, { demoExpired: false }); renderLibrary(); setStatus(T('演示回放 · 图片已修复', 'Demo replay · Images repaired'), 'ok'); } else fixNoteImages(id).then(function () { renderLibrary(); scheduleSync(); }).catch(function (error) { setStatus(error.message, 'err'); }); }
    else if (action === 'save-text') {
      var container = button.closest('.note-editor');
      var text = container.querySelector('[data-note-text]').value;
      var imageText = container.querySelector('[data-note-images]').value;
      var parsed = X.buildManual(text, imageText);
      var changedImages = imageText !== (note.images || []).filter(X.refs.isWebUrl).join('\n');
      var images = changedImages ? parsed.images : note.images;
      var repository = changedImages ? parsed.images.map(function (url) { var index = (note.images || []).indexOf(url); return index < 0 ? null : (note.imagesRepo || [])[index] || null; }) : note.imagesRepo;
      noteDrafts.delete(id);
      X.store.update(id, { body: parsed.body || text, images: images, imagesRepo: repository, tags: Array.from(new Set((note.tags || []).concat(parsed.tags))), captureState: '' });
      renderLibrary();
      if (els.noteDlg.open) showNote(id);
      scheduleSync();
      setStatus(T('正文已保存', 'Text saved'), 'ok');
    }
  }
  function handleReadAction(button) {
    var action = button.dataset.read, c = compById(readingCompId);
    if (action === 'close') return closeRead();
    if (action === 'src') return openSource(Number(button.dataset.n), button);
    if (action === 'close-peek') return closePeek();
    if (action === 'copy') return copyText(compToMarkdown(c));
    if (action === 'export') return download(X.export.filename(c), compToMarkdown(c), 'text/markdown;charset=utf-8');
    if (action === 'jump') { var section = els.readDlg.querySelector('#read-sec-' + button.dataset.i); section?.scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' }); section?.querySelector('h2')?.focus({ preventScroll: true }); els.readDlg.classList.remove('contents-open'); }
    if (action === 'contents') els.readDlg.classList.toggle('contents-open');
    if (action === 'trace') { var open = els.readDlg.classList.toggle('trace-open'); els.readDlg.querySelector('.read__sources').innerHTML = open ? traceHtml(c) : sourceOverview(c) + X.refs.bind(c).sections.map(function (section, i) { return '<div class="margin-section" data-margin="' + (i + 1) + '">' + section.refs.map(function (n) { return marginCard(X.refs.bind(c).sources[n - 1], c, i + 1); }).join('') + '</div>'; }).join(''); if (!open) alignMargins(); }
    if (action === 'edit') { editingCompId = c.id; editingRevision = c.savedAt; els.readDlg.innerHTML = compReadHtml(c); els.readDlg.querySelector('.comp__ed-title').focus(); }
    if (action === 'save-edit') saveGuideEdit();
    if (action === 'cancel-edit') { editingCompId = null; openRead(c.id, readOpener); }
    if (action === 'add') { closeRead(); activePlace = 'saved'; renderLibrary(); els.addToComp.value = c.id; els.existingGuide.textContent = c.title; els.newGuide.setAttribute('aria-pressed', 'false'); els.existingGuide.setAttribute('aria-pressed', 'true'); }
    if (action === 'reorg' && confirm(T('重新整理这篇合集？会去重、合并与重排。', 'Re-organize this guide? It will de-duplicate, merge and reorder the text.'))) { closeRead(); runConsolidate(c, true); }
    if (action === 'arch' || action === 'unarch') { X.store.saveComp(Object.assign({}, c, { archived: action === 'arch' })); closeRead(); renderLibrary(); scheduleSync(); }
    if (action === 'del' && confirm(T('删除这篇合集？', 'Delete this guide?'))) { X.store.removeComp(c.id); closeRead(); renderLibrary(); scheduleSync(); }
  }
  function bind() {
    els.captureForm.addEventListener('submit', function (event) { event.preventDefault(); onFetch(); });
    els.urlInput.addEventListener('input', function () { els.urlInput.dataset.sample = 'false'; });
    els.pasteBtn.addEventListener('click', async function () { try { await onFetch(await navigator.clipboard.readText()); } catch (error) { setStatus(T('请把剪贴板内容粘进输入框，再点保存。', 'Paste your clipboard into the field, then choose Save.'), 'err'); els.urlInput.focus(); } });
    document.addEventListener('paste', function (event) { if (event.target.closest('input,textarea,[contenteditable=true]') || document.querySelector('dialog[open]')) return; var text = event.clipboardData?.getData('text/plain'); if (text) { event.preventDefault(); onFetch(text); } });
    els.search.addEventListener('input', function () { activeTag = ''; if (activePlace === 'guides') activePlace = 'saved'; renderLibrary(); });
    els.searchToggle.addEventListener('click', function () { document.querySelector('.topbar').classList.toggle('search-open'); els.search.focus(); });
    els.selectAll.addEventListener('click', function () { visibleNotes.forEach(function (n) { selectedIds.add(n.id); }); renderLibrary(); });
    els.clearSel.addEventListener('click', function () { if (binding) return; selectedIds.clear(); if (els.noteDlg.open) els.noteDlg.close(); renderLibrary(); });
    els.newGuide.addEventListener('click', function () { els.addToComp.value = ''; els.newGuide.setAttribute('aria-pressed', 'true'); els.existingGuide.setAttribute('aria-pressed', 'false'); els.guideMenu.hidden = true; updateSelBar(); });
    els.existingGuide.addEventListener('click', function () { els.guideMenu.hidden = !els.guideMenu.hidden; });
    els.consolidateBtn.addEventListener('click', function () { runConsolidate(compById(els.addToComp.value) || null); });
    els.openTray.addEventListener('click', openTray);
    els.noteDlg.addEventListener('close', function () { if (els.noteDlg.contains(els.selBar)) els.detailPane.append(els.selBar); });
    document.addEventListener('close', function (event) { if (event.target.contains(els.status)) document.body.append(els.status); }, true);
    document.addEventListener('input', function (event) {
      if (!event.target.matches('[data-note-text],[data-note-images]')) return;
      var editor = event.target.closest('.note-editor');
      var id = editor.querySelector('[data-act=save-text]').dataset.id;
      noteDrafts.set(id, { text: editor.querySelector('[data-note-text]').value, images: editor.querySelector('[data-note-images]').value });
    });
    els.syncBtn.addEventListener('click', doSync);
    els.fixAllBtn.addEventListener('click', function () { if (demo) setStatus(T('演示数据的图片都保存在应用里。', 'Demo images are kept with the app.'), 'ok'); else fixAllImages(); });
    els.exportJson.addEventListener('click', function () { download('clipbind-notes.json', JSON.stringify(X.store.getAll(), null, 2), 'application/json'); });
    els.exportMd.addEventListener('click', function () { download('clipbind-notes.md', X.store.getAll().map(noteToMarkdown).join('\n\n---\n\n'), 'text/markdown'); });
    els.archToggle.addEventListener('click', function () { activePlace = 'archive'; activeFilter = 'all'; activeTag = ''; selectedIds.clear(); renderLibrary(); });
    els.compArchToggle.addEventListener('click', function () { activePlace = 'archive'; activeFilter = 'all'; renderLibrary(); });
    els.aboutBtn.addEventListener('click', function () { showInfo(); });
    document.addEventListener('click', function (event) {
      var imageLink = event.target.closest('.gallery a');
      if (imageLink) {
        var image = imageLink.querySelector('img');
        if (image?.src && safeImage(image.src)) {
          event.preventDefault();
          var lightbox = document.getElementById('imageDlg');
          lightbox.innerHTML = '<button class="btn" data-close-image>' + svg('close') + T('关闭图片', 'Close image') + '</button><h1 id="image-title">' + esc(image.alt) + '</h1><img src="' + esc(image.src) + '" alt="' + esc(image.alt) + '">';
          lightbox.showModal(); focusDialogHeading(lightbox);
          return;
        }
      }
      var button = event.target.closest('button, a[data-read]'); if (!button) return;
      if (button.hasAttribute('data-close-image')) document.getElementById('imageDlg').close();
      if (button.dataset.place) { activePlace = button.dataset.place; activeFilter = 'all'; activeTag = ''; selectedIds.clear(); renderLibrary(); }
      if (button.dataset.cat) { activePlace = activePlace === 'archive' ? 'archive' : 'saved'; activeFilter = button.dataset.cat; activeTag = ''; try { localStorage.setItem('clipbind-pile', activeFilter); } catch (error) {} renderLibrary(); }
      if (button.dataset.tag) { activeTag = activeTag === button.dataset.tag ? '' : button.dataset.tag; renderLibrary(); }
      if (button.dataset.dim) { if (button.dataset.dim === 'platform') activePlatform = button.dataset.val; else activeType = button.dataset.val; activeTag = ''; renderLibrary(); }
      if (button.dataset.act) handleNoteAction(button);
      if (button.dataset.cact === 'read') openRead(button.dataset.id, button);
      if (button.dataset.cact === 'unarch') { var c = compById(button.dataset.id); X.store.saveComp(Object.assign({}, c, { archived: false })); renderLibrary(); scheduleSync(); }
      if (button.dataset.read) { event.preventDefault(); handleReadAction(button); }
      if (button.hasAttribute('data-toast')) toastActions[Number(button.dataset.toast)]?.run();
      if (button.hasAttribute('data-dismiss-toast')) els.status.hidden = true;
      if (button.hasAttribute('data-dismiss-demo')) { els.demoStrip.dataset.dismissed = 'true'; els.demoStrip.hidden = true; }
      if (button.hasAttribute('data-demo-capture')) onFetch(X.demo.captureText(X.i18n.lang));
      if (button.hasAttribute('data-phone-select-all')) { visibleNotes.forEach(function (note) { selectedIds.add(note.id); }); renderLibrary(); }
      if (button.hasAttribute('data-pipeline-node')) renderPipelineDetail(Number(button.dataset.pipelineNode));
      if (button.hasAttribute('data-pipeline-video')) renderPipelineDetail(0, true);
      if (button.hasAttribute('data-how')) showInfo();
      if (button.hasAttribute('data-close-info')) els.infoDlg.close();
      if (button.hasAttribute('data-close-note')) els.noteDlg.close();
      if (button.hasAttribute('data-open-ai')) { if (els.infoDlg.open) els.infoDlg.close(); if (els.noteDlg.open) els.noteDlg.close(); SuiteSettings.open('ai'); }
      if (button.hasAttribute('data-local-help')) showInfo(false, true);
      if (button.dataset.removeSelection) { selectedIds.delete(button.dataset.removeSelection); renderLibrary(); }
      if (button.dataset.targetGuide) { els.addToComp.value = button.dataset.targetGuide; els.existingGuide.textContent = compById(button.dataset.targetGuide).title; els.newGuide.setAttribute('aria-pressed', 'false'); els.existingGuide.setAttribute('aria-pressed', 'true'); els.guideMenu.hidden = true; updateSelBar(); }
      if (button.dataset.demoSet) chooseDemoSet(button.dataset.demoSet);
      if (button.dataset.topicChoice) { X.store.update(button.dataset.id, { category: button.dataset.topicChoice, topicChosen: true }); scheduleSync(); renderLibrary(); if (els.noteDlg.open) showNote(button.dataset.id); }
      if (button.hasAttribute('data-clear-search')) { els.search.value = ''; renderLibrary(); }
      if (button.hasAttribute('data-toggle-rail')) { railCollapsed = !railCollapsed; els.main.classList.toggle('rail-collapsed', railCollapsed); renderStatic(); }
      if (button.hasAttribute('data-toggle-pane')) { paneCollapsed = !paneCollapsed; els.main.classList.toggle('pane-collapsed', paneCollapsed); renderStatic(); }
    });
    els.libList.addEventListener('click', function (event) { var row = event.target.closest('[data-note]'); if (!row || event.target.closest('button,input,a')) return; if (selectedIds.size) selectNote(row.dataset.note, !selectedIds.has(row.dataset.note), event.shiftKey); else showNote(row.dataset.note); });
    els.libList.addEventListener('click', function (event) { var checkbox = event.target.closest('.selbox'); if (checkbox) selectNote(checkbox.dataset.id, checkbox.checked, event.shiftKey); });
    els.libList.addEventListener('focusin', function (event) {
      var row = event.target.closest('[data-note]');
      if (!row) return;
      focusedId = row.dataset.note;
      els.libList.querySelectorAll('[data-note]').forEach(function (entry) { entry.classList.toggle('is-focused', entry === row); });
    });
    var pressTimer, pressX, pressY, longPressed = false;
    els.libList.addEventListener('pointerdown', function (event) { if (event.pointerType !== 'touch' || event.target.closest('button,input')) return; var row = event.target.closest('[data-note]'); if (!row) return; pressX = event.clientX; pressY = event.clientY; longPressed = false; pressTimer = setTimeout(function () { selectNote(row.dataset.note, true); longPressed = true; }, 450); });
    els.libList.addEventListener('pointermove', function (event) { if (Math.abs(event.clientX - pressX) + Math.abs(event.clientY - pressY) > 10) clearTimeout(pressTimer); });
    ['pointerup', 'pointercancel'].forEach(function (type) { els.libList.addEventListener(type, function () { clearTimeout(pressTimer); }); });
    els.libList.addEventListener('click', function (event) { if (longPressed) { event.preventDefault(); event.stopImmediatePropagation(); longPressed = false; } }, true);
    els.libList.addEventListener('dragstart', function (event) { var row = event.target.closest('[data-note]'); if (row) { if (!selectedIds.has(row.dataset.note)) selectNote(row.dataset.note, true); event.dataTransfer.setData('text/plain', row.dataset.note); } });
    els.railGuides.addEventListener('dragover', function (event) { if (event.target.closest('[data-cact]')) event.preventDefault(); });
    els.railGuides.addEventListener('drop', function (event) { var target = event.target.closest('[data-cact]'); if (!target) return; event.preventDefault(); els.addToComp.value = target.dataset.id; updateSelBar(); });
    els.readDlg.addEventListener('cancel', function (event) { event.preventDefault(); var peek = els.readDlg.querySelector('#sourcePeek'); if (peek && !peek.hidden) closePeek(); else closeRead(); });
    els.readDlg.addEventListener('scroll', function () { els.readDlg.classList.toggle('is-scrolled', els.readDlg.scrollTop > 100); }, { passive: true });
    window.addEventListener('resize', function () { alignMargins(); moveFilters(); });
    document.addEventListener('keydown', keyboard);
    window.addEventListener('beforeunload', function (event) { if (pendingCaptures.size || binding || editingCompId || noteDrafts.size) { event.preventDefault(); event.returnValue = ''; } });
  }
  function keyboard(event) {
    if (event.defaultPrevented) return;
    if (event.key === 'Escape' && els.readDlg.open) { event.preventDefault(); var peek = els.readDlg.querySelector('#sourcePeek'); if (peek && !peek.hidden) closePeek(); else closeRead(); return; }
    if (event.key === 'Escape' && !document.querySelector('dialog[open]')) { if (!binding) { selectedIds.clear(); renderLibrary(); } event.preventDefault(); return; }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !document.querySelector('dialog[open]')) { event.preventDefault(); document.querySelector('.topbar').classList.add('search-open'); els.search.focus(); return; }
    if (event.target.closest('input,textarea,select,[contenteditable=true]')) return;
    if (els.infoDlg.open || els.noteDlg.open || document.querySelector('.suite-panel[open]')) return;
    if (els.readDlg.open) { if (['n', 'p'].includes(event.key) && Appearance.shortcutsOn()) { var headings = Array.from(els.readDlg.querySelectorAll('.read__sec h2')), current = headings.findIndex(function (h) { return h === document.activeElement; }), next = headings[Math.max(0, Math.min(headings.length - 1, current + (event.key === 'n' ? 1 : -1)))]; next?.focus(); next?.scrollIntoView({ block: 'start' }); } return; }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); if (activePlace === 'saved') { visibleNotes.forEach(function (n) { selectedIds.add(n.id); }); renderLibrary(); } return; }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.querySelector('.topbar').classList.add('search-open'); els.search.focus(); return; }
    if (!Appearance.shortcutsOn() || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === '/') { event.preventDefault(); document.querySelector('.topbar').classList.add('search-open'); els.search.focus(); }
    if (event.key === 'a') { event.preventDefault(); els.urlInput.focus(); }
    if (event.key === '?') showInfo(true);
    if (event.key === 'z') lastUndo?.();
    if (event.key === '[') { railCollapsed = !railCollapsed; els.main.classList.toggle('rail-collapsed', railCollapsed); }
    if (event.key === ']') { paneCollapsed = !paneCollapsed; els.main.classList.toggle('pane-collapsed', paneCollapsed); }
    if ((event.key === 'j' || event.key === 'k') && activePlace === 'guides') { var guides = Array.from(els.compList.querySelectorAll('[data-cact=read]')); var current = guides.indexOf(document.activeElement); guides[Math.max(0, Math.min(guides.length - 1, current + (event.key === 'j' ? 1 : -1)))]?.focus(); return; }
    if (event.key === 'j' || event.key === 'k') { var index = visibleNotes.findIndex(function (n) { return n.id === focusedId; }); var note = visibleNotes[Math.max(0, Math.min(visibleNotes.length - 1, index + (event.key === 'j' ? 1 : -1)))]; if (note) { focusedId = note.id; renderPreview(); var row = Array.from(els.libList.querySelectorAll('[data-note]')).find(function (el) { return el.dataset.note === note.id; }); row?.focus(); } }
    if (event.key === 'x' && focusedId) { event.preventDefault(); selectNote(focusedId, !selectedIds.has(focusedId), false, true); }
    if (event.key === 'Enter' && event.target.matches('[data-note]')) showNote(event.target.dataset.note);
    if (event.key === 'e' && focusedId && activePlace === 'saved') { X.store.archive([focusedId]); selectedIds.delete(focusedId); renderLibrary(); scheduleSync(); }
    if (event.key === 'b' && selectedIds.size) { if (innerWidth < 900) openTray(); else runConsolidate(compById(els.addToComp.value)); }
  }
  function init() {
    ['main','status','urlInput','search','rail','places','phonePlaces','catFilter','phoneTopics','topicCaption','platFilter','railGuides','archCount','compArchCount','pileTitle','pileTags','selectAll','pileGuide','libCount','libList','compsCard','compList','compCount','preview','detailPane','selBar','mobileSelection','selCount','selectedStack','includeImgs','imageOptionText','bindConsequence','guideMenu','bindNotice','bindProgress','consolidateBtn','addToComp','noteDlg','readDlg','infoDlg','fetchBtn','pasteBtn','syncBtn','syncStatus','searchToggle','aboutBtn','newGuide','existingGuide','clearSel','exportMd','exportJson','fixAllBtn','archToggle','compArchToggle','openTray','captureForm','demoStrip'].forEach(function (id) { els[id] = document.getElementById(id); });
    try { activeFilter = localStorage.getItem('clipbind-pile') || 'all'; } catch (error) {}
    renderStatic(); bind(); initTips(); X.app.ready = true;
    if (demo) seedDemo(); else renderLibrary(); updateSyncUI();
    if (X.sync.isConfigured()) doSync();
    var observed = new MutationObserver(function () { var container = document.querySelector('#suite-app-controls'); if (container && !container.querySelector('[data-how]')) { var button = document.createElement('button'); button.className = 'btn'; button.dataset.how = ''; button.textContent = T('它是怎么做的', 'How it works'); container.append(button); } });
    observed.observe(document.body, { childList: true, subtree: true });
    if (typeof ResizeObserver !== 'undefined') {
      var headerSize = new ResizeObserver(function () { document.documentElement.style.setProperty('--header-height', document.querySelector('.topbar').getBoundingClientRect().height + 'px'); });
      headerSize.observe(document.querySelector('.topbar'));
    }
  }
  function hasEditingDrafts() { return editingCompId !== null || noteDrafts.size > 0 || selectedIds.size > 0 || Boolean(els.urlInput?.value.trim() && els.urlInput.dataset.sample !== 'true'); }
  X.app = {
    ready: false, hasEditingDrafts: hasEditingDrafts,
    hasContentDrafts: function () { return editingCompId !== null || noteDrafts.size > 0 || Boolean(els.urlInput?.value.trim() && els.urlInput.dataset.sample !== 'true'); },
    unsaved: function () { return hasEditingDrafts() || pendingCaptures.size > 0 || binding || syncing || Boolean(syncTimer) || X.sync.hasUnsynced() || X.store.error(); },
    cancelSync: function () { clearTimeout(syncTimer); syncTimer = null; }, scheduleSync: scheduleSync,
    resetDrafts: function () { selectedIds.clear(); noteDrafts.clear(); editingCompId = null; readingCompId = null; if (els.readDlg.open) els.readDlg.close(); if (els.noteDlg.open) els.noteDlg.close(); els.urlInput.value = ''; },
    refreshAI: updateSelBar,
    rerender: function () { if (!els.libList) return; renderStatic(); if (demo) seedDemo(); renderLibrary(); updateSyncUI(); }
  };
  window.addEventListener('clipbind-storage-error', function () { if (els.status) setStatus(T('本机副本没保存上，请到设置里重试，或先导出完整备份。', 'This browser copy could not be saved. Retry in Settings or export a full backup.'), 'err'); });
  document.addEventListener('DOMContentLoaded', function () {
    X.store.init().then(function () {
      var start = async function () { await X.settings.initializeSource(); init(); };
      return typeof HubSettingsRuntime === 'undefined' ? start() : HubSettingsRuntime.track(start);
    }).catch(function (error) { init(); X.settings.pause(true); setStatus(error.message, 'err'); });
  });
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

  async function copyText(t){return (typeof HubSettingsRuntime==='undefined'?(fn=>fn()):(fn=>HubSettingsRuntime.track(fn)))(async()=>{/* settings workflow */
    try { await navigator.clipboard.writeText(t); setStatus(T('已复制到剪贴板','Copied to clipboard'), 'ok'); }
    catch (e) {
      var ta = document.createElement('textarea');
      ta.value = t; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove(); setStatus(T('已复制','Copied'), 'ok');
    }
  });}

  function download(name, content, type){
    var blob = new Blob([content], { type: type || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  async function fixNoteImages(id, quiet){return (typeof HubSettingsRuntime==='undefined'?(fn=>fn()):(fn=>HubSettingsRuntime.track(fn)))(async()=>{/* settings workflow */
    var note = X.store.getAll().find(function (n) { return n.id === id; });
    if (!note) return { ok: 0, fail: 0 };
    if (!X.images.ready()) {
      setStatus(T('请先在设置的连接部分里连接 GitHub（归档图片需要令牌）','Connect GitHub in Settings → Connection first (archiving needs a token)'), 'err');
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
  });}

  async function fixAllImages(){return (typeof HubSettingsRuntime==='undefined'?(fn=>fn()):(fn=>HubSettingsRuntime.track(fn)))(async()=>{/* settings workflow */
    var todo = X.store.getAll().filter(function (n) {
      return (n.images || []).length > (n.imagesRepo || []).filter(Boolean).length;
    });
    if (!todo.length) { setStatus(T('所有图片都已归档','All images already archived'), 'ok'); return; }
    if (!X.images.ready()) { setStatus(T('请先在设置的连接部分里连接 GitHub（归档图片需要令牌）','Connect GitHub in Settings → Connection first (archiving needs a token)'), 'err'); return; }
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
      setStatus(T('修复完成：归档 ','Done: archived ') + ok + T(' 张','') + (fail ? T('，','; ') + fail + T(' 张失败（原帖可能已删除或需登录）',' failed (post deleted or login required)') : ''), fail ? 'err' : 'ok');
    } finally { els.fixAllBtn.disabled = false; }
  });}

  async function runRealConsolidate(existingComp, reorgOnly){return (typeof HubSettingsRuntime==='undefined'?(fn=>fn()):(fn=>HubSettingsRuntime.track(fn)))(async()=>{/* settings workflow */
    var outputLang = X.i18n.lang;
    if (!X.ai || !X.ai.isReady()){
      setStatus(T('请先在设置的 AI 部分填写 Anthropic API 密钥','Enter your Anthropic API key in Settings → AI first'), 'err');
      SuiteSettings.open('ai');
      return;
    }
    var notes = reorgOnly ? [] : Array.from(selectedIds).map(noteById).filter(Boolean);
    if (!notes.length && !existingComp){ setStatus(T('请先勾选笔记','Select some notes first'), 'err'); return; }
    els.consolidateBtn.disabled = true; els.addToComp.disabled = true;
    setStatus(reorgOnly ? T('再整理中…（去重合并、剔除无效信息，请勿关闭页面）','Re-organizing… (dedupe & clean, keep this page open)') : T('整理中…（约 10–30 秒，请勿关闭页面）','Binding… (~10–30s, keep this page open)'), 'loading');
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
        setStatus(T('整理中（含 ' + total + ' 张图，图多时需 1–3 分钟）…', 'Binding (' + total + ' images — may take 1–3 min)…') + (warn.length ? ' · ' + warn.join(T('；', '; ')) : ''), 'loading');
      }
      var res = await X.ai.consolidate(posts, existingComp || null);
      if (existingComp && compById(existingComp.id)?.savedAt !== existingComp.savedAt) throw new Error(T('目标合集刚被另一处更新，请重新打开它再试。', 'The target guide changed elsewhere. Open its latest version and try again.'));
      var sections = (res.sections || []).map(function (s) {
        var srcs = (s.source_indices || []).map(function (i) {
          var nn = notes[i - 1]; return nn ? { title: nn.title || T('未命名','Untitled'), url: nn.url || '' } : null;
        }).filter(Boolean);
        return { heading: s.heading, content: s.content, sources: srcs };
      });
      var prevIds = (existingComp && existingComp.sourceNoteIds) || [];
      var prevUrls = (existingComp && existingComp.sourceUrls) || [];
      // Keep the necessary images: the AI names (via keep_images) the ones text can't replace; merge with the guide's existing images, de-duplicated
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
        model: X.ai.getConfig().model, runAt: new Date().toISOString(), lang: outputLang, trace: { imagesRead: Object.keys(imgMap).length, transcriptCharsUsed: posts.reduce(function (sum, post) { return sum + Math.min((post.transcript || '').length, 8000); }, 0), inputNotes: notes.length }
      };
      var saved = X.store.saveComp(comp);
      X.store.archive(notes.map(function (n) { return n.id; }));   // consolidated source notes are archived automatically
      selectedIds.clear();
      renderLibrary(); renderComps(); updateSelBar();
      setStatus(notes.length ? T('整理完成 已存入合集，原笔记已自动归档','Done Saved to a guide; source notes auto-archived') : T('再整理完成 合集已更新（去重合并、清理无效信息）','Re-organized Guide updated'), 'ok');
      scheduleSync();
      openRead(saved.id); var restore = function () { X.store.unarchive(notes.map(function (n) { return n.id; })); renderLibrary(); scheduleSync(); }; lastUndo = restore; setStatus(T('合集已保存，原笔记已归档', 'Guide saved, source notes archived'), 'ok', [{ label: T('撤销归档', 'Restore them'), run: restore }]);
    } catch (e) {
      els.bindProgress.textContent = T('整理失败，笔记还在，可以重试。', 'Binding failed. Your notes are kept. Try again.') + ' ' + e.message; setStatus(els.bindProgress.textContent, 'err');
    } finally {
      els.consolidateBtn.disabled = false; els.addToComp.disabled = false;
    }
  });}

  var syncTimer = null;
  var syncing = false;

  function setSyncStatus(state, text, title){
    if (!els.syncStatus) return;
    els.syncStatus.className = SYNC_CLASS[state] || 'sync-pill';
    els.syncStatus.textContent = text;
    els.syncStatus.title = title || T('云同步状态','Cloud sync status');
  }

  function updateSyncUI(){
    if (!X.sync) return;
    if (X.sync.isConfigured()) setSyncStatus('ok', '☁ ' + X.sync.getConfig().owner, T('已连接 ','Connected ') + X.sync.dataLabel());
    else setSyncStatus('', T('● 本地','● Local'), T('未连接云同步，仅存本机','Not connected; local only'));
  }

  async function doSync(){return (typeof HubSettingsRuntime==='undefined'?(fn=>fn()):(fn=>HubSettingsRuntime.track(fn)))(async()=>{/* settings workflow */
    syncTimer=null;
    if (!X.sync || !X.sync.isConfigured() || syncing) return;
    var syncCompleted=false;
    syncing = true;
    setSyncStatus('syncing', T('↻ 同步中…','↻ Syncing…'));
    try {
      await X.sync.sync();syncCompleted=true;FirstRead.ready();
      renderLibrary();
      renderComps();
      var t = new Date().toLocaleTimeString(X.i18n.lang === 'en' ? 'en-US' : 'zh-CN', { hour: '2-digit', minute: '2-digit' });
      setSyncStatus('ok', T('☁ 已同步','☁ Synced'), T('已同步于 ','Synced at ') + t + ' · ' + X.sync.dataLabel());
    } catch (e) {
      FirstRead.fail(doSync,T);
      setSyncStatus('err', T('⚠ 同步失败','⚠ Sync failed'), e.message);
    } finally {
      syncing = false;
      if(syncCompleted&&X.sync.isConfigured()&&X.sync.hasUnsynced())scheduleSync();
    }
  });}

  function scheduleSync(){
    X.sync.queueSave();
    var flush = X.store.flush();
    SaveStatus.localSave(flush, function () { SaveStatus.localSave(X.store.retryPersistence(), scheduleSync); });
    flush.then(()=>SaveStatus.store.retained(SaveStatus.key("content.json"),true),()=>SaveStatus.store.retained(SaveStatus.key("content.json"),false));
    if (!X.sync || !X.sync.isConfigured()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(()=>{syncTimer=null;doSync();}, 800);   // debounce: a burst of edits triggers one sync
  }


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
    X.tips = { show: show, hide: hide, el: tip };   // exposed for UI checks
  }


})(window.XHS);
