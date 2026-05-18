import type { ConfidenceLevel, FactCategory, FactExtractionOptions, FactExtractionResult, FactId } from './types.js';
export interface FactExtractionLLM {
    extractFacts(text: string, options: {
        categories?: FactCategory[];
        maxFacts?: number;
    }): Promise<ExtractedFactData[]>;
    embed(text: string): Promise<number[]>;
    countTokens(text: string): number;
}
export interface ExtractedFactData {
    category: FactCategory;
    content: string;
    confidence: ConfidenceLevel;
}
export declare class FactExtractor {
    private llm;
    constructor(llm: FactExtractionLLM);
    extractFromMessage(message: string, options: FactExtractionOptions): Promise<FactExtractionResult>;
    extractFromConversation(messages: string[], options: FactExtractionOptions): Promise<FactExtractionResult>;
    private filterByConfidence;
    private createFacts;
    private deduplicateFacts;
    private calculateCompressedTokens;
}
export declare function generateFactId(): FactId;
export declare const FACT_EXTRACTION_PROMPT = "Extract key facts from the following conversation message.\n\nFor each fact, provide:\n- category: one of preference, context, decision, constraint, entity, relationship, event\n- content: a concise statement of the fact\n- confidence: high, medium, or low\n\nFocus on:\n- User preferences and requirements\n- Project context and constraints\n- Technical decisions made\n- Named entities (files, databases, APIs)\n- Relationships between entities\n\nReturn as JSON array:\n[\n  {\"category\": \"preference\", \"content\": \"User prefers TypeScript over JavaScript\", \"confidence\": \"high\"},\n  ...\n]\n\nMessage:\n{{message}}";
export declare function createFactExtractor(llm: FactExtractionLLM): FactExtractor;
//# sourceMappingURL=extractor.d.ts.map