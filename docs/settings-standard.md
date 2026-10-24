# Settings update — 2026-10-24

The top-right gear is the single Settings entry: Connection, AI, Language and theme, Data and App-specific. Language, theme, palettes and credentials no longer have duplicate header/toolbar controls. Sync and the sync status remain. Notes-only JSON/Markdown exports and compilation image analysis stay beside their tasks.

Each account/repository now has a separate complete browser library (IndexedDB, with localStorage fallback): notes, compilations and both deletion lists. Original migration copies belong to one original source. Connection changes wait for work and drafts; first connection can merge offline saved notes. Browser persistence errors keep the working copy and block a source change. Public copies do not inherit the hub connection; demo mode never reads credentials.

Private backup includes the complete current-browser library, unsynced saved edits, unknown fields and image references. It excludes separate image bytes and open editors. Offline restore replaces only this browser copy atomically. Connected restore also replaces content.json after validation, preview, confirmation and revision checks. A later sync still uses timestamp/deletion merge rules. Clear notes keeps compilations. The local video service and its transport are unchanged; its separate token lives under Connection advanced.

Connected backup uses the same fixed content.json and repository default branch as normal sync. Unrelated legacy routing fields remain stored and cannot redirect a restore.

右上齿轮统一管理连接、AI、语言与主题、数据和应用专属；移除页头与工具栏重复偏好控件，同步与状态保留。每个账号／仓库有独立的本机完整收藏库，包含笔记、合集和两份删除列表。备份含尚未同步的已收藏内容及图片引用，不含独立图片字节或打开的编辑表单。离线恢复一次替换本机副本；连接后还需核对版本、检查并确认替换 content.json。清空笔记保留合集，本地视频后台与传输方式保持不变。
