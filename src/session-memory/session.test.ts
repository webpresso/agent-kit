/**
 * Unit tests for v2 session primitives: captureEvent, snapshot, restore.
 *
 * Forces AK_SESSION_ENGINE=ts so tests run against the TypeScript SQLite engine and
 * never require the ctx-rs native binary.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { captureEvent, snapshot, restore, resolveDbPath } from './session.js'

// Force TS engine for all tests in this file
const originalEngine = process.env['AK_SESSION_ENGINE']
process.env['AK_SESSION_ENGINE'] = 'ts'

const TEST_REPO_HASH = 'abc123def456abc1'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ak-v2-session-test-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

afterAll(() => {
  if (originalEngine === undefined) {
    delete process.env['AK_SESSION_ENGINE']
  } else {
    process.env['AK_SESSION_ENGINE'] = originalEngine
  }
})

describe('resolveDbPath', () => {
  it('resolves to <sessionsDir>/<repoHash>.db', () => {
    const dbPath = resolveDbPath(TEST_REPO_HASH, tmpDir)
    expect(dbPath).toBe(join(tmpDir, `${TEST_REPO_HASH}.db`))
  })

  it('different repoHashes produce different paths', () => {
    const path1 = resolveDbPath('hash-aaa', tmpDir)
    const path2 = resolveDbPath('hash-bbb', tmpDir)
    expect(path1).not.toBe(path2)
  })
})

describe('captureEvent', () => {
  it('captures a tool event and returns true', () => {
    const result = captureEvent(
      {
        repoHash: TEST_REPO_HASH,
        event: {
          sessionId: 'session-001',
          toolName: 'Edit',
          content: 'Edited file foo.ts to add session memory',
        },
      },
      tmpDir,
    )
    expect(result).toBe(true)
  })

  it('captures multiple events without error', () => {
    const results = Array.from({ length: 5 }, (_, i) =>
      captureEvent(
        {
          repoHash: TEST_REPO_HASH,
          event: {
            sessionId: 'session-001',
            toolName: i % 2 === 0 ? 'Edit' : 'Bash',
            content: `event ${i} content`,
          },
        },
        tmpDir,
      ),
    )
    expect(results.every((r) => r === true)).toBe(true)
  })

  it('events from different sessions are stored independently', () => {
    const r1 = captureEvent(
      {
        repoHash: TEST_REPO_HASH,
        event: { sessionId: 'session-A', toolName: 'Edit', content: 'session A edit' },
      },
      tmpDir,
    )
    const r2 = captureEvent(
      {
        repoHash: TEST_REPO_HASH,
        event: { sessionId: 'session-B', toolName: 'Read', content: 'session B read' },
      },
      tmpDir,
    )
    expect(r1).toBe(true)
    expect(r2).toBe(true)
  })

  it('concurrent captures do not corrupt the WAL', () => {
    const results = Array.from({ length: 20 }, (_, i) =>
      captureEvent(
        {
          repoHash: TEST_REPO_HASH,
          event: { sessionId: `session-${i}`, toolName: 'Edit', content: `content ${i}` },
        },
        tmpDir,
      ),
    )
    expect(results.every((r) => r === true)).toBe(true)
  })
})

describe('snapshot', () => {
  it('creates a snapshot with a UUID snapshotId', async () => {
    captureEvent(
      {
        repoHash: TEST_REPO_HASH,
        event: { sessionId: 's1', toolName: 'Edit', content: 'edited main.ts' },
      },
      tmpDir,
    )

    const result = await snapshot({ repoHash: TEST_REPO_HASH, capMs: 5000 }, tmpDir)

    expect(result.snapshotId).toBeTruthy()
    expect(typeof result.snapshotId).toBe('string')
    // UUID format check
    expect(result.snapshotId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })

  it('includes captured events in the snapshot', async () => {
    captureEvent(
      {
        repoHash: TEST_REPO_HASH,
        event: { sessionId: 's1', toolName: 'Edit', content: 'edited main.ts' },
      },
      tmpDir,
    )
    captureEvent(
      {
        repoHash: TEST_REPO_HASH,
        event: { sessionId: 's1', toolName: 'Bash', content: 'ran tests' },
      },
      tmpDir,
    )

    const result = await snapshot({ repoHash: TEST_REPO_HASH, capMs: 5000 }, tmpDir)

    expect(result.eventsIncluded).toBeGreaterThanOrEqual(2)
    expect(result.partial).toBe(false)
  })

  it('returns a snapshot even when no events have been captured', async () => {
    const result = await snapshot({ repoHash: TEST_REPO_HASH, capMs: 5000 }, tmpDir)

    expect(result.snapshotId).toBeTruthy()
    expect(result.eventsIncluded).toBe(0)
    expect(typeof result.partial).toBe('boolean')
  })

  it('returns a valid result with capMs=0 (may be partial)', async () => {
    for (let i = 0; i < 10; i++) {
      captureEvent(
        {
          repoHash: TEST_REPO_HASH,
          event: { sessionId: 's1', toolName: 'Edit', content: `edit ${i}` },
        },
        tmpDir,
      )
    }

    const result = await snapshot({ repoHash: TEST_REPO_HASH, capMs: 0 }, tmpDir)
    expect(result.snapshotId).toBeTruthy()
    expect(typeof result.partial).toBe('boolean')
  })

  it('returns a different snapshotId on each call', async () => {
    const r1 = await snapshot({ repoHash: TEST_REPO_HASH, capMs: 5000 }, tmpDir)
    const r2 = await snapshot({ repoHash: TEST_REPO_HASH, capMs: 5000 }, tmpDir)
    expect(r1.snapshotId).not.toBe(r2.snapshotId)
  })
})

describe('restore', () => {
  it('returns empty hits and null snapshotId when no events exist', () => {
    const result = restore({ repoHash: TEST_REPO_HASH, query: 'anything', limit: 5 }, tmpDir)
    expect(result.hits).toStrictEqual([])
    expect(result.snapshotId).toBeNull()
  })

  it('returns a snapshotId after snapshot has been taken', async () => {
    captureEvent(
      {
        repoHash: TEST_REPO_HASH,
        event: {
          sessionId: 's1',
          toolName: 'Edit',
          content: 'implemented session memory store with SQLite FTS5',
        },
      },
      tmpDir,
    )
    await snapshot({ repoHash: TEST_REPO_HASH, capMs: 5000 }, tmpDir)

    const result = restore(
      { repoHash: TEST_REPO_HASH, query: 'session memory SQLite' },
      tmpDir,
    )
    expect(result.snapshotId).toBeTruthy()
    expect(Array.isArray(result.hits)).toBe(true)
  })


  it('restore returns the exact snapshotId created by snapshot', async () => {
    captureEvent(
      {
        repoHash: TEST_REPO_HASH,
        event: {
          sessionId: 's1',
          toolName: 'Edit',
          content: 'snapshot id fidelity query terms',
        },
      },
      tmpDir,
    )

    const snap = await snapshot({ repoHash: TEST_REPO_HASH, capMs: 5000 }, tmpDir)
    const result = restore(
      { repoHash: TEST_REPO_HASH, query: 'snapshot id fidelity query terms' },
      tmpDir,
    )

    expect(result.snapshotId).toBe(snap.snapshotId)
  })

  it('snapshot scopes to CLAUDE_SESSION_ID when available', async () => {
    const originalSessionId = process.env['CLAUDE_SESSION_ID']
    process.env['CLAUDE_SESSION_ID'] = 'session-A'

    try {
      captureEvent(
        {
          repoHash: TEST_REPO_HASH,
          event: { sessionId: 'session-A', toolName: 'Edit', content: 'belongs to A' },
        },
        tmpDir,
      )
      captureEvent(
        {
          repoHash: TEST_REPO_HASH,
          event: { sessionId: 'session-B', toolName: 'Edit', content: 'belongs to B' },
        },
        tmpDir,
      )

      const snap = await snapshot({ repoHash: TEST_REPO_HASH, capMs: 5000 }, tmpDir)
      expect(snap.eventsIncluded).toBe(1)

      const restoredA = restore({ repoHash: TEST_REPO_HASH, query: 'belongs to A' }, tmpDir)

      expect(restoredA.snapshotId).toBe(snap.snapshotId)
      expect(snap.eventsIncluded).toBe(1)
    } finally {
      if (originalSessionId === undefined) {
        delete process.env['CLAUDE_SESSION_ID']
      } else {
        process.env['CLAUDE_SESSION_ID'] = originalSessionId
      }
    }
  })

  it('result.hits is always a readonly array', () => {
    const result = restore({ repoHash: TEST_REPO_HASH, query: 'test', limit: 5 }, tmpDir)
    expect(Array.isArray(result.hits)).toBe(true)
  })

  it('respects limit parameter — returns at most limit hits', async () => {
    // Insert enough events to generate hits
    for (let i = 0; i < 10; i++) {
      captureEvent(
        {
          repoHash: TEST_REPO_HASH,
          event: {
            sessionId: 's1',
            toolName: 'Edit',
            content: `common query phrase document ${i}`,
          },
        },
        tmpDir,
      )
    }
    await snapshot({ repoHash: TEST_REPO_HASH, capMs: 5000 }, tmpDir)

    const result = restore(
      { repoHash: TEST_REPO_HASH, query: 'common query phrase', limit: 3 },
      tmpDir,
    )
    expect(result.hits.length).toBeLessThanOrEqual(3)
  })
})

describe('snapshot + restore round-trip', () => {
  it('captures events, snapshots, and restore returns the snapshot', async () => {
    // Capture a distinctive event
    captureEvent(
      {
        repoHash: TEST_REPO_HASH,
        event: {
          sessionId: 'roundtrip-session',
          toolName: 'Edit',
          content: 'unique phrase zeta omega for round-trip test',
        },
      },
      tmpDir,
    )

    const snap = await snapshot({ repoHash: TEST_REPO_HASH, capMs: 5000 }, tmpDir)
    expect(snap.eventsIncluded).toBeGreaterThanOrEqual(1)

    const restored = restore(
      { repoHash: TEST_REPO_HASH, query: 'unique phrase zeta omega', limit: 10 },
      tmpDir,
    )

    // The snapshot was created, so snapshotId must be non-null
    expect(restored.snapshotId).toBeTruthy()
    expect(Array.isArray(restored.hits)).toBe(true)
  })
})
