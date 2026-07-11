-- 收藏整理库抓取「开关」：双击→弹窗告诉你当前状态(运行中/已停止)，并可就地启动/停止。无终端。
set homePath to (POSIX path of (path to home folder))
set localDir to homePath & "Desktop/Dev/hub-apps/content-organizer/local"
set tokenFile to homePath & ".config/xhs-fetch/token"
set pyPath to "/opt/anaconda3/bin/python3"
try
	do shell script "test -x " & pyPath
on error
	set pyPath to "/usr/bin/env python3"
end try

-- 按端口 8766 判断是否在跑（避免误判自身）
set isRunning to false
try
	do shell script "/usr/sbin/lsof -ti tcp:8766"
	set isRunning to true
end try

if isRunning then
	set r to display dialog "🟢 抓取服务：运行中

网页库「🎬 抓视频」现在可用。" buttons {"停止服务", "保持运行"} default button "保持运行" with title "收藏整理库抓取" giving up after 15
	if (gave up of r) is false and (button returned of r) is "停止服务" then
		do shell script "/usr/sbin/lsof -ti tcp:8766 | xargs kill -9 2>/dev/null; true"
		display dialog "⚪ 抓取服务已停止。" buttons {"好"} default button "好" with title "收藏整理库抓取" giving up after 5
	end if
else
	set r to display dialog "⚪ 抓取服务：已停止

点「启动服务」开始。" buttons {"启动服务", "先不启动"} default button "启动服务" with title "收藏整理库抓取" giving up after 15
	if (gave up of r) is false and (button returned of r) is "启动服务" then
		try
			set the clipboard to (do shell script "cat " & quoted form of tokenFile)
		end try
		do shell script "cd " & quoted form of localDir & " && ( nohup " & pyPath & " content_server.py < /dev/null > /tmp/co_fetch.log 2>&1 & )"
		display dialog "🟢 已启动 · 口令已复制到剪贴板。

首次去网页库 ⚙️ 粘上「本地抓视频口令」，然后用「🎬 抓视频」。" buttons {"好"} default button "好" with title "收藏整理库抓取" giving up after 8
	end if
end if
