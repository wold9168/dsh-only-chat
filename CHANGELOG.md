# Changelog

## 0.1.0

- Sidebar entry `Only Chat` (仅聊天): one click starts or reuses a chat and opens it in the main panel.
- Chat mode isolation: while a chat is open the sidebar's browsing region becomes this plugin's own flat
  chat list (host-like rows: title, relative time, running dot, hover keep / convert / delete) and the
  hero's workspace chip and preset control render nothing; leaving chat mode restores the host chrome
  and removes the chat Workspace registration, so its row is invisible in normal mode.
- Keep (pin) exempts a chat from the automatic limit, and the Settings page shares the same row
  renderer as the sidebar. Chats are never archived.
- A chat with no messages yet is left out of both lists (it is the draft you are looking at) while it
  still counts toward the limit; deleting the chat that is open moves the main panel to the next chat
  or back to an ordinary session.
- Host-side pairing: a Session in the chat directory is kept on the Only Chat preset, and a Session that
  takes that preset elsewhere is reverted to the deployment default. Settings lists exactly what the
  Host counts as a chat, so every listed row can be deleted.
- Each chat records the `only-chat` preset selection, so the composer shows and runs Only Chat rather
  than the deployment default.
- `only-chat` Agent preset: read, search, and web tools only; no writer, no shell, no delegation.
- `dsh-only-chat/guard`: host-layer tools are hidden from a chat's scope and denied at execution time,
  so configured MCP servers and `working_directory` are unusable in a chat.
- Each chat pins the deployment's `read-only` permission preset in its own Session log.
- Settings → Only Chat: chat list, per-chat delete, delete all, the `maxChats` limit (default 20), the
  chat folder, and Convert to a session (one-way).
- Bounded history: starting a chat past the limit deletes the least recently active idle chats and
  leaves any chat still inside a turn alone.
- Routes are gated to the authenticated browser Peer; API clients cannot start, convert, or delete.
