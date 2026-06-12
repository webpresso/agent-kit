import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { z } from 'zod'

import type { ToolDescriptor } from '#mcp/auto-discover'
import { resolveSessionRepoHash } from '#session-memory/repo-hash'
import { resolveDbPath, restore } from '#session-memory/session'
import { getStore } from '#session-memory/store'

const inputSchema = z
  .object({
    query: z.string().min(1),
    limit: z.number().int().min(1).max(50).optional().default(10),
    cwd: z.string().optional(),
  })
  .strict()

const outputSchema = z.object({
  query: z.string(),
  hits: z.array(
    z.object({
      content: z.string(),
      source: z.string(),
      tier: z.enum(['porter', 'trigram', 'levenshtein']),
      rank: z.number(),
    }),
  ),
  hitCount: z.number(),
  snapshotId: z.string().nullable(),
})

const tool: ToolDescriptor = {
  name: 'wp_session_search',
  description:
    'Search session memory for content relevant to the given query. Returns ranked hits from the built-in native session-memory engine.',
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
    const repoHash = resolveSessionRepoHash(cwd)
    const dbPath = resolveDbPath(repoHash)
    mkdirSync(dirname(dbPath), { recursive: true })
    const storeHits = getStore(dbPath).search({
      query: input.query,
      limit: input.limit,
    })
    const restoreResult = restore({
      repoHash,
      query: input.query,
      limit: input.limit,
    })
    const restoreHits = restoreResult.hits
    const combined = [...storeHits, ...restoreHits]
    const seen = new Set<string>()
    const result = combined
      .filter((hit) => {
        const key = `${hit.source}\u0000${hit.content}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((left, right) => left.rank - right.rank)
      .slice(0, input.limit)
    const payload = {
      query: input.query,
      hits: result.map((hit) => ({
        content: hit.content,
        source: hit.source,
        tier: hit.tier,
        rank: hit.rank,
      })),
      hitCount: result.length,
      snapshotId: restoreResult.snapshotId,
    }
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
      structuredContent: payload,
    }
  },
}

export default tool
