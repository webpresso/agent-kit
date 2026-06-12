import { z } from 'zod'

import type { ToolDescriptor } from '#mcp/auto-discover'
import { resolveSessionRepoHash } from '#session-memory/repo-hash'
import { snapshot } from '#session-memory/session'

const inputSchema = z
  .object({
    sessionId: z.string().optional(),
    cwd: z.string().optional(),
    capMs: z.number().int().min(0).max(30_000).optional().default(5_000),
  })
  .strict()

const outputSchema = z.object({
  snapshotId: z.string(),
  eventsIncluded: z.number(),
  partial: z.boolean(),
})

const tool: ToolDescriptor = {
  name: 'wp_session_snapshot',
  description:
    'Create a session-memory snapshot before risky operations or branch switches.',
  inputSchema,
  outputSchema,
  annotations: {
    title: 'Session Snapshot',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  async handler(rawInput) {
    const input = inputSchema.parse(rawInput)
    const cwd = input.cwd ?? process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd()
    const result = await snapshot({
      repoHash: resolveSessionRepoHash(cwd),
      capMs: input.capMs,
      sessionId: input.sessionId,
    })
    const payload = {
      snapshotId: result.snapshotId,
      eventsIncluded: result.eventsIncluded,
      partial: result.partial,
    }
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
      structuredContent: payload,
    }
  },
}

export default tool
