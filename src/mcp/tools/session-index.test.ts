import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import sessionIndexTool from './session-index.js'
import { SessionMemoryStore } from '../../session-memory/store.js'

const dirs: string[] = []

function tmpDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ak-mcp-session-index-'))
  dirs.push(dir)
  return join(dir, 'memory.sqlite')
}

function payload(result: Awaited<ReturnType<typeof sessionIndexTool.handler>>) {
  return result.structuredContent as {
    passed: boolean
    summary: string
    counts: { inputChunks: number; indexedChunks: number; warningCount: number }
    sources: string[]
    chunkIds: string[]
    warnings: string[]
  }
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('wp_session_index tool', () => {
  it('exposes a first-class bounded descriptor', () => {
    expect(sessionIndexTool.name).toBe('wp_session_index')
    expect(typeof sessionIndexTool.handler).toBe('function')
    expect(sessionIndexTool.annotations?.destructiveHint).toBe(false)
  })

  it('indexes provided chunks and returns ids/sources without raw text echo', async () => {
    const dbPath = tmpDbPath()
    const largeText = `${'large searchable body '.repeat(1024)}needle-value`

    const result = await sessionIndexTool.handler({
      dbPath,
      source: 'mcp:direct-test',
      chunks: [
        { text: largeText, metadata: { kind: 'large' } },
        { text: 'small replacement parity note', source: 'mcp:secondary' },
      ],
    })
    const data = payload(result)

    expect(data.passed).toBe(true)
    expect(data.counts).toEqual({ inputChunks: 2, indexedChunks: 2, warningCount: 0 })
    expect(data.sources).toEqual(['mcp:direct-test', 'mcp:secondary'])
    expect(data.chunkIds).toHaveLength(2)
    expect(JSON.stringify(result)).not.toContain('needle-value')
    expect(JSON.stringify(result)).not.toContain('large searchable body')

    const store = new SessionMemoryStore(dbPath)
    expect(store.search({ query: 'needle-value', limit: 1 })[0]?.source).toBe('mcp:direct-test')
    store.close()
  })

  it('returns a deterministic bounded error for empty chunks', async () => {
    const result = await sessionIndexTool.handler({
      dbPath: tmpDbPath(),
      source: 'mcp:empty-test',
      chunks: [{ text: '   ' }],
    })
    const data = payload(result)

    expect(result.isError).toBe(true)
    expect(data.passed).toBe(false)
    expect(data.counts).toEqual({ inputChunks: 1, indexedChunks: 0, warningCount: 1 })
    expect(data.warnings).toEqual(['chunk[0] empty text skipped'])
    expect(JSON.stringify(result)).not.toContain('   ')
  })
})
