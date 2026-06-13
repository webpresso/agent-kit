import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Database } from '#db/sqlite.js'

import { loadNativeSessionMemoryEngine } from './native-runtime.js'
import { captureEvent, resolveDbPath, restore, snapshot } from './session.js'
import { resetStoreCacheForTests } from './store.js'

const TEST_REPO_HASH = 'abc123def456abc1'
let tmpDir: string

const originalClaudeSessionId = process.env['CLAUDE_SESSION_ID']

beforeEach(() => {
  loadNativeSessionMemoryEngine()
  process.env['CLAUDE_SESSION_ID'] = 'session-A'
  tmpDir = mkdtempSync(join(tmpdir(), 'wp-native-session-test-'))
})

afterEach(() => {
  if (originalClaudeSessionId === undefined) delete process.env['CLAUDE_SESSION_ID']
  else process.env['CLAUDE_SESSION_ID'] = originalClaudeSessionId
  resetStoreCacheForTests()
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
})

describe('native session-memory session primitives', () => {
  it('resolves db paths by repo hash', () => {
    expect(resolveDbPath(TEST_REPO_HASH, tmpDir)).toBe(join(tmpDir, `${TEST_REPO_HASH}.db`))
  })

  it('captures events and creates snapshots', async () => {
    expect(
      captureEvent(
        {
          repoHash: TEST_REPO_HASH,
          event: {
            toolName: 'Edit',
            content: 'implemented native session memory store',
          },
        },
        tmpDir,
      ),
    ).toBe(true)

    const result = await snapshot({ repoHash: TEST_REPO_HASH, capMs: 5_000 }, tmpDir)
    expect(Boolean(result.snapshotId)).toBe(true)
    expect(result.eventsIncluded).toBeGreaterThanOrEqual(1)
    expect(result.partial).toBe(false)
  })

  it('restores hits and latest snapshot id', async () => {
    captureEvent(
      {
        repoHash: TEST_REPO_HASH,
        event: {
          toolName: 'Edit',
          content: 'restore this implementation detail from native session memory',
        },
      },
      tmpDir,
    )
    const snap = await snapshot({ repoHash: TEST_REPO_HASH, capMs: 5_000 }, tmpDir)
    const result = restore(
      { repoHash: TEST_REPO_HASH, query: 'implementation detail native session memory', limit: 10 },
      tmpDir,
    )
    expect(result.hits.length).toBeGreaterThan(0)
    expect(result.snapshotId).toBe(snap.snapshotId)
  })

  it('restore-by-snapshot stays repo-scoped and respects limit', async () => {
    for (let index = 0; index < 3; index += 1) {
      captureEvent(
        {
          repoHash: TEST_REPO_HASH,
          event: {
            toolName: 'Edit',
            content: `repo-a event ${index}`,
          },
        },
        tmpDir,
      )
    }
    const repoASnapshot = await snapshot({ repoHash: TEST_REPO_HASH, capMs: 5_000 }, tmpDir)

    const otherRepoHash = 'zzz999yyy888xxx7'
    for (let index = 0; index < 2; index += 1) {
      captureEvent(
        {
          repoHash: otherRepoHash,
          event: {
            toolName: 'Edit',
            content: `repo-b event ${index}`,
          },
        },
        tmpDir,
      )
    }
    await snapshot({ repoHash: otherRepoHash, capMs: 5_000 }, tmpDir)

    const result = restore(
      {
        repoHash: TEST_REPO_HASH,
        query: 'ignored for snapshot restore',
        snapshotId: repoASnapshot.snapshotId,
        limit: 2,
      },
      tmpDir,
    )

    expect(result.snapshotId).toBe(repoASnapshot.snapshotId)
    expect(result.hits).toHaveLength(2)
    expect(result.hits.every((hit) => hit.content.includes('repo-a'))).toBe(true)
  })

  it('restore-by-snapshot accepts legacy object-wrapped content_json payloads', () => {
    const dbPath = resolveDbPath(TEST_REPO_HASH, tmpDir)
    const db = new Database(dbPath)
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          agent_id TEXT NOT NULL,
          snapshot_id TEXT NOT NULL,
          repo_hash TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          status TEXT NOT NULL,
          content_json TEXT NOT NULL
        )
      `)
      db.prepare(
        'INSERT INTO sessions(agent_id, snapshot_id, repo_hash, created_at, status, content_json) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(
        'session-A',
        'legacy-snapshot',
        TEST_REPO_HASH,
        1_718_200_000,
        'complete',
        JSON.stringify({
          events: [
            { event_id: 'evt-1', tool_name: 'Edit', content: 'legacy snapshot event one' },
            { event_id: 'evt-2', tool_name: 'Read', content: 'legacy snapshot event two' },
          ],
        }),
      )
    } finally {
      db.close()
    }

    const result = restore(
      {
        repoHash: TEST_REPO_HASH,
        query: 'ignored for snapshot restore',
        snapshotId: 'legacy-snapshot',
        limit: 1,
      },
      tmpDir,
    )

    expect(result.snapshotId).toBe('legacy-snapshot')
    expect(result.hits).toHaveLength(1)
    expect(result.hits[0]?.content).toBe('legacy snapshot event one')
  })

  it('returns partial snapshots when the cap is exhausted', async () => {
    for (let index = 0; index < 20; index += 1) {
      captureEvent(
        {
          repoHash: TEST_REPO_HASH,
          event: {
            toolName: 'Bash',
            content: `event ${index} for the native engine`,
          },
        },
        tmpDir,
      )
    }
    const result = await snapshot({ repoHash: TEST_REPO_HASH, capMs: 0 }, tmpDir)
    expect(Boolean(result.snapshotId)).toBe(true)
    expect(typeof result.partial).toBe('boolean')

    const restored = restore(
      {
        repoHash: TEST_REPO_HASH,
        query: 'ignored for snapshot restore',
        snapshotId: result.snapshotId,
        limit: 100,
      },
      tmpDir,
    )

    expect(restored.hits.length).toBe(result.eventsIncluded)
    expect(result.eventsIncluded).toBeLessThanOrEqual(20)
  })
})
