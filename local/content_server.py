#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Content Organizer · local fetch API (headless; called by the web app). Handles Xiaohongshu and
Bilibili videos — the platform is detected from the link.
The toggle app starts it; the web app calls it at http://127.0.0.1:8766.

It does only the heavy lifting: download the video → transcribe (Bilibili: existing subtitles
first, local whisper otherwise; Xiaohongshu: always whisper) → extract candidate frames that look
different from each other (returned as base64).
Deciding which screenshots are useful and writing the library + archived images both happen in
the web app — that is where the Claude key and the GitHub token live. This process never touches
your secrets and never touches git: minimum surface.

Dependencies: pip3 install yt-dlp faster-whisper av pillow
Run standalone (for debugging): python3 content_server.py
"""
import sys, os, re, json, subprocess, tempfile, shutil, base64, io, secrets, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("XHS_PORT", "8766"))
COOKIES_BROWSER = os.environ.get("XHS_COOKIES_BROWSER", "chrome")
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small")
WHISPER_LANG = os.environ.get("WHISPER_LANG", "zh")     # empty = auto-detect
KEEP_MAX = int(os.environ.get("XHS_FRAMES", "14"))      # max candidate frames returned (the AI picks the useful ones)
# De-duplication threshold: the real judge is Claude in the web app (it can read on-screen text); locally we
# only merge frames that are *nearly identical*. Measured MAD: same page (compression noise only) ≈ 0.0006;
# same layout with different text (demo pages / slides) ≈ 0.014–0.022; scene change 0.1+.
# The old value 0.12 was far above 0.014 and merged every "same layout, different text" page (a demo whose
# every page listed different skill names yielded a single screenshot). 0.008: noise merges, any text change
# survives — better to send too many and let the AI choose.
SCENE_THR = float(os.environ.get("XHS_SCENE_THR", "0.008"))
SIG_PX = int(os.environ.get("XHS_SIG_PX", "144"))       # thumbnail edge for comparison (resolution matters little; 144 keeps small text)
FRAME_MAX = 1568
ALLOW_ORIGINS = {"https://nickkklian.github.io",
                 "http://localhost:8765", "http://127.0.0.1:8765",
                 "http://localhost:8766", "http://127.0.0.1:8766"}
# Serving the web app from your own domain? List extra origins one per line in ~/.config/xhs-fetch/origins
try:
    with open(os.path.join(os.path.expanduser("~"), ".config", "xhs-fetch", "origins")) as _f:
        ALLOW_ORIGINS |= {ln.strip() for ln in _f if ln.strip() and not ln.startswith("#")}
except OSError:
    pass
YTDLP = [sys.executable, "-m", "yt_dlp"]

# Local token: generated once and stored in ~/.config/xhs-fetch/token; the web app must pass ?token= on /fetch
# (so other sites can't call the service)
def _token():
    d = os.path.join(os.path.expanduser("~"), ".config", "xhs-fetch"); os.makedirs(d, exist_ok=True)
    p = os.path.join(d, "token")
    if os.path.exists(p): return open(p).read().strip()
    t = secrets.token_urlsafe(16); open(p, "w").write(t); return t
TOKEN = _token()

def ytdlp_cmd(extra):
    c = list(YTDLP)
    if COOKIES_BROWSER: c += ["--cookies-from-browser", COOKIES_BROWSER]
    return c + extra

# ---------- pipeline ----------
def clean_url(text):
    text = (text or "").strip()
    m = re.search(r"https?://\S+", text)
    if m: return re.sub(r"[^\w=/?&%.\-]+$", "", m.group(0))
    m = re.search(r"(?:xhslink\.com|(?:www\.)?xiaohongshu\.com)/\S+", text)
    if m: return "https://" + re.sub(r"[^\w=/?&%.\-]+$", "", m.group(0))
    raise RuntimeError("No link found. Paste a Xiaohongshu or Bilibili link (surrounding share text is fine).")

def detect_platform(url):
    return "bili" if re.search(r"bilibili\.com|b23\.tv|/video/BV|(?:^|[/?&=])av\d+", url or "", re.I) else "xhs"

XHS_ID_RE = re.compile(r"(?:explore|discovery/item|item)/([0-9a-fA-F]{16,32})")
BV_RE = re.compile(r"(BV[0-9A-Za-z]{8,12})")
def note_key(url, info_id, plat):
    if plat == "bili":
        m = BV_RE.search(url or "") or BV_RE.search(str(info_id or ""))
        return (m.group(1) if m else "") or (str(info_id) if info_id else "") or secrets.token_hex(8)
    m = XHS_ID_RE.search(url or "")
    return (m.group(1) if m else "") or (info_id or "") or secrets.token_hex(8)

def meta(url, plat):
    p = subprocess.run(ytdlp_cmd(["--dump-single-json", "--skip-download", "--no-warnings", url]),
                       capture_output=True, text=True)
    if p.returncode != 0:
        err = (p.stderr or "")
        if plat == "xhs" and (("No video formats" in err) or ("failed to obtain" in err) or ("Unable to extract" in err)):
            raise RuntimeError("Couldn't get the video — this link probably lacks xsec_token. Use a link that carries it: "
                               "open the post in the Xiaohongshu app → Share → Copy link (xhslink includes the token), "
                               "or open it in a logged-in desktop browser and copy the address bar URL (contains xsec_token=…).")
        raise RuntimeError(("Bilibili" if plat == "bili" else "Xiaohongshu") + " metadata fetch failed: " + err[:220])
    info = json.loads(p.stdout)
    if info.get("entries"): info = info["entries"][0]
    return info

def build_note(url, info, plat):
    tags = info.get("tags") or info.get("categories") or []
    if isinstance(tags, str): tags = [tags]
    cover = (info.get("thumbnail") or "").replace("http://", "https://")
    note = {
        "title": (info.get("title") or ("Bilibili video" if plat == "bili" else "Xiaohongshu video")).strip(),
        "author": (info.get("uploader") or info.get("uploader_id") or "").strip(),
        "body": (info.get("description") or "").strip(),
        "url": info.get("webpage_url") or url,
        "cover": cover,
        "duration": int(info.get("duration") or 0),
        "tags": [str(t) for t in tags][:12],
        "isVideo": True,
        "categoryEmoji": "🎬" if plat == "xhs" else "📺",
        "transcript": "",
    }
    # `category` is stored data; the web app maps it to the UI language at display time.
    if plat == "bili":
        cats = info.get("categories") or []
        note["platform"] = "bili"; note["source"] = "bili"
        note["tname"] = (cats[0] if cats else "") or ""
        note["category"] = note["tname"] or "B站视频"
    else:
        note["platform"] = "xhs"; note["source"] = "xhs-video"; note["category"] = "视频"
    return note

def download_media(url, tmp):
    out = os.path.join(tmp, "v.%(ext)s")
    import glob
    p = subprocess.run(ytdlp_cmd(["-f", "b", "--no-part", "-o", out, url]), capture_output=True, text=True)
    files = glob.glob(os.path.join(tmp, "v.*"))
    if not files:
        raise RuntimeError("Video download failed (login cookie needed, or not a video): " + (p.stderr or "")[:200])
    return files[0]

def dl(url, tmp, fmt, name):
    """Download one stream with the given format selector; returns (local path or None, process result)."""
    import glob
    out = os.path.join(tmp, name + ".%(ext)s")
    p = subprocess.run(ytdlp_cmd(["-f", fmt, "--no-part", "-o", out, url]), capture_output=True, text=True)
    files = glob.glob(os.path.join(tmp, name + ".*"))
    return (files[0] if files else None), p

def whisper_transcribe(media_path, log):
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise RuntimeError("Local transcription needs: pip3 install faster-whisper")
    log(f"Loading whisper model {WHISPER_MODEL} (first run downloads a few hundred MB)…")
    model = WhisperModel(WHISPER_MODEL, device="auto", compute_type="auto")
    segments, _ = model.transcribe(media_path, language=(WHISPER_LANG or None), vad_filter=True)
    parts = []
    for i, seg in enumerate(segments):
        t = (seg.text or "").strip()
        if t: parts.append(t)
        if (i + 1) % 10 == 0: log(f"…{i + 1} segments transcribed")
    return "\n".join(parts)

def candidate_frames(media_path, log):
    """Extract key frames → de-duplicate by visual difference → return the *distinct* candidates (base64 webp).
    No judgement here — which ones are useful is decided by the AI in the web app."""
    try:
        import av
        from PIL import ImageChops, ImageStat
    except ImportError:
        log("(av/pillow not installed; no candidate frames)"); return []
    cand = []
    try:
        c = av.open(media_path); v = c.streams.video[0]; v.codec_context.skip_frame = "NONKEY"
        for frame in c.decode(v):
            im = frame.to_image(); cand.append((im, im.convert("L").resize((SIG_PX, SIG_PX))))
            if len(cand) >= 240: break
        c.close()
    except Exception as e:
        log(f"(frame extraction failed: {str(e)[:80]})"); return []
    if not cand: return []
    kept = []
    for i in range(len(cand)):
        if not kept: kept.append(i); continue
        mind = min(ImageStat.Stat(ImageChops.difference(cand[i][1], cand[j][1])).mean[0] / 255.0 for j in kept)
        if mind > SCENE_THR: kept.append(i)
    if len(kept) > KEEP_MAX:
        step = len(kept) / float(KEEP_MAX); kept = [kept[int(i * step)] for i in range(KEEP_MAX)]
    out = []
    for fi in kept:
        im = cand[fi][0].convert("RGB"); w, h = im.size; lo = max(w, h)
        if lo > FRAME_MAX:
            s = FRAME_MAX / float(lo); im = im.resize((max(1, int(w * s)), max(1, int(h * s))))
        buf = io.BytesIO(); im.save(buf, "WEBP", quality=82)
        out.append(base64.b64encode(buf.getvalue()).decode())
    return out

def extract_sub_text(path):
    raw = open(path, encoding="utf-8", errors="ignore").read()
    if path.endswith((".json", ".json3", ".srv3")):
        try:
            body = (json.loads(raw) or {}).get("body") or []
            txt = "\n".join((seg.get("content") or "").strip() for seg in body if (seg.get("content") or "").strip())
            if txt.strip(): return txt
        except Exception: pass
    out = []
    for ln in raw.splitlines():
        ln = ln.strip()
        if not ln or ln.isdigit() or "-->" in ln: continue
        if ln == "WEBVTT" or ln.startswith(("NOTE", "Kind:", "Language:")): continue
        ln = re.sub(r"<[^>]+>", "", ln).strip()
        if ln and (not out or out[-1] != ln): out.append(ln)
    return "\n".join(out)

def get_subtitle(url, tmp):
    # Chinese subtitles only (including Bilibili's AI subtitles); never `all` (it drags in ai-zh-ar and other machine translations)
    subprocess.run(ytdlp_cmd(["--skip-download", "--write-subs", "--write-auto-subs",
                              "--sub-langs", "ai-zh,zh-Hans,zh-Hant,zh-CN,zh",
                              "-o", os.path.join(tmp, "%(id)s.%(ext)s"), url]), capture_output=True)
    subs = [f for f in os.listdir(tmp) if re.search(r"\.(srt|vtt|ass|json3?|srv3)$", f)]
    subs.sort(key=lambda f: (0 if "zh" in f else 1, f))
    for f in subs:
        txt = extract_sub_text(os.path.join(tmp, f))
        if txt.strip() and re.search(r"[一-鿿]", txt): return txt   # must contain CJK characters
    return ""

def process(url, log):
    url = clean_url(url); plat = detect_platform(url)
    log(("Bilibili" if plat == "bili" else "Xiaohongshu") + " · " + url)
    log("Fetching metadata…"); info = meta(url, plat); note = build_note(url, info, plat)
    note["key"] = note_key(note["url"], info.get("id"), plat)
    log(f"\"{note['title']}\" · {note['author'] or 'anonymous'} · {note['duration']}s")
    tmp = tempfile.mkdtemp(prefix="cvapi_")
    try:
        vid = None
        if plat == "bili":
            # Bilibili is DASH (separate video/audio, no muxed file): subtitles first, then download the video
            # stream (frames) and audio stream (transcription) separately — avoids needing ffmpeg to merge.
            log("Looking for existing subtitles…"); t = get_subtitle(note["url"], tmp)
            if t: log(f"✓ existing subtitles, {len(t)} chars")
            log("Downloading video stream (for frames; smallest bitrate, H.264 preferred)…")
            vid, vp = dl(note["url"], tmp, "bv*[vcodec^=avc1][tbr<=800]/bv*[tbr<=800]/bv*[vcodec^=avc1]/bv*", "v")
            if not vid: log("(video stream download failed, skipping screenshots: " + (vp.stderr or "").strip()[-140:] + ")")
            if not t:
                log("No subtitles → downloading audio for local transcription…")
                aud, ap = dl(note["url"], tmp, "ba[ext=m4a]/ba/bestaudio", "a")
                if aud: t = whisper_transcribe(aud, log); log(f"✓ transcribed {len(t)} chars")
                else: log("(audio download failed, no transcript: " + (ap.stderr or "").strip()[-140:] + ")")
            note["transcript"] = t
        else:
            # Xiaohongshu: a single muxed file (video + audio)
            log("Downloading video…"); vid = download_media(note["url"], tmp)
            log("Transcribing speech locally (may take minutes, depending on length)…"); note["transcript"] = whisper_transcribe(vid, log); log(f"✓ transcribed {len(note['transcript'])} chars")
        log("Extracting candidate frames…"); frames = candidate_frames(vid, log) if vid else []
        log(f"✓ {len(frames)} candidate frames (the web app's AI decides which are useful)")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    log("✅ Fetch complete")
    return {"note": note, "frames": frames}

# ---------- HTTP ----------
def _cors(h):
    origin = h.headers.get("Origin", "")
    ok = (origin in ALLOW_ORIGINS) or bool(re.match(r"^http://(localhost|127\.0\.0\.1)(:\d+)?$", origin))
    h.send_header("Access-Control-Allow-Origin", origin if ok else "https://nickkklian.github.io")
    h.send_header("Vary", "Origin")

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json; charset=utf-8")
        _cors(self); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_OPTIONS(self):
        self.send_response(204); _cors(self)
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*"); self.end_headers()
    def do_GET(self):
        u = urllib.parse.urlparse(self.path); qs = urllib.parse.parse_qs(u.query)
        if u.path == "/health":
            self._json({"ok": True, "name": "xhs-fetch", "tokenRequired": True}); return
        if u.path == "/fetch":
            if (qs.get("token") or [""])[0] != TOKEN:
                self._json({"error": "bad or missing token"}, 401); return
            url = (qs.get("url") or [""])[0]
            self.send_response(200); self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache"); _cors(self); self.end_headers()
            def emit(ev, data):
                try:
                    self.wfile.write(("event: " + ev + "\ndata: " + json.dumps(data, ensure_ascii=False) + "\n\n").encode()); self.wfile.flush()
                except Exception: pass
            try:
                emit("done", process(url, lambda l: emit("log", l)))
            except Exception as e:
                emit("fail", str(e))
            return
        self._json({"error": "not found"}, 404)

def make_server():
    return ThreadingHTTPServer(("127.0.0.1", PORT), H)

def run_server():
    make_server().serve_forever()

def main():
    print(f"Content Organizer · local fetch API running → http://127.0.0.1:{PORT}/")
    print(f"Token: {TOKEN}   (paste it into the web app's ⚙️ Settings)")
    run_server()

if __name__ == "__main__":
    main()
