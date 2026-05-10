import type { Checkpoint, SerializedMessage } from '../checkpoint/types.js'
import type { RetrievedFact } from '../facts/types.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createHierarchicalRetriever,
  DEFAULT_RETRIEVAL_CONFIG,
  type EmbeddingProvider,
  formatContextForPrompt,
  HierarchicalRetriever,
  type MemoryStore,
  type RetrievedContext,
} from './retriever.js'

function createMockStore(overrides: Partial<MemoryStore> = {}): MemoryStore {
  return {
    getLatestCheckpoint: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue(null),
    getFacts: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue([]),
    touchFact: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue(undefined),
    ...overrides,
  }
}

function createMockEmbedder(overrides: Partial<EmbeddingProvider> = {}): EmbeddingProvider {
  return {
    embed: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue([0.1, 0.2, 0.3]),
    ...overrides,
  }
}

function createMessage(role: SerializedMessage['role'], content: string): SerializedMessage {
  return { role, content }
}

function createMockCheckpoint(messages: SerializedMessage[] = []): Checkpoint {
  return {
    id: 'ckpt_test',
    threadId: 'thread_1',
    state: {
      messages,
      toolCalls: [],
    },
    createdAt: new Date(),
  }
}

function createMockFact(overrides: Partial<RetrievedFact> = {}): RetrievedFact {
  return {
    id: `fact_${Math.random().toString(36).substring(2, 8)}`,
    threadId: 'thread_1',
    category: 'preference',
    content: 'Test fact content',
    confidence: 'high',
    relevance: 0.8,
    embedding: [0.1, 0.2, 0.3],
    accessCount: 0,
    lastAccessedAt: new Date(),
    createdAt: new Date(),
    invalidated: false,
    ...overrides,
  }
}

describe('HierarchicalRetriever', () => {
  let retriever: HierarchicalRetriever
  let mockStore: MemoryStore
  let mockEmbedder: EmbeddingProvider

  beforeEach(() => {
    vi.clearAllMocks()
    mockStore = createMockStore()
    mockEmbedder = createMockEmbedder()
    retriever = new HierarchicalRetriever(mockStore, mockEmbedder)
  })

  describe('retrieve', () => {
    it('should return empty context when no checkpoint exists', async () => {
      const result = await retriever.retrieve('thread_1', 'What is the project about?')

      expect(result.shortTerm.messages).toHaveLength(0)
      expect(result.longTerm.facts).toHaveLength(0)
      expect(result.totalTokens).toBe(0)
    })

    it('should retrieve short-term memory from checkpoint', async () => {
      const messages = [createMessage('user', 'Hello'), createMessage('assistant', 'Hi there!')]
      mockStore = createMockStore({
        getLatestCheckpoint: vi
          .fn<(...args: unknown[]) => unknown>()
          .mockResolvedValue(createMockCheckpoint(messages)),
      })
      retriever = new HierarchicalRetriever(mockStore, mockEmbedder)

      const result = await retriever.retrieve('thread_1', 'Any query')

      expect(result.shortTerm.messages).toHaveLength(2)
      expect(result.shortTerm.tokenCount).toBeGreaterThan(0)
    })

    it('should retrieve long-term memory facts', async () => {
      const facts = [
        createMockFact({ content: 'User prefers TypeScript', relevance: 0.9 }),
        createMockFact({ content: 'Project uses React', relevance: 0.8 }),
      ]
      mockStore = createMockStore({
        getFacts: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue(facts),
      })
      retriever = new HierarchicalRetriever(mockStore, mockEmbedder)

      const result = await retriever.retrieve('thread_1', 'What technologies?')

      expect(result.longTerm.facts).toHaveLength(2)
      expect(result.longTerm.tokenCount).toBeGreaterThan(0)
    })

    it('should touch accessed facts', async () => {
      const facts = [createMockFact({ id: 'fact_1' }), createMockFact({ id: 'fact_2' })]
      mockStore = createMockStore({
        getFacts: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue(facts),
      })
      retriever = new HierarchicalRetriever(mockStore, mockEmbedder)

      await retriever.retrieve('thread_1', 'Query')

      expect(mockStore.touchFact).toHaveBeenCalledTimes(2)
      expect(mockStore.touchFact).toHaveBeenCalledWith('fact_1')
      expect(mockStore.touchFact).toHaveBeenCalledWith('fact_2')
    })

    it('should calculate compression ratio', async () => {
      const messages = [createMessage('user', 'This is a very long message with lots of content')]
      const facts = [createMockFact({ content: 'Short fact' })]
      mockStore = createMockStore({
        getLatestCheckpoint: vi
          .fn<(...args: unknown[]) => unknown>()
          .mockResolvedValue(createMockCheckpoint(messages)),
        getFacts: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue(facts),
      })
      retriever = new HierarchicalRetriever(mockStore, mockEmbedder)

      const result = await retriever.retrieve('thread_1', 'Query')

      expect(result.compressionRatio).not.toBe(undefined)
    })

    it('should sort facts by relevance', async () => {
      const facts = [
        createMockFact({ content: 'Low relevance', relevance: 0.3, embedding: [0.1, 0.1, 0.1] }),
        createMockFact({ content: 'High relevance', relevance: 0.9, embedding: [0.9, 0.9, 0.9] }),
        createMockFact({ content: 'Medium relevance', relevance: 0.6, embedding: [0.5, 0.5, 0.5] }),
      ]
      mockStore = createMockStore({
        getFacts: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue(facts),
      })
      mockEmbedder = createMockEmbedder({
        embed: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue([0.9, 0.9, 0.9]),
      })
      retriever = new HierarchicalRetriever(mockStore, mockEmbedder)

      const result = await retriever.retrieve('thread_1', 'Query')

      expect(result.longTerm.facts.length).toBeGreaterThan(0)
    })

    it('should generate query embedding', async () => {
      mockStore = createMockStore({
        getFacts: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue([]),
      })
      retriever = new HierarchicalRetriever(mockStore, mockEmbedder)

      await retriever.retrieve('thread_1', 'My test query')

      expect(mockEmbedder.embed).toHaveBeenCalledWith('My test query')
    })

    it('should respect minRelevance from config', async () => {
      mockStore = createMockStore()
      retriever = new HierarchicalRetriever(mockStore, mockEmbedder, {
        minRelevance: 0.7,
      })

      await retriever.retrieve('thread_1', 'Query')

      expect(mockStore.getFacts).toHaveBeenCalledWith(
        expect.objectContaining({ minRelevance: 0.7 }),
      )
    })
  })

  describe('short-term memory configuration', () => {
    it('should skip short-term when includeRecentMessages is false', async () => {
      const messages = [createMessage('user', 'Hello')]
      mockStore = createMockStore({
        getLatestCheckpoint: vi
          .fn<(...args: unknown[]) => unknown>()
          .mockResolvedValue(createMockCheckpoint(messages)),
      })
      retriever = new HierarchicalRetriever(mockStore, mockEmbedder, {
        includeRecentMessages: false,
      })

      const result = await retriever.retrieve('thread_1', 'Query')

      expect(result.shortTerm.messages).toHaveLength(0)
    })

    it('should limit messages by recentMessageCount', async () => {
      const messages = [
        createMessage('user', 'Message 1'),
        createMessage('assistant', 'Message 2'),
        createMessage('user', 'Message 3'),
        createMessage('assistant', 'Message 4'),
        createMessage('user', 'Message 5'),
        createMessage('assistant', 'Message 6'),
      ]
      mockStore = createMockStore({
        getLatestCheckpoint: vi
          .fn<(...args: unknown[]) => unknown>()
          .mockResolvedValue(createMockCheckpoint(messages)),
      })
      retriever = new HierarchicalRetriever(mockStore, mockEmbedder, {
        recentMessageCount: 3,
        shortTermMaxTokens: 10000,
      })

      const result = await retriever.retrieve('thread_1', 'Query')

      expect(result.shortTerm.messages.length).toBeLessThanOrEqual(3)
    })

    it('should limit messages by shortTermMaxTokens', async () => {
      const messages = [
        createMessage('user', 'A'.repeat(1000)),
        createMessage('assistant', 'B'.repeat(1000)),
        createMessage('user', 'C'.repeat(1000)),
      ]
      mockStore = createMockStore({
        getLatestCheckpoint: vi
          .fn<(...args: unknown[]) => unknown>()
          .mockResolvedValue(createMockCheckpoint(messages)),
      })
      retriever = new HierarchicalRetriever(mockStore, mockEmbedder, {
        shortTermMaxTokens: 300,
        recentMessageCount: 10,
      })

      const result = await retriever.retrieve('thread_1', 'Query')

      expect(result.shortTerm.messages.length).toBeLessThan(3)
    })
  })

  describe('long-term memory configuration', () => {
    it('should limit facts by longTermMaxTokens', async () => {
      const facts = [
        createMockFact({ content: 'A'.repeat(1000) }),
        createMockFact({ content: 'B'.repeat(1000) }),
        createMockFact({ content: 'C'.repeat(1000) }),
      ]
      mockStore = createMockStore({
        getFacts: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue(facts),
      })
      retriever = new HierarchicalRetriever(mockStore, mockEmbedder, {
        longTermMaxTokens: 300,
      })

      const result = await retriever.retrieve('thread_1', 'Query')

      expect(result.longTerm.facts.length).toBeLessThan(3)
    })
  })
})

describe('DEFAULT_RETRIEVAL_CONFIG', () => {
  it('should have expected default values', () => {
    expect(DEFAULT_RETRIEVAL_CONFIG).toEqual({
      shortTermMaxTokens: 2000,
      longTermMaxTokens: 1000,
      minRelevance: 0.5,
      includeRecentMessages: true,
      recentMessageCount: 5,
    })
  })
})

describe('formatContextForPrompt', () => {
  it('should format empty context', () => {
    const context: RetrievedContext = {
      shortTerm: { messages: [], tokenCount: 0 },
      longTerm: { facts: [], tokenCount: 0 },
      totalTokens: 0,
      compressionRatio: 0,
    }

    const result = formatContextForPrompt(context)

    expect(result).toBe('')
  })

  it('should format short-term messages', () => {
    const context: RetrievedContext = {
      shortTerm: {
        messages: [createMessage('user', 'Hello'), createMessage('assistant', 'Hi there!')],
        tokenCount: 10,
      },
      longTerm: { facts: [], tokenCount: 0 },
      totalTokens: 10,
      compressionRatio: 0,
    }

    const result = formatContextForPrompt(context)

    expect(result).toContain('## Recent Conversation')
    expect(result).toContain('user: Hello')
    expect(result).toContain('assistant: Hi there!')
  })

  it('should format long-term facts', () => {
    const context: RetrievedContext = {
      shortTerm: { messages: [], tokenCount: 0 },
      longTerm: {
        facts: [
          createMockFact({ category: 'preference', content: 'User prefers dark mode' }),
          createMockFact({ category: 'context', content: 'Project uses TypeScript' }),
        ],
        tokenCount: 20,
      },
      totalTokens: 20,
      compressionRatio: 0.5,
    }

    const result = formatContextForPrompt(context)

    expect(result).toContain('## Relevant Context')
    expect(result).toContain('[preference] User prefers dark mode')
    expect(result).toContain('[context] Project uses TypeScript')
  })

  it('should format both short-term and long-term', () => {
    const context: RetrievedContext = {
      shortTerm: {
        messages: [createMessage('user', 'Question')],
        tokenCount: 5,
      },
      longTerm: {
        facts: [createMockFact({ category: 'decision', content: 'Using React' })],
        tokenCount: 10,
      },
      totalTokens: 15,
      compressionRatio: 0.3,
    }

    const result = formatContextForPrompt(context)

    expect(result).toContain('## Recent Conversation')
    expect(result).toContain('## Relevant Context')
  })
})

describe('createHierarchicalRetriever', () => {
  it('should create a hierarchical retriever', () => {
    const mockStore = createMockStore()
    const mockEmbedder = createMockEmbedder()

    const retriever = createHierarchicalRetriever(mockStore, mockEmbedder)

    expect(retriever).toBeInstanceOf(HierarchicalRetriever)
  })

  it('should accept custom config', () => {
    const mockStore = createMockStore()
    const mockEmbedder = createMockEmbedder()

    const retriever = createHierarchicalRetriever(mockStore, mockEmbedder, {
      shortTermMaxTokens: 5000,
      minRelevance: 0.8,
    })

    expect(retriever).toBeInstanceOf(HierarchicalRetriever)
  })
})

describe('cosineSimilarity edge cases', () => {
  let retriever: HierarchicalRetriever
  let mockStore: MemoryStore
  let mockEmbedder: EmbeddingProvider

  beforeEach(() => {
    vi.clearAllMocks()
    mockStore = createMockStore()
    mockEmbedder = createMockEmbedder()
    retriever = new HierarchicalRetriever(mockStore, mockEmbedder)
  })

  it('should handle facts without embeddings using relevance score', async () => {
    const factsWithoutEmbedding = [
      createMockFact({
        content: 'Fact without embedding',
        relevance: 0.75,
        embedding: undefined,
      }),
    ]
    mockStore = createMockStore({
      getFacts: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue(factsWithoutEmbedding),
    })
    retriever = new HierarchicalRetriever(mockStore, mockEmbedder)

    const result = await retriever.retrieve('thread_1', 'Query')

    expect(result.longTerm.facts).toHaveLength(1)
    expect(result.longTerm.facts[0]?.relevance).toBe(0.75)
  })

  it('should handle vectors of different lengths', async () => {
    const factsWithDifferentEmbedding = [
      createMockFact({
        content: 'Fact with different embedding size',
        relevance: 0.5,
        embedding: [0.1, 0.2],
      }),
    ]
    mockStore = createMockStore({
      getFacts: vi
        .fn<(...args: unknown[]) => unknown>()
        .mockResolvedValue(factsWithDifferentEmbedding),
    })
    retriever = new HierarchicalRetriever(mockStore, mockEmbedder)

    const result = await retriever.retrieve('thread_1', 'Query')

    expect(result.longTerm.facts).toHaveLength(1)
    expect(result.longTerm.facts[0]?.relevance).toBe(0)
  })

  it('should handle zero vector embeddings', async () => {
    const factsWithZeroEmbedding = [
      createMockFact({
        content: 'Fact with zero embedding',
        relevance: 0.5,
        embedding: [0, 0, 0],
      }),
    ]
    mockStore = createMockStore({
      getFacts: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue(factsWithZeroEmbedding),
    })
    retriever = new HierarchicalRetriever(mockStore, mockEmbedder)

    const result = await retriever.retrieve('thread_1', 'Query')

    expect(result.longTerm.facts).toHaveLength(1)
    expect(result.longTerm.facts[0]?.relevance).toBe(0)
  })

  it('should compute correct cosine similarity for identical vectors', async () => {
    const factsWithMatchingEmbedding = [
      createMockFact({
        content: 'Fact with matching embedding',
        relevance: 0.5,
        embedding: [0.1, 0.2, 0.3],
      }),
    ]
    mockStore = createMockStore({
      getFacts: vi
        .fn<(...args: unknown[]) => unknown>()
        .mockResolvedValue(factsWithMatchingEmbedding),
    })
    retriever = new HierarchicalRetriever(mockStore, mockEmbedder)

    const result = await retriever.retrieve('thread_1', 'Query')

    expect(result.longTerm.facts).toHaveLength(1)
    expect(result.longTerm.facts[0]?.relevance).toBeCloseTo(1, 5)
  })
})
