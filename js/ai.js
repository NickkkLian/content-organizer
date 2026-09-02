/* AI consolidation: calls the Claude Messages API to merge several notes into one sectioned piece.
   Front end only, straight to api.anthropic.com (needs the anthropic-dangerous-direct-browser-access header).
   The API key is stored only in this browser (localStorage key xhs_ai_config) — never in a repo, never hard-coded.
   Prompts are written in English; the output language follows the UI language. */
window.XHS = window.XHS || {};
(function (X) {
  'use strict';
  var T = (window.XHS.i18n && window.XHS.i18n.T) || function (zh, en) { return en; };

  var KEY = 'xhs_ai_config';
  var DEFAULT_MODEL = 'claude-opus-4-8';
  var MODELS = [
    { id: 'claude-opus-4-8', name: 'Opus 4.8（最强 · 推荐）', nameEn: 'Opus 4.8 (best · recommended)' },
    { id: 'claude-sonnet-5', name: 'Sonnet 5（更快更省）', nameEn: 'Sonnet 5 (faster & cheaper)' },
    { id: 'claude-haiku-4-5', name: 'Haiku 4.5（最便宜）', nameEn: 'Haiku 4.5 (cheapest)' }
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

  // Structured output so the sectioned JSON is always parseable (only supported schema features used)
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
      },
      // labels of images worth keeping in the compilation ("2-3" = 3rd image of the 2nd note); drop what text can express
      keep_images: { type: 'array', items: { type: 'string' } }
    },
    required: ['title', 'topic', 'summary', 'sections', 'keep_images'],
    additionalProperties: false
  };

  function outputLanguage() {
    return (X.i18n && X.i18n.lang === 'en') ? 'English' : 'Simplified Chinese';
  }

  function systemPrompt() {
    return 'You are a content editor. Task: take the saved items the user provides (Xiaohongshu posts/videos, Bilibili videos; sometimes an existing compilation as well), ' +
      'organise, summarise and de-duplicate them, and merge them into one clearly structured long-form piece (a "compilation").\n' +
      'Requirements:\n' +
      '1. Identify the shared theme and several sub-topics; one section per sub-topic.\n' +
      '2. **De-duplicate and merge**: keep each piece of information once; fold similar views/methods into one fuller statement; merge repetition across sources and across sections so the reader never sees the same thing twice.\n' +
      '3. **Remove noise, but do not delete substance**: drop off-topic chatter, engagement bait (follow/like/subscribe/"see comments"), pure emotional filler, and the repetition and garbling typical of speech transcripts; always keep the concrete, valuable facts — shop names, addresses, prices, steps, figures, opinions, conclusions, lessons, links.\n' +
      '4. **Present the content directly, not as reported speech**: never write "the author says / the creator mentions / they recommend"; state the facts, views and methods themselves.\n' +
      '5. Distil and rewrite in your own words; never copy sentences verbatim. Write all output in ' + outputLanguage() + '.\n' +
      '6. Video content is mostly speech-to-text — no punctuation, colloquial, with homophone errors; infer the intended meaning from context before distilling.\n' +
      '7. If images are attached, read the text and key information inside them (menus, price lists, slides, figures) and fold it into the body.\n' +
      '8. **Keep only necessary images**: images are labelled [image N-M] (N = item number, M = image number within that item). Put the ones that text cannot replace — menus, price lists, slides, charts, data screenshots, step-by-step photos, UI screenshots with key information — into keep_images; never keep decorative, scenery, portrait or duplicate images. ' +
      'If the body already states the information clearly, do not keep the image. Return an empty array [] if nothing is worth keeping.\n' +
      '9. source_indices uses 1-based numbers and lists which input items [N] a section mainly draws on (an empty array is fine for new content with no single source).\n' +
      '10. The title should be concise and informative; the summary sums up the whole piece in one or two sentences.';
  }

  function postsBlock(posts) {
    return posts.map(function (p, i) {
      var tags = (p.tags && p.tags.length) ? p.tags.map(function (t) { return '#' + t; }).join(' ') : '(none)';
      var src = (p.platform === 'bili' ? 'Bilibili' : 'Xiaohongshu') + ((p.isVideo || p.platform === 'bili') ? ' video' : ' post');
      var s = '[' + (i + 1) + '] ' + src + ' | Title: ' + (p.title || '(none)') + '\nTags: ' + tags;
      if (p.body) s += '\nBody / description: ' + p.body.slice(0, 1500);
      if (p.transcript) s += '\nTranscript: ' + p.transcript.slice(0, 8000);
      s += '\nLink: ' + (p.url || '(none)');
      return s;
    }).join('\n\n');
  }

  // posts: [{title, body, tags, url}]; existing: an existing compilation object (when merging into it) or null
  async function consolidate(posts, existing) {
    var cfg = getConfig();
    if (!cfg.apiKey) throw new Error(T('未设置 AI 令牌','AI token not set'));
    if ((!posts || !posts.length) && !existing) throw new Error(T('没有可整理的内容','Nothing to consolidate'));
    posts = posts || [];

    var userText = '';
    if (existing) {
      var existingText = 'Existing compilation title: ' + (existing.title || '') + '\n' +
        (existing.sections || []).map(function (s) { return '## ' + s.heading + '\n' + s.content; }).join('\n\n');
      if (posts.length) {
        userText += 'Below are an [existing compilation] and ' + posts.length + ' [newly saved items]. Merge the new items into the compilation — not by appending: **de-duplicate and merge** between old and new (each piece of information once; similar views folded into one), **remove noise**, and return one tightened [complete compilation].\n\n[Existing compilation]\n' + existingText + '\n\n———\n\n[Newly saved items]\n' + postsBlock(posts);
      } else {
        userText += 'Please give the [existing compilation] below a **tightening pass**: de-duplicate and merge across sections (repeated or similar content folded into one), remove noise, tighten the language, straighten the structure, and return a more concise [complete compilation].\n\n[Existing compilation]\n' + existingText;
      }
    } else {
      userText += 'Here are ' + posts.length + ' saved items (Xiaohongshu posts/videos, Bilibili videos):\n\n' + postsBlock(posts);
    }

    // Assemble content: text + (optionally) each note's images (posts[i].imgs are image content blocks)
    var content = [{ type: 'text', text: userText }];
    posts.forEach(function (p, i) {
      if (p.imgs && p.imgs.length) {
        content.push({ type: 'text', text: 'Images of item [' + (i + 1) + ']:' });
        p.imgs.forEach(function (b) { content.push(b); });
      }
    });

    var body = {
      model: cfg.model || DEFAULT_MODEL,
      max_tokens: 16000,
      system: systemPrompt(),
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

  // Frame judging: candidate frames go to Claude vision; only the informative ones survive.
  // frames = [b64…]; returns the indices to keep (undecidable / none useful → []).
  async function judgeFrames(frames) {
    var cfg = getConfig();
    if (!cfg.apiKey || !frames || !frames.length) return [];
    var content = [{ type: 'text', text:
      'These are candidate screenshots from one video, numbered from 0. Keep only the ones with **information value** — text, slides, web/app screenshots, figures, charts, step-by-step demonstrations, anything that conveys information on its own. Exclude talking-head shots, empty shots, scenery and anything without standalone information. Return the indices to keep; return an empty array if none are useful.' }];
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
