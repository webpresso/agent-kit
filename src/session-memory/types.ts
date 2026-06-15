export interface SessionMemoryChunk {
  id: string
  source: string
  text: string
  metadata?: Record<string, unknown>
  createdAt?: string
}

export interface IndexedSessionMemoryChunk extends Required<Omit<SessionMemoryChunk, 'metadata'>> {
  metadata: Record<string, unknown>
}

export interface SessionMemorySearchOptions {
  query: string
  source?: string
  limit?: number
  maxPreviewBytes?: number
  sourceTypes?: readonly SessionMemoryUnifiedSourceType[]
}

export interface SessionMemorySearchResult extends IndexedSessionMemoryChunk {
  score: number
  tier: 'porter' | 'trigram' | 'levenshtein'
}

export const SESSION_CONTINUITY_EVENT_TYPES = [
  'user_prompt',
  'decision',
  'constraint',
  'tool_read',
  'tool_edit',
  'tool_command',
  'failure',
  'rejected_approach',
  'assistant_turn_summary',
  'compaction_boundary',
  'rule_snapshot',
] as const

export type SessionContinuityEventType = (typeof SESSION_CONTINUITY_EVENT_TYPES)[number]

export interface SessionEventInput {
  eventId?: string
  ts?: string
  eventType: SessionContinuityEventType
  toolName: string
  content: string
  summary?: string
  priority?: number
  metadata?: Record<string, unknown>
}

export interface SessionCaptureInput {
  repoHash: string
  agentId?: string
  sessionId?: string
  event: SessionEventInput
}

export interface SnapshotInput {
  repoHash: string
  sessionId?: string
  agentId?: string
  capMs?: number
  minPriority?: number
  maxEventBytes?: number
  maxSnapshotBytes?: number
}

export interface SnapshotResult {
  snapshotId: string
  sessionId: string
  status: 'complete' | 'partial'
  eventCount: number
  content: string
  readonly eventsIncluded?: number
  readonly partial?: boolean
  readonly error?: string
}

export interface RestoreInput {
  repoHash: string
  query: string
  limit?: number
  maxPreviewBytes?: number
  sourceTypes?: readonly SessionMemoryUnifiedSourceType[]
  readonly sessionId?: string
  readonly snapshotId?: string
}

export interface RestoredSessionEvent {
  sessionId: string
  eventId: string
  ts: string
  eventType: SessionContinuityEventType
  toolName: string
  content: string
  summary?: string
  priority: number
  metadata: Record<string, unknown>
  score: number
}

export type SessionMemoryUnifiedSourceType = 'continuity_event' | 'indexed_chunk'

export type SessionMemoryUnifiedTier =
  | 'event_fts'
  | 'chunk_porter'
  | 'chunk_trigram'
  | 'chunk_levenshtein'

export interface SessionMemoryUnifiedProvenance {
  kind: SessionMemoryUnifiedSourceType
  id: string
  source?: string
  repoHash?: string
  sessionId?: string
  eventId?: string
}

export interface SessionMemoryUnifiedResult {
  sourceType: SessionMemoryUnifiedSourceType
  provenance: SessionMemoryUnifiedProvenance
  dedupeKey: string
  score: number
  tier: SessionMemoryUnifiedTier
  timestamp: string
  preview: string
  metadata: Record<string, unknown>
}

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

export interface FetchIndexOptions {
  readonly url: string
  readonly dbPath: string
  readonly cacheTtlMs?: number
}

export interface FetchIndexResult {
  readonly url: string
  readonly chunkCount: number
  readonly cached: boolean
  readonly cachedAt?: number
}
