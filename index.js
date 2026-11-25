/**
 * dsh-only-chat — Host half.
 *
 * Only Chat keeps workspace-free chats in one directory of its own. A chat runs
 * the deployment's own default Agent preset — the same capabilities as an
 * ordinary session — with read-only layered on top of it: the Session pins the
 * read-only permission preset, and the agent's scope refuses file writers, MCP
 * tools, and the profile and package editors. A chat is retired once the number
 * of kept chats passes `maxChats`. Chat history stays in Harness Session logs —
 * this half keeps no second copy of it.
 *
 * The browser reaches this half through routes under `/api/dsh-only-chat`,
 * gated to the authenticated browser Peer: only a person at the interface can
 * start, convert, or delete a chat.
 */

import { mkdir, readdir, realpath, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'
import Schema from '@deepseek-ai/schemastery'

export const name = 'dsh-only-chat'

const API_PREFIX = '/api/dsh-only-chat'

/**
 * Tools a chat must not run. The chat uses the deployment's own default preset,
 * so this list is what separates it from a normal session: file writers, profile
 * and package editors, and the directory mover.
 */
const REFUSED_TOOLS = new Set([
  'write',
  'edit',
  'apply_patch',
  'plugin_manager',
  'plugin_market',
  'cordis_run',
  'cordis_define',
  'cordis_undefine',
  'cordis_stop',
  'working_directory',
])

/** MCP tool names are `mcp__<server>__<tool>`, and MCP servers run unsandboxed. */
const MCP_PREFIX = 'mcp__'
const REFUSAL = 'Only Chat chats are read-only: this tool cannot change files or Harness state here.'

/**
 * Whether one tool name crosses the read-only line.
 * @param toolName - a registered tool name.
 */
function isRefusedTool(toolName) {
  return REFUSED_TOOLS.has(toolName) || toolName.startsWith(MCP_PREFIX)
}
const ROUTES = new Set(['state', 'open', 'enter', 'exit', 'delete', 'clear', 'convert', 'max-chats'])

/** One teardown step waits this long before the whole delete refuses. */
const teardownStepMs = 5000
/** Route bodies name identifiers and one number, so a larger body is always a mistake. */
const maxBodyBytes = 8 * 1024
/** Every canonical Session-log artifact starts with this name inside its directory. */
const artifactPrefix = 'session'
/** Session artifacts live under this child of the Harness home, one directory per chat. */
const sessionsRootSegment = 'sessions'
/** Projection checkpoints live in this storage domain, keyed by session id. */
const projectionCacheDomain = 'session_projcache'
const projectionCacheTable = 'sessions'
/** The limit a user may set, mirrored by the settings page's number input. */
const maxChatsLimit = 1000
/**
 * A Session with no owning Workspace cannot receive its first message: the host
 * conversation surface renders an empty session as a workspace chooser. So chats
 * live in a Workspace of their own over `chatDirectory`, which the user never
 * has to pick, and the composer works as it does for any other chat.
 */
const chatWorkspaceTitle = 'Only Chat'

/** Harness data root, with the same precedence the harness itself uses. */
function dshHome() {
  const configured = process.env.DSH_HOME
  return configured !== undefined && configured.trim() !== '' ? configured : join(homedir(), '.dsh')
}

export const Config = Schema.object({
  maxChats: Schema.number().step(1).min(1).max(maxChatsLimit).default(20)
    .description('Chats kept at the same time. Starting a chat past this limit deletes the least recently active idle chat.'),
  chatDirectory: Schema.string().default(join(dshHome(), 'only-chat'))
    .description('Absolute directory every Only Chat Session log lives under.'),
})

export const inject = [
  'agents',
  'connection',
  'sandboxPolicy',
  'sessionController',
  'sessionPersistence',
  'sessionQuery',
  'sessions',
  'webServer',
  'workspaceRegistry',
]

export async function apply(ctx, config) {
  const chatDirectory = await safeChatDirectory(config.chatDirectory)
  const maxChats = config.maxChats

  /**
   * A chat is ours only when its own header says so: this plugin's directory,
   * this plugin's directory and not a fork or a subagent of one. Chats run the
   * deployment's own default preset, so the directory is what marks ownership;
   * pointing `chatDirectory` at an existing project cannot make this plugin
   * delete someone else's sessions.
   */
  const isChatHeader = (header) => header !== undefined
    && header.cwd === chatDirectory
    && header.parentSession === undefined
    && header.origin !== 'subagent'

  /** One queue so two chats started in the same tick never prune against stale counts. */
  let queue = Promise.resolve()
  const enqueue = (task) => {
    queue = queue.then(task, task)
    return queue
  }

  /**
   * Last write time of a chat's artifact, falling back to its creation instant.
   * The shipped JSONL backend persists each batch, so the file mtime tracks use.
   */
  const activityOf = async (header) => {
    const created = header.createdAt ?? 0
    const location = (await ctx.sessionPersistence.stat(header.id))?.location
    if (location === undefined) return created
    const info = await stat(location.path).catch(() => undefined)
    return info === undefined ? created : Math.max(created, info.mtimeMs)
  }

  /**
   * Whether this chat has not started a turn yet. The browser hides the draft chat
   * from its list, while the limit still counts it.
   */
  const isBlank = (sessionId) => {
    const session = ctx.sessions.get(sessionId)
    return session !== undefined && ctx.agents.turnBoundaryOf(session).lastTurn === 0
  }

  /** Every chat this plugin owns, minus archived ones, most recently active first. */
  const listChats = async () => {
    const headers = new Map()
    for (const session of ctx.sessions.list()) if (isChatHeader(session.header)) headers.set(session.id, session.header)
    for (const snapshot of await ctx.sessionPersistence.list()) {
      if (isChatHeader(snapshot.header) && !headers.has(snapshot.header.id)) headers.set(snapshot.header.id, snapshot.header)
    }
    const archived = new Set(ctx.workspaceRegistry.archivedSessionIds)
    const pinned = new Set(ctx.workspaceRegistry.pinnedSessionIds)
    const chats = []
    for (const header of headers.values()) {
      if (archived.has(header.id)) continue
      chats.push({
        sessionId: header.id,
        activity: await activityOf(header),
        pinned: pinned.has(header.id),
        blank: isBlank(header.id),
      })
    }
    return chats.sort((left, right) => right.activity - left.activity)
  }

  /** True while the chat's Agent sits inside a turn. */
  const isBusy = (sessionId) => {
    const session = ctx.sessions.get(sessionId)
    return session !== undefined && ctx.agents.turnBoundaryOf(session).openTurnStartSeq !== null
  }

  /**
   * Delete one chat end to end: quiet its Agent, detach the live Session, drop
   * the session-owned artifact directory, and clear its projection checkpoint.
   * @returns true when an artifact was removed from disk.
   */
  const removeChat = async (sessionId) => {
    assertSessionId(sessionId)
    const session = ctx.sessions.get(sessionId)
    const snapshot = session === undefined ? await ctx.sessionPersistence.stat(sessionId) : undefined
    if (!isChatHeader(session?.header ?? snapshot?.header)) {
      throw new OnlyChatError('This chat is not an Only Chat chat, so nothing was deleted.')
    }
    const entry = ctx.sessions.store?.get?.(sessionId)
    if (entry?.appending === true || entry?.announcement === 'dispatching') {
      throw new OnlyChatError('This chat is still finishing a step. Try again in a moment.')
    }

    const writers = writersOf(ctx, sessionId)
    const agent = ctx.agents.get(sessionId)
    if (agent !== undefined) {
      // `cancel` is a synchronous request; the real bound is `whenIdle`.
      if (typeof agent.cancel === 'function') agent.cancel({ kind: 'disposed' })
      if (typeof agent.whenIdle === 'function') await step(agent.whenIdle(), `settle "${sessionId}"`)
      detachAgent(ctx, sessionId, agent)
    }
    if (session !== undefined) {
      if (typeof ctx.sessions.flush === 'function') await step(ctx.sessions.flush(session), `flush "${sessionId}"`)
      await step(detachSession(ctx, sessionId), `detach "${sessionId}"`)
    }
    await closeWriters(ctx, sessionId, writers)

    const directory = await artifactDirectory(ctx, sessionId)
    let removed = false
    if (directory !== undefined) {
      await rm(directory, { recursive: true, force: true })
      removed = true
    }
    // Clearing the archive flag after the log is gone avoids a row that points
    // at a deleted Session for one frame.
    if (ctx.workspaceRegistry.archivedSessionIds.includes(sessionId)) {
      await ctx.workspaceRegistry.unarchiveSession(sessionId).catch(() => undefined)
    }
    await clearProjectionCache(ctx, sessionId)
    if (session === undefined) notifyClients(ctx, sessionId)
    return removed
  }

  /**
   * Retire the least recently active idle chats past the limit. A pinned chat is
   * kept on purpose — that is what the row's keep control means here — so the
   * kept count can stay above the limit when the user pins more than the limit.
   * @param keep - a chat the caller just started and must not retire.
   * @returns the retired chat ids.
   */
  const prune = async (keep) => {
    const chats = await listChats()
    if (chats.length <= maxChats) return []
    const removed = []
    let kept = chats.length
    for (const chat of [...chats].reverse()) {
      if (kept <= maxChats) break
      if (chat.sessionId === keep || chat.pinned || isBusy(chat.sessionId)) continue
      try {
        await removeChat(chat.sessionId)
        removed.push(chat.sessionId)
        kept -= 1
      } catch (error) {
        ctx.logger.warn(`only-chat: retiring "${chat.sessionId}" failed: ${messageOf(error)}`)
      }
    }
    if (kept > maxChats) {
      ctx.logger.warn(`only-chat: ${kept} chats are kept over the limit of ${maxChats} because pinned or busy chats are not retired`)
    }
    return removed
  }

  /**
   * The newest live chat that has not started a turn yet, which is what a click
   * on the sidebar entry reuses instead of minting another empty chat.
   */
  const findReusable = () => {
    let best
    for (const session of ctx.sessions.list()) {
      if (!isChatHeader(session.header)) continue
      if (ctx.agents.turnBoundaryOf(session).lastTurn !== 0) continue
      if (ctx.workspaceRegistry.archivedSessionIds.includes(session.id)) continue
      const createdAt = session.header.createdAt ?? 0
      if (best === undefined || createdAt > best.createdAt) best = { sessionId: session.id, createdAt }
    }
    return best?.sessionId
  }

  /**
   * The Workspace backing the chat directory, created on first use and created
   * again if the user deleted it. Its row in the sidebar is the only place this
   * plugin's chats are visible outside Settings.
   */
  const ensureWorkspace = async () => {
    const existing = await ctx.workspaceRegistry.resolveByPath(chatDirectory)
    if (existing !== undefined) return existing
    return ctx.workspaceRegistry.create(chatDirectory, chatWorkspaceTitle)
  }

  /**
   * Account every chat to the chat Workspace. A chat started before this plugin
   * had a Workspace, or one whose row the user deleted, would otherwise render
   * as "choose a workspace" and refuse its first message.
   * @returns the Workspace the chats belong to.
   */
  const ensureMembership = async () => {
    const workspace = await ensureWorkspace()
    for (const chat of await listChats()) {
      if (workspace.sessionIds.includes(chat.sessionId)) continue
      await workspace.attachSession(chat.sessionId).catch(() => undefined)
    }
    return workspace
  }

  /**
   * Give the caller a chat to write into: reuse the empty one, else start a new
   * one and retire whatever the limit now exceeds.
   */
  const openChat = async () => {
    const workspace = await ensureMembership()
    const reusable = findReusable()
    if (reusable !== undefined) return { sessionId: reusable, reused: true, removed: [] }
    const created = await ctx.sessionController.create({ workspaceId: workspace.id })
    const removed = await prune(created.sessionId)
    return { sessionId: created.sessionId, reused: false, removed }
  }

  /** Delete every chat this plugin owns, leaving any chat still inside a turn. */
  const clearChats = async () => {
    const removed = []
    for (const chat of await listChats()) {
      if (isBusy(chat.sessionId)) continue
      await removeChat(chat.sessionId)
      removed.push(chat.sessionId)
    }
    return removed
  }

  /**
   * Move a chat into a workspace as an ordinary Session: copy its log into a new
   * Session attached to that workspace, restore the deployment's default preset
   * and permission on the copy, then delete the chat. One way by design — a
   * normal session is not a chat anymore and is never turned back into one.
   */
  const convertChat = async (sessionId, workspaceId) => {
    assertSessionId(sessionId)
    const workspace = ctx.workspaceRegistry.get(workspaceId)
    if (workspace === undefined) throw new OnlyChatError('That workspace no longer exists.')
    const sourceHeader = ctx.sessions.get(sessionId)?.header ?? (await ctx.sessionPersistence.stat(sessionId))?.header
    if (!isChatHeader(sourceHeader)) throw new OnlyChatError('This chat is not an Only Chat chat.')

    const observed = await ctx.sessionQuery.observeSession(sessionId)
    let events
    try {
      events = observed.events
      if (!events.some(event => event.type === 'user/message')) {
        throw new OnlyChatError('This chat has no messages yet, so there is nothing to move.')
      }
    } finally {
      observed[Symbol.dispose]?.()
    }

    const created = await ctx.sessionController.create({ workspaceId })
    const agent = ctx.agents.get(created.sessionId)
    if (agent?.session === undefined) throw new OnlyChatError('The new session is not live.')
    // Events keep their order and sequence numbers, so surface citations stay
    // valid. The chat's own permission and preset events travel with them and
    // are then overridden by fresh ones.
    agent.session.append(events.map(toEventInput))
    const presets = ctx.get('agentPresets')
    if (presets !== undefined && created.agentPreset !== undefined) await presets.select(agent, created.agentPreset)
    const permissions = ctx.get('permissionPresets')
    if (permissions !== undefined) permissions.set(agent.session, permissions.catalog().defaultPreset)
    else agent.session.append('sandbox/mode', { mode: ctx.sandboxPolicy.defaultMode })
    if (typeof ctx.sessions.flush === 'function') await step(ctx.sessions.flush(agent.session), 'flush the converted chat')
    await removeChat(sessionId)
    return { sessionId: created.sessionId, workspaceId }
  }

  /**
   * Persist a new limit through the profile's configuration editor. The limit
   * takes effect on the next chat start, so lowering it never deletes by itself.
   * @returns the saved limit.
   */
  const saveMaxChats = async (value) => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > maxChatsLimit) {
      throw new OnlyChatError(`Only Chat keeps between 1 and ${maxChatsLimit} chats.`)
    }
    const editor = ctx.get('configEditor')
    const entry = ctx.fiber.entry
    if (editor === undefined || entry === undefined) {
      throw new OnlyChatError('This profile cannot save configuration; edit cordis.patch.yml instead.')
    }
    await editor.edit(entry, current => ({ ...current, maxChats: value }))
    return value
  }

  /**
   * Make one chat read-only on top of the preset it runs. The Session pins the
   * deployment's read-only permission preset, and the agent's own scope refuses
   * the tools that would write outside that sandbox. Permission presets pins a
   * fresh Session from its own `agent/created` listener registered with
   * `prepend: true`, so this runs after that pin and read-only is the last value
   * in the log.
   */
  const applyReadOnly = (agent) => {
    const session = agent.session
    const permissions = ctx.get('permissionPresets')
    const readOnly = permissions?.catalog().options.find(option => option.value === 'read-only')
    if (readOnly !== undefined) permissions.set(session, 'read-only')
    else if (ctx.sandboxPolicy.overrideOf(session) !== 'read-only') session.append('sandbox/mode', { mode: 'read-only' })

    // `restrict` removes the registered ones from the catalog; the guard is the
    // part that holds for a tool that registers after this point, such as an MCP
    // server connecting later.
    const tools = agent.ctx?.tools
    if (tools === undefined) return
    const registered = ctx.tools.definitions().map((definition) => definition.name).filter(isRefusedTool)
    if (registered.length > 0) {
      try {
        tools.restrict({ deny: registered })
      } catch {
        // A scope that cannot restrict still gets the guard below.
      }
    }
    tools.guard((execution) => (isRefusedTool(execution.name) ? REFUSAL : undefined))
  }

  /**
   * Leave chat mode: drop the chat Workspace registration so its row disappears
   * from the ordinary workspace list. The directory and every chat log stay; the
   * next chat start re-registers the Workspace and re-accounts the chats.
   * @returns true when a registration was removed.
   */
  const leaveChatMode = async () => {
    const workspace = await ctx.workspaceRegistry.resolveByPath(chatDirectory)
    if (workspace === undefined) return false
    return ctx.workspaceRegistry.delete(workspace.id)
  }

  /**
   * Account one specific chat to the chat Workspace, so a chat opened from the
   * Settings page behaves like one started from the sidebar entry.
   */
  const enterChat = async (sessionId) => {
    assertSessionId(sessionId)
    const header = ctx.sessions.get(sessionId)?.header ?? (await ctx.sessionPersistence.stat(sessionId))?.header
    if (!isChatHeader(header)) throw new OnlyChatError('This chat is not an Only Chat chat.')
    await ensureMembership()
    return { sessionId }
  }

  const api = {
    chatDirectory, maxChats, enqueue, listChats, openChat, removeChat, clearChats, convertChat, saveMaxChats,
    enterChat, leaveChatMode,
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: API_PREFIX,
    handler: (req, res) => void route(ctx, api, req, res),
  }), 'only-chat: bridge routes')

  ctx.effect(() => ctx.on('agent/created', ({ agent }) => {
    if (agent.session === undefined || !isChatHeader(agent.session.header)) return
    try {
      applyReadOnly(agent)
    } catch (error) {
      ctx.logger.warn(`only-chat: could not make "${agent.id}" read-only: ${messageOf(error)}`)
    }
  }, { global: true }), 'only-chat: read-only chats')

  ctx.effect(() => ctx.on('session/created', (session) => {
    if (!isChatHeader(session.header)) return
    void enqueue(() => prune(session.id)).catch((error) => {
      ctx.logger.warn(`only-chat: bounded history failed: ${messageOf(error)}`)
    })
  }, { global: true }), 'only-chat: bounded history')

  // A chat Workspace exists only while someone is chatting, so startup creates
  // nothing: entering chat mode through `open` or `enter` registers it, and
  // `exit` removes it again.
}

/**
 * Answer one bridge request. The composition's trust fence runs first, then
 * only the authenticated browser Peer may reach a route at all.
 */
async function route(ctx, api, req, res) {
  const admission = ctx.connection.admit(req)
  if ('rejection' in admission) {
    res.statusCode = admission.rejection
    res.end()
    return
  }
  if (admission.peer !== ctx.connection.browserPeer) {
    sendJson(res, 403, { error: 'Only Chat is operated from the Harness interface, not from an API client.' })
    return
  }
  const path = new URL(String(req.url), 'http://localhost').pathname.slice(API_PREFIX.length).replace(/^\//, '')
  if (!ROUTES.has(path)) {
    sendJson(res, 404, { error: 'Unknown Only Chat route.' })
    return
  }
  try {
    if (req.method === 'GET' && path === 'state') {
      const chats = await api.enqueue(() => api.listChats())
      sendJson(res, 200, {
        chatDirectory: api.chatDirectory,
        maxChats: api.maxChats,
        chats,
        count: chats.length,
      })
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Only Chat reads state with GET and changes it with POST.' })
      return
    }
    if (!isJsonRequest(req)) {
      sendJson(res, 415, { error: 'Only Chat requests must send application/json.' })
      return
    }
    const body = await readJsonBody(req)
    if (path === 'open') {
      sendJson(res, 200, await api.enqueue(() => api.openChat()))
      return
    }
    if (path === 'enter') {
      const sessionId = requiredString(body.sessionId)
      sendJson(res, 200, await api.enqueue(() => api.enterChat(sessionId)))
      return
    }
    if (path === 'exit') {
      sendJson(res, 200, { removed: await api.enqueue(() => api.leaveChatMode()) })
      return
    }
    if (path === 'delete') {
      const sessionId = requiredString(body.sessionId)
      sendJson(res, 200, { sessionId, removed: await api.enqueue(() => api.removeChat(sessionId)) })
      return
    }
    if (path === 'clear') {
      sendJson(res, 200, { removed: await api.enqueue(() => api.clearChats()) })
      return
    }
    if (path === 'convert') {
      const sessionId = requiredString(body.sessionId)
      const workspaceId = requiredString(body.workspaceId)
      sendJson(res, 200, await api.enqueue(() => api.convertChat(sessionId, workspaceId)))
      return
    }
    sendJson(res, 200, { maxChats: await api.enqueue(() => api.saveMaxChats(body.maxChats)) })
  } catch (error) {
    // A refused operation is the caller's problem and says why; anything else is
    // ours, and its detail stays in the log rather than in the response.
    if (error instanceof OnlyChatError) {
      sendJson(res, 400, { error: error.message })
      return
    }
    ctx.logger.error(`only-chat: ${path} failed: ${messageOf(error)}`)
    sendJson(res, 500, { error: 'Only Chat could not complete that. See the Harness log.' })
  }
}

/**
 * Refuse a chat directory that would let this plugin delete logs it did not
 * create: the Harness home, its ancestors, and filesystem roots.
 * @returns the canonical directory, created if absent.
 */
async function safeChatDirectory(path) {
  if (!isAbsolutePath(path)) {
    throw new Error(`only-chat: chatDirectory must be an absolute path, got ${JSON.stringify(path)}`)
  }
  const requested = resolve(path)
  assertSafeDirectory(requested)
  await mkdir(requested, { recursive: true })
  const canonical = await realpath(requested)
  assertSafeDirectory(canonical)
  if (!(await stat(canonical)).isDirectory()) throw new Error(`only-chat: chatDirectory "${canonical}" is not a directory`)
  return canonical
}

/** Throw when a directory is too broad for a plugin that deletes session logs. */
function assertSafeDirectory(target) {
  if (target === resolve(homedir())) throw new Error('only-chat: chatDirectory must not be the user home directory')
  if (target === resolve(sep) || /^[A-Za-z]:[\\/]*$/.test(target)) {
    throw new Error('only-chat: chatDirectory must not be a filesystem root')
  }
  const home = resolve(dshHome())
  if (target === home || home.startsWith(target + sep)) {
    throw new Error('only-chat: chatDirectory must sit below the Harness home, not at or above it')
  }
}

/** Reject ids that could name a path outside the chat directory. */
function assertSessionId(sessionId) {
  if (typeof sessionId !== 'string' || sessionId === '' || sessionId === '.' || sessionId === '..'
    || /[\\/\x00-\x1f<>"|?*]/.test(sessionId) || /[. ]$/.test(sessionId)) {
    throw new OnlyChatError('That chat identifier is not usable.')
  }
}

/** Rebuild one stored event as an append input, keeping its surface metadata. */
function toEventInput(event) {
  if (event.surfaceOp === undefined) return [event.type, event.data]
  return [
    event.type,
    event.data,
    {
      surfaceOp: event.surfaceOp,
      ...(event.sourceEventSeqs === undefined ? {} : { sourceEventSeqs: event.sourceEventSeqs }),
    },
  ]
}

/** Release this idle Agent's registry entry; another owner's entry is left alone. */
function detachAgent(ctx, sessionId, agent) {
  const store = ctx.agents.store
  if (store === undefined) throw new OnlyChatError('This Harness build exposes no Agent registry to release.')
  const entry = store.get?.(sessionId)
  if (entry === undefined) return
  if (entry.agent !== undefined && entry.agent !== agent) return
  if (entry.agent === agent && typeof ctx.agents.detachEntered === 'function') {
    ctx.agents.detachEntered(entry)
    return
  }
  store.delete?.(sessionId)
}

/** Drop the live Session row, which drains its write handle and notifies clients. */
async function detachSession(ctx, sessionId) {
  const entry = ctx.sessions.store?.get?.(sessionId)
  if (entry === undefined) return undefined
  if (typeof entry.detach !== 'function') throw new OnlyChatError('This Harness build cannot detach a live Session safely.')
  return entry.detach()
}

/** Close every write handle left on this chat and refuse one still owned. */
async function closeWriters(ctx, sessionId, writers) {
  for (const writer of writers) {
    if (typeof writer.close !== 'function') throw new OnlyChatError('A chat write handle cannot be closed safely.')
    await step(writer.close(), `close the writer of "${sessionId}"`)
  }
  const late = writersOf(ctx, sessionId)
  if (late.length === 0) return
  for (const writer of late) {
    if (typeof writer.close === 'function') await step(writer.close(), `close a late writer of "${sessionId}"`)
  }
  if (writersOf(ctx, sessionId).length > 0) {
    throw new OnlyChatError('Something still holds this chat open, so nothing was deleted.')
  }
}

/** Write handles the persistence backend currently holds for this chat. */
function writersOf(ctx, sessionId) {
  const tracker = ctx.sessionPersistence.tracker
  const writers = new Set()
  const direct = tracker?.writers?.get?.(sessionId)
  if (direct !== undefined) writers.add(direct)
  for (const handle of tracker?.openHandles ?? []) {
    if (handle.id === sessionId && handle.access === 'write') writers.add(handle)
  }
  return [...writers]
}

/**
 * The session-owned directory holding this chat's artifact, or undefined when
 * the chat never materialized one.
 * @throws when the artifact sits outside the Harness session root.
 */
async function artifactDirectory(ctx, sessionId) {
  const location = (await ctx.sessionPersistence.stat(sessionId))?.location
  if (location === undefined) return undefined
  const root = resolve(join(resolve(dshHome()), sessionsRootSegment))
  const directory = resolve(dirname(location.path))
  if (directory !== root && !directory.startsWith(root + sep)) {
    throw new OnlyChatError(`The log of this chat is outside "${root}", so nothing was deleted.`)
  }
  const info = await stat(directory).catch(() => undefined)
  if (info === undefined || !info.isDirectory()) throw new OnlyChatError('The log directory of this chat is not a plain directory.')
  if (basename(directory) !== sessionId) throw new OnlyChatError('The log directory of this chat has an unexpected name.')
  const names = await readdir(directory)
  if (names.some(name => !name.startsWith(artifactPrefix))) {
    throw new OnlyChatError('The log directory of this chat holds unexpected files.')
  }
  // An empty directory is an unmaterialized chat: nothing to delete, no reason to fail.
  return names.length === 0 ? undefined : directory
}

/** Best-effort removal of this chat's projection checkpoint. */
async function clearProjectionCache(ctx, sessionId) {
  const domain = ctx.get('storageDomain')?.get?.(projectionCacheDomain)
  const table = domain?.table?.(projectionCacheTable)
  if (table === undefined || typeof table.delete !== 'function') return
  await table.delete(sessionId).catch(() => undefined)
}

/** Tell connected clients about a chat that was cold and so never detached. */
function notifyClients(ctx, sessionId) {
  try {
    ctx.emit('api-session/removed', sessionId)
  } catch {
    // That event belongs to the Session API; a deployment without it just
    // lists the chat again until its next refresh.
  }
}

/** Await one teardown step with a bound, so a wedged Agent refuses the delete. */
async function step(operation, label) {
  let timer
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`only-chat: ${label} timed out`)), teardownStepMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/** A refusal meant for the user; anything else is an internal failure. */
class OnlyChatError extends Error {}

function requiredString(value) {
  if (typeof value !== 'string' || value === '') throw new OnlyChatError('A chat or workspace identifier is missing.')
  return value
}

function isAbsolutePath(path) {
  return typeof path === 'string' && (path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path))
}

function isJsonRequest(req) {
  const header = req.headers['content-type']
  const essence = Array.isArray(header) ? header[0] : header
  return String(essence).split(';', 1)[0].trim().toLowerCase() === 'application/json'
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBodyBytes) throw new OnlyChatError('That request is too large.')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  let parsed
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new OnlyChatError('That request body is not valid JSON.')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new OnlyChatError('That request body must be a JSON object.')
  }
  return parsed
}

function sendJson(res, status, value) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(value))
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}
