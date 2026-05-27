import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { SessionMemorySessionStore } from './session.js'

const dirs: string[] = []
function dbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ak-session-log-'))
  dirs.push(dir)
  return join(dir, 'sessions.sqlite')
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('SessionMemorySessionStore', () => {
  it('captures, snapshots, and restores events', () => {
    const store = new SessionMemorySessionStore(dbPath())
    store.captureEvent({
      repoHash: 'repo123456789abcd',
      event: { toolName: 'edit', content: 'changed session memory store' },
    })
    const snapshot = store.snapshot({ repoHash: 'repo123456789abcd' })
    expect(snapshot.status).toBe('complete')
    expect(snapshot.content).toContain('session memory')
    expect(store.restore({ repoHash: 'repo123456789abcd', query: 'memory' })[0]?.content).toContain(
      'memory',
    )
    store.close()
  })

  it('returns partial snapshots when cap is exhausted', () => {
    const store = new SessionMemorySessionStore(dbPath())
    for (let i = 0; i < 20; i += 1) {
      store.captureEvent({
        repoHash: 'repo123456789abcd',
        event: { toolName: 'tool', content: `event ${i}` },
      })
    }
    const snapshot = store.snapshot({ repoHash: 'repo123456789abcd', capMs: -1 })
    expect(snapshot.status).toBe('partial')
    expect(snapshot.eventCount).toBe(0)
    store.close()
  })

  it('supports multiple handles writing with WAL enabled', () => {
    const path = dbPath()
    const a = new SessionMemorySessionStore(path)
    const b = new SessionMemorySessionStore(path)
    a.captureEvent({
      repoHash: 'repo123456789abcd',
      event: { toolName: 'a', content: 'alpha write' },
    })
    b.captureEvent({
      repoHash: 'repo123456789abcd',
      event: { toolName: 'b', content: 'beta write' },
    })
    expect(a.restore({ repoHash: 'repo123456789abcd', query: 'write', limit: 10 })).toHaveLength(2)
    a.close()
    b.close()
  })
})
