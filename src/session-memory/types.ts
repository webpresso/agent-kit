/**
 * Session-memory type definitions.
 *
 * Forward-compatible with both v1 (better-sqlite3 TS engine) and
 * v2 (ctx-rs Rust engine via napi-rs FFI).
 * Migration v1→v2 is "swap engine binary, keep .db file" — invisible to consumers.
 */

// ── Store types ──────────────────────────────────────────────────────────────

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

// ── Session event types ──────────────────────────────────────────────────────

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

// ── Fetch-index types ────────────────────────────────────────────────────────

export interface FetchIndexOptions {
  readonly url: string
  readonly dbPath: string
  /** Override cache TTL in ms (for testing) */
  readonly cacheTtlMs?: number
}

export interface FetchIndexResult {
  readonly url: string
  readonly chunkCount: number
  readonly cached: boolean
  readonly cachedAt?: number
}

// ── Backend selector ─────────────────────────────────────────────────────────

/** Engine backends. ctx-rs is the default in v2. */
export type SessionEngineBackend = 'ctx-rs' | 'ts'

/** Status returned when ctx-rs prebuilt is missing and AK_DISABLE_CTX=1. */
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
