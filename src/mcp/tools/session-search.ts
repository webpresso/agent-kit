/**
 * `ak_session_search` MCP tool.
 *
 * Searches the session memory store for content relevant to the given query.
 * Uses three-tier search: porter FTS5 BM25 → trigram FTS5 → IDF-weighted Levenshtein.
 *
 * Auto-discovered by `src/mcp/auto-discover.ts` — no manual registration needed.
 * File named `session-search.ts` (no `ak-` prefix per agent-kit convention).
 */
import { z } from 'zod'

import type { ToolDescriptor } from '#mcp/auto-discover'
import { restore } from '#session-memory/session'
import { computeRepoHash } from '#session-memory/repo-hash'

const inputSchema = z.object({
  query: z.string().min(1).describe('Search query to find relevant session content'),
  limit: z.number().int().min(1).max(50).optional().default(10).describe('Maximum number of results to return'),
  source: z.string().optional().describe('Filter results to a specific source label'),
  cwd: z.string().optional().describe('Working directory (defaults to CLAUDE_PROJECT_DIR or cwd)'),
})

export type AkSessionSearchInput = z.infer<typeof inputSchema>

const hitSchema = z.object({
  content: z.string(),
  source: z.string(),
  tier: z.enum(['porter', 'trigram', 'levenshtein']),
  rank: z.number(),
})

const outputSchema = z.object({
  query: z.string(),
  hits: z.array(hitSchema),
  hitCount: z.number(),
  snapshotId: z.string().nullable(),
})

const tool: ToolDescriptor = {
  name: 'ak_session_search',
  description:
    'Search session memory for content relevant to the given query. Returns ranked hits from recent tool events and snapshots. Three-tier search: porter FTS5 → trigram → Levenshtein.',
  inputSchema,
  outputSchema,
  annotations: {
    title: 'Session Search',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  async handler(rawInput) {
    const input = inputSchema.parse(rawInput)
    const cwd = input.cwd ?? process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd()
    const repoHash = computeRepoHash(cwd)

    const result = restore({
      repoHash,
      query: input.query,
      limit: input.limit,
    })

    const payload = {
      query: input.query,
      hits: result.hits.map((h) => ({
        content: h.content,
        source: h.source,
        tier: h.tier,
        rank: h.rank,
      })),
      hitCount: result.hits.length,
      snapshotId: result.snapshotId,
    }

    const text = JSON.stringify(payload)
    return {
      content: [{ type: 'text' as const, text }],
      structuredContent: payload,
    }
  },
}

export default tool
