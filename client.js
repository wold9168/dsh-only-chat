/**
 * dsh-only-chat — browser half.
 *
 * The sidebar entry starts (or reuses) a chat and hands it straight to the host
 * Conversation surface, so one click gives the user a chat they can type into.
 * While a chat is open, this half also takes over three seats of the host chrome
 * — the sidebar browsing region becomes this plugin's chat list, and the New
 * Session hero's workspace chip and preset selector render nothing — so a chat
 * sees no other workspace and no other preset. Chat history and the kept-count
 * limit are managed in a Settings section.
 *
 * Rows come from the Host's own chat list, joined with the shared Session catalog
 * for titles and running state. Plugin code draws no chat transcript of its own.
 */
window.__ModuleLoader__.load({
  id: 'dsh-only-chat',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const PANEL_ID = 'only-chat'
    const SECTION_ID = 'only-chat'
    const NS = 'only-chat'
    /** The Agent preset the Host half runs for every chat. */
    const PRESET_ID = 'only-chat'
    const API_PATH = 'api/dsh-only-chat'
    const maxChatsLimit = 1000
    /** Relative times are re-rendered on this interval so an open page does not freeze. */
    const timeRefreshMs = 60000

    const dictionaries = {
      en: {
        nav: 'Only Chat',
        starting: 'Starting a chat…',
        startFailed: 'Could not start a chat.',
        retry: 'Try again',
        manageHint: 'Your chats are listed under Settings → Only Chat.',
        modeHeading: 'Only Chat',
        newChat: 'New chat',
        backToWorkspaces: 'Back to workspaces',
        modeHint: 'Read-only over your files. History and the kept count sit under Settings → Only Chat.',
        listHeading: 'Chats kept here',
        empty: 'No chats yet. Click Only Chat in the sidebar to start one.',
        noWritten: 'No chat has been written in yet.',
        loading: 'Loading…',
        running: 'generating',
        openNow: 'open',
        untitled: 'New chat',
        delete: 'Delete',
        cancel: 'Cancel',
        confirmDelete: 'Delete this chat?',
        confirmDeleteDesc: 'The chat log is deleted permanently and cannot be restored.',
        clearAll: 'Delete all chats',
        confirmClearDesc: 'Every chat log here is deleted permanently, including kept ones. A chat that is still generating is left alone.',
        cleared: 'Deleted the chats.',
        nothingRemoved: 'Nothing was deleted. Chats still generating stay until that turn ends.',
        convert: 'Convert to a session',
        convertWorkspace: 'Target workspace',
        pinLabel: 'Keep this chat past the limit',
        unpinLabel: 'Let this chat be retired at the limit',
        convertWarning: 'The conversation is copied into a normal session in that workspace, with the normal tools, and this chat is deleted. A converted session cannot be turned back into a chat.',
        noWorkspace: 'No other workspace is registered yet, so nothing can be converted.',
        limitHeading: 'How many to keep',
        limitUnit: 'chats',
        save: 'Save',
        saved: 'Saved.',
        limitNote: 'Saving writes maxChats to your profile patch. Lowering the limit deletes nothing by itself: the next chat you start removes the least recently active unkept idle chats until the count fits.',
        keptNote: 'A chat with the pin icon is never retired by the limit, so kept chats can put the total above it.',
        willPruneLead: 'Starting the next chat deletes',
        willPruneTail: 'chats.',
        privacy: 'Read tools in these chats can open any path the Harness can read, including files under your home directory. They cannot change files, run commands, or use configured MCP servers.',
        workspaceNote: 'While a chat is open the sidebar shows only Only Chat; leaving chat mode returns your other workspaces, and the Only Chat workspace exists only during a chat.',
        directoryLabel: 'Chat folder',
        summary: 'kept',
        deleteFailed: 'Could not delete that chat.',
        convertFailed: 'Could not convert that chat.',
        pinFailed: 'Could not change that chat’s keep state.',
        unreachable: 'Cannot reach the local Harness. Check that it is still running.',
        invalidLimit: 'Enter a whole number between 1 and 1000.',
      },
      zh: {
        nav: '仅聊天',
        starting: '正在开始聊天…',
        startFailed: '无法开始聊天。',
        retry: '重试',
        manageHint: '聊天列表在「设置 → 仅聊天」里。',
        modeHeading: '仅聊天',
        newChat: '新聊天',
        backToWorkspaces: '返回工作区',
        modeHint: '对本地文件只读。聊天列表和保留数量在「设置 → 仅聊天」里。',
        listHeading: '保留的聊天',
        empty: '还没有聊天。点侧边栏的「仅聊天」开始。',
        noWritten: '还没有聊天说过话。',
        loading: '正在读取…',
        running: '正在生成',
        openNow: '正在打开',
        untitled: '新聊天',
        delete: '删除',
        cancel: '取消',
        confirmDelete: '删除这个聊天？',
        confirmDeleteDesc: '聊天记录会被永久删除，无法恢复。',
        clearAll: '删除全部聊天',
        confirmClearDesc: '这里的全部聊天记录都会被永久删除，包括被保留（图钉）的。正在生成的聊天会保留到本轮结束。',
        cleared: '已删除全部聊天。',
        nothingRemoved: '没有删除任何聊天。正在生成的聊天会保留到本轮结束。',
        convert: '转为正常会话',
        convertWorkspace: '目标工作区',
        pinLabel: '保留这个聊天，超出上限也不会删',
        unpinLabel: '取消保留，超出上限时可能被删除',
        convertWarning: '这段对话会被复制成目标工作区里的普通会话，使用普通工具，然后删除这个聊天。转换后无法再变回聊天。',
        noWorkspace: '还没有别的工作区，所以暂时无法转换。',
        limitHeading: '保留数量',
        limitUnit: '个聊天',
        save: '保存',
        saved: '已保存。',
        limitNote: '保存会把 maxChats 写入你的 profile patch。调小数量本身不会删除聊天：下一次新建聊天时，会删除最久没动的、未被保留的空闲聊天直到数量符合要求。',
        keptNote: '带图钉的聊天不会被数量上限删除，所以被保留的聊天可以让总数超过上限。',
        willPruneLead: '下一次新建聊天会删除',
        willPruneTail: '个聊天。',
        privacy: '这些聊天里的读取工具可以打开 Harness 能读取的任意路径，包括主目录下的文件。它们不会改动文件、不会执行命令，也不会使用你配置的 MCP 服务器。',
        workspaceNote: '打开聊天时侧边栏只显示仅聊天；退出后你的其他工作区会回来，而「Only Chat」这个工作区只在聊天期间存在。',
        directoryLabel: '聊天目录',
        summary: '已保留',
        deleteFailed: '无法删除该聊天。',
        convertFailed: '无法转换该聊天。',
        pinFailed: '无法改变该聊天的保留状态。',
        unreachable: '无法连接本地 Harness，请确认它仍在运行。',
        invalidLimit: '请输入 1 到 1000 之间的整数。',
      },
    }

    /**
     * Styles ride the page as a component-local element, so closing it removes them.
     * Row metrics follow the host session rows: a 32px line, a resting time label
     * that the hover actions replace.
     */
    const css = `
.oc-wrap,.oc-side,.oc-item,.oc-row,.oc-open,.oc-inline,.oc-side-head,.oc-side-actions,.oc-field{box-sizing:border-box}
.oc-wrap{color:var(--dsw-alias-label-primary);flex-direction:column;gap:16px;display:flex}
.oc-start{color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:12px;align-items:center;gap:10px;padding:14px 16px;font-size:13px;display:flex}
.oc-title{margin:0;font-size:20px;line-height:28px;font-weight:500}
.oc-label{margin:0;color:var(--dsw-alias-label-primary);font-size:14px;line-height:20px;font-weight:550}
.oc-sub{margin:4px 0 0;color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:1.6}
.oc-list{margin:0;padding:0;list-style:none;flex-direction:column;gap:2px;display:flex}
.oc-item{flex-direction:column;gap:2px;display:flex}
.oc-row{border-radius:10px;align-items:center;gap:2px;height:32px;padding:0 4px;display:flex}
@media (hover:hover){.oc-row:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}}
.oc-open{cursor:pointer;font:inherit;color:inherit;text-align:left;background:0 0;border:0;border-radius:8px;flex:1;min-width:0;height:32px;align-items:center;gap:8px;padding:0 7px;display:flex}
.oc-open:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary)));outline-offset:-1px}
.oc-dot{background:var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary));flex:none;border-radius:50%;width:7px;height:7px}
.oc-name{flex:1;min-width:0;font-size:13.5px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.oc-meta{color:var(--dsw-alias-label-secondary);flex:none;font-variant-numeric:tabular-nums;font-size:12px}
.oc-actions{flex:none;margin-left:auto;display:none;align-items:center;gap:1px}
.oc-action-extra{display:none}
@media (hover:hover){
  /* Keyboard focus reveals the actions; a pointer click that leaves the button
   * focused does not, which is what focus-visible distinguishes. The resting
   * time label yields to the actions in both cases. */
  .oc-row:hover .oc-actions,.oc-row:has(:focus-visible) .oc-actions{display:inline-flex}
  .oc-row:hover .oc-action-extra,.oc-row:has(:focus-visible) .oc-action-extra{display:inline-flex}
  .oc-row:hover .oc-meta,.oc-row:has(:focus-visible) .oc-meta{display:none}
}
/* A kept chat shows only its keep button while nothing is hovered. */
.oc-row-kept .oc-actions{display:inline-flex}
@media (pointer:coarse){
  .oc-actions,.oc-action-extra{display:inline-flex}
  .oc-meta{display:none}
}
.oc-btn{cursor:pointer;font:inherit;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:16px;align-items:center;gap:6px;height:32px;padding:0 12px;font-size:13px;transition:background-color .18s ease,border-color .18s ease;display:inline-flex}
.oc-btn:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-1))}
.oc-btn:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary)));outline-offset:2px}
.oc-btn:disabled{opacity:.5;cursor:default}
.oc-btn-primary{border-color:transparent;background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary));color:var(--dsw-alias-label-primary-foreground,var(--dsw-alias-bg-base))}
.oc-btn-danger{color:var(--dsw-alias-state-error-primary);background:0 0;border-color:transparent;padding:0 8px}
.oc-icon-btn{cursor:pointer;font:inherit;color:var(--dsw-alias-label-secondary);background:0 0;border:0;border-radius:8px;flex:none;justify-content:center;align-items:center;width:26px;height:26px;display:inline-flex}
.oc-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-primary)}
.oc-icon-btn-danger:hover{color:var(--dsw-alias-state-error-primary)}
.oc-icon-btn:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary)));outline-offset:-1px}
.oc-inline{align-items:center;gap:8px;padding:2px 8px 6px;display:flex;flex-wrap:wrap}
.oc-inline-text{color:var(--dsw-alias-label-secondary);font-size:12px}
.oc-desc{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.6}
.oc-alert{margin:0;color:var(--dsw-alias-state-error-primary);font-size:12.5px}
.oc-ok{margin:0;color:var(--dsw-alias-state-success-primary);font-size:12.5px}
.oc-empty{color:var(--dsw-alias-label-secondary);border:1px dashed var(--dsw-alias-border-l2);border-radius:12px;padding:14px;font-size:12.5px;margin:0}
.oc-select,.oc-input{font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 9px;font-size:13px}
.oc-input{width:78px;font-variant-numeric:tabular-nums}
.oc-select:focus-visible,.oc-input:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary)));outline-offset:1px}
.oc-divider{border-top:1px solid var(--dsw-alias-border-l1);margin:2px 0}
.oc-side{color:var(--dsw-alias-label-primary);gap:6px;padding:8px 6px 10px;font-size:13px;display:flex;flex-direction:column;min-height:0}
.oc-side-head{color:var(--dsw-alias-label-secondary);justify-content:space-between;align-items:center;gap:7px;padding:0 6px;font-size:12.5px;display:flex}
.oc-side-new{cursor:pointer;font:inherit;color:var(--dsw-alias-label-secondary);background:0 0;border:0;border-radius:8px;align-items:center;gap:5px;height:26px;padding:0 8px;font-size:12.5px;display:inline-flex}
.oc-side-new:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-primary)}
.oc-side-new:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary)));outline-offset:-1px}
.oc-side-list{overflow:auto;flex-direction:column;gap:2px;display:flex}
.oc-side-foot{padding:2px 6px 0}
.oc-side-hint{margin:0;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.5}
@media (pointer:coarse){.oc-input{font-size:16px}}
`

    /** Rules that only apply while this plugin's hero marker is in the DOM. */
    const heroCss = `
.oc-marker{display:none}
div:has(> .oc-marker) > button[aria-haspopup="menu"],
div:has(> [data-slot] > .oc-marker) > button[aria-haspopup="menu"]{display:none}
`

    /** Resolve one bridge route against this page's base, as other plugin bridges do. */
    function endpoint(name) {
      try {
        return new URL(`${API_PATH}/${name}`, document.baseURI).toString()
      } catch {
        return `/${API_PATH}/${name}`
      }
    }

    /**
     * One bridge call. A refused response keeps the Host's own sentence, which
     * is written for the user; a transport failure becomes one plain note.
     */
    async function call(name, body, t) {
      let response
      try {
        response = await fetch(endpoint(name), body === undefined
          ? undefined
          : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      } catch {
        throw new Error(t('unreachable'))
      }
      const text = await response.text()
      let value = {}
      try {
        value = text === '' ? {} : JSON.parse(text)
      } catch {
        throw new Error(t('unreachable'))
      }
      if (!response.ok) throw new Error(typeof value.error === 'string' ? value.error : `${name} failed (${response.status})`)
      return value
    }

    function messageOf(error) {
      return error instanceof Error ? error.message : String(error)
    }

    /** Relative time in the page locale, falling back to a short date. */
    function makeFormatter(locale) {
      let relative
      let date
      try {
        relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
        date = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' })
      } catch {
        return (time) => `${Math.max(0, Math.round((Date.now() - time) / 60000))}m`
      }
      return (time) => {
        const seconds = Math.round((time - Date.now()) / 1000)
        if (seconds > -60) return relative.format(Math.min(-1, seconds), 'second')
        const minutes = Math.round(seconds / 60)
        if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute')
        const hours = Math.round(minutes / 60)
        if (Math.abs(hours) < 24) return relative.format(hours, 'hour')
        const days = Math.round(hours / 24)
        if (Math.abs(days) < 7) return relative.format(days, 'day')
        const weeks = Math.round(days / 7)
        if (Math.abs(weeks) < 5) return relative.format(weeks, 'week')
        return date.format(new Date(time))
      }
    }

    /** Own-drawn glyphs, so this half needs no UI-primitives module from the page. */
    function Glyph({ size, kind }) {
      const svg = {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true,
        style: { display: 'block' }, fill: 'none', stroke: 'currentColor',
        'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      }
      if (kind === 'trash') {
        return h('svg', svg,
          h('path', { d: 'M4 7h16' }),
          h('path', { d: 'M9 7V4h6v3' }),
          h('path', { d: 'M6 7l1 12h10l1-12' }),
          h('path', { d: 'M10.5 11v5M13.5 11v5' }))
      }
      if (kind === 'branch') {
        return h('svg', svg,
          h('circle', { cx: 6, cy: 5.5, r: 2 }),
          h('circle', { cx: 6, cy: 18.5, r: 2 }),
          h('circle', { cx: 17, cy: 12, r: 2 }),
          h('path', { d: 'M6 7.5v9' }),
          h('path', { d: 'M8 6h5a4 4 0 0 1 4 4v2' }))
      }
      if (kind === 'pin' || kind === 'pinFilled') {
        return h('svg', svg,
          h('path', { d: 'M9 4h6l-1 6 3 3H7l3-3Z' }),
          h('path', { d: 'M12 13v7' }),
          ...(kind === 'pinFilled' ? [h('path', { d: 'M9 4h6l-1 6 3 3H7l3-3Z', fill: 'currentColor', stroke: 'none' })] : []))
      }
      if (kind === 'plus') {
        return h('svg', svg, h('path', { d: 'M12 5v14M5 12h14' }))
      }
      return h('svg', svg,
        h('path', { d: 'M6 4h12a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H12l-5 4v-4H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z' }),
        h('circle', { cx: 8.5, cy: 10, r: 1.15, fill: 'currentColor', stroke: 'none' }),
        h('circle', { cx: 12, cy: 10, r: 1.15, fill: 'currentColor', stroke: 'none' }),
        h('circle', { cx: 15.5, cy: 10, r: 1.15, fill: 'currentColor', stroke: 'none' }))
    }

    /**
     * The hero while a chat is open: nothing can be chosen, so this renders no
     * control of its own and hides the host chip that would open the workspace
     * picker. The rule is scoped to the row this component sits inside, which is
     * why the marker has to be rendered here rather than from a global style.
     */
    function HeroQuiet() {
      return h('span', { className: 'oc-marker', 'aria-hidden': true }, h('style', null, heroCss))
    }

    /** Subscribe to one observable snapshot store without losing its receiver. */
    function useSnapshot(store) {
      return React.useSyncExternalStore(
        (listener) => store.subscribe(listener),
        () => store.getSnapshot(),
      )
    }

    /** A minimal observable store shared by every surface of this plugin. */
    function createStore(initial) {
      let value = initial
      const listeners = new Set()
      return {
        getSnapshot: () => value,
        set: (next) => {
          value = next
          for (const listener of listeners) listener()
        },
        subscribe: (listener) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
      }
    }

    /** The active locale id, re-rendered when the user switches language. */
    function useLocale(ctx) {
      return useSnapshot(ctx.locale).active ?? 'en'
    }

    /**
     * Whether a catalog row is one of this plugin's chats. The recorded preset
     * decides; the chat directory is a fallback for a deployment whose list rows
     * carry no preset projection.
     */
    function isChatRow(row, chatDirectory) {
      if (row === undefined) return false
      if (row.parentId !== undefined || row.origin === 'subagent') return false
      return row.projectionValues?.agentPreset === PRESET_ID
        || (chatDirectory !== undefined && row.cwd === chatDirectory)
    }

    /** The chat currently shown in the main panel, which is what defines chat mode. */
    function currentChat(ctx, chatDirectory) {
      const list = ctx.sessions.list.getSnapshot()
      for (const id of list.ids) {
        const row = list.byId[id]
        if (isChatRow(row, chatDirectory) && (row.retainedBy?.mainView ?? 0) > 0) return row
      }
      return undefined
    }

    /**
     * Chat rows in the Host's own order, most recently active first. The Host list
     * is the authority for what counts as a chat: it holds exactly the Sessions
     * this plugin may delete, so a stray Session that merely picked this preset in
     * another workspace cannot show up here un-deletable. A chat that has not been
     * written in yet is the draft the user is looking at, so `chats` leaves it out
     * while `all` keeps it for the kept-count.
     */
    function useChats(ctx, state) {
      const list = useSnapshot(ctx.sessions.list)
      const all = (state?.chats ?? []).map((entry) => {
        const row = list.byId[entry.sessionId]
        return {
          sessionId: entry.sessionId,
          title: row?.title,
          updatedAt: entry.activity ?? row?.updatedAt ?? 0,
          running: row?.running ?? false,
          open: (row?.retainedBy?.mainView ?? 0) > 0,
          pinned: entry.pinned === true,
          // The catalog row knows the live draft state and updates as the first
          // message lands, so the list does not wait on a Host refresh.
          blank: row === undefined ? entry.blank === true : row.blank === true,
        }
      })
      return { pending: state === null || list.phase === 'pending', chats: all.filter((chat) => !chat.blank), all }
    }

    /**
     * Move the main panel somewhere that still exists: the next chat, then the most
     * recently active ordinary session, then any other workspace.
     * @param avoid - a chat the caller just removed.
     */
    function nextChat(ctx, state, chatDirectory, avoid) {
      const chats = state?.chats ?? []
      const written = chats.find((entry) => entry.sessionId !== avoid && entry.blank !== true)
        ?? chats.find((entry) => entry.sessionId !== avoid)
      if (written !== undefined) { ctx.uiWorkspace.openSession(written.sessionId); return true }
      return goToNormalSession(ctx, chatDirectory)
    }

    /** Leave chat mode towards an ordinary session, creating one when none exists. */
    function goToNormalSession(ctx, chatDirectory) {
      const snapshot = ctx.sessions.list.getSnapshot()
      const normal = snapshot.ids
        .map((id) => snapshot.byId[id])
        .filter((row) => row !== undefined && !isChatRow(row, chatDirectory))
        .sort((left, right) => right.updatedAt - left.updatedAt)[0]
      if (normal !== undefined) { ctx.uiWorkspace.openSession(normal.id); return true }
      const others = ctx.workspaces.list.getSnapshot().items.filter((workspace) => workspace.path !== chatDirectory)
      if (others.length > 0) { void ctx.uiWorkspace.openWorkspace(others[0].workspaceId).catch(() => undefined); return true }
      ctx.uiWorkspace.startSession()
      return true
    }

    /**
     * One chat row, shared by the sidebar list and the Settings page: an open
     * target plus hover-revealed keep, convert, and delete actions. Conversion is
     * confirmed inline because it deletes the chat, and deletion is confirmed
     * because it cannot be undone.
     */
    function ChatRow(props) {
      const { ctx, t, format, loadState, chat, options, chatDirectory, confirmId, setConfirmId, draft, setDraft, onError } = props
      const title = chat.title ?? t('untitled')
      const ownDraft = draft?.sessionId === chat.sessionId ? draft : null

      const open = () => {
        void call('enter', { sessionId: chat.sessionId }, t)
          .catch((failure) => { onError?.(messageOf(failure)) })
          .then(() => { ctx.uiWorkspace.openSession(chat.sessionId) })
        props.closeSurface?.()
      }

      const toggleKeep = () => {
        // Call through the service face: `ctx.workspaces` methods bind their
        // receiver at call time, so pulling one out of the object loses `this`.
        const request = chat.pinned ? ctx.workspaces.unpinSession(chat.sessionId) : ctx.workspaces.pinSession(chat.sessionId)
        void Promise.resolve(request)
          .then(() => loadState())
          .catch((failure) => { onError?.(`${t('pinFailed')} ${messageOf(failure)}`) })
      }

      const remove = () => {
        setConfirmId(null)
        void call('delete', { sessionId: chat.sessionId }, t)
          .then(async () => {
            const value = await loadState()
            // The main panel may still point at the chat that is gone, so move it.
            if (chat.open) nextChat(ctx, value, chatDirectory, chat.sessionId)
          })
          .catch((failure) => { onError?.(`${t('deleteFailed')} ${messageOf(failure)}`) })
      }

      const convert = (workspaceId) => {
        setDraft(null)
        void call('convert', { sessionId: chat.sessionId, workspaceId }, t)
          .then((result) => {
            ctx.uiWorkspace.openSession(result.sessionId)
            props.closeSurface?.()
            return loadState()
          })
          .catch((failure) => { onError?.(`${t('convertFailed')} ${messageOf(failure)}`) })
      }

      return h('li', { className: 'oc-item', key: chat.sessionId },
        h('div', { className: chat.pinned ? 'oc-row oc-row-kept' : 'oc-row' },
          h('button', { type: 'button', className: 'oc-open', onClick: open },
            chat.running ? h('span', { className: 'oc-dot', 'aria-hidden': true }) : null,
            h('span', { className: 'oc-name' }, title),
            h('span', { className: 'oc-meta' },
              chat.running ? t('running') : chat.open ? t('openNow') : format(chat.updatedAt))),
          h('div', { className: 'oc-actions' },
            h('button', {
              type: 'button', className: 'oc-icon-btn', 'aria-label': chat.pinned ? t('unpinLabel') : t('pinLabel'),
              onClick: toggleKeep,
            }, h(Glyph, { size: 14, kind: chat.pinned ? 'pinFilled' : 'pin' })),
            options.length > 0 && !chat.running
              ? h('button', {
                type: 'button', className: 'oc-icon-btn oc-action-extra', 'aria-label': `${t('convert')}: ${title}`,
                onClick: () => { setConfirmId(null); setDraft({ sessionId: chat.sessionId, workspaceId: options[0].workspaceId }) },
              }, h(Glyph, { size: 14, kind: 'branch' }))
              : null,
            h('button', {
              type: 'button', className: 'oc-icon-btn oc-icon-btn-danger oc-action-extra', 'aria-label': `${t('delete')}: ${title}`,
              onClick: () => setConfirmId(chat.sessionId),
            }, h(Glyph, { size: 14, kind: 'trash' })))),
        ownDraft !== null
          ? h('div', { className: 'oc-inline' },
            h('p', { className: 'oc-desc' }, t('convertWarning')),
            h('select', {
              className: 'oc-select', value: ownDraft.workspaceId, autoFocus: true,
              'aria-label': t('convertWorkspace'),
              onChange: (event) => setDraft({ sessionId: chat.sessionId, workspaceId: event.target.value }),
            }, options.map((workspace) => h('option', { key: workspace.workspaceId, value: workspace.workspaceId }, workspace.title))),
            h('button', {
              type: 'button', className: 'oc-btn oc-btn-primary',
              onKeyDown: (event) => { if (event.key === 'Escape') setDraft(null) },
              onClick: () => convert(ownDraft.workspaceId),
            }, t('convert')),
            h('button', { type: 'button', className: 'oc-btn', onClick: () => setDraft(null) }, t('cancel')))
          : confirmId === chat.sessionId
            ? h('div', { className: 'oc-inline' },
              h('span', { className: 'oc-inline-text' }, `${t('confirmDelete')} ${t('confirmDeleteDesc')}`),
              h('button', {
                type: 'button', className: 'oc-btn oc-btn-danger', autoFocus: true,
                onKeyDown: (event) => { if (event.key === 'Escape') setConfirmId(null) },
                onClick: remove,
              }, t('delete')),
              h('button', { type: 'button', className: 'oc-btn', onClick: () => setConfirmId(null) }, t('cancel')))
            : null)
    }

    /** The chat list body, shared by the sidebar region and the Settings section. */
    function ChatList(props) {
      const { ctx, t, state } = props
      const locale = useLocale(ctx)
      const format = React.useMemo(() => makeFormatter(locale), [locale])
      const [, setTick] = React.useState(0)
      const [confirmId, setConfirmId] = React.useState(null)
      const [draft, setDraft] = React.useState(null)
      const workspaces = useSnapshot(ctx.workspaces.list)
      const { pending, chats, all } = useChats(ctx, state)
      const options = workspaces.items.filter((workspace) => workspace.path !== state?.chatDirectory)

      React.useEffect(() => {
        const timer = setInterval(() => setTick((value) => value + 1), timeRefreshMs)
        return () => clearInterval(timer)
      }, [])

      if (pending) return h('p', { className: 'oc-empty' }, t('loading'))
      if (chats.length === 0) {
        return h('p', { className: 'oc-empty' }, all.length > 0 ? t('noWritten') : t('empty'))
      }
      return h('ul', { className: 'oc-side-list', 'aria-label': t('listHeading') },
        chats.map((chat) => h(ChatRow, {
          key: chat.sessionId,
          ctx, t, format,
          loadState: props.loadState,
          chat, options, chatDirectory: state?.chatDirectory,
          confirmId, setConfirmId, draft, setDraft,
          closeSurface: props.closeSurface,
          onError: props.onError,
        })))
    }

    /**
     * The sidebar browsing region while a chat is open: this plugin's own list, so
     * no other workspace or session is visible from a chat.
     */
    function ChatSidebar(props) {
      const { ctx, t, directory, stateStore, loadState } = props
      const state = useSnapshot(stateStore)
      const [notice, setNotice] = React.useState(null)

      const startNew = () => {
        setNotice(null)
        void call('open', {}, t)
          .then((opened) => {
            ctx.uiWorkspace.openSession(opened.sessionId)
            return loadState()
          })
          .catch((failure) => setNotice(messageOf(failure)))
      }

      const back = () => goToNormalSession(ctx, directory)

      if (props.wide === false) {
        return h('div', { className: 'oc-side' }, h('style', null, css),
          h('button', {
            type: 'button', className: 'oc-icon-btn', 'aria-label': t('newChat'),
            onClick: startNew,
          }, h(Glyph, { size: 16, kind: 'bubble' })))
      }

      return h('div', { className: 'oc-side' }, h('style', null, css),
        h('div', { className: 'oc-side-head' },
          h('span', null, t('modeHeading')),
          h('button', { type: 'button', className: 'oc-side-new', onClick: startNew },
            h(Glyph, { size: 14, kind: 'plus' }), t('newChat'))),
        notice !== null ? h('p', { role: 'alert', className: 'oc-side-hint' }, notice) : null,
        h(ChatList, { ctx, t, state, loadState, onError: setNotice }),
        h('div', { className: 'oc-side-foot' },
          h('button', { type: 'button', className: 'oc-btn', onClick: back }, t('backToWorkspaces')),
          h('p', { className: 'oc-side-hint' }, t('modeHint'))))
    }

    /** The sidebar target: start or reuse a chat, then leave for the Conversation panel. */
    function StartPage(props) {
      const { ctx, t, loadState } = props
      const [error, setError] = React.useState(null)
      const started = React.useRef(false)

      const start = React.useCallback(async () => {
        setError(null)
        try {
          const opened = await call('open', {}, t)
          ctx.uiWorkspace.openSession(opened.sessionId)
          await loadState()
        } catch (failure) {
          setError(messageOf(failure))
        }
      }, [ctx, t, loadState])

      React.useEffect(() => {
        if (started.current) return
        started.current = true
        void start()
      }, [start])

      return h('div', { className: 'oc-wrap' }, h('style', null, css),
        error === null
          ? h('div', { className: 'oc-start', role: 'status' }, t('starting'))
          : h('div', { className: 'oc-wrap' },
            h('p', { role: 'alert', className: 'oc-alert' }, `${t('startFailed')} ${error}`),
            h('div', { className: 'oc-inline' },
              h('button', { type: 'button', className: 'oc-btn oc-btn-primary', onClick: () => void start() }, t('retry')),
              h('p', { className: 'oc-desc' }, t('manageHint')))))
    }

    /** The Settings section: the same chat list, plus delete-all and the kept-count limit. */
    function HistorySection(props) {
      const { ctx, t, stateStore, loadState } = props
      const state = useSnapshot(stateStore)
      const [error, setError] = React.useState(null)
      const [notice, setNotice] = React.useState(null)
      const [confirmClear, setConfirmClear] = React.useState(false)
      const [draftLimit, setDraftLimit] = React.useState(null)
      const { chats, all } = useChats(ctx, state)
      const workspaces = useSnapshot(ctx.workspaces.list)
      const convertOptions = workspaces.items.filter((workspace) => workspace.path !== state?.chatDirectory)

      const run = async (operation, done) => {
        setError(null)
        setNotice(null)
        try {
          await operation()
          await loadState()
          if (done !== undefined) setNotice(done)
        } catch (failure) {
          setError(messageOf(failure))
        }
      }

      const removeAll = () => run(async () => {
        const result = await call('clear', {}, t)
        if (!Array.isArray(result.removed) || result.removed.length === 0) throw new Error(t('nothingRemoved'))
      }, t('cleared'))

      const saveLimit = () => run(async () => {
        const value = Number(draftLimit)
        if (!Number.isInteger(value) || value < 1 || value > maxChatsLimit) throw new Error(t('invalidLimit'))
        await call('max-chats', { maxChats: value }, t)
      }, t('saved'))

      const limit = draftLimit ?? state?.maxChats ?? 20
      const unkept = all.filter((chat) => !chat.pinned).length
      const overLimit = state === null ? 0 : Math.max(0, unkept - limit)

      return h('div', { className: 'oc-wrap' },
        h('style', null, css),
        h('div', null,
          h('h2', { className: 'oc-title' }, t('nav')),
          h('p', { className: 'oc-sub' }, t('privacy')),
          h('p', { className: 'oc-desc' }, t('workspaceNote')),
          state !== null ? h('p', { className: 'oc-desc' }, `${t('directoryLabel')}: ${state.chatDirectory}`) : null),
        error !== null ? h('div', { className: 'oc-inline' },
          h('p', { role: 'alert', className: 'oc-alert' }, error),
          h('button', { type: 'button', className: 'oc-btn', onClick: () => void loadState() }, t('retry')))
          : null,
        notice !== null ? h('p', { role: 'status', className: 'oc-ok' }, notice) : null,
        h('div', { className: 'oc-divider' }),
        h('h3', { className: 'oc-label' }, t('listHeading')),
        h(ChatList, { ctx, t, state, loadState, closeSurface: () => props.close?.(), onError: (message) => setError(message) }),
        all.length > 0 && !confirmClear
          ? h('div', { className: 'oc-inline' },
            h('button', { type: 'button', className: 'oc-btn oc-btn-danger', onClick: () => setConfirmClear(true) }, t('clearAll')))
          : null,
        confirmClear
          ? h('div', { className: 'oc-inline' },
            h('span', { className: 'oc-inline-text' }, `${t('clearAll')} (${all.length}) ${t('confirmClearDesc')}`),
            h('button', {
              type: 'button', className: 'oc-btn oc-btn-danger', autoFocus: true,
              onKeyDown: (event) => { if (event.key === 'Escape') setConfirmClear(false) },
              onClick: () => { setConfirmClear(false); void removeAll() },
            }, t('delete')),
            h('button', { type: 'button', className: 'oc-btn', onClick: () => setConfirmClear(false) }, t('cancel')))
          : null,
        state !== null && all.length > 0 && convertOptions.length === 0
          ? h('p', { className: 'oc-desc' }, t('noWorkspace'))
          : null,
        h('div', { className: 'oc-divider' }),
        h('h3', { className: 'oc-label' }, t('limitHeading')),
        h('div', { className: 'oc-inline' },
          h('input', {
            className: 'oc-input', type: 'number', min: 1, max: maxChatsLimit, step: 1,
            'aria-label': t('limitHeading'),
            value: limit, disabled: state === null,
            onChange: (event) => setDraftLimit(event.target.value),
          }),
          h('span', { className: 'oc-inline-text' }, `${t('summary')}: ${all.length} / ${limit} ${t('limitUnit')}`),
          h('button', {
            type: 'button', className: 'oc-btn', disabled: state === null || Number(draftLimit) === state.maxChats,
            onClick: () => void saveLimit(),
          }, t('save'))),
        h('p', { className: 'oc-desc' }, t('limitNote')),
        h('p', { className: 'oc-desc' }, t('keptNote')),
        overLimit > 0
          ? h('p', { role: 'status', className: 'oc-alert' }, `${t('willPruneLead')} ${overLimit} ${t('willPruneTail')}`)
          : null)
    }

    return {
      inject: ['slots', 'locale', 'sessions', 'uiWorkspace', 'workspaces'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, dictionaries), 'only-chat: dictionaries')
        const t = ctx.locale.bind(NS)
        const stateStore = createStore(null)
        const loadState = () => call('state', undefined, t).then((value) => {
          stateStore.set(value)
          return value
        })

        /**
         * Chat mode is the main panel holding one of this plugin's chats. While it
         * is on, three seats of the host chrome are replaced: the sidebar browsing
         * region becomes this plugin's chat list, and the hero's workspace chip and
         * preset control render nothing, so nothing else can be chosen for a chat.
         * Leaving chat mode restores all three and drops the chat Workspace
         * registration, so its row disappears from the ordinary workspace list.
         */
        let chatDirectory
        let occupants = []
        let inMode = null
        let closed = false
        const enterMode = (sessionId) => {
          if (occupants.length === 0) {
            // A `single` cell renders the lowest `priority`, and the shipped
            // occupants sit at 0, so these registrations sit below them. A dynamic
            // browser half may be assigned a priority of its own, which is lower
            // still; either way these win over the shipped presentation.
            occupants = [
              ctx.slots.register({ name: 'sidebar.workspaces', locale: NS, priority: -10 },
                (props) => h(ChatSidebar, { ...props, ctx, t, directory: chatDirectory, stateStore, loadState })),
              ctx.slots.register({ name: 'conversation.hero.workspace', locale: NS, priority: -10 },
                () => h(HeroQuiet)),
              ctx.slots.register({ name: 'conversation.hero.agentPreset', locale: NS, priority: -10 },
                () => null),
            ]
          }
          // Covers a page reload that lands in a chat: the Host re-registers the
          // chat Workspace and re-accounts the chats.
          void call('enter', { sessionId }, t)
            .then(() => loadState())
            .catch(() => undefined)
        }
        const exitMode = () => {
          const disposers = occupants
          occupants = []
          for (const dispose of disposers) dispose()
          void call('exit', {}, t)
            .then(() => loadState())
            .catch(() => undefined)
        }
        const evaluate = () => {
          if (closed) return
          // Nothing is known yet while the catalog is still loading; deciding now
          // would tear down a chat Workspace the arriving rows are about to need.
          if (ctx.sessions.list.getSnapshot().phase === 'pending') return
          const current = currentChat(ctx, chatDirectory)
          // `null` means unobserved: the first pass also clears a chat Workspace
          // left behind by a previous session that ended without an exit.
          if (inMode !== null && (current !== undefined) === inMode) return
          inMode = current !== undefined
          if (inMode) enterMode(current.id)
          else exitMode()
        }
        ctx.effect(() => {
          const off = ctx.sessions.list.subscribe(() => queueMicrotask(evaluate))
          return () => {
            closed = true
            off()
            const disposers = occupants
            occupants = []
            for (const dispose of disposers) dispose()
          }
        }, 'only-chat: chat mode')
        void loadState()
          .then((value) => {
            chatDirectory = value.chatDirectory
            queueMicrotask(evaluate)
          })
          .catch(() => undefined)

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 20,
          locale: NS,
          label: () => t('nav'),
        }, (props) => h(Glyph, { size: props.size, kind: 'bubble' })))

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
          label: () => t('nav'),
        }, (props) => h(StartPage, { ...props, ctx, t, loadState })))

        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: SECTION_ID,
          order: 30,
          locale: NS,
          label: () => t('nav'),
        }, (props) => h(HistorySection, { ...props, ctx, t, stateStore, loadState })))

        ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
          name: 'settings.section.icon',
          id: SECTION_ID,
          locale: NS,
        }, (props) => h(Glyph, { size: props.size, kind: 'bubble' })))
      },
    }
  },
})
