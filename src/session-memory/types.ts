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
}

export interface SessionMemorySearchResult extends IndexedSessionMemoryChunk {
  score: number
  tier: 'porter' | 'trigram' | 'levenshtein'
}

export interface SessionEventInput {
  eventId?: string
  ts?: string
  toolName: string
  content: string
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
}

export interface SnapshotResult {
  snapshotId: string
  sessionId: string
  status: 'complete' | 'partial'
  eventCount: number
  content: string
}

export interface RestoreInput {
  repoHash: string
  query: string
  limit?: number
}

export interface RestoredSessionEvent {
  sessionId: string
  eventId: string
  ts: string
  toolName: string
  content: string
  score: number
}
