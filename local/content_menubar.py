#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
收藏整理库 · 抓取服务「菜单栏小程序」。点一下启动本地抓取后端，网页库就能「🎬 抓视频」。
双击同目录的「收藏整理库抓取.app」启动（不开终端）；菜单里可启动/停止、复制口令、打开网页。

一次性安装： pip3 install rumps yt-dlp faster-whisper av pillow
（若 .app 打不开，退而求其次：终端里跑 python3 content_menubar.py，或直接 python3 content_server.py）
"""
import threading, subprocess, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    import rumps
except ImportError:
    print("请先安装： pip3 install rumps"); sys.exit(1)
import content_server as srv

APP_URL = "https://nickkklian.github.io/content-organizer/"

class FetchApp(rumps.App):
    def __init__(self):
        super().__init__("🎬⚪", quit_button=None)
        self.httpd = None
        self.thread = None
        self.menu = ["启动抓取服务", "停止服务", None, "复制口令", "打开收藏整理库网页", None, "退出"]

    def running(self):
        return self.thread is not None and self.thread.is_alive()

    @rumps.clicked("启动抓取服务")
    def start(self, _):
        if self.running():
            rumps.notification("收藏整理库", "", "服务已经在运行"); return
        try:
            self.httpd = srv.make_server()
        except OSError as e:
            rumps.notification("收藏整理库", "启动失败（端口被占？）", str(e)); return
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.title = "🎬🟢"
        rumps.notification("收藏整理库", "抓取服务已启动", "去网页库点「🎬 抓视频」粘链接")

    @rumps.clicked("停止服务")
    def stop(self, _):
        if self.httpd:
            try: self.httpd.shutdown()
            except Exception: pass
        self.httpd = None; self.thread = None
        self.title = "🎬⚪"
        rumps.notification("收藏整理库", "", "抓取服务已停止")

    @rumps.clicked("复制口令")
    def copy_token(self, _):
        p = subprocess.Popen(["pbcopy"], stdin=subprocess.PIPE)
        p.communicate(srv.TOKEN.encode())
        rumps.notification("收藏整理库", "口令已复制到剪贴板", "粘进网页库 ⚙️ 设置的「本地抓视频口令」")

    @rumps.clicked("打开收藏整理库网页")
    def open_web(self, _):
        subprocess.Popen(["open", APP_URL])

    @rumps.clicked("退出")
    def quit_app(self, _):
        if self.httpd:
            try: self.httpd.shutdown()
            except Exception: pass
        rumps.quit_application()

if __name__ == "__main__":
    FetchApp().run()
