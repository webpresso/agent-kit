/**
 * session-capture — captures PostToolUse events into the session memory store.
 *
 * Non-blocking: if SQLite is locked or errors, logs to stderr and returns false.
 * Never throws — hook failures must not block the tool call chain.
 */
import type { ToolInput } from '#hooks/shared/types'
import { captureEvent } from '#session-memory/session'
import { computeRepoHash } from '#session-memory/repo-hash'
import { getContent } from '#hooks/shared/types'

/**
 * Capture a tool event for session memory.
 * Returns true on success, false on failure (non-blocking).
 */
export function captureToolEvent(input: ToolInput, sessionId: string): boolean {
  try {
    const toolName = input.tool_name ?? 'unknown'
    const content = getContent(input) ?? JSON.stringify(input.tool_input ?? {})
    const repoHash = computeRepoHash(input.cwd)

    return captureEvent({
      repoHash,
      event: {
        sessionId,
        toolName,
        content: content.slice(0, 4096), // cap content to avoid huge DB rows
      },
    })
  } catch (err) {
    process.stderr.write(
      `ak-session-capture: unexpected error: ${(err as Error).message}\n`,
    )
    return false
  }
}
