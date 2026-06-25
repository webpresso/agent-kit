import type { Checkpoint, CheckpointState, SerializedMessage } from "#ai-memory/checkpoint/types";
import type { FactRetrievalOptions, RetrievedFact } from "#ai-memory/facts/types";

export interface MemoryRetrievalConfig {
  shortTermMaxTokens: number;
  longTermMaxTokens: number;
  minRelevance: number;
  includeRecentMessages: boolean;
  recentMessageCount: number;
}

export const DEFAULT_RETRIEVAL_CONFIG: MemoryRetrievalConfig = {
  shortTermMaxTokens: 2000,
  longTermMaxTokens: 1000,
  minRelevance: 0.5,
  includeRecentMessages: true,
  recentMessageCount: 5,
};

export interface RetrievedContext {
  shortTerm: {
    messages: CheckpointState["messages"];
    tokenCount: number;
  };
  longTerm: {
    facts: RetrievedFact[];
    tokenCount: number;
  };
  totalTokens: number;
  compressionRatio: number;
}

export interface MemoryStore {
  getLatestCheckpoint(threadId: string): Promise<Checkpoint | null>;
  getFacts(options: FactRetrievalOptions): Promise<RetrievedFact[]>;
  touchFact(factId: string): Promise<void>;
}

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

export class HierarchicalRetriever {
  private store: MemoryStore;
  private embedder: EmbeddingProvider;
  private config: MemoryRetrievalConfig;

  constructor(
    store: MemoryStore,
    embedder: EmbeddingProvider,
    config: Partial<MemoryRetrievalConfig> = {},
  ) {
    this.store = store;
    this.embedder = embedder;
    this.config = { ...DEFAULT_RETRIEVAL_CONFIG, ...config };
  }

  async retrieve(threadId: string, query: string): Promise<RetrievedContext> {
    const shortTerm = await this.retrieveShortTerm(threadId);
    const longTerm = await this.retrieveLongTerm(threadId, query);
    const totalTokens = shortTerm.tokenCount + longTerm.tokenCount;
    const estimatedOriginalTokens = await this.estimateOriginalTokens(threadId);
    const compressionRatio =
      estimatedOriginalTokens > 0 ? 1 - totalTokens / estimatedOriginalTokens : 0;

    return {
      shortTerm,
      longTerm,
      totalTokens,
      compressionRatio,
    };
  }

  private async retrieveShortTerm(threadId: string): Promise<RetrievedContext["shortTerm"]> {
    if (!this.config.includeRecentMessages) {
      return { messages: [], tokenCount: 0 };
    }

    const checkpoint = await this.store.getLatestCheckpoint(threadId);
    if (!checkpoint) {
      return { messages: [], tokenCount: 0 };
    }

    const messages = this.selectRecentMessages(
      checkpoint.state.messages,
      this.config.recentMessageCount,
      this.config.shortTermMaxTokens,
    );

    const tokenCount = this.estimateTokens(
      messages.map((message: SerializedMessage) => message.content).join(" "),
    );

    return { messages, tokenCount };
  }

  private async retrieveLongTerm(
    threadId: string,
    query: string,
  ): Promise<RetrievedContext["longTerm"]> {
    const queryEmbedding = await this.embedder.embed(query);
    const facts = await this.store.getFacts({
      threadId,
      query,
      minRelevance: this.config.minRelevance,
      limit: 50,
    });

    const scoredFacts = facts.map((fact) =>
      Object.assign({}, fact, {
        relevance: fact.embedding
          ? this.cosineSimilarity(queryEmbedding, fact.embedding)
          : fact.relevance,
      }),
    );

    scoredFacts.sort((a, b) => b.relevance - a.relevance);

    const selectedFacts = this.selectFactsWithinLimit(scoredFacts, this.config.longTermMaxTokens);

    for (const fact of selectedFacts) {
      await this.store.touchFact(fact.id);
    }

    const tokenCount = this.estimateTokens(selectedFacts.map((fact) => fact.content).join(" "));

    return { facts: selectedFacts, tokenCount };
  }

  private selectRecentMessages(
    messages: CheckpointState["messages"],
    maxCount: number,
    maxTokens: number,
  ): CheckpointState["messages"] {
    const recent = messages.slice(-maxCount);
    const selected: CheckpointState["messages"] = [];
    let tokens = 0;

    for (let i = recent.length - 1; i >= 0; i--) {
      const message = recent[i];
      if (!message) continue;
      const messageTokens = this.estimateTokens(message.content);
      if (tokens + messageTokens > maxTokens) break;
      selected.unshift(message);
      tokens += messageTokens;
    }

    return selected;
  }

  private selectFactsWithinLimit(facts: RetrievedFact[], maxTokens: number): RetrievedFact[] {
    const selected: RetrievedFact[] = [];
    let tokens = 0;

    for (const fact of facts) {
      const factTokens = this.estimateTokens(fact.content);
      if (tokens + factTokens > maxTokens) break;
      selected.push(fact);
      tokens += factTokens;
    }

    return selected;
  }

  private async estimateOriginalTokens(threadId: string): Promise<number> {
    const checkpoint = await this.store.getLatestCheckpoint(threadId);
    if (!checkpoint) return 0;
    const allContent = checkpoint.state.messages
      .map((message: SerializedMessage) => message.content)
      .join(" ");
    return this.estimateTokens(allContent);
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const aVal = a[i] ?? 0;
      const bVal = b[i] ?? 0;
      dotProduct += aVal * bVal;
      normA += aVal * aVal;
      normB += bVal * bVal;
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }
}

export function formatContextForPrompt(context: RetrievedContext): string {
  const sections: string[] = [];

  if (context.shortTerm.messages.length > 0) {
    sections.push("## Recent Conversation");
    for (const message of context.shortTerm.messages) {
      sections.push(`${message.role}: ${message.content}`);
    }
  }

  if (context.longTerm.facts.length > 0) {
    sections.push("\n## Relevant Context");
    for (const fact of context.longTerm.facts) {
      sections.push(`- [${fact.category}] ${fact.content}`);
    }
  }

  return sections.join("\n");
}

export function createHierarchicalRetriever(
  store: MemoryStore,
  embedder: EmbeddingProvider,
  config?: Partial<MemoryRetrievalConfig>,
): HierarchicalRetriever {
  return new HierarchicalRetriever(store, embedder, config);
}
