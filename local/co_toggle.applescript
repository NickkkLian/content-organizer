-- Content Organizer fetch-service toggle: double-click → a dialog shows the current state (running / stopped)
-- and lets you start or stop it in place. No terminal window.
-- The service script is expected next to this app (same folder), so the bundle is relocatable.
set homePath to (POSIX path of (path to home folder))
set appPath to (POSIX path of (path to me))
set localDir to do shell script "dirname " & quoted form of appPath
set tokenFile to homePath & ".config/xhs-fetch/token"
set pyPath to "/opt/anaconda3/bin/python3"
try
	do shell script "test -x " & pyPath
on error
	set pyPath to "/usr/bin/env python3"
end try

-- Detect "running" by port 8766 (avoids mis-detecting this app itself)
set isRunning to false
try
	do shell script "/usr/sbin/lsof -ti tcp:8766"
	set isRunning to true
end try

if isRunning then
	set r to display dialog "🟢 Fetch service: running

\"🎬 Fetch video\" in the web app is available." buttons {"Stop service", "Keep running"} default button "Keep running" with title "Content Organizer fetch" giving up after 15
	if (gave up of r) is false and (button returned of r) is "Stop service" then
		do shell script "/usr/sbin/lsof -ti tcp:8766 | xargs kill -9 2>/dev/null; true"
		display dialog "⚪ Fetch service stopped." buttons {"OK"} default button "OK" with title "Content Organizer fetch" giving up after 5
	end if
else
	set r to display dialog "⚪ Fetch service: stopped

Click \"Start service\" to begin." buttons {"Start service", "Not now"} default button "Start service" with title "Content Organizer fetch" giving up after 15
	if (gave up of r) is false and (button returned of r) is "Start service" then
		try
			set the clipboard to (do shell script "cat " & quoted form of tokenFile)
		end try
		do shell script "cd " & quoted form of localDir & " && ( nohup " & pyPath & " content_server.py < /dev/null > /tmp/co_fetch.log 2>&1 & )"
		display dialog "🟢 Started · the token has been copied to your clipboard.

First time: paste it into the web app's ⚙️ Settings (\"local fetch token\"), then use \"🎬 Fetch video\"." buttons {"OK"} default button "OK" with title "Content Organizer fetch" giving up after 8
	end if
end if
