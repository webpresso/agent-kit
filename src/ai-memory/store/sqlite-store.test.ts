import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import type { CheckpointConfig, CheckpointState } from '../checkpoint/types.js'
import type { Fact } from '../facts/types.js'
import { createHierarchicalRetriever } from '../hierarchy/retriever.js'
import { SqliteAiMemoryStore } from './sqlite-store.js'

const tempRoots: string[] = []

function createTempDbPath(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'ak-ai-memory-store-'))
  tempRoots.push(root)
  return path.join(root, 'memory.db')
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('SqliteAiMemoryStore', () => {
  it('persists checkpoints through save/load/list/clearThread', async () => {
    const store = new SqliteAiMemoryStore(createTempDbPath())
    const config: CheckpointConfig = { threadId: 'thread-1' }
    const state: CheckpointState = {
      messages: [{ role: 'user', content: 'hello world' }],
      toolCalls: [],
    }

    const first = await store.save(config, state)
    const second = await store.save(config, {
      messages: [...state.messages, { role: 'assistant', content: 'hi back' }],
      toolCalls: [],
    }, first.checkpointId)

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
})
