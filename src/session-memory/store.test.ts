import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { SessionMemoryStore } from './store.js'

const dirs: string[] = []
function store(): SessionMemoryStore {
  const dir = mkdtempSync(join(tmpdir(), 'ak-session-store-'))
  dirs.push(dir)
  return new SessionMemoryStore(join(dir, 'memory.sqlite'))
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('SessionMemoryStore', () => {
  it('indexes chunks and returns top five porter matches', () => {
    const s = store()
    for (let i = 0; i < 100; i += 1) {
      s.indexChunk({
        id: `chunk-${i}`,
        source: 'global',
        text: i < 8 ? `foo note ${i}` : `bar note ${i}`,
      })
    }
    expect(s.search({ query: 'foo', limit: 5 })).toHaveLength(5)
    expect(s.search({ query: 'foo', limit: 5 }).every((row) => row.text.includes('foo'))).toBe(true)
    s.close()
  })

  it('falls back through trigram and fuzzy search', () => {
    const s = store()
    s.indexChunk({ id: 'tri', source: 'a', text: 'alphabet soup' })
    s.indexChunk({ id: 'fuzzy', source: 'a', text: 'contextual memory' })
    expect(s.search({ query: 'alphab', source: 'a', limit: 1 })[0]?.tier).toBe('trigram')
    expect(s.search({ query: 'memry', source: 'a', limit: 1 })[0]?.id).toBe('fuzzy')
    s.close()
  })

  it('uses source scoping with global fallback', () => {
    const s = store()
    s.indexChunk({ id: 'global', source: 'global', text: 'shared restore context' })
    expect(s.search({ query: 'restore', source: 'missing', limit: 1 })[0]?.id).toBe('global')
    s.close()
  })

  it('re-indexes idempotently without double adding', () => {
    const s = store()
    s.indexChunk({ id: 'same', source: 'global', text: 'old text' })
    s.indexChunk({ id: 'same', source: 'global', text: 'new text' })
    expect(s.count()).toBe(1)
    expect(s.search({ query: 'new', limit: 5 })[0]?.text).toBe('new text')
    s.close()
  })
})

// G017: unified recall semantics for indexed chunks.
describe('SessionMemoryStore unified search results', () => {
  it('returns preview-only chunk results with stable provenance and dedupe keys', () => {
    const s = store()
    const text = `${'bounded chunk body '.repeat(20)}hidden-overflow`
    s.indexChunk({ id: 'chunk-a', source: 'web:docs', text, createdAt: '2026-06-13T00:00:00.000Z' })
    s.indexChunk({ id: 'chunk-b', source: 'web:docs', text, createdAt: '2026-06-13T00:00:01.000Z' })

    const results = s.searchUnified({
      query: 'bounded hidden-overflow',
      limit: 10,
      maxPreviewBytes: 48,
    })

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      sourceType: 'indexed_chunk',
      provenance: { kind: 'indexed_chunk', id: 'chunk-a', source: 'web:docs' },
      tier: expect.any(String),
      timestamp: '2026-06-13T00:00:00.000Z',
    })
    expect(results[0]?.dedupeKey).toMatch(/^indexed_chunk:web:docs:/u)
    expect(results[0]?.preview.length).toBeLessThanOrEqual(48)
    expect(results[0]?.preview).not.toContain('hidden-overflow')
    expect(JSON.stringify(results)).not.toContain(
      'bounded chunk body bounded chunk body bounded chunk body',
    )
    s.close()
  })

  it('preserves source scoping without global fallback in unified mode', () => {
    const s = store()
    s.indexChunk({ id: 'global', source: 'global', text: 'shared restore context' })
    expect(s.searchUnified({ query: 'restore', source: 'missing', limit: 1 })).toEqual([])
    expect(
      s.searchUnified({ query: 'restore', source: 'global', limit: 1 })[0]?.provenance,
    ).toMatchObject({
      source: 'global',
      id: 'global',
    })
    s.close()
  })

  it('keeps distinct source provenance even for identical content', () => {
    const s = store()
    s.indexChunk({ id: 'a', source: 'source:a', text: 'same cross source memory' })
    s.indexChunk({ id: 'b', source: 'source:b', text: 'same cross source memory' })
    const results = s.searchUnified({ query: 'memory', limit: 10 })
    expect(results.map((result) => result.provenance.source).sort()).toEqual([
      'source:a',
      'source:b',
    ])
    expect(new Set(results.map((result) => result.dedupeKey)).size).toBe(2)
    s.close()
  })

  it('supports source-type filtering and caps huge limits deterministically', () => {
    const s = store()
    for (let i = 0; i < 80; i += 1) {
      s.indexChunk({ id: `chunk-${i}`, source: 'bulk', text: `bulk memory ${i}` })
    }
    expect(s.searchUnified({ query: 'memory', sourceTypes: ['continuity_event'] })).toEqual([])
    expect(s.searchUnified({ query: 'memory', limit: 1_000 }).length).toBeLessThanOrEqual(50)
    expect(s.searchUnified({ query: 'memory', limit: -1 }).length).toBeLessThanOrEqual(5)
    s.close()
  })

  it('returns no unified results for empty or malformed token queries', () => {
    const s = store()
    s.indexChunk({ id: 'a', source: 'source:a', text: 'memory' })
    expect(s.searchUnified({ query: '   ', limit: 10 })).toEqual([])
    expect(s.searchUnified({ query: '""""', limit: 10 })).toEqual([])
    s.close()
  })
})

describe('SessionMemoryStore operator helpers', () => {
  it('reports stats, dry-runs scoped purge, confirms scoped purge, and doctors the index', () => {
    const s = store()
    s.indexChunk({ id: 'a', source: 'web:a', text: 'operator memory one' })
    s.indexChunk({ id: 'b', source: 'web:b', text: 'operator memory two' })

    expect(s.stats()).toMatchObject({ chunkCount: 2, sourceCount: 2, sources: ['web:a', 'web:b'] })
    expect(s.purge({ source: 'web:a' })).toMatchObject({
      dryRun: true,
      matchedCount: 1,
      deletedCount: 0,
    })
    expect(s.count()).toBe(2)
    expect(s.purge({ source: 'web:a', confirm: true })).toMatchObject({
      dryRun: false,
      matchedCount: 1,
      deletedCount: 1,
    })
    expect(s.searchUnified({ query: 'one', source: 'web:a', limit: 1 })).toEqual([])
    expect(s.stats()).toMatchObject({ chunkCount: 1, sourceCount: 1, sources: ['web:b'] })
    expect(s.doctor()).toMatchObject({ ok: true, chunkCount: 1 })
    s.close()
  })
})
