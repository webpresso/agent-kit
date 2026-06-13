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
      event: {
        eventType: 'tool_edit',
        toolName: 'edit',
        content: 'changed session memory store',
      },
    })
    const snapshot = store.snapshot({ repoHash: 'repo123456789abcd' })
    expect(snapshot.status).toBe('complete')
    expect(snapshot.content).toContain('session memory')
    expect(store.restore({ repoHash: 'repo123456789abcd', query: 'memory' })[0]?.content).toContain(
      'memory',
    )
    store.close()
  })

  it('persists typed continuity events and restores their envelope metadata', () => {
    const store = new SessionMemorySessionStore(dbPath())
    const eventId = store.captureEvent({
      repoHash: 'repo123456789abcd',
      event: {
        eventId: 'evt-decision-1',
        eventType: 'decision',
        toolName: 'UserPromptSubmit',
        content: 'Use typed continuity events for resume context.',
        summary: 'Decision: use typed continuity events',
        priority: 90,
        metadata: { source: 'prompt', tags: ['continuity'] },
      },
    })

    expect(eventId).toBe('evt-decision-1')
    const [restored] = store.restore({
      repoHash: 'repo123456789abcd',
      query: 'continuity',
      limit: 1,
    })
    expect(restored).toMatchObject({
      eventId: 'evt-decision-1',
      eventType: 'decision',
      toolName: 'UserPromptSubmit',
      content: 'Use typed continuity events for resume context.',
      summary: 'Decision: use typed continuity events',
      priority: 90,
      metadata: { source: 'prompt', tags: ['continuity'] },
    })

    store.close()
  })

  it('serializes bounded typed snapshot rows with priority filtering', () => {
    const store = new SessionMemorySessionStore(dbPath())
    store.captureEvent({
      repoHash: 'repo123456789abcd',
      event: {
        eventId: 'evt-low-read',
        eventType: 'tool_read',
        toolName: 'Read',
        content: 'low-priority read payload '.repeat(40),
        priority: 10,
      },
    })
    store.captureEvent({
      repoHash: 'repo123456789abcd',
      event: {
        eventId: 'evt-high-rule',
        eventType: 'rule_snapshot',
        toolName: 'PreCompact',
        content: 'Preserve rule snapshots in compacted resume context. '.repeat(40),
        summary: 'Rule snapshot for resume context',
        priority: 80,
        metadata: { ruleCount: 3 },
      },
    })

    const snapshot = store.snapshot({
      repoHash: 'repo123456789abcd',
      minPriority: 50,
      maxEventBytes: 80,
      maxSnapshotBytes: 800,
    })

    expect(snapshot.status).toBe('complete')
    expect(snapshot.eventCount).toBe(1)
    expect(snapshot.content).toContain('"eventType":"rule_snapshot"')
    expect(snapshot.content).toContain('"summary":"Rule snapshot for resume context"')
    expect(snapshot.content).toContain('"truncated":true')
    expect(snapshot.content).not.toContain('evt-low-read')

    store.close()
  })

  it('prioritizes resume-critical events when snapshot byte budget is tight', () => {
    const store = new SessionMemorySessionStore(dbPath())
    store.captureEvent({
      repoHash: 'repo123456789abcd',
      event: {
        eventId: 'evt-old-low',
        ts: '2026-06-13T00:00:00.000Z',
        eventType: 'tool_read',
        toolName: 'Read',
        content: 'older low priority payload '.repeat(20),
        priority: 10,
      },
    })
    store.captureEvent({
      repoHash: 'repo123456789abcd',
      event: {
        eventId: 'evt-new-high',
        ts: '2026-06-13T00:01:00.000Z',
        eventType: 'decision',
        toolName: 'UserPromptSubmit',
        content: 'Keep high priority decisions in bounded resume snapshots.',
        priority: 100,
      },
    })

    const snapshot = store.snapshot({ repoHash: 'repo123456789abcd', maxSnapshotBytes: 260 })
    expect(snapshot.content).toContain('evt-new-high')
    expect(snapshot.content).not.toContain('evt-old-low')

    store.close()
  })

  it('normalizes unsafe metadata without crashing capture hot paths', () => {
    const store = new SessionMemorySessionStore(dbPath())
    const circular: Record<string, unknown> = { big: 10n }
    circular.self = circular
    store.captureEvent({
      repoHash: 'repo123456789abcd',
      event: {
        eventId: 'evt-safe-metadata',
        eventType: 'tool_command',
        toolName: 'Bash',
        content: 'metadata normalization remains safe',
        metadata: circular,
      },
    })

    expect(
      store.restore({ repoHash: 'repo123456789abcd', query: 'normalization', limit: 1 })[0],
    ).toMatchObject({
      eventId: 'evt-safe-metadata',
      metadata: { big: '10', self: '[Circular]' },
    })

    store.close()
  })

  it('returns partial snapshots when cap is exhausted', () => {
    const store = new SessionMemorySessionStore(dbPath())
    for (let i = 0; i < 20; i += 1) {
      store.captureEvent({
        repoHash: 'repo123456789abcd',
        event: { eventType: 'tool_read', toolName: 'tool', content: `event ${i}` },
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
      event: { eventType: 'tool_edit', toolName: 'a', content: 'alpha write' },
    })
    b.captureEvent({
      repoHash: 'repo123456789abcd',
      event: { eventType: 'tool_edit', toolName: 'b', content: 'beta write' },
    })
    expect(a.restore({ repoHash: 'repo123456789abcd', query: 'write', limit: 10 })).toHaveLength(2)
    a.close()
    b.close()
  })
})

// G017: unified recall semantics for typed continuity events.
describe('SessionMemorySessionStore unified restore results', () => {
  it('returns preview-only event results with stable provenance and dedupe keys', () => {
    const store = new SessionMemorySessionStore(dbPath())
    store.captureEvent({
      repoHash: 'repo123456789abcd',
      sessionId: 'session-a',
      event: {
        eventId: 'evt-unified-1',
        ts: '2026-06-13T00:00:00.000Z',
        eventType: 'decision',
        toolName: 'UserPromptSubmit',
        content: `${'bounded decision content '.repeat(20)}hidden-event-overflow`,
        summary: 'Decision: bounded preview',
      },
    })

    const results = store.restoreUnified({
      repoHash: 'repo123456789abcd',
      query: 'bounded hidden-event-overflow',
      limit: 5,
      maxPreviewBytes: 48,
    })

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      sourceType: 'continuity_event',
      provenance: {
        kind: 'continuity_event',
        repoHash: 'repo123456789abcd',
        sessionId: 'session-a',
        eventId: 'evt-unified-1',
      },
      timestamp: '2026-06-13T00:00:00.000Z',
    })
    expect(results[0]?.dedupeKey).toBe('continuity_event:repo123456789abcd:evt-unified-1')
    expect(results[0]?.preview.length).toBeLessThanOrEqual(64)
    expect(results[0]?.preview).not.toContain('hidden-event-overflow')
    expect(JSON.stringify(results)).not.toContain(
      'bounded decision content bounded decision content',
    )
    store.close()
  })

  it('dedupes repeated event identity and preserves cross-source event provenance', () => {
    const store = new SessionMemorySessionStore(dbPath())
    store.captureEvent({
      repoHash: 'repo123456789abcd',
      sessionId: 'session-a',
      event: { eventId: 'evt-same', eventType: 'decision', toolName: 'a', content: 'same memory' },
    })
    store.captureEvent({
      repoHash: 'repo123456789abcd',
      sessionId: 'session-a',
      event: {
        eventId: 'evt-same',
        eventType: 'decision',
        toolName: 'b',
        content: 'same memory updated',
      },
    })
    store.captureEvent({
      repoHash: 'repo-other',
      sessionId: 'session-b',
      event: { eventId: 'evt-other', eventType: 'decision', toolName: 'c', content: 'same memory' },
    })

    const currentRepo = store.restoreUnified({
      repoHash: 'repo123456789abcd',
      query: 'memory',
      limit: 10,
    })
    const otherRepo = store.restoreUnified({ repoHash: 'repo-other', query: 'memory', limit: 10 })

    expect(currentRepo).toHaveLength(1)
    expect(currentRepo[0]?.provenance).toMatchObject({
      repoHash: 'repo123456789abcd',
      eventId: 'evt-same',
    })
    expect(otherRepo).toHaveLength(1)
    expect(otherRepo[0]?.provenance).toMatchObject({ repoHash: 'repo-other', eventId: 'evt-other' })
    expect(currentRepo[0]?.dedupeKey).not.toBe(otherRepo[0]?.dedupeKey)
    store.close()
  })

  it('supports source-type filtering and caps huge limits deterministically', () => {
    const store = new SessionMemorySessionStore(dbPath())
    for (let i = 0; i < 80; i += 1) {
      store.captureEvent({
        repoHash: 'repo123456789abcd',
        event: {
          eventId: `evt-limit-${i}`,
          eventType: 'decision',
          toolName: 'tool',
          content: `bulk memory ${i}`,
        },
      })
    }
    expect(
      store.restoreUnified({
        repoHash: 'repo123456789abcd',
        query: 'memory',
        sourceTypes: ['indexed_chunk'],
      }),
    ).toEqual([])
    expect(
      store.restoreUnified({ repoHash: 'repo123456789abcd', query: 'memory', limit: 1_000 }).length,
    ).toBeLessThanOrEqual(50)
    expect(
      store.restoreUnified({ repoHash: 'repo123456789abcd', query: 'memory', limit: -1 }).length,
    ).toBeLessThanOrEqual(5)
    store.close()
  })

  it('returns no unified results for empty or malformed token queries', () => {
    const store = new SessionMemorySessionStore(dbPath())
    store.captureEvent({
      repoHash: 'repo123456789abcd',
      event: { eventType: 'decision', toolName: 'tool', content: 'memory' },
    })
    expect(store.restoreUnified({ repoHash: 'repo123456789abcd', query: '   ', limit: 5 })).toEqual(
      [],
    )
    expect(
      store.restoreUnified({ repoHash: 'repo123456789abcd', query: '""""', limit: 5 }),
    ).toEqual([])
    store.close()
  })
})

describe('SessionMemorySessionStore operator helpers', () => {
  it('reports stats, dry-runs scoped purge, confirms scoped purge, and doctors continuity events', () => {
    const store = new SessionMemorySessionStore(dbPath())
    store.captureEvent({
      repoHash: 'repo123456789abcd',
      sessionId: 'session-a',
      event: {
        eventId: 'evt-a',
        eventType: 'decision',
        toolName: 'UserPromptSubmit',
        content: 'operator memory one',
      },
    })
    store.captureEvent({
      repoHash: 'repo-other',
      sessionId: 'session-b',
      event: {
        eventId: 'evt-b',
        eventType: 'constraint',
        toolName: 'UserPromptSubmit',
        content: 'operator memory two',
      },
    })

    expect(store.stats()).toMatchObject({ eventCount: 2, repoCount: 2, sessionCount: 2 })
    expect(store.purge({ repoHash: 'repo123456789abcd' })).toMatchObject({
      dryRun: true,
      matchedEventCount: 1,
      deletedEventCount: 0,
    })
    expect(store.restore({ repoHash: 'repo123456789abcd', query: 'one', limit: 1 })).toHaveLength(1)
    expect(store.purge({ repoHash: 'repo123456789abcd', confirm: true })).toMatchObject({
      dryRun: false,
      matchedEventCount: 1,
      deletedEventCount: 1,
    })
    expect(store.restore({ repoHash: 'repo123456789abcd', query: 'one', limit: 1 })).toEqual([])
    expect(store.stats()).toMatchObject({ eventCount: 1, repoCount: 1, sessionCount: 1 })
    expect(store.doctor()).toMatchObject({ ok: true, eventCount: 1 })
    store.close()
  })
})
