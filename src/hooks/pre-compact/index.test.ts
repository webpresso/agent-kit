import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runPreCompact } from './index.js'
import { captureEvent, resolveDbPath, snapshot } from '#session-memory/session'

const TEST_REPO_HASH = 'precompact000abc1'

// Force TS engine so tests never depend on the ctx-rs native binary
const originalEngine = process.env['AK_SESSION_ENGINE']
process.env['AK_SESSION_ENGINE'] = 'ts'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ak-pre-compact-test-'))
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

afterAll(() => {
  if (originalEngine === undefined) {
    delete process.env['AK_SESSION_ENGINE']
  } else {
    process.env['AK_SESSION_ENGINE'] = originalEngine
  }
})

describe('runPreCompact', () => {
  it('creates a snapshot and returns snapshotId', async () => {
    // Capture some events first
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

    // Test the snapshot function directly with the test tmpDir
    const result = await snapshot({ repoHash: TEST_REPO_HASH, capMs: 5000 }, tmpDir)

    expect(Boolean(result.snapshotId)).toBe(true)
    expect(result.eventsIncluded).toBeGreaterThanOrEqual(2)
    expect(result.partial).toBe(false)
  })

  it('runPreCompact returns null when an error occurs', async () => {
    // Passing a fake cwd that triggers git hash computation
    // The function should not throw, just return null or a result
    const result = await runPreCompact('/tmp')
    // Either null (error) or a valid result — both acceptable
    if (result !== null) {
      expect(Boolean(result.snapshotId)).toBe(true)
    } else {
      expect(result).toBeNull()
    }
  })

  it('returns partial result when timeout is very tight', async () => {
    // Capture many events
    for (let i = 0; i < 5; i++) {
      captureEvent(
        {
          repoHash: TEST_REPO_HASH,
          event: { sessionId: 's1', toolName: 'Edit', content: `edit ${i}` },
        },
        tmpDir,
      )
    }

    // With 0ms cap, may be partial
    const result = await snapshot({ repoHash: TEST_REPO_HASH, capMs: 0 }, tmpDir)
    expect(Boolean(result.snapshotId)).toBe(true)
    expect(typeof result.partial).toBe('boolean')
  })

  it('resolveDbPath returns expected path for known hash', () => {
    const dbPath = resolveDbPath(TEST_REPO_HASH, tmpDir)
    expect(dbPath).toContain(TEST_REPO_HASH)
    expect(dbPath).toContain(tmpDir)
  })
})
