-- 收藏整理库抓取「开关」：双击→启动服务(并把口令复制到剪贴板)；再双击→停止。无终端。
set homePath to (POSIX path of (path to home folder))
set localDir to homePath & "Desktop/Dev/hub-apps/content-organizer/local"
set tokenFile to homePath & ".config/xhs-fetch/token"
set pyPath to "/opt/anaconda3/bin/python3"

-- 兜底：anaconda python 不在就用系统 python3
try
	do shell script "test -x " & pyPath
on error
	set pyPath to "/usr/bin/env python3"
end try

-- 按端口 8766 判断是否在跑（避免 pgrep 匹配到自身 shell 的误判）
set isRunning to false
try
	do shell script "/usr/sbin/lsof -ti tcp:8766"
	set isRunning to true
end try

if isRunning then
	do shell script "/usr/sbin/lsof -ti tcp:8766 | xargs kill -9 2>/dev/null; true"
	display notification "抓取服务已停止" with title "收藏整理库抓取" sound name "Pop"
else
	-- 先复制口令（不依赖服务是否起来，避免后面卡住漏复制）
	try
		set the clipboard to (do shell script "cat " & quoted form of tokenFile)
	end try
	-- 子 shell 后台启动：( … & ) 让 do shell script 立即返回、applet 不卡住（否则漏复制、也挡下次点击）
	do shell script "cd " & quoted form of localDir & " && ( nohup " & pyPath & " content_server.py < /dev/null > /tmp/co_fetch.log 2>&1 & )"
	display notification "已启动 · 口令已复制,去网页库 ⚙️ 粘上即可" with title "收藏整理库抓取 🟢" sound name "Glass"
end if
