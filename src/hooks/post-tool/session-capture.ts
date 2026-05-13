/**
 * session-capture — captures PostToolUse events into the session memory store.
 *
 * Handles the expanded PostToolUse matcher (Edit|Write|MultiEdit|Bash|Read|Grep|WebFetch|mcp__):
 * - Bash: command string + combined output
 * - Edit/Write/MultiEdit: file path + new content (capped)
 * - Read: file path key (content not duplicated — file already in context)
 * - Grep: search pattern + truncated match results
 * - WebFetch: URL + response body (truncated to 2KB)
 * - MCP tools (mcp__*): tool name + stringified response (truncated)
 *
 * Non-blocking: if SQLite is locked or errors, logs to stderr and returns false.
 * Never throws — hook failures must not block the tool call chain.
 */
import type { ToolInput } from '#hooks/shared/types'
import { captureEvent } from '#session-memory/session'
import { computeRepoHash } from '#session-memory/repo-hash'
import { getContent, getFilePath } from '#hooks/shared/types'

const CONTENT_CAP = 4096 // bytes — cap individual event content to avoid huge DB rows
const WEBFETCH_CAP = 2048 // bytes — WebFetch responses can be huge; keep a compact excerpt

/**
 * Derive a content string for the event based on tool type.
 *
 * Each tool type emits a different shape — we normalise to a compact, searchable
 * string rather than storing raw JSON payloads (which are noisy and large).
 */
function deriveContent(input: ToolInput): string {
  const toolName = input.tool_name ?? 'unknown'
  const toolInput = input.tool_input ?? {}

  // Read — record the file path so later searches can find "what files were read"
  if (toolName === 'Read') {
    const filePath = getFilePath(input)
    return filePath ? `Read: ${filePath}` : 'Read: (unknown path)'
  }

  // Grep — record pattern + file pattern for searchability
  if (toolName === 'Grep') {
    const pattern = typeof toolInput.pattern === 'string' ? toolInput.pattern : ''
    const path = typeof toolInput.path === 'string' ? toolInput.path : ''
    return `Grep pattern="${pattern}" path="${path}"`
  }

  // WebFetch — record URL + first 2KB of response body
  if (toolName === 'WebFetch') {
    const url = typeof toolInput.url === 'string' ? toolInput.url : '(unknown url)'
    // tool_output is not in the input schema but may appear in PostToolUse payload
    const rawOutput = input.tool_output
    const body = typeof rawOutput === 'string' ? rawOutput.slice(0, WEBFETCH_CAP) : ''
    return body ? `WebFetch ${url}: ${body}` : `WebFetch ${url}`
  }

  // MCP tools (mcp__*) — tool name + stringified response
  if (toolName.startsWith('mcp__')) {
    const rawOutput = input.tool_output
    const responseStr =
      typeof rawOutput === 'string'
        ? rawOutput.slice(0, WEBFETCH_CAP)
        : rawOutput !== undefined
          ? JSON.stringify(rawOutput).slice(0, WEBFETCH_CAP)
          : ''
    return responseStr ? `${toolName}: ${responseStr}` : toolName
  }

  // Edit/Write/MultiEdit/Bash — use existing getContent helper (returns new_string or content)
  const content = getContent(input)
  if (content) return content

  // Fallback: stringify the input
  return JSON.stringify(toolInput)
}

/**
 * Capture a tool event for session memory.
 * Returns true on success, false on failure (non-blocking).
 */
export function captureToolEvent(input: ToolInput, sessionId: string): boolean {
  try {
    const toolName = input.tool_name ?? 'unknown'
    const content = deriveContent(input)
    const repoHash = computeRepoHash(input.cwd)

    return captureEvent({
      repoHash,
      event: {
        sessionId,
        toolName,
        content: content.slice(0, CONTENT_CAP),
      },
    })
  } catch (err) {
    process.stderr.write(
      `ak-session-capture: unexpected error: ${(err as Error).message}\n`,
    )
    return false
  }
}
