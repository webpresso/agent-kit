import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const stateRoot = vi.hoisted(() => ({ path: '' }))
const fsMocks = vi.hoisted(() => ({
  createWriteStream: vi.fn(),
  openSync: vi.fn(),
  actualCreateWriteStream: undefined as undefined | (typeof import('node:fs'))['createWriteStream'],
  actualOpenSync: undefined as undefined | (typeof import('node:fs'))['openSync'],
}))

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  fsMocks.actualCreateWriteStream = actual.createWriteStream
  fsMocks.actualOpenSync = actual.openSync
  return {
    ...actual,
    createWriteStream: fsMocks.createWriteStream,
    openSync: fsMocks.openSync,
  }
})

vi.mock('#paths/state-root.js', () => ({
  getSurfacePath: vi.fn((name: string, _scope: 'repo' | 'worktree' | 'user') =>
    join(stateRoot.path, name),
  ),
}))

import { createCliLogSink, readCliLogEntries, readCliLogEntry } from './quality-log-store.js'

describe('quality log store', () => {
  beforeEach(() => {
    stateRoot.path = mkdtempSync(join(tmpdir(), 'wp-cli-logs-'))
    if (!fsMocks.actualCreateWriteStream || !fsMocks.actualOpenSync) {
      throw new Error('node:fs mock was not initialized')
    }
    fsMocks.createWriteStream.mockReset()
    fsMocks.openSync.mockReset()
    fsMocks.createWriteStream.mockImplementation(fsMocks.actualCreateWriteStream)
    fsMocks.openSync.mockImplementation(fsMocks.actualOpenSync)
  })

  afterEach(() => {
    rmSync(stateRoot.path, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('stores the latest entry first and can read older entries by ordinal', async () => {
    const first = createCliLogSink('test')
    first.write('first\n')
    await first.finalize({ exitCode: 0, summary: 'first run' })

    const second = createCliLogSink('test')
    second.write('second\n')
    const secondEntry = await second.finalize({ exitCode: 1, summary: 'second run' })

    expect(readCliLogEntry('test')?.id).toBe(secondEntry.id)
    expect(readCliLogEntry('test', 2)?.summary).toBe('first run')
  })

  it('materializes the log file path immediately when the sink is created', () => {
    const sink = createCliLogSink('audit')

    expect(existsSync(sink.absoluteLogPath)).toBe(true)
  })

  it('observes stream errors before finalize is called', async () => {
    const stream = new FakeWriteStream()
    fsMocks.openSync.mockReturnValue(123)
    fsMocks.createWriteStream.mockReturnValue(stream)

    const sink = createCliLogSink('lint')
    const error = new Error('write fd failed')

    expect(stream.listenerCount('error')).toBe(1)
    expect(() => stream.emit('error', error)).not.toThrow()
    await expect(sink.finalize({ exitCode: 1 })).rejects.toThrow(error)
  })

  it('does not remove another active sink before it finalizes', async () => {
    const first = createCliLogSink('audit')
    const second = createCliLogSink('audit')

    first.write('first\n')
    second.write('second\n')

    await first.finalize({ exitCode: 0, summary: 'first run' })

    expect(existsSync(second.absoluteLogPath)).toBe(true)

    await second.finalize({ exitCode: 0, summary: 'second run' })
    expect(existsSync(second.absoluteLogPath)).toBe(true)
  })

  it('preserves concurrent finalized entries and removes inactive orphan logs', async () => {
    const active = createCliLogSink('audit')
    active.write('still running\n')

    await Promise.all(
      Array.from({ length: 12 }, async (_, index) => {
        const sink = createCliLogSink('audit')
        sink.write(`run-${index}\n`)
        await sink.finalize({ exitCode: 0, summary: `run ${index}` })
      }),
    )

    expect(existsSync(active.absoluteLogPath)).toBe(true)

    const entriesBeforeActiveFinalizes = readCliLogEntries('audit')
    expect(entriesBeforeActiveFinalizes).toHaveLength(10)
    expect(new Set(entriesBeforeActiveFinalizes.map((entry) => entry.id)).size).toBe(10)

    await active.finalize({ exitCode: 0, summary: 'still running' })

    const entries = readCliLogEntries('audit')
    expect(entries).toHaveLength(10)
    expect(entries[0]?.summary).toBe('still running')
    expect(
      readdirSync(join(stateRoot.path, 'cli-logs', 'audit')).filter((file) =>
        file.endsWith('.log.active'),
      ),
    ).toEqual([])
    expect(
      readdirSync(join(stateRoot.path, 'cli-logs', 'audit')).filter((file) => file.endsWith('.log'))
        .length,
    ).toBe(13)
  })

  it('keeps recently finalized logs readable even when they fall out of the index', async () => {
    const victim = createCliLogSink('test')
    victim.write('victim\n')
    const victimEntry = await victim.finalize({ exitCode: 0, summary: 'victim' })

    await Promise.all(
      Array.from({ length: 12 }, async (_, index) => {
        const sink = createCliLogSink('test')
        sink.write(`new-${index}\n`)
        await sink.finalize({ exitCode: 0, summary: `new ${index}` })
      }),
    )

    expect(readCliLogEntries('test')).toHaveLength(10)
    expect(readFileSync(victimEntry.logPath, 'utf8')).toBe('victim\n')
  })

  it('stamps quiet logs as recent when they finalize', async () => {
    const victim = createCliLogSink('test')
    victim.write('victim\n')
    const stale = new Date(Date.now() - 120_000)
    utimesSync(victim.absoluteLogPath, stale, stale)

    const victimEntry = await victim.finalize({ exitCode: 0, summary: 'victim' })

    await Promise.all(
      Array.from({ length: 12 }, async (_, index) => {
        const sink = createCliLogSink('test')
        sink.write(`new-${index}\n`)
        await sink.finalize({ exitCode: 0, summary: `new ${index}` })
      }),
    )

    expect(readFileSync(victimEntry.logPath, 'utf8')).toBe('victim\n')
  })

  it('keeps finalization non-fatal when a live log path is removed before finalize', async () => {
    const sink = createCliLogSink('test')
    sink.write('lost backing file\n')
    rmSync(sink.absoluteLogPath, { force: true })

    const entry = await sink.finalize({ exitCode: 1, summary: 'missing path recovered' })

    expect(entry.logPath).toBe(sink.absoluteLogPath)
    expect(readCliLogEntry('test')).toEqual(entry)
    expect(readFileSync(entry.logPath, 'utf8')).toBe('')
    expect(
      readdirSync(join(stateRoot.path, 'cli-logs', 'test')).filter((file) =>
        file.endsWith('.log.active'),
      ),
    ).toEqual([])
  })

  it('retains only the latest 10 entries and prunes old log files', async () => {
    let oldestPath = ''
    for (let index = 0; index < 11; index += 1) {
      const sink = createCliLogSink('qa')
      sink.write(`run-${index}\n`)
      const entry = await sink.finalize({ exitCode: index % 2, summary: `run ${index}` })
      if (index === 0) oldestPath = entry.logPath
    }

    const entries = readCliLogEntries('qa')
    expect(entries).toHaveLength(10)
    expect(entries.some((entry) => entry.summary === 'run 0')).toBe(false)
    expect(readFileSync(oldestPath, 'utf8')).toBe('run-0\n')

    const stale = new Date(Date.now() - 120_000)
    utimesSync(oldestPath, stale, stale)
    const cleanup = createCliLogSink('qa')
    cleanup.write('cleanup\n')
    await cleanup.finalize({ exitCode: 0, summary: 'cleanup' })

    expect(() => readFileSync(oldestPath, 'utf8')).toThrow()
  })
})

class FakeWriteStream extends EventEmitter {
  write(): boolean {
    return true
  }

  end(callback?: () => void): this {
    callback?.()
    return this
  }
}
