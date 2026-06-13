import { z } from 'zod'

import type { ToolDescriptor } from '#mcp/auto-discover'
import { resolveSessionRepoHash } from '#session-memory/repo-hash'
import { captureEvent, flushCapturedEvents } from '#session-memory/session'

const inputSchema = z
  .object({
    content: z.string().min(1),
    toolName: z.string().optional().default('manual'),
    sessionId: z.string().optional(),
    cwd: z.string().optional(),
  })
  .strict()

const outputSchema = z.object({
  captured: z.boolean(),
  flushedEvents: z.number(),
  toolName: z.string(),
  capturedLength: z.number(),
  truncated: z.boolean(),
})

const tool: ToolDescriptor = {
  name: 'wp_session_capture',
  description:
    'Manually capture content into session memory so it survives compaction and becomes recallable via wp_session_restore.',
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
    const cwd = input.cwd ?? process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd()
    const repoHash = resolveSessionRepoHash(cwd)
    const capturedContent = input.content.slice(0, 4096)
    const captured = captureEvent({
      repoHash,
      event: {
        sessionId: input.sessionId,
        toolName: input.toolName,
        content: capturedContent,
      },
    })
    const payload = {
      captured,
      flushedEvents: captured ? flushCapturedEvents(repoHash) : 0,
      toolName: input.toolName,
      capturedLength: capturedContent.length,
      truncated: capturedContent.length !== input.content.length,
    }
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
      structuredContent: payload,
    }
  },
}

export default tool
