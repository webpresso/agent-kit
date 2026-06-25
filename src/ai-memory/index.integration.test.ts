import { describe, expect, it } from "vitest";

import {
  BaseCheckpointSaver,
  type Checkpoint,
  type CheckpointConfig,
  type CheckpointId,
  type CheckpointResult,
  type CheckpointState,
  createFactConsolidator,
  createFactExtractor,
  createHierarchicalRetriever,
  DEFAULT_RETRIEVAL_CONFIG,
  type EmbeddingProvider,
  type Fact,
  type FactDatabase,
  FACT_EXTRACTION_PROMPT,
  generateCheckpointId,
  generateFactId,
  generateThreadId,
  type ListCheckpointsOptions,
  type MemoryStore,
  type RetrievedFact,
  formatContextForPrompt,
} from "./index.js";

class TestCheckpointSaver extends BaseCheckpointSaver {
  private checkpoints = new Map<CheckpointId, Checkpoint>();

  async save(
    config: CheckpointConfig,
    state: CheckpointState,
    parentId?: CheckpointId,
  ): Promise<CheckpointResult> {
    const checkpointId = generateCheckpointId();
    this.checkpoints.set(checkpointId, {
      id: checkpointId,
      threadId: config.threadId,
      state,
      parentId,
      metadata: {
        source: "system",
        step: 1,
        createdAt: new Date(),
      },
      createdAt: new Date(),
    });

    return {
      success: true,
      checkpointId,
    };
  }

  async loadLatest(threadId: string): Promise<Checkpoint | null> {
    return (
      Array.from(this.checkpoints.values())
        .filter((checkpoint) => checkpoint.threadId === threadId)
        .toSorted((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null
    );
  }

  async load(checkpointId: CheckpointId): Promise<Checkpoint | null> {
    return this.checkpoints.get(checkpointId) ?? null;
  }

  async list(options?: ListCheckpointsOptions): Promise<Checkpoint[]> {
    return Array.from(this.checkpoints.values()).filter(
      (checkpoint) => !options?.threadId || checkpoint.threadId === options.threadId,
    );
  }

  async delete(checkpointId: CheckpointId): Promise<CheckpointResult> {
    return {
      success: this.checkpoints.delete(checkpointId),
      checkpointId,
    };
  }

  async clearThread(threadId: string): Promise<CheckpointResult> {
    for (const [checkpointId, checkpoint] of this.checkpoints.entries()) {
      if (checkpoint.threadId === threadId) {
        this.checkpoints.delete(checkpointId);
      }
    }

    return { success: true };
  }
}

describe("ai-memory package facade", () => {
  it("exports the extracted memory primitives", () => {
    expect(typeof BaseCheckpointSaver).toBe("function");
    expect(typeof createFactConsolidator).toBe("function");
    expect(typeof createFactExtractor).toBe("function");
    expect(typeof createHierarchicalRetriever).toBe("function");
    expect(typeof generateCheckpointId).toBe("function");
    expect(typeof generateFactId).toBe("function");
    expect(typeof generateThreadId).toBe("function");
    expect(typeof FACT_EXTRACTION_PROMPT).toBe("string");
    expect(DEFAULT_RETRIEVAL_CONFIG.recentMessageCount).toBeGreaterThan(0);
  });

  it("supports checkpoint saver tuple retrieval through the extracted facade", async () => {
    const saver = new TestCheckpointSaver();
    const config: CheckpointConfig = {
      threadId: "thread_1",
      userId: "user_1",
    };
    const state: CheckpointState = {
      messages: [{ role: "user", content: "Hello from ai-memory" }],
      toolCalls: [],
    };

    const result = await saver.save(config, state);
    const tuple = await saver.getTuple(config);

    expect(result.success).toBe(true);
    expect(tuple?.checkpoint.id).toBe(result.checkpointId);
    expect(tuple?.checkpoint.state).toEqual(state);
  });

  it("extracts and deduplicates facts through the extracted facade", async () => {
    const extractor = createFactExtractor({
      countTokens: () => 40,
      embed: async () => [0.1, 0.2, 0.3],
      extractFacts: async () => [
        { category: "preference", content: "User prefers TypeScript", confidence: "high" },
        { category: "preference", content: "User prefers TypeScript", confidence: "high" },
      ],
    });

    const result = await extractor.extractFromConversation(["TypeScript", "TypeScript"], {
      threadId: "thread_1",
      minConfidence: "medium",
    });

    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]?.content).toBe("User prefers TypeScript");
    expect(result.sourceTokens).toBe(80);
  });

  it("consolidates similar facts through the extracted facade", async () => {
    const baseDate = new Date("2024-01-01T00:00:00.000Z");
    const facts = new Map<string, Fact>([
      [
        "fact_low",
        {
          id: "fact_low",
          threadId: "thread_1",
          category: "preference",
          content: "User prefers dark mode",
          confidence: "low",
          embedding: [1, 0, 0],
          accessCount: 1,
          lastAccessedAt: baseDate,
          createdAt: baseDate,
          invalidated: false,
        },
      ],
      [
        "fact_high",
        {
          id: "fact_high",
          threadId: "thread_1",
          category: "preference",
          content: "User prefers dark mode",
          confidence: "high",
          embedding: [1, 0, 0],
          accessCount: 2,
          lastAccessedAt: baseDate,
          createdAt: new Date("2024-01-02T00:00:00.000Z"),
          invalidated: false,
        },
      ],
    ]);

    const db: FactDatabase = {
      delete: async (factId) => {
        facts.delete(factId);
      },
      findByThread: async (threadId) =>
        Array.from(facts.values()).filter((fact) => fact.threadId === threadId),
      insert: async (fact) => {
        facts.set(fact.id, fact);
      },
      update: async (factId, updates) => {
        const current = facts.get(factId);
        if (current) {
          facts.set(factId, { ...current, ...updates });
        }
      },
    };

    const result = await createFactConsolidator(db).consolidate({
      threadId: "thread_1",
      similarityThreshold: 0.99,
    });

    expect(result.merged).toBe(1);
    expect(result.invalidated).toBe(1);
    expect(facts.get("fact_low")?.invalidated).toBe(true);
    expect(facts.get("fact_high")?.accessCount).toBe(3);
  });

  it("retrieves and formats hierarchical context through the extracted facade", async () => {
    const store: MemoryStore = {
      getFacts: async () => {
        const fact: RetrievedFact = {
          id: "fact_1",
          threadId: "thread_1",
          category: "context",
          content: "Project uses React",
          confidence: "high",
          relevance: 0.9,
          embedding: [0.1, 0.2, 0.3],
          accessCount: 0,
          lastAccessedAt: new Date("2024-01-01T00:00:00.000Z"),
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
          invalidated: false,
        };

        return [fact];
      },
      getLatestCheckpoint: async () => ({
        id: "ckpt_1",
        threadId: "thread_1",
        state: {
          messages: [{ role: "user", content: "What stack do we use?" }],
          toolCalls: [],
        },
        metadata: {
          source: "user",
          step: 1,
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
        },
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
      }),
      touchFact: async () => undefined,
    };
    const embedder: EmbeddingProvider = {
      embed: async () => [0.1, 0.2, 0.3],
    };

    const context = await createHierarchicalRetriever(store, embedder).retrieve(
      "thread_1",
      "react stack",
    );
    const formatted = formatContextForPrompt(context);

    expect(context.shortTerm.messages).toHaveLength(1);
    expect(context.longTerm.facts).toHaveLength(1);
    expect(formatted).toContain("## Recent Conversation");
    expect(formatted).toContain("## Relevant Context");
    expect(formatted).toContain("Project uses React");
  });
});
