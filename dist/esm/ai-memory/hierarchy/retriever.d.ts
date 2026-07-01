import type { Checkpoint, CheckpointState } from "#ai-memory/checkpoint/types";
import type { FactRetrievalOptions, RetrievedFact } from "#ai-memory/facts/types";
export interface MemoryRetrievalConfig {
    shortTermMaxTokens: number;
    longTermMaxTokens: number;
    minRelevance: number;
    includeRecentMessages: boolean;
    recentMessageCount: number;
}
export declare const DEFAULT_RETRIEVAL_CONFIG: MemoryRetrievalConfig;
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
export declare class HierarchicalRetriever {
    private store;
    private embedder;
    private config;
    constructor(store: MemoryStore, embedder: EmbeddingProvider, config?: Partial<MemoryRetrievalConfig>);
    retrieve(threadId: string, query: string): Promise<RetrievedContext>;
    private retrieveShortTerm;
    private retrieveLongTerm;
    private selectRecentMessages;
    private selectFactsWithinLimit;
    private estimateOriginalTokens;
    private estimateTokens;
    private cosineSimilarity;
}
export declare function formatContextForPrompt(context: RetrievedContext): string;
export declare function createHierarchicalRetriever(store: MemoryStore, embedder: EmbeddingProvider, config?: Partial<MemoryRetrievalConfig>): HierarchicalRetriever;
//# sourceMappingURL=retriever.d.ts.map