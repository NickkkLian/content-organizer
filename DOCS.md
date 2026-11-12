# Clipbind: how it's built

Moved from the README so its first pages show what the app does. The text is unchanged, except that the closing note now names the four rules it refers to.

## How it's built

| Concern | Approach |
|---|---|
| Front end | Vanilla JS modules, one HTML file, no bundler. Loads in the order `i18n → samples → classify → parse → merge → refs → export → store → sync → images → fetch → ai → app` |
| Rules under test | The two things that would fail silently are pure functions in files of their own, DOM-free, loaded by the browser with `<script>` and by node with `require` — the file the browser runs is the file the tests run. `js/merge.js` is what happens when two devices have both written; `js/refs.js` is the numbered source list the reading view prints. `node check.mjs` runs 40 cases; `node check.mjs --break` breaks each rule in a copy and requires **the case written for it** to be the one that fails |
| Stylesheet under test | `node tools/check-css.mjs`: every class the app puts on an element has a rule, every rule is for a class it renders. Written after a restyle silently dropped the rules for twenty-two classes — error messages rendered in the neutral information style and nothing threw |
| Content-Security-Policy | A `<meta>` right after `<meta charset>`: scripts only from this site's own files and from the page's two inline scripts, pinned by sha256; no `'unsafe-inline'`, no `'unsafe-eval'`. The keys this app keeps in the browser share an origin with the author's other GitHub Pages sites, and the library shows text saved from other sites, so the browser itself refuses a script from another host, text run as code and inline event handlers. There is no build step: `node check-csp.mjs --write` computes the hashes and `node check-csp.mjs` (in CI) fails when the policy is missing, loosened or out of step with the page |
| Local storage | IndexedDB, with a one-time migration from localStorage. The origin hosts many apps and the ~5 MB localStorage quota is shared, so transcripts were silently failing to save — the store now throws visibly instead |
| Cloud sync | A single `content.json` in a private GitHub repo via the Contents API. Merge is union + tombstones + latest-`savedAt`-wins, so several devices can write concurrently; a `sha` conflict triggers one re-pull-and-retry |
| Image archiving | Fetched through an image proxy (CORS), compressed to 1080px WebP, committed to the repo; rendered back as blob URLs with the token. A cache-key subtlety with GitHub's `Accept`-negotiated responses is documented inline in `js/images.js` |
| AI | Claude Messages API called directly from the browser with **structured output** (a JSON schema), so the sectioned result never needs parsing heuristics. Output language follows the UI language |
| Video ingest | `local/content_server.py` — a tiny HTTP service on `127.0.0.1` that uses `yt-dlp` (with your browser cookies), `faster-whisper` for transcription and PyAV for key frames, streaming progress over **Server-Sent Events**. It returns candidate frames only; Claude vision in the browser judges which are informative |
| Secrets | GitHub token, Anthropic key and the local service token live only in this browser's storage. Nothing is ever written into a repo |
| Language | English by default, 中文 via the toggle; the preference is remembered in localStorage |

```
index.html            shell; static strings carry data-i18n keys
styles.css            topic rail, cover rows, preview and bind tray, source-linked reader, phone sheets
js/i18n.js            dictionary + T(zh, en) helper
js/samples.js         36 fictional notes in each language, including two long video transcripts
js/library.js         search snippets, topic-tag counts and exact demo replay sets
js/classify.js        keyword categoriser (Chinese keywords — the content is Chinese)
js/parse.js           Xiaohongshu fetch chain: Jina HTML → Jina markdown → AllOrigins → manual
js/merge.js           the merge rules: union by id, tombstones win, latest savedAt wins (DOM-free, tested)
js/refs.js            one numbered source list per compilation, and the numbers each section cites (DOM-free, tested)
js/export.js          saved compilation Markdown; reuses refs, with no connection or AI dependencies
js/store.js           IndexedDB store with synchronous API and localStorage fallback
js/sync.js            private-repo sync, tombstone merge, legacy bootstrap
js/images.js          archiving, expiry detection, proxy fallbacks, vision sizing
js/fetch.js           client for the local video service (EventSource)
js/ai.js              consolidation + frame judging (structured outputs)
js/app.js             UI, sample data, event wiring
demo/                 two guides per language, exact prompt records and replay data
assets/fonts/         self-hosted Figtree, Source Serif 4 and sliced Noto Serif SC, with OFL licences
local/                the optional video service and its double-click toggle app (see local/README.md)
check.mjs             40 cases over js/merge.js and js/refs.js; --break has to make the right one fail
check-export.mjs      order, numbering, complete sources, language, escaping, settings exclusion, empty and large exports
tools/check-css.mjs   every rendered class has a rule, every rule is rendered; --break deletes rules to show it goes red
check-csp.mjs         the page's Content-Security-Policy: --write puts it in, the default run checks it, --self-test breaks it
make-demo-compilation.mjs   runs the AI step once with your key and writes demo/compilation.json
```

## Design notes worth reading in the code

- `js/store.js` — why put/get must be separate helpers, and why a failed write must throw rather than
  return.
- `js/images.js` — why the sha-lookup request uses `cache: 'no-store'`: Chrome cached a raw WebP
  under the same URL and a later JSON request received image bytes.
- `styles.css` — why the grid uses `minmax(0, 1fr)`: with real cards, `1fr` let a column grow to
  668px on a 375px phone, and an empty library can't reveal it.
- `local/content_server.py` — the measured frame-difference thresholds behind `SCENE_THR`.

## Checks

```bash
python3 -m http.server 8765        # then open http://localhost:8765/?demo=1
node check.mjs                     # 40 cases over the merge rules and the source list
node check.mjs --break             # breaks each rule; the case written for it has to be the one that fails
node check-export.mjs              # portable compilation Markdown and source-list parity
node tools/check-css.mjs           # every rendered class has a rule, and back
node tools/check-css.mjs --break   # deletes rules to show the check can go red
node check-csp.mjs                 # the Content-Security-Policy is script-src 'self' + the inline scripts' hashes
node check-csp.mjs --write         # after editing an inline script in index.html: update the hashes
node check-models.mjs              # every AI request names Claude Opus 5.5, Sonnet 5.5 or Haiku 5.5 (fetch replaced by a recorder)
node check-redesign.mjs            # classification, search, tag counts and bilingual replay data
node check-demo-assets.mjs         # unique WebP covers, file hashes, size and provenance
node check-capture.mjs             # normal Save form, concurrent captures, offline video and failed writes
node --test test/*.test.mjs        # Settings contracts and migration
```

In `js/refs.js`, the four decisions listed under "The reading view" in the README (URL as identity, numbering by first appearance, dropping a source with neither URL nor title, listing uncited notes) are also the four breaks `node check.mjs --break` makes in it.
