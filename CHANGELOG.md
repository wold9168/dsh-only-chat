# Changelog

## 0.1.0

- Sidebar entry `Only Chat` (仅聊天): one click starts or reuses a chat and opens it in the main panel.
- Chats run the deployment's own default Agent preset — no preset is declared here — so a chat has the
  same capabilities as an ordinary session: skills, commands, jobs, schedules, goals, planning,
  compaction, subagents, workflows, web, and office tools.
- Read-only layer per chat: the Session pins the deployment's `read-only` permission preset, and the
  chat's own Agent scope refuses `write`, `edit`, `apply_patch`, MCP tools, `plugin_manager`,
  `plugin_market`, `cordis_run`/`cordis_define`/`cordis_undefine`/`cordis_stop`, and `working_directory`
  at execution time. The refusal covers tools registered after the chat started.
- Chat mode isolation: while a chat is open the sidebar's browsing region becomes this plugin's own flat
  chat list (host-like rows: title, relative time, running dot, hover keep / convert / delete, no extra
  left inset so the rows use the sidebar's full width) and the
  hero's workspace chip and preset control render nothing; the sidebar entry is the way back — it reads
  as the mode switch in normal mode and reports when there is nowhere to return to — and leaving chat
  mode restores the host chrome
  and removes the chat Workspace registration, so its row is invisible in normal mode.
- Keep (pin) sorts a chat to the top of both lists and exempts it from the automatic limit; the
  Settings page shares the same row renderer as the sidebar. Chats are never archived.
- A chat with no messages yet is left out of both lists (it is the draft you are looking at) while it
  still counts toward the limit; deleting the chat that is open moves the main panel to the next chat
  or back to an ordinary session.
- Settings → Only Chat: the same chat list, delete all, the `maxChats` limit (default 20), the chat
  folder, and Convert to a session (one-way), which restores the deployment's default permission on
  the copy.
- Bounded history: starting a chat past the limit deletes the least recently active idle chats and
  leaves any chat inside a turn or kept alone; the Settings estimate of what the next chat will retire
  counts the same chats.
- Routes are gated to the authenticated browser Peer; API clients cannot start, convert, or delete.
