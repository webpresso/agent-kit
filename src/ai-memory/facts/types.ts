export type FactId = string;

export type FactCategory =
  | "preference"
  | "context"
  | "decision"
  | "constraint"
  | "entity"
  | "relationship"
  | "event";

export type ConfidenceLevel = "high" | "medium" | "low";

export interface Fact {
  id: FactId;
  threadId: string;
  category: FactCategory;
  content: string;
  confidence: ConfidenceLevel;
  sourceId?: string;
  embedding?: number[];
  accessCount: number;
  lastAccessedAt: Date;
  createdAt: Date;
  invalidated: boolean;
  invalidationReason?: string;
}

export interface FactExtractionOptions {
  threadId: string;
  categories?: FactCategory[];
  minConfidence?: ConfidenceLevel;
  maxFacts?: number;
}

export interface FactExtractionResult {
  facts: Fact[];
  sourceTokens: number;
  compressedTokens: number;
  compressionRatio: number;
}

export interface FactRetrievalOptions {
  threadId: string;
  query?: string;
  categories?: FactCategory[];
  limit?: number;
  minRelevance?: number;
  includeInvalidated?: boolean;
}

export interface RetrievedFact extends Fact {
  relevance: number;
}

export interface FactConsolidationOptions {
  threadId: string;
  similarityThreshold?: number;
  invalidateSuperseded?: boolean;
}

export interface FactConsolidationResult {
  merged: number;
  invalidated: number;
  remaining: number;
}

export type MemoryTier = "short_term" | "long_term" | "archived";

export interface MemoryEntry {
  id: string;
  content: string;
  tier: MemoryTier;
  facts: FactId[];
  tokenCount: number;
  createdAt: Date;
  expiresAt?: Date;
}
