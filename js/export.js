/* A portable text artifact of the saved reading view. Only explicit document fields cross this boundary;
   connection settings, storage and AI are deliberately not dependencies. refs.bind owns all numbering. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./refs.js'));
  else root.XHS.export = factory(root.XHS.refs);
})(typeof self !== 'undefined' ? self : this, function (R) {
  'use strict';

  // The reading view displays plain text. Keep Markdown/HTML in that text literal in other viewers too.
  function text(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\`*_{}\[\]()#+.!|~\-]/g, '\\$&').replace(/\r\n?/g, '\n').replace(/\n/g, '  \n');
  }
  function destination(url) {
    return String(url).replace(/[\s<>\\()"\x00-\x1f\x7f]/g, function (c) { return encodeURIComponent(c).replace(/[()]/g, function (p) { return p === '(' ? '%28' : '%29'; }); });
  }
  function markdown(comp, uiLang) {
    var c = comp || {}, b = R.bind(c), zh = (c.lang || uiLang) === 'zh';
    function T(cn, en) { return zh ? cn : en; }
    var blocks = ['# ' + text(c.title || T('未命名合集', 'Untitled compilation'))];
    var meta = [];
    if (c.topic) meta.push(T('主题：', 'Topic: ') + text(c.topic));
    if (c.model) meta.push(T('模型：', 'Model: ') + text(c.model));
    if (c.lang) meta.push(T('语言：', 'Language: ') + text(c.lang));
    if (c.runAt || c.savedAt) meta.push(T('生成时间：', 'Generated: ') + text(c.runAt || c.savedAt));
    if (meta.length) blocks.push(meta.map(function (line) { return '> ' + line; }).join('  \n'));
    if (c.summary) blocks.push(text(c.summary));
    b.sections.forEach(function (s) {
      blocks.push('## ' + text(s.heading || T('无标题板块', 'Untitled section')));
      if (s.content) blocks.push(text(s.content));
      if (s.refs.length) blocks.push(T('来源 ', 'From ') + s.refs.map(function (n) { return '[' + n + ']'; }).join(' '));
    });
    if (!b.sections.length) blocks.push(T('这篇合集还没有板块。', 'This compilation has no sections yet.'));
    blocks.push('## ' + T('来源', 'Sources'));
    blocks.push(b.sources.length ? b.sources.map(function (s) {
      var label = text(R.label(s));
      var entry = R.isWebUrl(s.url) ? '[' + label + '](<' + destination(s.url) + '>)' : label;
      if (s.url && !R.isWebUrl(s.url) && s.title) entry += ' · ' + text(s.url);
      return s.n + '. ' + entry + (s.cited ? '' : ' (' + T('未单独引用', 'uncited') + ')');
    }).join('\n') : T('没有来源。', 'No sources.'));
    return blocks.join('\n\n') + '\n';
  }
  function filename(comp) {
    var title = String((comp || {}).title || '').replace(/[\x00-\x1f\x7f]/g, '').replace(/[<>:"/\\|?*]+/g, '-').replace(/^[.\s-]+|[.\s-]+$/g, '').slice(0, 80).replace(/[.\s-]+$/g, '');
    return (title || 'compilation') + '.md';
  }
  return { markdown: markdown, filename: filename };
});
