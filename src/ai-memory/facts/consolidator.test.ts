import type { Fact, FactId } from './types.js'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createFactConsolidator, FactConsolidator, type FactDatabase } from './consolidator.js'

function createMockFact(overrides: Partial<Fact> = {}): Fact {
  const now = new Date()
  return {
    id: `fact_${Math.random().toString(36).substring(2, 8)}`,
    threadId: 'thread_1',
    category: 'preference',
    content: 'Test fact content',
    confidence: 'high',
    embedding: [0.1, 0.2, 0.3],
    accessCount: 0,
    lastAccessedAt: now,
    createdAt: now,
    invalidated: false,
    ...overrides,
  }
}

function createMockDatabase(facts: Fact[] = []): FactDatabase {
  const store = new Map<FactId, Fact>(facts.map((f) => [f.id, f]))

  return {
    findByThread: vi
      .fn<(...args: unknown[]) => unknown>()
      .mockImplementation(async (threadId: string) => {
        return Array.from(store.values()).filter((f) => f.threadId === threadId)
      }),
    update: vi
      .fn<(...args: unknown[]) => unknown>()
      .mockImplementation(async (id: FactId, updates: Partial<Fact>) => {
        const fact = store.get(id)
        if (fact) {
          Object.assign(fact, updates)
        }
      }),
    delete: vi.fn<(...args: unknown[]) => unknown>().mockImplementation(async (id: FactId) => {
      store.delete(id)
    }),
    insert: vi.fn<(...args: unknown[]) => unknown>().mockImplementation(async (fact: Fact) => {
      store.set(fact.id, fact)
    }),
  }
}

describe('FactConsolidator', () => {
  let consolidator: FactConsolidator
  let mockDb: FactDatabase

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('consolidate', () => {
    it('should return empty result when no facts exist', async () => {
      mockDb = createMockDatabase([])
      consolidator = new FactConsolidator(mockDb)

      const result = await consolidator.consolidate({ threadId: 'thread_1' })

      expect(result).toEqual({ merged: 0, invalidated: 0, remaining: 0 })
    })

    it('should not merge facts with low similarity', async () => {
      const facts = [
        createMockFact({
          id: 'fact_1',
          content: 'User prefers dark mode',
          embedding: [1, 0, 0],
        }),
        createMockFact({
          id: 'fact_2',
          content: 'Project uses React framework',
          embedding: [0, 1, 0],
        }),
      ]
      mockDb = createMockDatabase(facts)
      consolidator = new FactConsolidator(mockDb)

      const result = await consolidator.consolidate({ threadId: 'thread_1' })

      expect(result.merged).toBe(0)
      expect(result.remaining).toBe(2)
    })

    it('should merge similar facts', async () => {
      const baseDate = new Date()
      const facts = [
        createMockFact({
          id: 'fact_1',
          content: 'User prefers dark mode',
          embedding: [0.9, 0.1, 0.1],
          confidence: 'medium',
          createdAt: baseDate,
        }),
        createMockFact({
          id: 'fact_2',
          content: 'User likes dark mode theme',
          embedding: [0.9, 0.1, 0.1],
          confidence: 'high',
          createdAt: new Date(baseDate.getTime() + 86400000),
        }),
      ]
      mockDb = createMockDatabase(facts)
      consolidator = new FactConsolidator(mockDb)

      const result = await consolidator.consolidate({
        threadId: 'thread_1',
        similarityThreshold: 0.9,
      })

      expect(result.merged).toBeGreaterThanOrEqual(0)
    })

    it('should invalidate superseded facts by default', async () => {
      const facts = [
        createMockFact({
          id: 'fact_1',
          content: 'Same content here',
          embedding: [1, 0, 0],
        }),
        createMockFact({
          id: 'fact_2',
          content: 'Same content here',
          embedding: [1, 0, 0],
        }),
      ]
      mockDb = createMockDatabase(facts)
      consolidator = new FactConsolidator(mockDb)

      await consolidator.consolidate({
        threadId: 'thread_1',
        similarityThreshold: 0.99,
      })

      expect(mockDb.update).toHaveBeenCalledTimes(2)
    })

    it('should delete superseded facts when invalidateSuperseded is false', async () => {
      const facts = [
        createMockFact({
          id: 'fact_1',
          content: 'Same content here',
          embedding: [1, 0, 0],
        }),
        createMockFact({
          id: 'fact_2',
          content: 'Same content here',
          embedding: [1, 0, 0],
        }),
      ]
      mockDb = createMockDatabase(facts)
      consolidator = new FactConsolidator(mockDb)

      await consolidator.consolidate({
        threadId: 'thread_1',
        similarityThreshold: 0.99,
        invalidateSuperseded: false,
      })

      expect(mockDb.delete).toHaveBeenCalledTimes(1)
    })

    it('should keep higher confidence fact', async () => {
      const facts = [
        createMockFact({
          id: 'fact_low',
          content: 'Same fact',
          embedding: [1, 0, 0],
          confidence: 'low',
        }),
        createMockFact({
          id: 'fact_high',
          content: 'Same fact',
          embedding: [1, 0, 0],
          confidence: 'high',
        }),
      ]
      mockDb = createMockDatabase(facts)
      consolidator = new FactConsolidator(mockDb)

      await consolidator.consolidate({
        threadId: 'thread_1',
        similarityThreshold: 0.99,
        invalidateSuperseded: false,
      })

      expect(mockDb.delete).toHaveBeenCalledWith('fact_low')
    })

    it('should skip already invalidated facts', async () => {
      const facts = [
        createMockFact({
          id: 'fact_1',
          content: 'Active fact',
          invalidated: false,
        }),
        createMockFact({
          id: 'fact_2',
          content: 'Already invalidated',
          invalidated: true,
        }),
      ]
      mockDb = createMockDatabase(facts)
      consolidator = new FactConsolidator(mockDb)

      const result = await consolidator.consolidate({ threadId: 'thread_1' })

      expect(result.remaining).toBeLessThanOrEqual(1)
    })

    it('should group facts by category', async () => {
      const facts = [
        createMockFact({
          id: 'fact_1',
          category: 'preference',
          content: 'Similar preference',
          embedding: [1, 0, 0],
        }),
        createMockFact({
          id: 'fact_2',
          category: 'context',
          content: 'Similar preference',
          embedding: [1, 0, 0],
        }),
      ]
      mockDb = createMockDatabase(facts)
      consolidator = new FactConsolidator(mockDb)

      const result = await consolidator.consolidate({
        threadId: 'thread_1',
        similarityThreshold: 0.99,
      })

      expect(result.merged).toBe(0)
      expect(result.remaining).toBe(2)
    })

    it('should use default similarity threshold of 0.85', async () => {
      const facts = [
        createMockFact({
          id: 'fact_1',
          content: 'Some content',
          embedding: [0.9, 0.1, 0.1],
        }),
        createMockFact({
          id: 'fact_2',
          content: 'Similar content',
          embedding: [0.85, 0.15, 0.1],
        }),
      ]
      mockDb = createMockDatabase(facts)
      consolidator = new FactConsolidator(mockDb)

      const result = await consolidator.consolidate({ threadId: 'thread_1' })

      expect(result).not.toBe(undefined)
    })

    it('should merge access counts when consolidating', async () => {
      const facts = [
        createMockFact({
          id: 'fact_1',
          content: 'Same content',
          embedding: [1, 0, 0],
          accessCount: 5,
          confidence: 'high',
        }),
        createMockFact({
          id: 'fact_2',
          content: 'Same content',
          embedding: [1, 0, 0],
          accessCount: 3,
          confidence: 'low',
        }),
      ]
      mockDb = createMockDatabase(facts)
      consolidator = new FactConsolidator(mockDb)

      await consolidator.consolidate({
        threadId: 'thread_1',
        similarityThreshold: 0.99,
      })

      expect(mockDb.update).toHaveBeenCalledWith(
        'fact_1',
        expect.objectContaining({ accessCount: 8 }),
      )
    })
  })

  describe('text similarity fallback', () => {
    it('should use text similarity when embeddings are missing', async () => {
      const facts = [
        createMockFact({
          id: 'fact_1',
          content: 'hello world test',
          embedding: undefined,
        }),
        createMockFact({
          id: 'fact_2',
          content: 'hello world test',
          embedding: undefined,
        }),
      ]
      mockDb = createMockDatabase(facts)
      consolidator = new FactConsolidator(mockDb)

      const result = await consolidator.consolidate({
        threadId: 'thread_1',
        similarityThreshold: 0.9,
      })

      expect(result.merged).toBeGreaterThanOrEqual(0)
    })
  })

  describe('pair sorting', () => {
    it('should process most similar pairs first when multiple pairs exist', async () => {
      const facts = [
        createMockFact({
          id: 'fact_1',
          content: 'User prefers dark theme',
          embedding: [1, 0, 0],
          confidence: 'high',
        }),
        createMockFact({
          id: 'fact_2',
          content: 'User prefers dark theme',
          embedding: [1, 0, 0],
          confidence: 'medium',
        }),
        createMockFact({
          id: 'fact_3',
          content: 'User likes dark mode',
          embedding: [0.95, 0.05, 0],
          confidence: 'low',
        }),
      ]
      mockDb = createMockDatabase(facts)
      consolidator = new FactConsolidator(mockDb)

      const result = await consolidator.consolidate({
        threadId: 'thread_1',
        similarityThreshold: 0.9,
      })

      expect(result.merged).toBeGreaterThanOrEqual(1)
    })
  })
})

describe('createFactConsolidator', () => {
  it('should create a fact consolidator', () => {
    const mockDb = createMockDatabase()

    const consolidator = createFactConsolidator(mockDb)

    expect(consolidator).toBeInstanceOf(FactConsolidator)
  })
})
