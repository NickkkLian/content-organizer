#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
收藏整理库 · 本地抓取 API（无界面，供网页库调用）。小红书 + B站 视频通吃：按链接自动认平台。
菜单栏 App（content_menubar.py）负责把它跑起来；网页库通过 http://127.0.0.1:8766 调它。

它只干重活：下视频 → 转写（B站优先取现成字幕，没有再本地 whisper；小红书一律 whisper）→ 抽“不同画面”的候选帧（base64 返回）。
【判图】哪些截图有用、【存库】写 content.json + 归档图，都在网页库里做——
那边才有 Claude key 和 GitHub 令牌。后端不碰你的任何密钥、也不碰 git，最小面。

依赖： pip3 install yt-dlp faster-whisper av pillow
单独跑（调试用）： python3 content_server.py
"""
import sys, os, re, json, subprocess, tempfile, shutil, base64, io, secrets, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("XHS_PORT", "8766"))
COOKIES_BROWSER = os.environ.get("XHS_COOKIES_BROWSER", "chrome")
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small")
WHISPER_LANG = os.environ.get("WHISPER_LANG", "zh")     # 空=自动识别
KEEP_MAX = int(os.environ.get("XHS_FRAMES", "14"))      # 最多返回多少张候选帧（AI 再从中挑有用的）
# 去重阈值：真正的判官是网页库的 Claude（它能读懂画面文字），本地只合并「近乎完全相同」的帧。
# 实测 MAD：同一页(仅压缩噪点)≈0.0006；同版式但文字不同的演示页/幻灯片≈0.014~0.022；换场景 0.1+。
# 旧值 0.12 远高于 0.014 → 把「版式一样、文字不同」的页面全并掉了（站长实测踩到：HTML 演示每页
# skills 名称不同却只截到一张）。取 0.008：噪点合并、文字一变就留，宁可多送让 AI 挑。
SCENE_THR = float(os.environ.get("XHS_SCENE_THR", "0.008"))
SIG_PX = int(os.environ.get("XHS_SIG_PX", "144"))       # 比对缩略图边长（分辨率影响不大，144 兼顾小字）
FRAME_MAX = 1568
ALLOW_ORIGINS = {"https://nickkklian.github.io",
                 "http://localhost:8765", "http://127.0.0.1:8765",
                 "http://localhost:8766", "http://127.0.0.1:8766"}
YTDLP = [sys.executable, "-m", "yt_dlp"]

# 本地口令：首次自动生成存 ~/.config/xhs-fetch/token；网页库调 /fetch 需带 ?token= 匹配（防别的网站偷调）
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

# ---------- 抓取管线 ----------
def clean_url(text):
    text = (text or "").strip()
    m = re.search(r"https?://\S+", text)
    if m: return re.sub(r"[^\w=/?&%.\-]+$", "", m.group(0))
    m = re.search(r"(?:xhslink\.com|(?:www\.)?xiaohongshu\.com)/\S+", text)
    if m: return "https://" + re.sub(r"[^\w=/?&%.\-]+$", "", m.group(0))
    raise RuntimeError("没找到链接。把小红书链接粘进来即可（可连前后分享文案）。")

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
            raise RuntimeError("拿不到视频内容——多半这条链接缺 xsec_token。请用带 token 的链接："
                               "小红书 App 打开这条→分享→复制链接（xhslink 自带 token），"
                               "或电脑浏览器登录后打开→复制地址栏网址（含 xsec_token=…）。")
        raise RuntimeError(("B站" if plat == "bili" else "小红书") + "抓元数据失败：" + err[:220])
    info = json.loads(p.stdout)
    if info.get("entries"): info = info["entries"][0]
    return info

def build_note(url, info, plat):
    tags = info.get("tags") or info.get("categories") or []
    if isinstance(tags, str): tags = [tags]
    cover = (info.get("thumbnail") or "").replace("http://", "https://")
    note = {
        "title": (info.get("title") or ("B站视频" if plat == "bili" else "小红书视频")).strip(),
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
        raise RuntimeError("视频下载失败（需登录 cookie / 或不是视频）：" + (p.stderr or "")[:200])
    return files[0]

def dl(url, tmp, fmt, name):
    """按指定 format 下载单个流，返回 (本地路径 or None, 进程结果)。"""
    import glob
    out = os.path.join(tmp, name + ".%(ext)s")
    p = subprocess.run(ytdlp_cmd(["-f", fmt, "--no-part", "-o", out, url]), capture_output=True, text=True)
    files = glob.glob(os.path.join(tmp, name + ".*"))
    return (files[0] if files else None), p

def whisper_transcribe(media_path, log):
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise RuntimeError("要本地转写请先装： pip3 install faster-whisper")
    log(f"载入模型 {WHISPER_MODEL}（首次会下载，约几百 MB）…")
    model = WhisperModel(WHISPER_MODEL, device="auto", compute_type="auto")
    segments, _ = model.transcribe(media_path, language=(WHISPER_LANG or None), vad_filter=True)
    parts = []
    for i, seg in enumerate(segments):
        t = (seg.text or "").strip()
        if t: parts.append(t)
        if (i + 1) % 10 == 0: log(f"…已转写 {i + 1} 段")
    return "\n".join(parts)

def candidate_frames(media_path, log):
    """抽关键帧 → 按画面差异去重，返回“互不相同”的候选帧（base64 webp）。不做取舍——哪些有用交给网页库的 AI 判。"""
    try:
        import av
        from PIL import ImageChops, ImageStat
    except ImportError:
        log("（未装 av/pillow，无候选帧）"); return []
    cand = []
    try:
        c = av.open(media_path); v = c.streams.video[0]; v.codec_context.skip_frame = "NONKEY"
        for frame in c.decode(v):
            im = frame.to_image(); cand.append((im, im.convert("L").resize((SIG_PX, SIG_PX))))
            if len(cand) >= 240: break
        c.close()
    except Exception as e:
        log(f"（抽帧失败：{str(e)[:80]}）"); return []
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
    # 只要中文字幕（含 B 站 AI 字幕）；别用 all（会混进 ai-zh-ar 等机翻）
    subprocess.run(ytdlp_cmd(["--skip-download", "--write-subs", "--write-auto-subs",
                              "--sub-langs", "ai-zh,zh-Hans,zh-Hant,zh-CN,zh",
                              "-o", os.path.join(tmp, "%(id)s.%(ext)s"), url]), capture_output=True)
    subs = [f for f in os.listdir(tmp) if re.search(r"\.(srt|vtt|ass|json3?|srv3)$", f)]
    subs.sort(key=lambda f: (0 if "zh" in f else 1, f))
    for f in subs:
        txt = extract_sub_text(os.path.join(tmp, f))
        if txt.strip() and re.search(r"[一-鿿]", txt): return txt   # 含汉字兜底
    return ""

def process(url, log):
    url = clean_url(url); plat = detect_platform(url)
    log(("B站" if plat == "bili" else "小红书") + " · " + url)
    log("抓元数据…"); info = meta(url, plat); note = build_note(url, info, plat)
    note["key"] = note_key(note["url"], info.get("id"), plat)
    log(f"「{note['title']}」 · {note['author'] or '匿名'} · {note['duration']}s")
    tmp = tempfile.mkdtemp(prefix="cvapi_")
    try:
        vid = None
        if plat == "bili":
            # B站是 DASH（视频/音频分离，无合并单文件）：字幕优先，再分别下视频流(抽帧)/音频流(转写)，避开 ffmpeg 合并
            log("找现成字幕…"); t = get_subtitle(note["url"], tmp)
            if t: log(f"✓ 现成字幕 {len(t)} 字")
            log("下载视频流(抽帧用，按码率选小的、优先 H.264)…")
            vid, vp = dl(note["url"], tmp, "bv*[vcodec^=avc1][tbr<=800]/bv*[tbr<=800]/bv*[vcodec^=avc1]/bv*", "v")
            if not vid: log("（视频流下载失败，跳过截图：" + (vp.stderr or "").strip()[-140:] + "）")
            if not t:
                log("无字幕 → 下音频本地转写…")
                aud, ap = dl(note["url"], tmp, "ba[ext=m4a]/ba/bestaudio", "a")
                if aud: t = whisper_transcribe(aud, log); log(f"✓ 转写 {len(t)} 字")
                else: log("（音频下载失败，无转写：" + (ap.stderr or "").strip()[-140:] + "）")
            note["transcript"] = t
        else:
            # 小红书：muxed 单文件通吃（视频+音频）
            log("下载视频…"); vid = download_media(note["url"], tmp)
            log("本地转写语音（按时长，可能几分钟）…"); note["transcript"] = whisper_transcribe(vid, log); log(f"✓ 转写 {len(note['transcript'])} 字")
        log("抽候选画面…"); frames = candidate_frames(vid, log) if vid else []
        log(f"✓ 候选画面 {len(frames)} 张（交给网页库 AI 判断哪些有用）")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    log("✅ 抓取完成")
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
    print(f"收藏整理库 · 本地抓取 API 已启动 → http://127.0.0.1:{PORT}/")
    print(f"口令(token)：{TOKEN}   （填进网页库 ⚙️ 设置）")
    run_server()

if __name__ == "__main__":
    main()
