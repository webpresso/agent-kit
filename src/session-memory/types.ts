/**
 * Session-memory type definitions for the ctx-rs delivery branch.
 *
 * Local module typings model the real ctx-rs API surface so this repo can
 * compile before the package's final delivery mechanism is wired up.
 */

export interface ChunkInsertInput {
  readonly content: string
  readonly source: string
}

export interface SearchHit {
  readonly content: string
  readonly source: string
  readonly rank: number
  readonly tier: 'porter' | 'trigram' | 'levenshtein'
}

export interface SearchOptions {
  readonly query: string
  readonly limit?: number
  readonly source?: string
}

export interface IndexStats {
  readonly chunkCount: number
  readonly sourceCount: number
}

export interface SessionEvent {
  readonly sessionId: string
  readonly eventId: string
  readonly ts: number
  readonly toolName: string
  readonly content: string
}

export interface CaptureEventInput {
  readonly repoHash: string
  readonly event: Omit<SessionEvent, 'eventId' | 'ts'>
}

export interface SnapshotInput {
  readonly repoHash: string
  /** Maximum time to spend consolidating, in ms */
  readonly capMs: number
}

export interface SnapshotResult {
  readonly snapshotId: string
  readonly eventsIncluded: number
  readonly partial: boolean
  readonly error?: string
}

export interface RestoreInput {
  readonly repoHash: string
  readonly query: string
  readonly limit?: number
}

export interface RestoreResult {
  readonly hits: readonly SearchHit[]
  readonly snapshotId: string | null
}

export interface FetchIndexOptions {
  readonly url: string
  readonly dbPath: string
  /** Reserved for future cache overrides once ctx-rs delivery is finalized. */
  readonly cacheTtlMs?: number
}

export interface FetchIndexResult {
  readonly url: string
  readonly chunkCount: number
  readonly cached: boolean
  readonly cachedAt?: number
}

/** Status returned by the ctx-rs wrapper when a native binding is unavailable. */
export interface UnavailableStatus {
  readonly status: 'unavailable'
}

export function isUnavailable(v: unknown): v is UnavailableStatus {
  return (
    typeof v === 'object' &&
    v !== null &&
    'status' in v &&
    (v as UnavailableStatus).status === 'unavailable'
  )
}
