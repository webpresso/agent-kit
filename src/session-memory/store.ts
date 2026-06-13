import { loadNativeSessionMemoryEngine } from './native-runtime.js'
import type { ChunkInsertInput, SearchHit, SearchOptions } from './types.js'

const DEFAULT_LIMIT = 5

export interface SessionStore {
  insertChunks(chunks: readonly ChunkInsertInput[]): void
  search(options: SearchOptions): readonly SearchHit[]
  getDbPath(): string
}

class NativeSessionStore implements SessionStore {
  constructor(private readonly dbPath: string) {}

  insertChunks(chunks: readonly ChunkInsertInput[]): void {
    const runtime = loadNativeSessionMemoryEngine()
    const grouped = new Map<string, string[]>()
    for (const chunk of chunks) {
      const list = grouped.get(chunk.source) ?? []
      list.push(chunk.content)
      grouped.set(chunk.source, list)
    }
    for (const [source, parts] of grouped) {
      runtime.index(this.dbPath, source, parts.join('\n\n'), false)
    }
  }

  search(options: SearchOptions): readonly SearchHit[] {
    const runtime = loadNativeSessionMemoryEngine()
    if (options.query.trim().length === 0) return []
    return runtime
      .search(this.dbPath, options.query, options.limit ?? DEFAULT_LIMIT, options.source ?? null)
      .map((hit) => ({
        content: hit.content,
        source: hit.source,
        rank: hit.rank,
        tier: hit.tier === 'trigram' || hit.tier === 'levenshtein' ? hit.tier : 'porter',
      }))
  }

  getDbPath(): string {
    return this.dbPath
  }
}

const storeCache = new Map<string, SessionStore>()

export function getStore(dbPath: string): SessionStore {
  const cached = storeCache.get(dbPath)
  if (cached !== undefined) return cached
  const store = new NativeSessionStore(dbPath)
  storeCache.set(dbPath, store)
  return store
}

export function resetStoreCacheForTests(): void {
  storeCache.clear()
}
