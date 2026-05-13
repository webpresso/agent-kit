/**
 * `ak_session_restore` MCP tool.
 *
 * Restores session context from memory, returning the most relevant prior
 * session events for the given query. Typically called by agents after
 * context compaction to recover working context.
 *
 * Auto-discovered by `src/mcp/server.ts` — no manual registration needed.
 */
import { z } from 'zod'

import type { ToolDescriptor } from '#mcp/auto-discover'
import { restore } from '#session-memory/session'
import { computeRepoHash } from '#session-memory/repo-hash'

const inputSchema = z.object({
  query: z.string().min(1).describe('What to restore — describes the current working context'),
  limit: z.number().int().min(1).max(50).optional().default(10).describe('Maximum results to return'),
  cwd: z.string().optional().describe('Working directory (defaults to CLAUDE_PROJECT_DIR or cwd)'),
})

export type AkSessionRestoreInput = z.infer<typeof inputSchema>

const outputSchema = z.object({
  query: z.string(),
  hits: z.array(
    z.object({
      content: z.string(),
      source: z.string(),
      tier: z.enum(['porter', 'trigram', 'levenshtein']),
    }),
  ),
  hitCount: z.number(),
  snapshotId: z.string().nullable(),
  sessionKnowledge: z.string(),
})

const tool: ToolDescriptor = {
  name: 'ak_session_restore',
  description:
    'Restore session context from memory. Returns relevant prior session events as a <session_knowledge> block. Call after context compaction or when recovering lost context.',
  inputSchema,
  outputSchema,
  annotations: {
    title: 'Session Restore',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  async handler(rawInput) {
    const input = inputSchema.parse(rawInput)
    const cwd = input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
    const repoHash = computeRepoHash(cwd)

    const result = restore({ repoHash, query: input.query, limit: input.limit })

    // Build <session_knowledge> block for direct use in context
    const entries = result.hits
      .map(
        (h) =>
          `  <entry source="${h.source}" tier="${h.tier}">${h.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</entry>`,
      )
      .join('\n')
    const sessionKnowledge =
      result.hits.length > 0
        ? `<session_knowledge query="${input.query}">\n${entries}\n</session_knowledge>`
        : ''

    const payload = {
      query: input.query,
      hits: result.hits.map((h) => ({ content: h.content, source: h.source, tier: h.tier })),
      hitCount: result.hits.length,
      snapshotId: result.snapshotId,
      sessionKnowledge,
    }

    const text = JSON.stringify(payload)
    return {
      content: [{ type: 'text' as const, text }],
      structuredContent: payload,
    }
  },
}

export default tool
