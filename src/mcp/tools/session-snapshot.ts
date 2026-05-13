/**
 * `ak_session_snapshot` MCP tool.
 *
 * Manually triggers a session memory snapshot. Useful before branch switches,
 * risky operations, or when the agent wants to checkpoint the current state.
 *
 * Auto-discovered by `src/mcp/auto-discover.ts` — no manual registration needed.
 */
import { z } from 'zod'

import type { ToolDescriptor } from '#mcp/auto-discover'
import { snapshot } from '#session-memory/session'
import { computeRepoHash } from '#session-memory/repo-hash'

const inputSchema = z.object({
  cwd: z.string().optional().describe('Working directory (defaults to CLAUDE_PROJECT_DIR or cwd)'),
  capMs: z
    .number()
    .int()
    .min(0)
    .max(30_000)
    .optional()
    .default(5_000)
    .describe('Maximum time to spend consolidating, in ms. Partial snapshot on timeout.'),
})

export type AkSessionSnapshotInput = z.infer<typeof inputSchema>

const outputSchema = z.object({
  snapshotId: z.string(),
  eventsIncluded: z.number(),
  partial: z.boolean(),
})

const tool: ToolDescriptor = {
  name: 'ak_session_snapshot',
  description:
    'Manually create a session memory snapshot. Consolidates recent tool events into a searchable snapshot. Returns the snapshot ID usable by ak_session_restore. Call before risky operations or branch switches.',
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
    const repoHash = computeRepoHash(cwd)

    const result = await snapshot({ repoHash, capMs: input.capMs })

    const payload = {
      snapshotId: result.snapshotId,
      eventsIncluded: result.eventsIncluded,
      partial: result.partial,
    }

    const text = JSON.stringify(payload)
    return {
      content: [{ type: 'text' as const, text }],
      structuredContent: payload,
    }
  },
}

export default tool
