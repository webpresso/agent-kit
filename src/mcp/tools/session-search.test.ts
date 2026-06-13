import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import sessionSearchTool from './session-search.js'
import { SessionMemorySessionStore } from '../../session-memory/session.js'
import { SessionMemoryStore } from '../../session-memory/store.js'

const dirs: string[] = []

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'ak-mcp-session-search-'))
  dirs.push(dir)
  return {
    sessionDbPath: join(dir, 'sessions.sqlite'),
    indexDbPath: join(dir, 'index.sqlite'),
  }
}

function payload(result: Awaited<ReturnType<typeof sessionSearchTool.handler>>) {
  return result.structuredContent as {
    passed: boolean
    summary: string
    counts: {
      resultCount: number
      continuityEventCount: number
      indexedChunkCount: number
      warningCount: number
    }
    results: Array<{
      sourceType: 'continuity_event' | 'indexed_chunk'
      provenance: { kind: string; id: string; source?: string; repoHash?: string; eventId?: string }
      dedupeKey: string
      score: number
      tier: string
      timestamp: string
      preview: string
      metadata: Record<string, unknown>
    }>
    warnings: string[]
  }
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('wp_session_search tool', () => {
  it('exposes a strict public search descriptor', () => {
    expect(sessionSearchTool.name).toBe('wp_session_search')
    expect(typeof sessionSearchTool.handler).toBe('function')
    expect(sessionSearchTool.annotations?.destructiveHint).toBe(false)
    expect(sessionSearchTool.annotations?.openWorldHint).toBe(false)
    expect(() => sessionSearchTool.inputSchema.parse({ query: 'memory', oldName: true })).toThrow()
  })

  it('searches indexed chunks and continuity events with source labels and bounded previews', async () => {
    const { sessionDbPath, indexDbPath } = fixture()
    const indexStore = new SessionMemoryStore(indexDbPath)
    indexStore.indexChunk({
      id: 'chunk-search-1',
      source: 'web:docs',
      text: `${'query driven recall '.repeat(20)}hidden-search-overflow`,
      createdAt: '2026-06-13T00:00:01.000Z',
    })
    indexStore.close()
    const sessionStore = new SessionMemorySessionStore(sessionDbPath)
    sessionStore.captureEvent({
      repoHash: 'repo123456789abcd',
      event: {
        eventId: 'evt-search-1',
        ts: '2026-06-13T00:00:00.000Z',
        eventType: 'constraint',
        toolName: 'UserPromptSubmit',
        content: `${'query driven recall event '.repeat(20)}hidden-search-overflow`,
      },
    })
    sessionStore.close()

    const result = await sessionSearchTool.handler({
      sessionDbPath,
      indexDbPath,
      repoHash: 'repo123456789abcd',
      query: 'query driven recall hidden-search-overflow',
      maxPreviewBytes: 64,
      limit: 10,
    })
    const data = payload(result)

    expect(data.passed).toBe(true)
    expect(data.counts).toMatchObject({
      resultCount: 2,
      indexedChunkCount: 1,
      continuityEventCount: 1,
    })
    expect(data.results.map((item) => item.sourceType)).toEqual([
      'indexed_chunk',
      'continuity_event',
    ])
    expect(data.results[0]).toMatchObject({ provenance: { source: 'web:docs' } })
    expect(data.results.every((item) => item.preview.length <= 64)).toBe(true)
    expect(JSON.stringify(result)).not.toContain('hidden-search-overflow')
    expect(JSON.stringify(result)).not.toContain('hidden-search-overflow')
  })

  it('honors source filters and source-type filters deterministically', async () => {
    const { sessionDbPath, indexDbPath } = fixture()
    const indexStore = new SessionMemoryStore(indexDbPath)
    indexStore.indexChunk({ id: 'chunk-a', source: 'web:a', text: 'scoped replacement memory' })
    indexStore.indexChunk({ id: 'chunk-b', source: 'web:b', text: 'scoped replacement memory' })
    indexStore.close()

    const chunkOnly = await sessionSearchTool.handler({
      sessionDbPath,
      indexDbPath,
      query: 'replacement memory',
      source: 'web:b',
      sourceTypes: ['indexed_chunk'],
      limit: 10,
    })
    expect(payload(chunkOnly).results.map((item) => item.provenance.source)).toEqual(['web:b'])

    const eventOnly = await sessionSearchTool.handler({
      sessionDbPath,
      indexDbPath,
      repoHash: 'repo123456789abcd',
      query: 'replacement memory',
      sourceTypes: ['continuity_event'],
      limit: 10,
    })
    expect(eventOnly.isError).toBe(true)
    expect(payload(eventOnly)).toMatchObject({ passed: false, counts: { resultCount: 0 } })
  })

  it('caps huge limits and returns bounded no-result responses for malformed queries', async () => {
    const { sessionDbPath, indexDbPath } = fixture()
    const indexStore = new SessionMemoryStore(indexDbPath)
    for (let i = 0; i < 80; i += 1) {
      indexStore.indexChunk({
        id: `chunk-${i}`,
        source: 'bulk',
        text: `bulk searchable memory ${i}`,
      })
    }
    indexStore.close()

    const capped = await sessionSearchTool.handler({
      sessionDbPath,
      indexDbPath,
      query: 'memory',
      limit: 1_000,
    })
    expect(payload(capped).results.length).toBeLessThanOrEqual(50)

    const malformed = await sessionSearchTool.handler({ sessionDbPath, indexDbPath, query: '""""' })
    expect(malformed.isError).toBe(true)
    expect(payload(malformed)).toMatchObject({ passed: false, counts: { resultCount: 0 } })
  })
})
