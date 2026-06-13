import { mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { Database } from '#db/sqlite.js'

import { loadNativeSessionMemoryEngine } from './native-runtime.js'
import type {
  CaptureEventInput,
  RestoreInput,
  RestoreResult,
  SnapshotInput,
  SnapshotResult,
} from './types.js'

const SESSIONS_DIR = join(homedir(), '.webpresso', 'sessions')

export function resolveDbPath(repoHash: string, sessionsDir?: string): string {
  return join(sessionsDir ?? SESSIONS_DIR, `${repoHash}.db`)
}

function ensureDbParent(dbPath: string): void {
  mkdirSync(dirname(dbPath), { recursive: true })
}

function resolveActiveSessionId(): string {
  return process.env['WP_SESSION_ID'] ?? process.env['CLAUDE_SESSION_ID'] ?? 'unknown'
}

function sessionMemoryCaptureDisabled(): boolean {
  return process.env['WEBPRESSO_SESSION_MEMORY'] === '0'
}

function resolveLatestSnapshotId(
  dbPath: string,
  repoHash: string,
  sessionId: string,
): string | null {
  const db = new Database(dbPath)
  try {
    const scoped = db
      .prepare<[string, string], { snapshot_id: string }>(
        'SELECT snapshot_id FROM sessions WHERE repo_hash = ? AND agent_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
      )
      .get(repoHash, sessionId)
    if (scoped?.snapshot_id) return scoped.snapshot_id
    return null
  } finally {
    db.close()
  }
}

export function captureEvent(input: CaptureEventInput, sessionsDir?: string): boolean {
  if (sessionMemoryCaptureDisabled()) return false
  const dbPath = resolveDbPath(input.repoHash, sessionsDir)
  ensureDbParent(dbPath)
  const runtime = loadNativeSessionMemoryEngine()
  runtime.captureEvent(
    dbPath,
    input.repoHash,
    input.event.sessionId ?? resolveActiveSessionId(),
    randomUUID(),
    input.event.toolName,
    input.event.content,
  )
  return true
}

export function flushCapturedEvents(repoHash: string, sessionsDir?: string): number {
  const dbPath = resolveDbPath(repoHash, sessionsDir)
  ensureDbParent(dbPath)
  const runtime = loadNativeSessionMemoryEngine()
  return runtime.flushEventsForDb ? runtime.flushEventsForDb(dbPath) : runtime.flushEvents()
}

export async function snapshot(
  input: SnapshotInput,
  sessionsDir?: string,
): Promise<SnapshotResult> {
  const dbPath = resolveDbPath(input.repoHash, sessionsDir)
  ensureDbParent(dbPath)
  const result = loadNativeSessionMemoryEngine().snapshot(
    dbPath,
    input.repoHash,
    input.sessionId ?? resolveActiveSessionId(),
    input.capMs,
  )
  return {
    snapshotId: result.snapshotId,
    eventsIncluded: result.eventCount,
    partial: !result.complete,
  }
}

export function restore(input: RestoreInput, sessionsDir?: string): RestoreResult {
  const dbPath = resolveDbPath(input.repoHash, sessionsDir)
  ensureDbParent(dbPath)
  const sessionId = input.sessionId ?? resolveActiveSessionId()
  if (input.snapshotId) {
    const db = new Database(dbPath)
    try {
      const row = db
        .prepare<[string, string, string], { content_json: string }>(
          'SELECT content_json FROM sessions WHERE snapshot_id = ? AND repo_hash = ? AND agent_id = ? LIMIT 1',
        )
        .get(input.snapshotId, input.repoHash, sessionId)
      if (!row) return { hits: [], snapshotId: null }
      const parsed = JSON.parse(row.content_json) as
        | Array<{
            event_id?: string
            tool_name?: string
            content?: string
          }>
        | {
            events?: Array<{
              event_id?: string
              tool_name?: string
              content?: string
            }>
          }
      const events = Array.isArray(parsed) ? parsed : (parsed.events ?? [])
      const hits = events
        .map((event, index) => ({
          content: event.content ?? '',
          source: `session:${event.tool_name ?? 'unknown'}`,
          rank: index + 1,
          tier: 'levenshtein' as const,
        }))
        .filter((hit) => hit.content.length > 0)
        .slice(0, input.limit ?? 10)
      return { hits, snapshotId: input.snapshotId }
    } finally {
      db.close()
    }
  }
  const runtime = loadNativeSessionMemoryEngine()
  if (runtime.flushEventsForDb) runtime.flushEventsForDb(dbPath)
  else runtime.flushEvents()
  const eventHits = runtime
    .restore(dbPath, input.repoHash, sessionId, input.query, input.limit ?? 10)
    .map((event, index) => ({
      content: event.content,
      source: `session:${event.toolName}`,
      rank: index + 1,
      tier: 'levenshtein' as const,
    }))
  return {
    hits: eventHits,
    snapshotId: resolveLatestSnapshotId(dbPath, input.repoHash, sessionId),
  }
}
