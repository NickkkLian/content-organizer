# Content Organizer · local fetch service

Speech-to-text and key-frame extraction for Xiaohongshu / Bilibili videos run **on your own Mac**:
`yt-dlp` reads the logged-in cookies from your browser, `faster-whisper` transcribes locally, and
nothing is uploaded anywhere. The web app talks to this service through the "🎬 Fetch video" tab.
The service never sees your API keys and never touches git — it only returns data. Judging which
screenshots are useful and saving to the library both happen in the browser.

## One-time install (no Homebrew needed)
```bash
pip3 install yt-dlp faster-whisper av pillow
```

## Usage: double-click the toggle app (no terminal)
**Double-click `Content-Organizer-Fetch.app`** — it **first shows the current state** and then lets you
choose (no blind toggling):
- "⚪ Fetch service: stopped" → click **Start service**: starts it and **copies the token to your clipboard**; "Not now" does nothing.
- "🟢 Fetch service: running" → click **Stop service** to stop it; "Keep running" does nothing.
- If nobody clicks within 15 seconds the dialog closes and **nothing happens** (no accidental start/stop).
- First time only, pair the token: open the web app → ⚙️ Settings → paste it into "local fetch token" → Save (the browser remembers it).
- After that, paste a link into "🎬 Fetch video".

> ⚠️ **Editing `content_server.py` requires a restart** (a running process keeps the code it started with):
> double-click → Stop service → double-click → Start service.
> The toggle runs the `content_server.py` that sits **next to the app**, so keep this folder current.

> If Finder refuses to open the app the first time (unsigned): **right-click → Open → Open**, or
> System Settings → Privacy & Security → "Open Anyway".

## Troubleshooting / notes
- **The app won't open at all** → terminal fallback: `cd <this folder> && python3 content_server.py`
  (prints the token; keep the window open = the service is running).
- **Different Python path** → edit `pyPath` at the top of `co_toggle.applescript` and recompile:
  `osacompile -o Content-Organizer-Fetch.app co_toggle.applescript`.
- **Xiaohongshu videos** need a link that carries `xsec_token` (Share → Copy link in the app gives an
  xhslink with it; or copy the address-bar URL from a logged-in desktop browser).
- **Bilibili** is DASH: the video stream (frames) and audio stream (transcription) are downloaded
  separately; existing subtitles (including AI subtitles; needs browser login cookies) are preferred,
  local whisper is the fallback. **Bilibili rate-limits (412)** — wait a few minutes and retry.
- **Screenshots** are judged by Claude in the web app; transcription and storage go through no third
  party (your Claude / GitHub keys exist only in your browser).
- Downloaded media is **deleted as soon as frames are extracted** (the temp directory is removed in a
  `finally`); only the whisper model (a few hundred MB) is cached once and reused.
- The token is stored at `~/.config/xhs-fetch/token`; the service listens on `127.0.0.1:8766`.
- Serving the web app from your own domain? Put each extra origin on its own line in `~/.config/xhs-fetch/origins` (CORS allow-list; restart the service after editing).

## Files
- `content_server.py` — the local fetch API (the part that does the work).
- `co_toggle.applescript` — source of the toggle app (recompile with `osacompile` after editing).
- `Content-Organizer-Fetch.app` — the compiled toggle (double-click to use).
