/* check-css.mjs — every class the app puts on an element has a rule, and every rule is for a class it puts there.

     node check-css.mjs           reports classes with no rule, and rules for classes nothing renders
     node check-css.mjs --break   deletes one rule at a time in a copy and requires the report to name that class

   This exists because of a real regression in this repository. Restyling the app onto the design tokens rewrote
   styles.css, the markup kept every class name it had, and twenty-one rules were quietly not carried over: error
   messages rendered in the neutral info style, the image gallery lost its grid and stacked full-width, the sync pill
   lost its three states. Nothing threw and nothing looked obviously broken in the states a screenshot happened to
   catch — which is exactly the shape of defect a person does not find by looking.

   How the classes are found, since there is no build step to ask:
     · anything inside a class="…" / class='…' — HTML attributes, and the ones assembled inside JS string literals
       (the capture stops at the first quote of either kind, so `'<b class="chip' + (on ? ' chip--on' : '')` yields
       `chip` here and `chip--on` from the rule below);
     · any string literal that is nothing but class-shaped tokens, one of which carries a `--`, a `__` or an `is-`
       prefix — the modifiers the render functions concatenate.
     · a literal assigned to .className, or passed to classList.add / remove / toggle / contains.
   A class named by none of those routes is invisible to this check, and so is the difference between a class that has
   one declaration somewhere and a class that is fully styled: this catches a rule that went missing, not a rule that
   says too little. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCES = ['index.html', 'appearance.js', ...fs.readdirSync(path.join(HERE, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f)];
const SHEETS = ['styles.css', 'design-tokens.css'];

/* Classes the sources name but that are hooks, not styling: JS or the tests reach them, no rule is expected. */
const HOOKS = new Set([]);

const WHOLE = /^[a-z][a-z0-9_-]*[a-z0-9]$/;      // a class name, ending in a character and not a separator
const PREFIX = /^[a-z][a-z0-9_-]*[-_]$/;         // what is left of one when a variable was going to finish it
const MODIFIER = /(--|__)|^is-/;

function classesInSources() {
  const found = new Map();      // class -> the files that name it
  const partial = new Map();    // prefix -> the files that build a class name out of it
  for (const rel of SOURCES) {
    /* Comments are not markup: this file's own prose about class names must not be read as class names. */
    const text = fs.readFileSync(path.join(HERE, rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
    const into = (map, token) => {
      if (!map.has(token)) map.set(token, new Set());
      map.get(token).add(rel);
    };
    for (const m of text.matchAll(/class=["']([^"'\n]*)/g)) {
      m[1].trim().split(/\s+/).forEach((p) => { if (WHOLE.test(p)) into(found, p); });
    }
    /* Set on an element directly rather than rendered into markup. */
    for (const m of text.matchAll(/\.className\s*=\s*(['"])([^'"\n]*)\1/g)) {
      m[2].trim().split(/\s+/).forEach((p) => { if (WHOLE.test(p)) into(found, p); });
    }
    for (const m of text.matchAll(/classList\.(?:add|remove|toggle|contains)\(\s*(['"])([^'"\n]*)\1/g)) {
      if (WHOLE.test(m[2])) into(found, m[2]);
    }
    /* A string literal that is nothing but class-shaped words, one of them a modifier: the pieces the render
       functions concatenate. A piece left hanging on a separator was going to be completed by a variable. */
    for (const m of text.matchAll(/(['"])([^'"\n]*)\1/g)) {
      const parts = m[2].trim().split(/\s+/).filter(Boolean);
      if (!parts.length || !parts.every((p) => WHOLE.test(p) || PREFIX.test(p))) continue;
      if (!parts.some((p) => MODIFIER.test(p))) continue;
      parts.forEach((p) => into(WHOLE.test(p) ? found : partial, p));
    }
  }
  return { found, partial };
}

/* Selectors only: a rule's declarations can hold a data: URI with dots in it, and did. */
function classesInSheets(sheets) {
  const found = new Map();
  for (const [rel, raw] of sheets) {
    const text = raw.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const rule of text.matchAll(/([^{}]*)\{[^{}]*\}/g)) {
      for (const m of rule[1].matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) {
        if (!found.has(m[1])) found.set(m[1], new Set());
        found.get(m[1]).add(rel);
      }
    }
  }
  return found;
}

function report(sheets) {
  const { found: inSource, partial } = classesInSources();
  const inSheet = classesInSheets(sheets);
  const unstyled = [...inSource.keys()].filter((c) => !inSheet.has(c) && !HOOKS.has(c)).sort();
  const dead = [...inSheet.keys()].filter((c) => !inSource.has(c)).sort();
  return { unstyled, dead, inSource, partial };
}

function readSheets(swap) {
  return SHEETS.map((rel) => [rel, fs.readFileSync((swap && swap[rel]) || path.join(HERE, rel), 'utf8')]);
}

/* Delete every rule whose selector list mentions .name — the whole declaration block with it. */
function deleteRulesFor(css, name) {
  let out = '', i = 0, removed = 0;
  const re = /([^{}]+)\{([^{}]*)\}/g;   // one flat rule; nested at-rules keep their own braces around these
  let m;
  while ((m = re.exec(css))) {
    const selector = m[1];
    if (new RegExp('\\.' + name + '(?![\\w-])').test(selector)) {
      out += css.slice(i, m.index);
      i = m.index + m[0].length;
      removed++;
    }
  }
  out += css.slice(i);
  return { css: out, removed };
}

function main() {
  if (!process.argv.includes('--break')) {
    const { unstyled, dead, inSource, partial } = report(readSheets());
    for (const c of unstyled) console.log(`UNSTYLED  .${c} — rendered by ${[...inSource.get(c)].join(', ')}, no rule in ${SHEETS.join(' or ')}`);
    for (const c of dead) console.log(`DEAD      .${c} — a rule exists, nothing renders it`);
    for (const [c, where] of partial) console.log(`BUILT     .${c}… — ${[...where].join(', ')} completes this name with a variable, so no check can see it; put the whole names in a table`);
    console.log(`RESULT: ${inSource.size} classes rendered, ${unstyled.length} with no rule, ${dead.length} rules nothing renders, ${partial.size} names built at runtime`);
    return unstyled.length || dead.length || partial.size ? 1 : 0;
  }

  /* The check can only be trusted if removing a rule turns it red, and reddens it for that class. The classes to
     try are taken from the stylesheet rather than listed here — a list would be one more thing to keep in step with
     the sheet, and the point is only that deleting a rule is noticed, whichever rule it is. */
  const styles = fs.readFileSync(path.join(HERE, 'styles.css'), 'utf8');
  const candidates = [...report(readSheets()).inSource.keys()]
    .filter((c) => deleteRulesFor(styles, c).removed === 1).sort();
  const WANT = 8;
  if (candidates.length < WANT) {
    console.log(`NOT APPLIED  only ${candidates.length} classes in styles.css have exactly one rule to delete`);
    return 1;
  }
  // spread across the sheet rather than the first eight, which would all come from one corner of the alphabet
  const probes = Array.from({ length: WANT }, (_, i) => candidates[Math.floor((i * candidates.length) / WANT)]);
  const caught = [];
  for (const name of probes) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'co-css-'));
    const copy = path.join(dir, 'styles.css');
    const { css, removed } = deleteRulesFor(styles, name);
    if (!removed) {
      console.log(`NOT APPLIED  .${name} — no rule to delete in styles.css`);
      caught.push(false);
    } else {
      fs.writeFileSync(copy, css);
      const { unstyled } = report(readSheets({ 'styles.css': copy }));
      const ok = unstyled.includes(name);
      console.log(`${ok ? 'CAUGHT     ' : 'NOT CAUGHT '} .${name} (${removed} rule${removed === 1 ? '' : 's'} deleted)` +
        (ok ? '' : `\n             reported instead: ${unstyled.join(', ') || 'nothing'}`));
      caught.push(ok);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const n = caught.filter(Boolean).length;
  console.log(`RESULT: ${n}/${probes.length} deleted rules reported as unstyled`);
  return n === probes.length ? 0 : 1;
}

process.exit(main());
