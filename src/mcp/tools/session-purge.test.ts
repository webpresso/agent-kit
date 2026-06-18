import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import sessionPurgeTool from './session-purge.js'
import { SessionMemorySessionStore } from '../../session-memory/session.js'
import { SessionMemoryStore } from '../../session-memory/store.js'

const dirs: string[] = []
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'ak-mcp-session-purge-'))
  dirs.push(dir)
  return { sessionDbPath: join(dir, 'sessions.sqlite'), indexDbPath: join(dir, 'index.sqlite') }
}
function payload(result: Awaited<ReturnType<typeof sessionPurgeTool.handler>>) {
  return result.structuredContent as {
    passed: boolean
    dryRun: boolean
    counts: {
      matchedEventCount: number
      deletedEventCount: number
      matchedChunkCount: number
      deletedChunkCount: number
      matchedGainEventCount: number
      deletedGainEventCount: number
      warningCount: number
    }
    warnings: string[]
  }
}
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('wp_session_purge tool', () => {
  it('defaults to dry-run and requires explicit global confirmation', async () => {
    expect(sessionPurgeTool.name).toBe('wp_session_purge')
    expect(sessionPurgeTool.annotations?.destructiveHint).toBe(true)
    const { sessionDbPath, indexDbPath } = fixture()
    const sessionStore = new SessionMemorySessionStore(sessionDbPath)
    sessionStore.captureEvent({
      repoHash: 'repo123456789abcd',
      event: { eventType: 'decision', toolName: 'tool', content: 'purge memory' },
    })
    sessionStore.close()
    const indexStore = new SessionMemoryStore(indexDbPath)
    indexStore.indexChunk({ id: 'chunk-a', source: 'web:a', text: 'purge chunk' })
    indexStore.close()

    const dryRun = payload(
      await sessionPurgeTool.handler({
        sessionDbPath,
        indexDbPath,
        source: 'web:a',
        repoHash: 'repo123456789abcd',
      }),
    )
    expect(dryRun).toMatchObject({
      passed: true,
      dryRun: true,
      counts: {
        matchedEventCount: 1,
        deletedEventCount: 0,
        matchedChunkCount: 1,
        deletedChunkCount: 0,
        matchedGainEventCount: 0,
        deletedGainEventCount: 0,
      },
    })

    const denied = await sessionPurgeTool.handler({ sessionDbPath, indexDbPath, confirm: true })
    expect(denied.isError).toBe(true)
    expect(payload(denied).warnings).toContain('global purge requires allowGlobal=true')
  })

  it('confirms scoped purge without touching other sources or repos', async () => {
    const { sessionDbPath, indexDbPath } = fixture()
    const sessionStore = new SessionMemorySessionStore(sessionDbPath)
    sessionStore.captureEvent({
      repoHash: 'repo123456789abcd',
      event: {
        eventId: 'evt-a',
        eventType: 'decision',
        toolName: 'tool',
        content: 'purge memory a',
      },
    })
    sessionStore.captureEvent({
      repoHash: 'repo-other',
      event: {
        eventId: 'evt-b',
        eventType: 'decision',
        toolName: 'tool',
        content: 'purge memory b',
      },
    })
    sessionStore.close()
    const indexStore = new SessionMemoryStore(indexDbPath)
    indexStore.indexChunk({ id: 'chunk-a', source: 'web:a', text: 'purge chunk a' })
    indexStore.indexChunk({ id: 'chunk-b', source: 'web:b', text: 'purge chunk b' })
    indexStore.close()

    const result = payload(
      await sessionPurgeTool.handler({
        sessionDbPath,
        indexDbPath,
        confirm: true,
        source: 'web:a',
        repoHash: 'repo123456789abcd',
      }),
    )
    expect(result).toMatchObject({
      passed: true,
      dryRun: false,
      counts: { deletedEventCount: 1, deletedChunkCount: 1 },
    })
    const remainingEvents = new SessionMemorySessionStore(sessionDbPath)
    expect(
      remainingEvents.restore({ repoHash: 'repo-other', query: 'purge', limit: 5 }),
    ).toHaveLength(1)
    remainingEvents.close()
    const remainingChunks = new SessionMemoryStore(indexDbPath)
    expect(remainingChunks.search({ query: 'purge', source: 'web:b', limit: 5 })).toHaveLength(1)
    remainingChunks.close()
  })

  it('confirms repo-scoped continuity purge without requiring global chunk purge', async () => {
    const { sessionDbPath, indexDbPath } = fixture()
    const sessionStore = new SessionMemorySessionStore(sessionDbPath)
    sessionStore.captureEvent({
      repoHash: 'repo123456789abcd',
      event: { eventType: 'decision', toolName: 'tool', content: 'repo-only purge memory' },
    })
    sessionStore.close()
    const indexStore = new SessionMemoryStore(indexDbPath)
    indexStore.indexChunk({ id: 'chunk-a', source: 'web:a', text: 'unscoped chunk remains' })
    indexStore.close()

    const result = payload(
      await sessionPurgeTool.handler({
        sessionDbPath,
        indexDbPath,
        confirm: true,
        repoHash: 'repo123456789abcd',
      }),
    )

    expect(result).toMatchObject({
      passed: true,
      dryRun: false,
      counts: { deletedEventCount: 1, deletedChunkCount: 0, warningCount: 0 },
      warnings: [],
    })
    const remainingChunks = new SessionMemoryStore(indexDbPath)
    expect(remainingChunks.search({ query: 'unscoped', limit: 5 })).toHaveLength(1)
    remainingChunks.close()
  })

  it('includes gain event counts in confirmed global indexed-chunk purge', async () => {
    const { sessionDbPath, indexDbPath } = fixture()
    const indexStore = new SessionMemoryStore(indexDbPath)
    indexStore.indexChunk({ id: 'chunk-a', source: 'web:a', text: 'purge chunk a' })
    indexStore.recordGainEvent({
      toolName: 'wp_session_index',
      rawBasisBytes: 100,
      returnedToolResultBytes: 40,
      gainBytes: 60,
      approxTokensSaved: 15,
      precision: 'exact_utf8_bytes_approx_tokens',
      rawBytesBasis: 'index_accepted_text',
    })
    indexStore.close()

    const result = payload(
      await sessionPurgeTool.handler({
        sessionDbPath,
        indexDbPath,
        target: 'indexed_chunks',
        confirm: true,
        allowGlobal: true,
      }),
    )

    expect(result).toMatchObject({
      passed: true,
      dryRun: false,
      counts: {
        matchedChunkCount: 1,
        deletedChunkCount: 1,
        matchedGainEventCount: 1,
        deletedGainEventCount: 1,
      },
    })
    const remainingChunks = new SessionMemoryStore(indexDbPath)
    expect(remainingChunks.stats()).toMatchObject({ chunkCount: 0 })
    expect(remainingChunks.gainStats()).toMatchObject({ eventCount: 0 })
    remainingChunks.close()
  })
})
