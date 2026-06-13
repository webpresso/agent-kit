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

export interface SessionEvent {
  readonly eventId: string
  readonly ts: number
  readonly toolName: string
  readonly content: string
}

export interface CaptureEventInput {
  readonly repoHash: string
  readonly event: Pick<SessionEvent, 'toolName' | 'content'> & { sessionId?: string }
}

export interface SnapshotInput {
  readonly repoHash: string
  readonly capMs: number
  readonly sessionId?: string
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
  readonly sessionId?: string
  readonly snapshotId?: string
}

export interface RestoreResult {
  readonly hits: readonly SearchHit[]
  readonly snapshotId: string | null
}

export interface FetchIndexOptions {
  readonly url: string
  readonly dbPath: string
  readonly cacheTtlMs?: number
  readonly fetchImpl?: typeof fetch
}

export interface FetchIndexResult {
  readonly url: string
  readonly chunkCount: number
  readonly cached: boolean
  readonly cachedAt?: number
}

export interface NativeSessionMemoryUnavailableStatus {
  readonly status: 'unavailable'
}

export function isUnavailable(value: unknown): value is NativeSessionMemoryUnavailableStatus {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    (value as NativeSessionMemoryUnavailableStatus).status === 'unavailable'
  )
}
