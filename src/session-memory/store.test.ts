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
