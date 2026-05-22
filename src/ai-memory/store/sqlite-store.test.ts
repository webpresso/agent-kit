import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CheckpointConfig, CheckpointState } from '#ai-memory/checkpoint/types.js'
import type { Fact } from '#ai-memory/facts/types.js'
import { createHierarchicalRetriever } from '#ai-memory/hierarchy/retriever.js'
import { SqliteAiMemoryStore } from './sqlite-store.js'

const tempRoots: string[] = []

function createTempDbPath(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'wp-ai-memory-store-'))
  tempRoots.push(root)
  return path.join(root, 'memory.db')
}

afterEach(() => {
  vi.useRealTimers()
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('SqliteAiMemoryStore', () => {
  it('persists checkpoints through save/load/list/clearThread', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const store = new SqliteAiMemoryStore(createTempDbPath())
    const config: CheckpointConfig = { threadId: 'thread-1' }
    const state: CheckpointState = {
      messages: [{ role: 'user', content: 'hello world' }],
      toolCalls: [],
    }

    const first = await store.save(config, state)
    vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'))
    const second = await store.save(
      config,
      {
        messages: [...state.messages, { role: 'assistant', content: 'hi back' }],
        toolCalls: [],
      },
      first.checkpointId,
    )

    const latest = await store.loadLatest('thread-1')
    const loaded = await store.load(second.checkpointId!)
    const listed = await store.list({ threadId: 'thread-1' })

    expect(first.success).toBe(true)
    expect(second.success).toBe(true)
    expect(latest?.id).toBe(second.checkpointId)
    expect(loaded?.parentId).toBe(first.checkpointId)
    expect(listed).toHaveLength(2)

    await store.clearThread('thread-1')
    expect(await store.loadLatest('thread-1')).toBeNull()
    store.close()
  })

  it('persists facts and updates retrieval metadata', async () => {
    const store = new SqliteAiMemoryStore(createTempDbPath())
    const fact: Fact = {
      id: 'fact-1',
      threadId: 'thread-1',
      category: 'context',
      content: 'Project uses React and TypeScript',
      confidence: 'high',
      embedding: [0.1, 0.2, 0.3],
      accessCount: 0,
      lastAccessedAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      invalidated: false,
    }

    await store.insert(fact)
    const before = await store.findByThread('thread-1')
    expect(before).toHaveLength(1)
    expect(before[0]?.content).toContain('React')

    await store.touchFact('fact-1')
    const afterTouch = await store.findByThread('thread-1')
    expect(afterTouch[0]?.accessCount).toBe(1)

    await store.update('fact-1', { invalidated: true, invalidationReason: 'test' })
    const retrieved = await store.getFacts({
      threadId: 'thread-1',
      includeInvalidated: true,
      query: 'typescript',
    })
    expect(retrieved[0]?.invalidated).toBe(true)
    expect(retrieved[0]?.relevance).toBeGreaterThan(0)
    store.close()
  })

  it('integrates with the hierarchical retriever on a real sqlite-backed store', async () => {
    const store = new SqliteAiMemoryStore(createTempDbPath())
    await store.save(
      { threadId: 'thread-1' },
      {
        messages: [{ role: 'user', content: 'What stack do we use?' }],
        toolCalls: [],
      },
    )
    await store.insert({
      id: 'fact-1',
      threadId: 'thread-1',
      category: 'context',
      content: 'The project uses React Router and TypeScript.',
      confidence: 'high',
      embedding: [0.1, 0.2, 0.3],
      accessCount: 0,
      lastAccessedAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      invalidated: false,
    })

    const retriever = createHierarchicalRetriever(store, {
      embed: async () => [0.1, 0.2, 0.3],
    })
    const context = await retriever.retrieve('thread-1', 'typescript stack')

    expect(context.shortTerm.messages).toHaveLength(1)
    expect(context.longTerm.facts).toHaveLength(1)
    expect(context.longTerm.facts[0]?.content).toContain('TypeScript')
    store.close()
  })

  it('load returns null for an unknown checkpoint id', async () => {
    const store = new SqliteAiMemoryStore(createTempDbPath())
    expect(await store.load('ckpt_missing')).toBeNull()
    store.close()
  })

  it('loadLatest returns null when thread has no checkpoints', async () => {
    const store = new SqliteAiMemoryStore(createTempDbPath())
    expect(await store.loadLatest('empty-thread')).toBeNull()
    store.close()
  })

  it('getLatestCheckpoint is an alias for loadLatest', async () => {
    const store = new SqliteAiMemoryStore(createTempDbPath())
    await store.save({ threadId: 'thread-1' }, { messages: [{ role: 'user', content: 'hi' }] })
    const viaAlias = await store.getLatestCheckpoint('thread-1')
    const viaDirect = await store.loadLatest('thread-1')
    expect(viaAlias).toStrictEqual(viaDirect)
    store.close()
  })

  it('list returns all checkpoints across threads when no threadId is given', async () => {
    const store = new SqliteAiMemoryStore(createTempDbPath())
    await store.save({ threadId: 'thread-a' }, { messages: [] })
    await store.save({ threadId: 'thread-b' }, { messages: [] })
    const rows = await store.list()
    expect(rows).toHaveLength(2)
    store.close()
  })

  it('list respects limit and offset', async () => {
    const store = new SqliteAiMemoryStore(createTempDbPath())
    for (let i = 0; i < 4; i++) {
      await store.save({ threadId: 'thread-1' }, { messages: [{ role: 'user', content: `m${i}` }] })
    }
    const page = await store.list({ threadId: 'thread-1', limit: 2, offset: 1 })
    expect(page).toHaveLength(2)
    store.close()
  })

  it('list supports ascending order', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const store = new SqliteAiMemoryStore(createTempDbPath())
    await store.save({ threadId: 'thread-1' }, { messages: [{ role: 'user', content: 'first' }] })
    vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'))
    await store.save({ threadId: 'thread-1' }, { messages: [{ role: 'user', content: 'second' }] })
    const asc = await store.list({ threadId: 'thread-1', order: 'asc' })
    const desc = await store.list({ threadId: 'thread-1', order: 'desc' })
    expect(asc[0]?.state.messages[0]?.content).toBe('first')
    expect(desc[0]?.state.messages[0]?.content).toBe('second')
    store.close()
  })

  it('delete returns undefined when id matches neither checkpoint nor fact', async () => {
    const store = new SqliteAiMemoryStore(createTempDbPath())
    expect(await store.delete('not-there')).toBeUndefined()
    store.close()
  })

  it('delete falls through to facts table when id matches no checkpoint', async () => {
    const store = new SqliteAiMemoryStore(createTempDbPath())
    const fact: Fact = {
      id: 'fact-1',
      threadId: 'thread-1',
      category: 'preference',
      content: 'k',
      confidence: 'high',
      accessCount: 0,
      lastAccessedAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      invalidated: false,
    }
    await store.insert(fact)
    await store.delete('fact-1')
    expect(await store.findByThread('thread-1')).toStrictEqual([])
    store.close()
  })

  it('update is a no-op for an unknown fact id', async () => {
    const store = new SqliteAiMemoryStore(createTempDbPath())
    await store.update('missing-fact', { content: 'nope' })
    expect(await store.findByThread('thread-1')).toStrictEqual([])
    store.close()
  })

  it('touchFact is a no-op for an unknown fact id', async () => {
    const store = new SqliteAiMemoryStore(createTempDbPath())
    await store.touchFact('missing-fact')
    expect(await store.findByThread('thread-1')).toStrictEqual([])
    store.close()
  })

  it('getFacts filters by category', async () => {
    const store = new SqliteAiMemoryStore(createTempDbPath())
    const base = {
      threadId: 'thread-1',
      confidence: 'high' as const,
      accessCount: 0,
      lastAccessedAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      invalidated: false,
    }
    await store.insert({ ...base, id: 'a', content: 'dark mode', category: 'preference' })
    await store.insert({ ...base, id: 'b', content: 'uses ts', category: 'context' })
    const prefs = await store.getFacts({ threadId: 'thread-1', categories: ['preference'] })
    expect(prefs.map((f) => f.id)).toStrictEqual(['a'])
    store.close()
  })

  it('getFacts excludes invalidated facts by default', async () => {
    const store = new SqliteAiMemoryStore(createTempDbPath())
    const base = {
      threadId: 'thread-1',
      category: 'preference' as const,
      confidence: 'high' as const,
      accessCount: 0,
      lastAccessedAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    }
    await store.insert({ ...base, id: 'live', content: 'live', invalidated: false })
    await store.insert({ ...base, id: 'dead', content: 'dead', invalidated: true })
    const facts = await store.getFacts({ threadId: 'thread-1' })
    expect(facts.map((f) => f.id)).toStrictEqual(['live'])
    store.close()
  })

  it('getFacts assigns relevance=1 when query is blank or whitespace', async () => {
    const store = new SqliteAiMemoryStore(createTempDbPath())
    await store.insert({
      id: 'a',
      threadId: 'thread-1',
      content: 'anything',
      category: 'preference',
      confidence: 'high',
      accessCount: 0,
      lastAccessedAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      invalidated: false,
    })
    const blank = await store.getFacts({ threadId: 'thread-1', query: '' })
    const spaces = await store.getFacts({ threadId: 'thread-1', query: '   ' })
    expect(blank[0]?.relevance).toBe(1)
    expect(spaces[0]?.relevance).toBe(1)
    store.close()
  })

  it('getFacts filters by minRelevance threshold', async () => {
    const store = new SqliteAiMemoryStore(createTempDbPath())
    const base = {
      threadId: 'thread-1',
      category: 'preference' as const,
      confidence: 'high' as const,
      accessCount: 0,
      lastAccessedAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      invalidated: false,
    }
    await store.insert({ ...base, id: 'match', content: 'dark mode at night' })
    await store.insert({ ...base, id: 'miss', content: 'completely unrelated text' })
    const facts = await store.getFacts({
      threadId: 'thread-1',
      query: 'dark mode',
      minRelevance: 0.5,
    })
    expect(facts.map((f) => f.id)).toStrictEqual(['match'])
    store.close()
  })

  it('getFacts assigns fractional relevance for partial-word query matches', async () => {
    const store = new SqliteAiMemoryStore(createTempDbPath())
    await store.insert({
      id: 'partial',
      threadId: 'thread-1',
      content: 'user prefers dark mode',
      category: 'preference',
      confidence: 'high',
      accessCount: 0,
      lastAccessedAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      invalidated: false,
    })
    const facts = await store.getFacts({ threadId: 'thread-1', query: 'dark unrelated' })
    expect(facts[0]?.relevance).toBe(0.5)
    store.close()
  })

  it('getFacts respects the limit option', async () => {
    const store = new SqliteAiMemoryStore(createTempDbPath())
    const base = {
      threadId: 'thread-1',
      category: 'preference' as const,
      confidence: 'high' as const,
      accessCount: 0,
      lastAccessedAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      invalidated: false,
    }
    for (let i = 0; i < 5; i++) {
      await store.insert({ ...base, id: `f${i}`, content: `content ${i}` })
    }
    const facts = await store.getFacts({ threadId: 'thread-1', limit: 2 })
    expect(facts).toHaveLength(2)
    store.close()
  })

  it('save preserves checkpoint state JSON round-trip (messages, toolCalls, tokenUsage)', async () => {
    const store = new SqliteAiMemoryStore(createTempDbPath())
    const state: CheckpointState = {
      messages: [{ role: 'assistant', content: 'with usage' }],
      toolCalls: [{ name: 'grep', args: { pattern: 'foo' } }],
      tokenUsage: { input: 1, output: 2, total: 3 },
    }
    const saved = await store.save({ threadId: 'thread-1' }, state)
    const loaded = await store.load(saved.checkpointId!)
    expect(loaded?.state).toStrictEqual(state)
    store.close()
  })

  it('insert round-trips sourceId and invalidationReason exactly when set', async () => {
    const store = new SqliteAiMemoryStore(createTempDbPath())
    await store.insert({
      id: 'with-opts',
      threadId: 'thread-1',
      category: 'preference',
      content: 'has opts',
      confidence: 'high',
      sourceId: 'src-original',
      accessCount: 0,
      lastAccessedAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      invalidated: true,
      invalidationReason: 'reason-original',
    })
    const [found] = await store.findByThread('thread-1')
    expect(found?.sourceId).toBe('src-original')
    expect(found?.invalidationReason).toBe('reason-original')
    store.close()
  })

  it('update preserves sourceId and invalidationReason when patched onto an existing fact', async () => {
    const store = new SqliteAiMemoryStore(createTempDbPath())
    await store.insert({
      id: 'pre',
      threadId: 'thread-1',
      category: 'preference',
      content: 'pre',
      confidence: 'high',
      accessCount: 0,
      lastAccessedAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      invalidated: false,
    })
    await store.update('pre', {
      sourceId: 'src-new',
      invalidated: true,
      invalidationReason: 'reason-new',
    })
    const [found] = await store.findByThread('thread-1')
    expect(found?.sourceId).toBe('src-new')
    expect(found?.invalidationReason).toBe('reason-new')
    store.close()
  })

  it('save generates checkpoint ids with exactly an 8-char random suffix', async () => {
    const store = new SqliteAiMemoryStore(createTempDbPath())
    const result = await store.save({ threadId: 'thread-1' }, { messages: [] })
    expect(result.checkpointId).toMatch(/^ckpt_[a-z0-9]+_[a-z0-9]{8}$/)
    store.close()
  })

  it('estimateRelevance trims empty tokens from leading and trailing whitespace in the query', async () => {
    const store = new SqliteAiMemoryStore(createTempDbPath())
    await store.insert({
      id: 'a',
      threadId: 'thread-1',
      content: 'foo',
      category: 'preference',
      confidence: 'high',
      accessCount: 0,
      lastAccessedAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      invalidated: false,
    })
    const facts = await store.getFacts({ threadId: 'thread-1', query: ' foo ' })
    expect(facts[0]?.relevance).toBe(1)
    store.close()
  })

  it('rejects further queries after close() (db connection released)', async () => {
    const store = new SqliteAiMemoryStore(createTempDbPath())
    store.close()
    await expect(store.list()).rejects.toThrow()
  })
})
