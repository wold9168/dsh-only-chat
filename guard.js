/**
 * dsh-only-chat/guard — the preset-scoped tool policy for Only Chat chats.
 *
 * Host-layer contributions reach every Agent, so a preset's own plugin list is
 * not enough to keep a chat read-only: configured MCP servers register their
 * tools globally, and `working_directory` comes from the base layer. This
 * plugin hides those host-layer tools from the chat's scope and denies by name
 * at execution time, so even a server that connects later cannot write a file
 * or run a command from a chat.
 */

/** Everything a chat may call, all of it read-only. */
const ALLOWED = new Set(['read', 'read_image', 'glob', 'grep', 'web_search', 'web_fetch'])

/** Reserved PTC presentation transport, which no restriction may name. */
const RESERVED_TRANSPORT = 'run_code'

export const name = 'dsh-only-chat-guard'
export const inject = ['tools']

export function apply(ctx) {
  const deny = ctx.tools.definitions()
    .map(definition => definition.name)
    .filter(toolName => !ALLOWED.has(toolName) && toolName !== RESERVED_TRANSPORT)
  if (deny.length > 0) {
    // A scope that cannot restrict still gets the execution guard below.
    try {
      ctx.tools.restrict({ deny })
    } catch {
      // Not fatal: the guard is the part that must hold.
    }
  }
  ctx.tools.guard((execution) => ALLOWED.has(execution.name)
    ? undefined
    : 'Only Chat chats read local files without changing them, so this tool is not available here.')
}
