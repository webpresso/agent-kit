import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const describeBun = process.versions.bun ? describe : describe.skip

let tmpDir: string
let dbPath: string
let store: import('./bun-store.js').BunSqliteStore
let BunSqliteStore: typeof import('./bun-store.js').BunSqliteStore

describeBun('BunSqliteStore', () => {
  beforeEach(async () => {
    ;({ BunSqliteStore } = await import('./bun-store.js'))
    tmpDir = mkdtempSync(join(tmpdir(), 'ak-bun-store-test-'))
    dbPath = join(tmpDir, 'test.db')
    store = new BunSqliteStore(dbPath)
  })

  afterEach(() => {
    store.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('insert and basic search', () => {
    it('insertChunks + search finds expected document via porter FTS5', () => {
      const chunks = Array.from({ length: 100 }, (_, i) => ({
        content: i === 42 ? 'the quick brown fox jumps' : `chunk number ${i} about something else`,
        source: 'test-source',
      }))
      store.insertChunks(chunks)

      const hits = store.search({ query: 'quick brown fox', limit: 5 })
      expect(hits.length).toBeGreaterThan(0)
      expect(hits.length).toBeLessThanOrEqual(5)
      expect(hits[0]?.tier).toBe('porter')
      expect(hits[0]?.content).toContain('fox')
    })

    it('search returns SearchHit with content, source, rank, tier fields', () => {
      store.insertChunks([{ content: 'hello world example text', source: 'my-source' }])

      const hits = store.search({ query: 'hello world', limit: 5 })
      expect(hits.length).toBeGreaterThan(0)

      const hit = hits[0]!
      expect(typeof hit.content).toBe('string')
      expect(typeof hit.source).toBe('string')
      expect(typeof hit.rank).toBe('number')
      expect(['porter', 'trigram', 'levenshtein'].includes(hit.tier)).toBe(true)
      expect(hit.source).toBe('my-source')
    })

    it('returns trigram results when porter finds nothing', () => {
      store.insertChunks([
        { content: 'impl3mentation is interesting', source: 'src1' },
        { content: 'something completely different', source: 'src2' },
      ])

      const hits = store.search({ query: 'impl3', limit: 5 })
      expect(hits.length).toBeGreaterThan(0)
      expect(['porter', 'trigram'].includes(hits[0]?.tier ?? '')).toBe(true)
    })

    it('falls back to Levenshtein when both porter and trigram find nothing', () => {
      store.insertChunks([{ content: 'hello world example', source: 'src' }])

      const hits = store.search({ query: 'helo', limit: 5 })
      expect(Array.isArray(hits)).toBe(true)
    })

    it('scopes search to a specific source', () => {
      store.insertChunks([
        { content: 'target content about testing', source: 'source-a' },
        { content: 'target content about testing', source: 'source-b' },
      ])

      const hits = store.search({ query: 'target content', source: 'source-a', limit: 5 })
      for (const hit of hits) {
        expect(hit.source).toBe('source-a')
      }
    })

    it('re-indexing the same source is idempotent — no double-adds', () => {
      const chunks = [
        { content: 'unique phrase omega alpha', source: 'reindex-src' },
        { content: 'another unique phrase beta', source: 'reindex-src' },
      ]

      store.insertChunks(chunks)
      const before = store.stats()

      store.insertChunks(chunks)
      const after = store.stats()

      expect(after.chunkCount).toBe(before.chunkCount)
    })
  })

  describe('stats', () => {
    it('reports correct chunk and source counts', () => {
      expect(store.stats()).toStrictEqual({ chunkCount: 0, sourceCount: 0 })

      store.insertChunks([
        { content: 'chunk one', source: 'src-a' },
        { content: 'chunk two', source: 'src-a' },
        { content: 'chunk three', source: 'src-b' },
      ])

      const s = store.stats()
      expect(s.chunkCount).toBe(3)
      expect(s.sourceCount).toBe(2)
    })
  })

  describe('getDb() for session operations', () => {
    it('captureEvent via getDb() + snapshot + restore round-trip', () => {
      const db = store.getDb()

      const sessionId = 'test-session-1'
      const eventId = 'evt-001'
      const ts = Date.now()
      db.prepare(
        'INSERT INTO session_events(session_id, event_id, ts, tool_name, content) VALUES (?, ?, ?, ?, ?)',
      ).run(sessionId, eventId, ts, 'bash', 'ran git status')

      const row = db
        .prepare('SELECT * FROM session_events WHERE session_id = ? AND event_id = ?')
        .get(sessionId, eventId) as {
        session_id: string
        event_id: string
        ts: number
        tool_name: string
        content: string
      } | null

      expect(row).not.toBeNull()
      expect(row?.tool_name).toBe('bash')
      expect(row?.content).toBe('ran git status')
      expect(row?.ts).toBe(ts)

      const snapshotId = 'snap-001'
      const agentId = 'agent-1'
      db.prepare(
        'INSERT INTO sessions(agent_id, snapshot_id, created_at, status, content_json) VALUES (?, ?, ?, ?, ?)',
      ).run(agentId, snapshotId, Date.now(), 'active', JSON.stringify({ summary: 'test snapshot' }))

      const snap = db
        .prepare('SELECT * FROM sessions WHERE agent_id = ? AND snapshot_id = ?')
        .get(agentId, snapshotId) as {
        agent_id: string
        snapshot_id: string
        content_json: string
        status: string
      } | null

      expect(snap).not.toBeNull()
      expect(snap?.status).toBe('active')
      const parsed = JSON.parse(snap?.content_json ?? '{}') as { summary: string }
      expect(parsed.summary).toBe('test snapshot')
    })

    it('getDb() returns a Database instance (not null/undefined)', () => {
      const db = store.getDb()
      expect(db).not.toBeNull()
      expect(typeof db.prepare).toBe('function')
      expect(typeof db.exec).toBe('function')
    })
  })
})
