/**
 * Tests for the auto-update error logger.
 *
 * Lane A's `getSurfacePath` is mocked here — tests should not depend on the
 * Lane A implementation landing first. Each test redirects the resolved log
 * file into a per-test tmp dir.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock Lane A's state-root surface before importing the SUT.
vi.mock('#paths/state-root.js', () => ({
  getSurfacePath: vi.fn(),
}))

import { getSurfacePath } from '#paths/state-root.js'
import {
  buildEntry,
  formatLine,
  logUpdateError,
  MAX_LINES,
  ROTATE_KEEP,
  STACK_TRUNCATE,
  rotateLines,
} from './log.js'

const getSurfacePathMock = vi.mocked(getSurfacePath)

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'wp-auto-update-log-'))
  getSurfacePathMock.mockReset()
  getSurfacePathMock.mockImplementation((name: string, scope: 'repo' | 'worktree' | 'user') => {
    if (scope !== 'user') throw new Error(`unexpected scope ${scope}`)
    return join(tmpDir, name)
  })
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('buildEntry', () => {
  it('produces a level=error entry with message + truncated stack for an Error', () => {
    const longStack = 'a'.repeat(STACK_TRUNCATE + 200)
    const err = new Error('boom')
    err.stack = longStack
    const now = new Date('2026-05-12T10:00:00.000Z')

    const entry = buildEntry(err, now)

    expect(entry.ts).toStrictEqual('2026-05-12T10:00:00.000Z')
    expect(entry.level).toStrictEqual('error')
    expect(entry.message).toStrictEqual('boom')
    expect(entry.stack).toStrictEqual('a'.repeat(STACK_TRUNCATE))
  })

  it('omits stack when Error.stack is undefined', () => {
    const err = new Error('no-stack')
    err.stack = undefined
    const entry = buildEntry(err, new Date('2026-05-12T00:00:00.000Z'))
    expect(entry.stack).toBeUndefined()
    expect(entry.message).toStrictEqual('no-stack')
  })

  it('treats a string throw as an error message', () => {
    const entry = buildEntry('text-only', new Date('2026-05-12T00:00:00.000Z'))
    expect(entry.message).toStrictEqual('text-only')
    expect(entry.stack).toBeUndefined()
  })

  it('serializes non-Error non-string throws as JSON', () => {
    const entry = buildEntry({ code: 'ENOENT', path: '/x' }, new Date('2026-05-12T00:00:00.000Z'))
    expect(entry.message).toStrictEqual('{"code":"ENOENT","path":"/x"}')
  })

  it('falls back to String() when the throw is not JSON-serializable', () => {
    const circular: { self?: unknown } = {}
    circular.self = circular
    const entry = buildEntry(circular, new Date('2026-05-12T00:00:00.000Z'))
    expect(entry.message).toStrictEqual('[object Object]')
  })
})

describe('formatLine', () => {
  it('returns one JSON object per line terminated by \\n', () => {
    const line = formatLine({
      ts: '2026-05-12T00:00:00.000Z',
      level: 'error',
      message: 'x',
    })
    expect(line.endsWith('\n')).toStrictEqual(true)
    expect(line.split('\n').length).toStrictEqual(2)
    const parsed: unknown = JSON.parse(line.trim())
    expect(parsed).toStrictEqual({
      ts: '2026-05-12T00:00:00.000Z',
      level: 'error',
      message: 'x',
    })
  })
})

describe('rotateLines', () => {
  it('returns input untouched when under MAX_LINES', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `${i}`)
    expect(rotateLines(lines)).toStrictEqual(lines)
  })

  it('returns input untouched at exactly MAX_LINES', () => {
    const lines = Array.from({ length: MAX_LINES }, (_, i) => `${i}`)
    expect(rotateLines(lines).length).toStrictEqual(MAX_LINES)
  })

  it('keeps last ROTATE_KEEP lines when above MAX_LINES', () => {
    const lines = Array.from({ length: MAX_LINES + 50 }, (_, i) => `${i}`)
    const out = rotateLines(lines)
    expect(out.length).toStrictEqual(ROTATE_KEEP)
    expect(out[0]).toStrictEqual(`${MAX_LINES + 50 - ROTATE_KEEP}`)
    expect(out[ROTATE_KEEP - 1]).toStrictEqual(`${MAX_LINES + 50 - 1}`)
  })
})

describe('logUpdateError', () => {
  it('appends a JSON line to <state-root>/auto-update.log for an Error', () => {
    logUpdateError(new Error('test-failure'))

    const logFile = join(tmpDir, 'auto-update.log')
    expect(existsSync(logFile)).toStrictEqual(true)
    const content = readFileSync(logFile, 'utf-8')
    const lines = content.split('\n').filter((line) => line.length > 0)
    expect(lines).toHaveLength(1)
    const entry: unknown = JSON.parse(lines[0]!)
    expect(entry).toMatchObject({
      level: 'error',
      message: 'test-failure',
    })
  })

  it('appends successive entries on separate lines', () => {
    logUpdateError(new Error('first'))
    logUpdateError(new Error('second'))
    logUpdateError(new Error('third'))

    const content = readFileSync(join(tmpDir, 'auto-update.log'), 'utf-8')
    const lines = content.split('\n').filter((line) => line.length > 0)
    expect(lines).toHaveLength(3)
    const messages = lines.map((line) => (JSON.parse(line) as LogEntryShape).message)
    expect(messages).toStrictEqual(['first', 'second', 'third'])
  })

  it('creates the parent directory if missing', () => {
    const nested = join(tmpDir, 'a', 'b', 'c')
    getSurfacePathMock.mockReturnValue(join(nested, 'auto-update.log'))

    logUpdateError(new Error('nested-dir'))

    expect(existsSync(join(nested, 'auto-update.log'))).toStrictEqual(true)
  })

  it('rotates the file when it exceeds MAX_LINES, keeping the last ROTATE_KEEP', () => {
    const logFile = join(tmpDir, 'auto-update.log')
    // Seed the file with MAX_LINES existing entries.
    const seedLines: string[] = []
    for (let i = 0; i < MAX_LINES; i++) {
      seedLines.push(JSON.stringify({ ts: 'x', level: 'error', message: `seed-${i}` }))
    }
    writeFileSync(logFile, `${seedLines.join('\n')}\n`)

    // Append one more entry — pushes to MAX_LINES + 1 → rotate triggers.
    logUpdateError(new Error('post-rotate'))

    const content = readFileSync(logFile, 'utf-8')
    const lines = content.split('\n').filter((line) => line.length > 0)
    expect(lines.length).toStrictEqual(ROTATE_KEEP)
    // The most recent entry must be the one that triggered rotation.
    const last = JSON.parse(lines[lines.length - 1]!) as LogEntryShape
    expect(last.message).toStrictEqual('post-rotate')
  })

  it('does not rotate when at or below MAX_LINES', () => {
    const logFile = join(tmpDir, 'auto-update.log')
    const seedLines: string[] = []
    for (let i = 0; i < MAX_LINES - 1; i++) {
      seedLines.push(JSON.stringify({ ts: 'x', level: 'error', message: `seed-${i}` }))
    }
    writeFileSync(logFile, `${seedLines.join('\n')}\n`)
    const sizeBefore = statSync(logFile).size

    logUpdateError(new Error('single-add'))

    const content = readFileSync(logFile, 'utf-8')
    const lines = content.split('\n').filter((line) => line.length > 0)
    expect(lines.length).toStrictEqual(MAX_LINES)
    expect(statSync(logFile).size > sizeBefore).toStrictEqual(true)
  })

  it('swallows all errors and never throws (mkdirSync failure path)', () => {
    getSurfacePathMock.mockImplementation(() => {
      throw new Error('state root unavailable')
    })

    // Must not throw even when path resolution fails.
    expect(() => logUpdateError(new Error('upstream'))).not.toThrow()
  })

  it('swallows errors when the surface path is invalid (e.g. unwritable)', () => {
    // Point at a path inside a directory that exists as a *file* — mkdir will fail.
    const blocker = join(tmpDir, 'blocker')
    writeFileSync(blocker, 'i am a file not a directory')
    getSurfacePathMock.mockReturnValue(join(blocker, 'auto-update.log'))

    expect(() => logUpdateError(new Error('boom'))).not.toThrow()
  })
})

interface LogEntryShape {
  ts: string
  level: string
  message: string
  stack?: string
}
