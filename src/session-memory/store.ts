/**
 * SQLite FTS5 store for session memory — ctx-rs backend only.
 *
 * Search remains three-tier at the engine layer (porter → trigram →
 * IDF-weighted Levenshtein), but this branch does not ship a TS fallback.
 */
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import { loadCtxRsSync } from './backend.js'
import type { CtxRsBinding } from './ctx-rs-runtime.js'
import type { ChunkInsertInput, SearchHit, SearchOptions } from './types.js'
import { isUnavailable } from './types.js'

const DEFAULT_LIMIT = 5

export interface SessionStore {
  insertChunks(chunks: readonly ChunkInsertInput[]): void
  search(opts: SearchOptions): readonly SearchHit[]
  getDbPath(): string
}

class CtxRsStore implements SessionStore {
  private readonly dbPath: string
  private readonly ctxRs: CtxRsBinding

  constructor(dbPath: string, ctxRs: CtxRsBinding) {
    mkdirSync(dirname(dbPath), { recursive: true })
    this.dbPath = dbPath
    this.ctxRs = ctxRs
  }

  insertChunks(chunks: readonly ChunkInsertInput[]): void {
    for (const chunk of chunks) {
      const result = this.ctxRs.index(this.dbPath, chunk.source, chunk.content, false)
      if (isUnavailable(result)) {
        throw new Error(`ctx-rs unavailable while indexing ${chunk.source}`)
      }
    }
  }

  search(opts: SearchOptions): readonly SearchHit[] {
    const result = this.ctxRs.search(
      this.dbPath,
      opts.query,
      opts.limit ?? DEFAULT_LIMIT,
      opts.source ?? null,
    )
    if (isUnavailable(result)) {
      throw new Error('ctx-rs unavailable during search')
    }
    return (result as Array<{ content: string; source: string; rank: number }>).map((hit) => ({
      content: hit.content,
      source: hit.source,
      rank: hit.rank,
      tier: 'porter' as const,
    }))
  }

  getDbPath(): string {
    return this.dbPath
  }
}

const storeCache = new Map<string, SessionStore>()

export function clearStoreCache(): void {
  storeCache.clear()
}

export function getStore(dbPath: string): SessionStore {
  const cached = storeCache.get(dbPath)
  if (cached !== undefined) return cached

  const store = new CtxRsStore(dbPath, loadCtxRsSync())
  storeCache.set(dbPath, store)
  return store
}
