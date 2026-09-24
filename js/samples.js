/* The three sample notes: what a visitor sees at ?demo=1, and what the cached demo compilation was made from.

   In their own file because two things need them and one of them has no DOM: the app renders them, and
   make-demo-compilation.mjs sends them to the model once to produce demo/compilation.json. Loaded as a classic
   <script> in the browser (window.XHS.samples) and with require() in node, like js/merge.js and js/refs.js.

   Every note is invented. The tags are Chinese because the posts they imitate are — this library is for what you save
   on Xiaohongshu and Bilibili, and js/classify.js scores Chinese keywords, so an English-only sample would also
   demonstrate a classifier that cannot classify (the tags are content, not interface text). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else {
    root.XHS = root.XHS || {};
    root.XHS.samples = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var NOTES = [

    { platform: 'xhs', title: 'Weekend brunch in Kitsilano — 5 spots worth the line',
      author: 'sample', tags: ['美食', 'brunch', 'Vancouver'],
      body: 'Ranked by how much the wait is worth it.\n1. Sourdough pancakes at the corner bakery — go before 9:30 or expect 40 min.\n2. The shakshuka place on 4th: ask for extra bread, the sauce deserves it.\n3. Best flat white is NOT at the café everyone posts — try the one by the beach.\n4. Avoid the big-chain brunch on weekends, 1h+ wait for the same eggs.\n5. Cash-only dumpling spot does a savoury breakfast set that nobody talks about.' },
    { platform: 'xhs', title: 'Kyoto in 3 days: temples before 8 am, everything else after',
      author: 'sample', tags: ['旅行', '攻略', 'Kyoto'],
      body: 'Day 1 — Fushimi Inari at 7 am (empty until ~9), Tofuku-ji, then Gion at dusk.\nDay 2 — Arashiyama bamboo grove at sunrise, Tenryu-ji garden, afternoon in Nishiki market.\nDay 3 — Philosopher\'s Path, Nanzen-ji aqueduct, a tea house in Higashiyama.\nBus day pass beats the subway for this route. Carry coins for temple entry.' },
    { platform: 'bili', isVideo: true, duration: 612, title: 'Mechanical keyboard buying guide: switches, layouts and budgets',
      author: 'sample', tags: ['数码', '键盘', '测评'], category: '数码', categoryEmoji: '📺', tname: '数码',
      body: 'A 10-minute explainer on what actually matters when buying your first mechanical keyboard.',
      /* Deliberately written at realistic length — a real fetch produces a few thousand to
         twenty thousand characters, and a three-line stub does not show what the pipeline is for.
         Entirely invented: this is not a transcript of any real video. */
      transcript: 'Okay so the question I get most often is which mechanical keyboard should I buy first, and honestly the answer is that three things decide whether you end up liking it: the switch type, the layout, and the case. Everything else is decoration. Let me go through them one at a time.\n\nStarting with switches. There are three families. Linear switches move straight down with no bump, they feel smooth, and they are what most people who type fast end up preferring. Tactile switches have a small bump partway through the press so you can feel the moment it registers, which some people find helps accuracy. And clicky switches add a click bar so the sound is deliberate and loud — those are great fun and terrible in an office. If you can, go to a shop and press them, because reading about a bump is nothing like feeling one. If you cannot, buy a switch tester for a few dollars before committing to a whole board.\n\nSecond, layout. Full size boards have a number pad, which sounds useful until you notice it pushes your mouse hand out by about fifteen centimetres all day. Tenkeyless drops the number pad. Seventy five percent keeps the function row and the arrow keys but squeezes everything together, and for most people that is the sweet spot — you keep the keys you actually use and get your desk back. Sixty percent drops the arrows entirely and puts them on a layer, which is fine if you are willing to build the muscle memory and annoying if you are not. Be honest with yourself about the number pad. If you do accounting, keep it. If you have used it twice this year, let it go.\n\nThird, the case, and this is the part people skip. The case is what you are actually hearing when you type. A hollow plastic case with the board screwed straight into it sounds thin and hollow. A gasket mounted board, where the plate sits on soft strips instead of being bolted down, sounds fuller and feels softer to bottom out on. Add weight — aluminium or a brass plate inside — and the whole thing gets quieter and more solid. This is the single biggest difference between a forty dollar board and a two hundred dollar board, more than the switches.\n\nNow budgets. Under a hundred, the one feature worth insisting on is hot swap sockets, which let you pull switches out with a tool and try different ones without soldering. That single feature turns a cheap board into something you can keep experimenting with. Between one hundred and two hundred, you start getting gasket mounting and better sound dampening. Above that you are mostly paying for materials and finish, which is a real thing to enjoy but not a performance upgrade.\n\nOne last thing about keycaps. PBT plastic resists the shine that ABS develops after a year of use, and the profile — the shape and height of each row — changes how your fingers travel more than people expect. Cherry profile is low and sculpted and a safe default. If your board comes with cheap keycaps, swapping them is the cheapest upgrade that actually changes the experience.\n\nSo to summarise: pick the switch by feel not by spec sheet, pick seventy five percent unless you have a reason not to, make sure it is hot swap, and spend whatever is left on the case rather than the extras.' }
  ];

  return { NOTES: NOTES };
});
