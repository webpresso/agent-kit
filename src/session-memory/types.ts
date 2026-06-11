/**
 * Session-memory type definitions.
 *
 * Forward-compatible with v2 ctx-rs (Rust) engine.
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

export interface FetchIndexResult {
  readonly url: string
  readonly chunkCount: number
  readonly cached: boolean
  readonly cachedAt?: number
}
