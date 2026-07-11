# 收藏整理库 · 本地抓取服务

小红书 / B站视频的「语音转写 + 关键帧」在你 **Mac 本地**做（住宅 IP 避风控），网页库通过它「🎬 抓视频」。后端不碰你的任何密钥、不碰 git，只返回数据；判图/存库都在网页里。

## 一次性安装（不用 Homebrew）
```bash
pip3 install rumps yt-dlp faster-whisper av pillow
```

## 用法（不开终端）
1. **双击「收藏整理库抓取.app」** → 菜单栏出现 🎬 图标。
2. 点图标 → **启动抓取服务**（图标变 🎬🟢）。
3. 点 **复制口令** → 打开网页库 ⚙️ 设置 → 粘进「本地抓视频口令」→ 保存（只需一次）。
4. 之后在网页库 **🎬 抓视频** 粘链接就行。不用时点「停止服务」或「退出」。

## 排错 / 说明
- **.app 打不开**（权限/签名）：终端里 `python3 content_menubar.py`（菜单栏版），或 `python3 content_server.py`（纯服务，会把口令打印出来）。
- .app 里默认用 `/opt/anaconda3/bin/python3`；你的 python 在别处就改 `收藏整理库抓取.app/Contents/MacOS/run` 里的 `PY=`。
- **小红书视频**要用带 `xsec_token` 的链接（App 分享→复制链接的 xhslink，或浏览器登录后地址栏网址）。
- **B站**优先取现成字幕（含 AI 字幕，需浏览器登录态 cookie），没有再本地 whisper；小红书一律 whisper。
- **截图**由网页库的 Claude 判断留哪些有用；转写、存库都不经过第三方（Claude/GitHub key 只在你浏览器里）。
- 口令存 `~/.config/xhs-fetch/token`。
