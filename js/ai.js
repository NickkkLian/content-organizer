/* AI 整理：调用 Claude Messages API，把多篇笔记综合成一篇分板块的合集。
   纯前端直连 api.anthropic.com（需 anthropic-dangerous-direct-browser-access 头）。
   API 令牌只存本机浏览器（localStorage 键 xhs_ai_config），绝不进仓库 / 硬编码。 */
window.XHS = window.XHS || {};
(function (X) {
  'use strict';
  var T = (window.XHS.i18n && window.XHS.i18n.T) || function(zh,en){return zh;};

  var KEY = 'xhs_ai_config';
  var DEFAULT_MODEL = 'claude-opus-4-8';
  var MODELS = [
    { id: 'claude-opus-4-8', name: 'Opus 4.8（最强 · 推荐）', nameEn: 'Opus 4.8 (Best · Recommended)' },
    { id: 'claude-sonnet-5', name: 'Sonnet 5（更快更省）', nameEn: 'Sonnet 5 (Faster & cheaper)' },
    { id: 'claude-haiku-4-5', name: 'Haiku 4.5（最便宜）', nameEn: 'Haiku 4.5 (Cheapest)' }
  ];

  function getConfig() {
    try {
      var c = JSON.parse(localStorage.getItem(KEY) || '{}');
      return { apiKey: c.apiKey || '', model: c.model || DEFAULT_MODEL };
    } catch (e) { return { apiKey: '', model: DEFAULT_MODEL }; }
  }
  function saveConfig(apiKey, model) {
    var cur = getConfig();
    var next = { apiKey: apiKey != null ? apiKey : cur.apiKey, model: model || cur.model || DEFAULT_MODEL };
    localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  }
  function isReady() { return Boolean(getConfig().apiKey); }

  // 结构化输出，保证拿到可解析的分板块 JSON（仅用受支持的 schema 特性）
  var SCHEMA = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      topic: { type: 'string' },
      summary: { type: 'string' },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            heading: { type: 'string' },
            content: { type: 'string' },
            source_indices: { type: 'array', items: { type: 'integer' } }
          },
          required: ['heading', 'content', 'source_indices'],
          additionalProperties: false
        }
      }
    },
    required: ['title', 'topic', 'summary', 'sections'],
    additionalProperties: false
  };

  var SYSTEM =
    '你是一名中文内容编辑。任务：把用户给的多条收藏内容（小红书图文/视频、B站视频）整理、归纳、去重，合并成一篇结构清晰的中文长文（合集）。\n' +
    '要求：\n' +
    '1. 找出共同主题与若干子主题，按子主题分板块（section）。\n' +
    '2. 每个板块综合多条内容的相关信息，提炼并用你自己的话重写，禁止逐条照抄。\n' +
    '3. 保留有价值的具体信息：店名、地址、价格、步骤、数据、观点、结论、链接等。\n' +
    '4. source_indices 用从 1 开始的编号，列出该板块主要参考了哪几条（对应输入里的【1】【2】…）。\n' +
    '5. 视频内容多为「语音转写」——没标点、口语化、可能有同音错别字，请据上下文理解真实意思再提炼。\n' +
    '6. 若附带图片，仔细读图里的文字与关键信息（菜单、价目、幻灯片、数据等）一并纳入。\n' +
    '7. 一律用简体中文。title 简洁有信息量；summary 用一两句话概括整篇。';

  function postsBlock(posts) {
    return posts.map(function (p, i) {
      var tags = (p.tags && p.tags.length) ? p.tags.map(function (t) { return '#' + t; }).join(' ') : '（无）';
      var src = (p.platform === 'bili' ? 'B站' : '小红书') + ((p.isVideo || p.platform === 'bili') ? '视频' : '图文');
      var s = '【' + (i + 1) + '】' + src + '｜标题：' + (p.title || '（无）') + '\n标签：' + tags;
      if (p.body) s += '\n正文/简介：' + p.body.slice(0, 1500);
      if (p.transcript) s += '\n语音转写：' + p.transcript.slice(0, 8000);
      s += '\n链接：' + (p.url || '（无）');
      return s;
    }).join('\n\n');
  }

  // posts: [{title, body, tags, url}]；existing: 已有合集对象（追加整合时传入）或 null
  async function consolidate(posts, existing) {
    var cfg = getConfig();
    if (!cfg.apiKey) throw new Error(T('未设置 AI 令牌','AI token not set'));
    if (!posts || !posts.length) throw new Error(T('没有可整理的笔记','No notes to consolidate'));

    var userText = '';
    if (existing) {
      userText += '这是一篇已有的合集，请把下面的新笔记整合进去（可补充到已有板块，或新增板块），最后返回整合后的【完整合集】（包含原有内容）：\n\n' +
        '已有合集标题：' + (existing.title || '') + '\n' +
        (existing.sections || []).map(function (s) { return '## ' + s.heading + '\n' + s.content; }).join('\n\n') +
        '\n\n———\n\n';
    }
    userText += '以下是 ' + posts.length + ' 条收藏内容（小红书图文/视频、B站视频）：\n\n' + postsBlock(posts);

    // 组装 content：正文 + （可选）各笔记附图（posts[i].imgs 为 image content blocks）
    var content = [{ type: 'text', text: userText }];
    posts.forEach(function (p, i) {
      if (p.imgs && p.imgs.length) {
        content.push({ type: 'text', text: '【' + (i + 1) + '】的图片：' });
        p.imgs.forEach(function (b) { content.push(b); });
      }
    });

    var body = {
      model: cfg.model || DEFAULT_MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: 'user', content: content }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } }
    };

    var r;
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify(body)
      });
    } catch (e) { throw new Error(T('网络错误：','Network error: ') + e.message); }

    if (r.status === 401) throw new Error(T('API 令牌无效或已过期 (401)','API token invalid or expired (401)'));
    if (r.status === 400) { var t = await r.text().catch(function () { return ''; }); throw new Error(T('请求被拒 (400) ','Request rejected (400) ') + t.slice(0, 160)); }
    if (r.status === 429) throw new Error(T('触发频率限制 (429)，请稍后再试','Rate limited (429), please retry later'));
    if (!r.ok) throw new Error(T('请求失败 HTTP ','Request failed HTTP ') + r.status);

    var j = await r.json();
    if (j.stop_reason === 'refusal') throw new Error(T('模型拒绝了该请求','The model refused the request'));
    var textBlock = (j.content || []).filter(function (b) { return b.type === 'text'; })[0];
    if (!textBlock) throw new Error(T('未返回内容','No content returned') + (j.stop_reason === 'max_tokens' ? T('（输出过长，请减少笔记数量）',' (output too long, reduce the number of notes)') : ''));
    var data;
    try { data = JSON.parse(textBlock.text); }
    catch (e) { throw new Error(T('解析返回的 JSON 失败','Failed to parse returned JSON')); }
    if (!data || !Array.isArray(data.sections)) throw new Error(T('返回结构不完整','Returned structure incomplete'));
    return data;
  }

  // 判图：候选帧交给 Claude 视觉，只留有信息价值的。frames=[b64…]；返回要保留的下标数组（判不了/都没用→[]）。
  async function judgeFrames(frames) {
    var cfg = getConfig();
    if (!cfg.apiKey || !frames || !frames.length) return [];
    var content = [{ type: 'text', text:
      '以下是一条视频的候选截图，按序号从 0 开始。只挑出「有信息价值」的（含文字/幻灯片/网页或App截图/数据/图表/步骤演示等能独立传达信息的），排除纯人物说话镜头、空镜、风景等没有独立信息的。返回要保留的序号数组；都没用就返回空数组。' }];
    frames.forEach(function (b, i) {
      content.push({ type: 'text', text: '[' + i + ']' });
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/webp', data: b } });
    });
    var reqBody = {
      model: cfg.model || DEFAULT_MODEL, max_tokens: 300,
      messages: [{ role: 'user', content: content }],
      output_config: { format: { type: 'json_schema', schema: {
        type: 'object', properties: { keep: { type: 'array', items: { type: 'integer' } } },
        required: ['keep'], additionalProperties: false } } }
    };
    var r;
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify(reqBody)
      });
    } catch (e) { return []; }
    if (!r.ok) return [];
    var j = await r.json();
    var tb = (j.content || []).filter(function (b) { return b.type === 'text'; })[0];
    if (!tb) return [];
    try {
      var d = JSON.parse(tb.text);
      return Array.isArray(d.keep) ? d.keep.filter(function (i) { return i >= 0 && i < frames.length; }) : [];
    } catch (e) { return []; }
  }

  X.ai = {
    getConfig: getConfig, saveConfig: saveConfig, isReady: isReady,
    consolidate: consolidate, judgeFrames: judgeFrames, MODELS: MODELS, DEFAULT_MODEL: DEFAULT_MODEL
  };
})(window.XHS);
