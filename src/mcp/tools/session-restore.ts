import { z } from 'zod'

import type { ToolDescriptor } from '#mcp/auto-discover'
import { resolveSessionRepoHash } from '#session-memory/repo-hash'
import { restore } from '#session-memory/session'

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function escapeText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

const inputSchema = z
  .object({
    query: z.string().optional().default(''),
    limit: z.number().int().min(1).max(50).optional().default(10),
    sessionId: z.string().optional(),
    snapshotId: z.string().optional(),
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
    }),
  ),
  hitCount: z.number(),
  snapshotId: z.string().nullable(),
  sessionKnowledge: z.string(),
})

const tool: ToolDescriptor = {
  name: 'wp_session_restore',
  description:
    'Restore session context after compaction and return a reusable <session_knowledge> block.',
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
    const cwd = input.cwd ?? process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd()
    if (!input.snapshotId && input.query.trim().length === 0) {
      throw new Error('wp_session_restore requires either a query or a snapshotId')
    }
    const result = restore({
      repoHash: resolveSessionRepoHash(cwd),
      query: input.query,
      limit: input.limit,
      sessionId: input.sessionId,
      snapshotId: input.snapshotId,
    })
    const entries = result.hits
      .map(
        (hit) =>
          `  <entry source="${escapeAttribute(hit.source)}" tier="${escapeAttribute(hit.tier)}">${escapeText(hit.content)}</entry>`,
      )
      .join('\n')
    const sessionKnowledge =
      result.hits.length > 0
        ? `<session_knowledge query="${escapeAttribute(input.query)}">\n${entries}\n</session_knowledge>`
        : ''
    const payload = {
      query: input.query,
      hits: result.hits.map((hit) => ({ content: hit.content, source: hit.source, tier: hit.tier })),
      hitCount: result.hits.length,
      snapshotId: result.snapshotId,
      sessionKnowledge,
    }
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
      structuredContent: payload,
    }
  },
}

export default tool
