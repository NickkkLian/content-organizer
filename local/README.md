# 收藏整理库 · 本地抓取服务

小红书 / B站视频的「语音转写 + 关键帧」在你 **Mac 本地**做（住宅 IP 避风控），网页库通过它「🎬 抓视频」。后端不碰你的任何密钥、不碰 git，只返回数据；判图/存库都在网页里。

## 一次性安装（不用 Homebrew）
```bash
pip3 install yt-dlp faster-whisper av pillow
```

## 用法：双击「开关」App（不开终端）
**双击 `收藏整理库抓取.app`** —— 它是个开关：
- **第一次双击 = 启动服务**，并把**口令自动复制到剪贴板** + 弹通知。
- 打开网页库 [收藏整理库](https://nickkklian.github.io/content-organizer/) → ⚙️ 设置 → 「本地抓视频口令」粘上 → 保存（**只需一次**，之后浏览器记住）。
- 之后在「🎬 抓视频」粘链接即可。
- **再次双击同一个 App = 停止服务。**

> 首次在 Finder 双击若被拦（未签名）：**右键 → 打开 → 打开**；或系统设置 → 隐私与安全性 → 「仍要打开」。

## 排错 / 说明
- **App 实在打不开** → 终端保底：`cd ~/Desktop/Dev/hub-apps/content-organizer/local && python3 content_server.py`（会打印口令；窗口留着别关＝服务）。
- **改了 python 路径/位置** → 编辑 `co_toggle.applescript` 顶部的 `pyPath`，再重编译：`osacompile -o 收藏整理库抓取.app co_toggle.applescript`。
- **小红书视频**要用带 `xsec_token` 的链接（App 分享→复制链接的 xhslink，或浏览器登录后地址栏网址）。
- **B站**是 DASH：分别下视频流(抽帧)/音频流(转写)；优先取现成字幕（含 AI 字幕，需浏览器登录 cookie），没有才本地 whisper。**B站反爬会限流(412)**，遇到等几分钟再试。
- **截图**由网页库的 Claude 判断留哪些有用；转写、存库都不经过第三方（Claude/GitHub key 只在你浏览器）。
- 下载的视频/音频**抽完帧即删**（临时目录 `finally` 清掉），不占空间；只有 whisper 模型（几百 MB）一次性缓存复用。
- 口令存 `~/.config/xhs-fetch/token`；服务端口 `127.0.0.1:8766`。

## 文件
- `content_server.py` —— 本地抓取 API（真干活的）。
- `co_toggle.applescript` —— 开关的源码（改完用 osacompile 重编译）。
- `收藏整理库抓取.app` —— 编译好的开关（双击用）。
