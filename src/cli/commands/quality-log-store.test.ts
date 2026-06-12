import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const stateRoot = vi.hoisted(() => ({ path: '' }))

vi.mock('#paths/state-root.js', () => ({
  getSurfacePath: vi.fn((name: string, _scope: 'repo' | 'worktree' | 'user') =>
    join(stateRoot.path, name),
  ),
}))

import { createCliLogSink, readCliLogEntries, readCliLogEntry } from './quality-log-store.js'

describe('quality log store', () => {
  beforeEach(() => {
    stateRoot.path = mkdtempSync(join(tmpdir(), 'wp-cli-logs-'))
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
    expect(() => readFileSync(oldestPath, 'utf8')).toThrow()
  })
})
