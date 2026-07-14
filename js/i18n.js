/* 中英双语引擎（原生中文 app，英文为备选）。
   全站共享 localStorage 键 pha-lang（默认 zh）。必须最先加载（在其它 js 之前）。
   静态 HTML 用 data-i18n / data-i18n-ph / data-i18n-title / data-i18n-html；
   动态渲染用 window.T(zh,en) 或 X.i18n.T。切换时 applyStatic() + X.app.rerender()。 */
window.XHS = window.XHS || {};
(function (X) {
  'use strict';

  var lang = (function () {
    try { return localStorage.getItem('pha-lang') === 'en' ? 'en' : 'zh'; }
    catch (e) { return 'zh'; }
  })();

  function T(zh, en) { return lang === 'en' ? en : zh; }

  // 静态 HTML 词典：key -> {zh, en}
  var I18N = {
    h1:           { zh: '📚 收藏整理库', en: '📚 Content Organizer' },
    sub:          { zh: '小红书(图文/视频) + B站(视频) 统一收藏 · 跨平台 AI 整理', en: 'Xiaohongshu (posts/videos) + Bilibili (videos) · unified library · cross-platform AI organizing' },
    tabLink:      { zh: '🔗 链接整理', en: '🔗 By link' },
    tabManual:    { zh: '✍️ 手动粘贴', en: '✍️ Manual paste' },
    tabVideo:     { zh: '🎬 抓视频', en: '🎬 Fetch video' },
    videoPh:      { zh: '粘小红书 / B站视频链接（可连分享文案一起粘）', en: 'Paste an XHS / Bilibili video link (share text ok)' },
    fetchVideo:   { zh: '🎬 抓取', en: '🎬 Fetch' },
    videoHint:    { zh: '需本地菜单栏小程序在跑。小红书视频要用带 xsec_token 的链接。转写在本机做，截图交 AI 判断留哪些。', en: 'Needs the local menu-bar app running. XHS videos need a link with xsec_token. Transcribed locally; AI decides which screenshots to keep.' },
    fetchTokenHint:{ zh: '本地「🎬 抓视频」服务的口令（菜单栏小程序里可看/复制）。只存本机浏览器。', en: 'Token for the local fetch service (view/copy in the menu-bar app). Stored only in this browser.' },
    testConn:     { zh: '测试连接', en: 'Test connection' },
    jumpComps:    { zh: '🧩 合集 ↓', en: '🧩 Compilations ↓' },
    jumpLib:      { zh: '↑ 回收藏库', en: '↑ Back to library' },
    compArchTitle:{ zh: '切换查看已归档的合集（与图文/视频归档分开）', en: 'Toggle archived compilations (separate from the note archive)' },
    urlPh:        { zh: '粘贴小红书链接，如 http://xhslink.com/xxx 或 https://www.xiaohongshu.com/explore/...', en: 'Paste an XHS link, e.g. http://xhslink.com/xxx or https://www.xiaohongshu.com/explore/...' },
    organize:     { zh: '整理', en: 'Organize' },
    linkHint:     { zh: '纯前端经公共代理（Jina Reader / AllOrigins）抓取，尽力而为；若被反爬拦截，请切到「手动粘贴」。', en: 'Front-end-only fetch via public proxies (Jina Reader / AllOrigins), best-effort; if blocked by anti-scraping, switch to "Manual paste".' },
    manualTextPh: { zh: '把小红书「分享 → 复制链接 / 复制文字」的内容整段粘进来（标题、正文、#话题# 都行）', en: 'Paste the whole "Share → Copy link / Copy text" content here (title, body, #topics# all fine)' },
    manualImgPh:  { zh: '（可选）图片直链，多个用空格或逗号分隔', en: '(Optional) direct image links, separated by spaces or commas' },
    myLib:        { zh: '我的收藏库', en: 'My library' },
    syncBtn:      { zh: '🔄 同步', en: '🔄 Sync' },
    archived:     { zh: '已归档', en: 'Archived' },
    archTitle:    { zh: '切换查看已归档', en: 'Toggle archived view' },
    searchPh:     { zh: '搜索标题 / 正文 / 标签', en: 'Search title / body / tags' },
    exportMd:     { zh: '导出 MD', en: 'Export MD' },
    exportJson:   { zh: '导出 JSON', en: 'Export JSON' },
    clearAll:     { zh: '清空', en: 'Clear' },
    fixAll:       { zh: '🔧 修复全部图片', en: '🔧 Fix all images' },
    fixAllTitle:  { zh: '重新抓取并把所有图片永久存进你的私有仓库（防小红书链接过期 403）', en: 'Re-fetch and archive all images permanently into your private repo (XHS links expire with 403)' },
    withImgs:     { zh: '连图片一起分析', en: 'Analyze images too' },
    withImgsTitle:{ zh: '把所选笔记的全部图片交给 AI 一起读（上限 100 张；图里的菜单/价格/步骤等会被整理进合集；图多时更慢、费用更高）', en: 'Send ALL images of the selected notes to the AI (up to 100; menus/prices/steps inside images get consolidated; more images = slower & costlier)' },
    syncHint:     { zh: '收藏库同步到私有仓库 <code id="repoLabel"></code>，多设备共享。令牌仅存于本机浏览器（与导航站共用 <code>pha-config</code>），<strong>绝不写入任何仓库</strong>。', en: 'Your library syncs to the private repo <code id="repoLabel"></code>, shared across devices. The token is stored only in this browser (shared <code>pha-config</code> with the portal) and <strong>never written to any repo</strong>.' },
    tokenPh:      { zh: 'GitHub Token（fine-grained PAT，需对 Database 仓库 Contents 读写）', en: 'GitHub Token (fine-grained PAT with read/write to the Database repo Contents)' },
    saveConnect:  { zh: '保存并连接', en: 'Save & connect' },
    aiHint:       { zh: '「✨ AI 整理成合集」用 Claude API 把多篇笔记综合成分板块长文；勾选「🖼 连图片一起分析」可让 AI 读取图内文字（菜单/价格/步骤）。API 令牌仅存本机浏览器、<strong>绝不写入仓库</strong>；点一次约几美分。<a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">获取 Key ↗</a>', en: '"✨ AI consolidate" uses the Claude API to merge multiple notes into a sectioned long-form piece; tick "🖼 Analyze images too" to have the AI read text inside images (menus/prices/steps). The API token is stored only in this browser and <strong>never written to any repo</strong>; ~a few cents per run. <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">Get a Key ↗</a>' },
    aiKeyPh:      { zh: 'Anthropic API Key（sk-ant-…）', en: 'Anthropic API Key (sk-ant-…)' },
    save:         { zh: '保存', en: 'Save' },
    consolidate:  { zh: '✨ AI 整理成合集', en: '✨ AI consolidate' },
    addToCompOpt: { zh: '加入已有合集…', en: 'Add to existing compilation…' },
    clearSel:     { zh: '取消选择', en: 'Clear selection' },
    myComps:      { zh: '我的合集', en: 'My compilations' },
    foot:         { zh: '本地缓存 + 私有仓库云同步 + AI 整理合集 · 令牌只存本机浏览器', en: 'Local cache + private-repo cloud sync + AI consolidation · token stored only in this browser' }
  };

  function L(k) {
    var e = I18N[k];
    return e ? (lang === 'en' ? e.en : e.zh) : k;
  }

  function applyStatic(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = L(el.getAttribute('data-i18n')); });
    root.querySelectorAll('[data-i18n-html]').forEach(function (el) { el.innerHTML = L(el.getAttribute('data-i18n-html')); });
    root.querySelectorAll('[data-i18n-ph]').forEach(function (el) { el.setAttribute('placeholder', L(el.getAttribute('data-i18n-ph'))); });
    root.querySelectorAll('[data-i18n-title]').forEach(function (el) { el.setAttribute('title', L(el.getAttribute('data-i18n-title'))); });
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
    var lb = document.getElementById('langBtn');
    if (lb) lb.textContent = lang === 'en' ? '中' : 'EN';
  }

  function toggleLang() {
    lang = lang === 'en' ? 'zh' : 'en';
    try { localStorage.setItem('pha-lang', lang); } catch (e) {}
    applyStatic();
    if (X.app && X.app.rerender) X.app.rerender();
  }

  X.i18n = {
    get lang() { return lang; },
    T: T, L: L, applyStatic: applyStatic, toggleLang: toggleLang, I18N: I18N
  };
  window.T = T;   // 方便各渲染文件直接用
})(window.XHS);
