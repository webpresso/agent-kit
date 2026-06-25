import { shortId } from "#shared-utils/short-id.js";

import type {
  ConfidenceLevel,
  Fact,
  FactCategory,
  FactExtractionOptions,
  FactExtractionResult,
  FactId,
} from "./types.js";

export interface FactExtractionLLM {
  extractFacts(
    text: string,
    options: { categories?: FactCategory[]; maxFacts?: number },
  ): Promise<ExtractedFactData[]>;
  embed(text: string): Promise<number[]>;
  countTokens(text: string): number;
}

export interface ExtractedFactData {
  category: FactCategory;
  content: string;
  confidence: ConfidenceLevel;
}

export class FactExtractor {
  private llm: FactExtractionLLM;

  constructor(llm: FactExtractionLLM) {
    this.llm = llm;
  }

  async extractFromMessage(
    message: string,
    options: FactExtractionOptions,
  ): Promise<FactExtractionResult> {
    const sourceTokens = this.llm.countTokens(message);
    const extractedFacts = await this.llm.extractFacts(message, {
      categories: options.categories,
      maxFacts: options.maxFacts ?? 10,
    });

    const filteredFacts = options.minConfidence
      ? this.filterByConfidence(extractedFacts, options.minConfidence)
      : extractedFacts;

    const facts = await this.createFacts(filteredFacts, options.threadId);
    const compressedTokens = this.calculateCompressedTokens(facts);
    const compressionRatio = sourceTokens > 0 ? 1 - compressedTokens / sourceTokens : 0;

    return {
      facts,
      sourceTokens,
      compressedTokens,
      compressionRatio,
    };
  }

  async extractFromConversation(
    messages: string[],
    options: FactExtractionOptions,
  ): Promise<FactExtractionResult> {
    const allFacts: Fact[] = [];
    let totalSourceTokens = 0;
    let totalCompressedTokens = 0;

    for (const message of messages) {
      const result = await this.extractFromMessage(message, options);
      allFacts.push(...result.facts);
      totalSourceTokens += result.sourceTokens;
      totalCompressedTokens += result.compressedTokens;
    }

    const dedupedFacts = this.deduplicateFacts(allFacts);

    return {
      facts: dedupedFacts,
      sourceTokens: totalSourceTokens,
      compressedTokens: this.calculateCompressedTokens(dedupedFacts),
      compressionRatio: totalSourceTokens > 0 ? 1 - totalCompressedTokens / totalSourceTokens : 0,
    };
  }

  private filterByConfidence(
    facts: ExtractedFactData[],
    minConfidence: ConfidenceLevel,
  ): ExtractedFactData[] {
    const confidenceLevels: Record<ConfidenceLevel, number> = {
      high: 3,
      medium: 2,
      low: 1,
    };
    const minLevel = confidenceLevels[minConfidence];
    return facts.filter((fact) => confidenceLevels[fact.confidence] >= minLevel);
  }

  private async createFacts(
    extractedFacts: ExtractedFactData[],
    threadId: string,
  ): Promise<Fact[]> {
    const now = new Date();
    const facts: Fact[] = [];

    for (const data of extractedFacts) {
      const embedding = await this.llm.embed(data.content);
      facts.push({
        id: generateFactId(),
        threadId,
        category: data.category,
        content: data.content,
        confidence: data.confidence,
        embedding,
        accessCount: 0,
        lastAccessedAt: now,
        createdAt: now,
        invalidated: false,
      });
    }

    return facts;
  }

  private deduplicateFacts(facts: Fact[]): Fact[] {
    const seen = new Set<string>();
    const unique: Fact[] = [];

    for (const fact of facts) {
      const normalized = fact.content.toLowerCase().trim();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        unique.push(fact);
      }
    }

    return unique;
  }

  private calculateCompressedTokens(facts: Fact[]): number {
    const totalChars = facts.reduce((sum, fact) => sum + fact.content.length, 0);
    return Math.ceil(totalChars / 4);
  }
}

export function generateFactId(): FactId {
  const timestamp = Date.now().toString(36);
  return `fact_${timestamp}_${shortId(6)}`;
}

export const FACT_EXTRACTION_PROMPT = `Extract key facts from the following conversation message.

For each fact, provide:
- category: one of preference, context, decision, constraint, entity, relationship, event
- content: a concise statement of the fact
- confidence: high, medium, or low

Focus on:
- User preferences and requirements
- Project context and constraints
- Technical decisions made
- Named entities (files, databases, APIs)
- Relationships between entities

Return as JSON array:
[
  {"category": "preference", "content": "User prefers TypeScript over JavaScript", "confidence": "high"},
  ...
]

Message:
{{message}}`;

export function createFactExtractor(llm: FactExtractionLLM): FactExtractor {
  return new FactExtractor(llm);
}
