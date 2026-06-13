/**
 * `ak_session_capture` MCP tool.
 *
 * Manually captures a custom event into session memory. Useful for recording
 * important decisions, findings, or context that the agent wants to preserve
 * across compaction.
 *
 * Auto-discovered by `src/mcp/server.ts` — no manual registration needed.
 */
import { z } from 'zod'

import type { ToolDescriptor } from '#mcp/auto-discover'
import { captureEvent } from '#session-memory/session'
import { computeRepoHash } from '#session-memory/repo-hash'

const inputSchema = z.object({
  content: z.string().min(1).describe('Content to capture (decision, finding, context)'),
  toolName: z
    .string()
    .optional()
    .default('manual')
    .describe('Label for the event source (e.g. "decision", "finding", "manual")'),
  sessionId: z
    .string()
    .optional()
    .describe('Session ID (defaults to CLAUDE_SESSION_ID env var or "unknown")'),
  cwd: z.string().optional().describe('Working directory (defaults to CLAUDE_PROJECT_DIR or cwd)'),
})

export type AkSessionCaptureInput = z.infer<typeof inputSchema>

const outputSchema = z.object({
  captured: z.boolean(),
  toolName: z.string(),
  contentLength: z.number(),
})

const tool: ToolDescriptor = {
  name: 'ak_session_capture',
  description:
    'Manually capture content into session memory. Use to record important decisions, findings, or context that should survive compaction. Content is searchable via ak_session_search.',
  inputSchema,
  outputSchema,
  annotations: {
    title: 'Session Capture',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  async handler(rawInput) {
    const input = inputSchema.parse(rawInput)
    const cwd = input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
    const repoHash = computeRepoHash(cwd)
    const sessionId = input.sessionId ?? process.env.CLAUDE_SESSION_ID ?? 'unknown'

    const captured = captureEvent({
      repoHash,
      event: {
        sessionId,
        toolName: input.toolName,
        content: input.content.slice(0, 4096),
      },
    })

    const payload = {
      captured,
      toolName: input.toolName,
      contentLength: input.content.length,
    }

    const text = JSON.stringify(payload)
    return {
      content: [{ type: 'text' as const, text }],
      structuredContent: payload,
    }
  },
}

export default tool
