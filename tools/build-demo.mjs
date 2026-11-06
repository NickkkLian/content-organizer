/* Fictional fixture authoring. SVG covers and data are original and released under the repository MIT licence. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const authoredAt = new Date().toISOString();
const pair = (zh, en) => ({ zh, en });
import { notes, sections } from './demo-content.mjs';
const categories = { kyoto: '旅行', food: '美食', tech: '数码', home: '家居', mixed: '其他' };
const englishTags = { 数码: 'Technology', 桌面: 'Desk', 房间: 'Room', 生活: 'Everyday', 京都: 'Kyoto', 红叶: 'Autumn', 寺庙: 'Temples', 住宿: 'Stay', 路线: 'Route', 交通: 'Transport', 晚饭: 'Dinner', 美食: 'Food', 雨天: 'Rain', 咖啡: 'Coffee', 步行: 'Walking', 市场: 'Market', 手作: 'Craft', 准备: 'Packing', 预算: 'Budget', 温哥华: 'Vancouver', 早午餐: 'Brunch', 素食: 'Vegetarian', 薄饼: 'Pancakes', 键盘: 'Keyboard', 配列: 'Layout', 轴体: 'Switches', 桌搭: 'Desk', 显示器: 'Monitor', 收纳: 'Storage', 清洁: 'Cleaning', 家居: 'Home', 照明: 'Lighting', 布置: 'Layout', 厨房: 'Kitchen', 植物: 'Plants', 阅读: 'Reading', 笔记: 'Notes', 修补: 'Mending', 周末: 'Weekend', 旅行: 'Travel', 摄影: 'Photos', 备份: 'Backup', 做饭: 'Cooking', 记录: 'Log' };
const counter = {};
const base = notes.map(([group, title, body, author, tags, duration], i) => {
  const number = counter[group] = (counter[group] || 0) + 1;
  return { id: `demo-${group}-${number}`, demoKey: `${group}-${number}`, group, title, body, author, tags, duration: duration || 0, platform: duration ? 'bili' : 'xhs', isVideo: Boolean(duration), url: `https://example.com/clipbind/${group}-${number}`, category: categories[group], demoCover: `assets/demo-covers/${group}-${number}.webp`, images: [`assets/demo-covers/${group}-${number}.webp`], savedAt: new Date(Date.UTC(2026, 9, 29 - Math.floor(i / 3), 16, i)).toISOString(), demoExpired: ['kyoto-7', 'home-3'].includes(`${group}-${number}`) };
});

// Each chapter adds a distinct comparison to the two fictional recorded walks.
function transcript(note, language) {
  const inputs = base.filter(n => n.group === 'kyoto');
  const opening = '';
  const observations = language === 'zh' ? [
    '出发前我把这段路拆成到站、找出口、步行、停留和返程五段。地图上挨着的两个点，实际可能隔着台阶和围墙。把出口名字写在离线笔记里，比截一张整个城区的地图更好用。',
    '这一段不能只记门票。等待、寄包和买水也占时间。我会在抵达前把钱包拿出来，先看入口告示，确认今天开放的门，再去排队。省下的十分钟留给院子，而不是塞进第四个景点。',
    '如果早上起晚了，就删去一个停留点，别把之后所有行程往后推。预约只固定一项，其他按距离串联。下雨时优先走有顶棚的路，石阶上的落叶比平地更容易滑。',
    '同行的人走路快慢不同，所以每走一段就留一个能坐下的地方。不要在狭窄路口停着商量下一站。先走到宽一点的地方，再打开地图。背包放身前，别挡住其他人的通道。',
    '预算表里我把住宿总额和个人支出分开。房间是两人共用，门票和车费则按人算。同一个金额如果先记整间房、后面又各算一遍，就会把总价翻高。',
    '返程路线在去程时就看好。不是每一条路都适合拖箱子，也不是每一个出口都有电梯。到终点还要算走去站台的时间，不能把地图上的到站时刻当作坐上车的时刻。',
    '点餐前先看最后点单时间，再看营业结束时间。菜单写着豆腐或蘑菇，也可能用了鱼汤或鸡汤。饮食限制直接问清楚，别从图标猜。若不能调整，就用事先记下的另一家。',
    '我把当日地图、店铺门口和菜单分开放。景色照片不用送进整理步骤，只有文字难以替代的路线图才留下。整理完仍能回到原笔记，查当时为什么选这条路。'
  ] : [
    'Before leaving, divide this leg into arrival, finding the exit, walking, the visit and returning. Nearby map pins can hide stairs or walls. Save the exit name offline instead of relying on a screenshot of the entire district.',
    'Admission is only one part of the visit. Waiting, bag storage and water stops take time too. Check the entrance notice and today’s open gate before joining a queue. Give the time saved to the courtyard instead of adding another attraction.',
    'If the morning starts late, remove one stop instead of shifting every later activity. Fix one reservation and connect the other places by distance. In rain, prioritise covered paths and watch wet leaves on steps.',
    'People walk at different speeds, so plan a place to sit between legs. Do not stop at a narrow junction to discuss the next turn. Reach a wider spot, then open the map and keep bags clear of passing walkers.',
    'Separate the whole room bill from personal spending. Two travellers share the room, while tickets and rides are per person. Counting the full room and then adding each person’s half again inflates the budget.',
    'Check the way home on the outward journey. Not every lane suits a wheeled case and not every station exit has a lift. The path to the platform still takes time. Reaching the station pin is different from boarding.',
    'Check last orders before the closing hour. Tofu or mushrooms can still use fish or chicken stock. Ask directly about dietary needs instead of guessing from icons. Keep another venue ready if the kitchen cannot adapt.',
    'Keep daily maps, storefront images and menus separate. Scenery does not need image analysis. Retain only a route diagram whose layout cannot be replaced by text. A bound guide should still lead back to the original reasoning.'
  ];
  const chapters = [];
  inputs.forEach((input, i) => {
    chapters.push((language === 'zh' ? '第' + (i + 1) + '段，' : 'Leg ' + (i + 1) + ', ') + input.title[language] + '。\n' + input.body[language]);
    const rotation = note.demoKey === 'kyoto-4' ? i : i + 3;
  for (let j = 0; j < (note.demoKey === 'kyoto-4' ? (language === 'zh' ? 6 : 5) : (language === 'zh' ? 2 : 1)); j++) chapters.push(observations[(rotation + j) % observations.length]);
  });
  return (opening + chapters.join('\n\n')).slice(0, 19500);
}
base.filter(note => note.group === 'kyoto').forEach((note, i) => {
  const diagram = { 2: 'kyoto-route', 3: 'kyoto-transit', 9: 'kyoto-walk' }[i];
  note.images = [diagram ? `assets/demo-covers/${diagram}.svg` : note.demoCover];
  if (i < 11) note.images.push('assets/demo-covers/kyoto-route.svg');
});
const sets = {};
for (const language of ['zh', 'en']) sets[language] = base.map(note => ({ ...note, title: note.title[language], body: note.body[language], tags: note.tags.map(tag => language === 'zh' ? tag : englishTags[tag] || tag), transcript: note.isVideo ? transcript(note, language) : '', images: note.images.map(file => file.replace(/(kyoto-(?:route|transit|walk))\.svg$/, '$1-' + language + '.svg')) }));

const guides = {};
for (const language of ['zh', 'en']) {
  guides[language] = {};
  for (const key of ['kyoto', 'food']) {
    const input = sets[language].filter(n => n.group === key);
    const raw = {
      title: key === 'kyoto' ? pair('京都五日', 'Kyoto in five days')[language] : pair('温哥华周末早午餐', 'A Vancouver brunch weekend')[language],
      topic: key === 'kyoto' ? pair('京都旅行', 'Kyoto travel')[language] : pair('温哥华美食', 'Vancouver food')[language],
      summary: key === 'kyoto' ? pair('从伏见稻荷、东福寺走到岚山和鸭川。按街区串起五天，留好雨天备选、交通与预算的余地。', 'Five days from Fushimi Inari and Tofuku-ji to Arashiyama and the Kamo River, with neighbourhood routes, rainy-day options and room in the budget. Check current access and menus before travelling.')[language] : pair('从 Kitsilano 的番茄炖蛋到 West 4th 的咖啡，把早午餐、预算与饭后散步串成半天。', 'Shakshuka in Kitsilano, coffee on West 4th and a walk by the water, with choices for rain, lighter meals and a budget for two.')[language],
      sections: sections[key].map(([heading, content, indices]) => ({ heading: heading[language], content: content[language], source_indices: indices })),
      keep_images: key === 'kyoto' ? ['10-1'] : []
    };
    const saved = { ...raw, id: `demo-guide-${key}`, demoKey: key, sections: raw.sections.map(s => ({ heading: s.heading, content: s.content, sources: s.source_indices.map(n => ({ title: input[n - 1].title, url: input[n - 1].url })) })), sourceNoteIds: input.map(n => n.id), sourceUrls: input.map(n => n.url), images: key === 'kyoto' ? [input[9].images[0]] : [], imagesRepo: [], lang: language, runAt: authoredAt, savedAt: authoredAt, model: 'AI-authored demo', trace: { imagesRead: input.reduce((sum, note) => sum + note.images.length, 0), transcriptCharsUsed: input.reduce((sum, note) => sum + Math.min((note.transcript || "").length, 8000), 0), inputNotes: input.length } };
    guides[language][key] = saved;
    fs.writeFileSync(path.join(root, 'demo', `${key}.${language}.json`), JSON.stringify(saved, null, 2) + '\n');
    const context = { window: { XHS: { i18n: { lang: language } } }, URLSearchParams, location: { search: '?demo=1' } };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(root, 'js/ai.js'), 'utf8').replace('  X.ai = {', '  X.promptRun = { systemPrompt: systemPrompt, postsBlock: postsBlock, schema: SCHEMA };\n  X.ai = {'), context);
    const prompt = context.window.XHS.promptRun;
    const record = { method: 'Authored by the AI coding agent in this build, following the exact application binding prompt. No API call was made. AI-written sample notes with real public place names, approximate planning ranges, original generated cover photographs and SVG diagrams.', language, authoredAt, system: prompt.systemPrompt(), userText: `Here are ${input.length} saved items (Xiaohongshu posts/videos, Bilibili videos):\n\n` + prompt.postsBlock(input), images: input.flatMap((note, i) => note.images.map((file, j) => ({ label: `[image ${i + 1}-${j + 1}]`, file }))), schema: prompt.schema, inputIds: input.map(n => n.id), rawOutput: raw, outputSHA256: crypto.createHash('sha256').update(JSON.stringify(raw)).digest('hex') };
    fs.writeFileSync(path.join(root, 'demo', `${key}.${language}.prompt-run.json`), JSON.stringify(record, null, 2) + '\n');
  }
}
const directory = path.join(root, 'assets/demo-covers'); fs.mkdirSync(directory, { recursive: true });
const diagrams = {
  'kyoto-route': '<path d="M80 370V100h135v130h185v140H80"/><path d="m65 120 15-20 15 20m285 230 20 20-20 20"/>',
  'kyoto-transit': '<path d="M70 120h340M70 240h340M70 360h340"/><path d="M145 120v120h170v120"/>',
  'kyoto-walk': '<path d="M70 370Q100 250 240 270T410 100"/><path d="M60 325h350M80 100q80 50 120 10t130 30"/>'
};
for (const [name, drawing] of Object.entries(diagrams)) {
  for (const language of ['zh','en']) {
    const labels = name === 'kyoto-route' ? pair(['伏见稻荷与东福寺','东山街区','岚山','锦市场','鸭川'],['Fushimi and Tofuku-ji','Higashiyama','Arashiyama','Nishiki Market','Kamo River'])[language] : name === 'kyoto-walk' ? pair(['青石桥','四处休息点','柳岸口','雨后低道关闭'],['Bluestone Bridge','Four rest points','Willow Exit','Lower path closed after rain'])[language] : pair(['铁路','地铁与巴士','核对车站与运营方'],['Rail','Subway and bus','Check operator and station'])[language];
    const caption = labels.map((label, i) => `<text x="24" y="${38+i*30}" font-size="22" font-family="sans-serif" fill="#1f1d1a">${label}</text>`).join('');
    let figure = `<rect width="480" height="480" fill="#e9ddbd"/><g fill="none" stroke="#53614c" stroke-width="12" stroke-linecap="round" transform="translate(100,100) scale(.7)">${drawing}</g><g fill="#9d5739">${[100,240,380].map((x,i)=>`<circle cx="${x}" cy="${[210,300,390][i]}" r="12"/>`).join('')}</g>${caption}`;
    if (name === 'kyoto-walk') {
      const words = pair(['鸭川散步示意','四条附近','三条附近','随时停下休息','上层道路','遇封闭折返','就近找车站'],['Kamo River sketch','Near Shijo','Near Sanjo','Pause when you like','Upper streets','Turn back at closures','Find a nearby station'])[language];
      figure = `<rect width="480" height="480" fill="#eee6d3"/><path d="M90 410Q215 340 280 270T430 130" fill="none" stroke="#b4c6cb" stroke-width="38"/><path d="m80 360 30-60 80-50 90-50 70-50 50-50" fill="none" stroke="#53614c" stroke-width="9"/><path d="M80 360 70 200 170 160 280 200" fill="none" stroke="#9d5739" stroke-width="5" stroke-dasharray="8 7"/><path d="M80 360 200 400 410 300 400 100" fill="none" stroke="#8a8378" stroke-width="5" stroke-dasharray="4 8"/>${[[110,300],[190,250],[280,200],[350,150]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="10" fill="#f3d35b" stroke="#1f1d1a" stroke-width="3"/>`).join('')}<path d="m292 353 25 25m0-25-25 25M55 235h20v-15h20v-15h20" fill="none" stroke="#9d5739" stroke-width="5"/><g fill="#1f1d1a" font-family="sans-serif" font-size="20"><text x="24" y="34">${words[0]}</text><text x="24" y="445">${words[1]}</text><text x="290" y="82">${words[2]}</text><text x="120" y="292">${words[3]}</text><text x="24" y="134">${words[4]}</text><text x="155" y="425">${words[5]}</text><text x="280" y="58">${words[6]}</text></g>`;
    }
    fs.writeFileSync(path.join(directory, `${name}-${language}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480">${figure}</svg>\n`);
  }
  const old=path.join(directory,name+'.svg');if(fs.existsSync(old))fs.unlinkSync(old);
}
const capture = { zh: '周末想试这家咖啡馆 #咖啡 #美食 https://example.com/clipbind/recorded-capture', en: 'A café for the weekend #Coffee #Food https://example.com/clipbind/recorded-capture' };
const bundle = { guides, capture };
fs.writeFileSync(path.join(root, 'js/samples.js'), `/* Fictional bilingual notes, generated by tools/build-demo.mjs. */\n(function (root, factory) {\n  if (typeof module === 'object' && module.exports) module.exports = factory();\n  else root.XHS.samples = factory();\n})(typeof self !== 'undefined' ? self : this, function () {\n  var data = ${JSON.stringify(sets)};\n  var copy = function (value) { return JSON.parse(JSON.stringify(value)); };\n  return { NOTES: copy(data.zh), notes: function (language) { return copy(data[language]); } };\n});\n`);
fs.writeFileSync(path.join(root, 'demo/data.js'), `/* Fictional bilingual demo, generated by tools/build-demo.mjs. */\nwindow.XHS.demo = (function () {\n  var data = ${JSON.stringify(bundle)};\n  var copy = function (value) { return JSON.parse(JSON.stringify(value)); };\n  return { notes: function (language) { return window.XHS.samples.notes(language); }, guide: function (key, language) { return copy(data.guides[language][key]); }, captureText: function (language) { return data.capture[language]; }, captureNote: function (language) { var note = window.XHS.samples.notes(language).find(function (n) { return n.demoKey === 'food-3'; }); delete note.id; delete note.demoKey; note.url = 'https://example.com/clipbind/recorded-capture'; return note; } };\n})();\n`);
fs.writeFileSync(path.join(directory, 'GENERATORS.md'), '# Content diagrams\n\nOriginal MIT SVG route, transit and Kamo River planning sketches are generated here. Photographic covers use built-in image_gen, adjacent prompts and COVERS.json. They are illustrative samples, not documentary photographs.\n');
fs.writeFileSync(path.join(root, 'demo/README.md'), '# Fictional demo records\n\nThe coding agent authored both guides in each language using the exact `systemPrompt`, `postsBlock` and structured-output schema in `js/ai.js`. Each `.prompt-run.json` records the full text request, input identities, structured result, authoring method and result hash. No live model API was called. The UI labels the replay. Notes and source URLs are fictional samples. Public place names are real; budgets are rough planning allowances, not live quotations. Generated photographs are illustrative. Kyoto sources start archived; the demo opens on eight unbound food notes. `tools/build-demo.mjs` reproduces data and original MIT-licensed SVG covers. The two video transcripts are scripted fictional speech. User-authored notes are never translated.\n');
console.log(JSON.stringify({ notes: base.length, guides: 4, transcripts: Object.fromEntries(Object.entries(sets).map(([lang, list]) => [lang, list.filter(n => n.isVideo).map(n => n.transcript.length)])) }));
