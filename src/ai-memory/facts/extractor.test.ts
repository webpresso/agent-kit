import type { ConfidenceLevel, FactCategory, FactExtractionOptions } from "./types.js";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createFactExtractor,
  type ExtractedFactData,
  FACT_EXTRACTION_PROMPT,
  type FactExtractionLLM,
  FactExtractor,
  generateFactId,
} from "./extractor.js";

function createMockLLM(overrides: Partial<FactExtractionLLM> = {}): FactExtractionLLM {
  return {
    extractFacts: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue([]),
    embed: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue([0.1, 0.2, 0.3]),
    countTokens: vi.fn<(...args: unknown[]) => unknown>().mockReturnValue(100),
    ...overrides,
  };
}

describe("FactExtractor", () => {
  let extractor: FactExtractor;
  let mockLLM: FactExtractionLLM;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLLM = createMockLLM();
    extractor = new FactExtractor(mockLLM);
  });

  describe("extractFromMessage", () => {
    it("should extract facts from a message", async () => {
      const extractedFacts: ExtractedFactData[] = [
        { category: "preference", content: "User prefers TypeScript", confidence: "high" },
        { category: "context", content: "Project uses React", confidence: "medium" },
      ];
      mockLLM = createMockLLM({
        extractFacts: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue(extractedFacts),
      });
      extractor = new FactExtractor(mockLLM);

      const options: FactExtractionOptions = { threadId: "thread_1" };

      const result = await extractor.extractFromMessage(
        "I prefer TypeScript and use React",
        options,
      );

      expect(result.facts).toHaveLength(2);
      expect(result.facts[0]?.content).toBe("User prefers TypeScript");
      expect(result.facts[1]?.content).toBe("Project uses React");
    });

    it("should include embeddings for each fact", async () => {
      const extractedFacts: ExtractedFactData[] = [
        { category: "preference", content: "User likes dark mode", confidence: "high" },
      ];
      const embeddings = [0.5, 0.6, 0.7];
      mockLLM = createMockLLM({
        extractFacts: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue(extractedFacts),
        embed: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue(embeddings),
      });
      extractor = new FactExtractor(mockLLM);

      const result = await extractor.extractFromMessage("I like dark mode", {
        threadId: "thread_1",
      });

      expect(result.facts[0]?.embedding).toEqual(embeddings);
    });

    it("should filter by minimum confidence", async () => {
      const extractedFacts: ExtractedFactData[] = [
        { category: "preference", content: "High confidence fact", confidence: "high" },
        { category: "context", content: "Medium confidence fact", confidence: "medium" },
        { category: "context", content: "Low confidence fact", confidence: "low" },
      ];
      mockLLM = createMockLLM({
        extractFacts: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue(extractedFacts),
      });
      extractor = new FactExtractor(mockLLM);

      const result = await extractor.extractFromMessage("Some message", {
        threadId: "thread_1",
        minConfidence: "medium",
      });

      expect(result.facts).toHaveLength(2);
      expect(result.facts.every((f) => f.confidence !== "low")).toBe(true);
    });

    it("should calculate compression ratio", async () => {
      const extractedFacts: ExtractedFactData[] = [
        { category: "preference", content: "Short fact", confidence: "high" },
      ];
      mockLLM = createMockLLM({
        extractFacts: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue(extractedFacts),
        countTokens: vi.fn<(...args: unknown[]) => unknown>().mockReturnValue(100),
      });
      extractor = new FactExtractor(mockLLM);

      const result = await extractor.extractFromMessage("A long message with many words", {
        threadId: "thread_1",
      });

      expect(result.sourceTokens).toBe(100);
      expect(result.compressedTokens).toBeGreaterThan(0);
      expect(result.compressionRatio).toBeGreaterThan(0);
    });

    it("should pass maxFacts option to LLM", async () => {
      mockLLM = createMockLLM({
        extractFacts: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue([]),
      });
      extractor = new FactExtractor(mockLLM);

      await extractor.extractFromMessage("Test message", {
        threadId: "thread_1",
        maxFacts: 5,
      });

      expect(mockLLM.extractFacts).toHaveBeenCalledWith("Test message", {
        categories: undefined,
        maxFacts: 5,
      });
    });

    it("should default maxFacts to 10", async () => {
      await extractor.extractFromMessage("Test message", { threadId: "thread_1" });

      expect(mockLLM.extractFacts).toHaveBeenCalledWith("Test message", {
        categories: undefined,
        maxFacts: 10,
      });
    });

    it("should pass categories option to LLM", async () => {
      const categories: FactCategory[] = ["preference", "decision"];

      await extractor.extractFromMessage("Test message", {
        threadId: "thread_1",
        categories,
      });

      expect(mockLLM.extractFacts).toHaveBeenCalledWith("Test message", {
        categories,
        maxFacts: 10,
      });
    });

    it("should handle empty extraction result", async () => {
      mockLLM = createMockLLM({
        extractFacts: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue([]),
        countTokens: vi.fn<(...args: unknown[]) => unknown>().mockReturnValue(50),
      });
      extractor = new FactExtractor(mockLLM);

      const result = await extractor.extractFromMessage("No facts here", { threadId: "thread_1" });

      expect(result.facts).toHaveLength(0);
      expect(result.sourceTokens).toBe(50);
      expect(result.compressedTokens).toBe(0);
    });

    it("should handle zero source tokens", async () => {
      mockLLM = createMockLLM({
        extractFacts: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue([]),
        countTokens: vi.fn<(...args: unknown[]) => unknown>().mockReturnValue(0),
      });
      extractor = new FactExtractor(mockLLM);

      const result = await extractor.extractFromMessage("", { threadId: "thread_1" });

      expect(result.compressionRatio).toBe(0);
    });
  });

  describe("extractFromConversation", () => {
    it("should extract facts from multiple messages", async () => {
      mockLLM = createMockLLM({
        extractFacts: vi
          .fn<(...args: unknown[]) => unknown>()
          .mockResolvedValueOnce([
            {
              category: "preference" as FactCategory,
              content: "Fact from message 1",
              confidence: "high" as ConfidenceLevel,
            },
          ])
          .mockResolvedValueOnce([
            {
              category: "context" as FactCategory,
              content: "Fact from message 2",
              confidence: "medium" as ConfidenceLevel,
            },
          ]),
        countTokens: vi.fn<(...args: unknown[]) => unknown>().mockReturnValue(50),
      });
      extractor = new FactExtractor(mockLLM);

      const messages = ["First message", "Second message"];

      const result = await extractor.extractFromConversation(messages, { threadId: "thread_1" });

      expect(result.facts).toHaveLength(2);
      expect(result.sourceTokens).toBe(100);
    });

    it("should deduplicate facts from conversation", async () => {
      const duplicateFact: ExtractedFactData = {
        category: "preference",
        content: "User prefers TypeScript",
        confidence: "high",
      };
      mockLLM = createMockLLM({
        extractFacts: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue([duplicateFact]),
      });
      extractor = new FactExtractor(mockLLM);

      const messages = ["TypeScript is great", "I love TypeScript"];

      const result = await extractor.extractFromConversation(messages, { threadId: "thread_1" });

      expect(result.facts).toHaveLength(1);
    });

    it("should handle empty message array", async () => {
      const result = await extractor.extractFromConversation([], { threadId: "thread_1" });

      expect(result.facts).toHaveLength(0);
      expect(result.sourceTokens).toBe(0);
    });
  });
});

describe("generateFactId", () => {
  it("should generate unique IDs", () => {
    const id1 = generateFactId();
    const id2 = generateFactId();
    const id3 = generateFactId();

    expect(id1).not.toBe(id2);
    expect(id2).not.toBe(id3);
  });

  it("should start with fact_ prefix", () => {
    const id = generateFactId();

    expect(id.startsWith("fact_")).toBe(true);
  });

  it("should contain alphanumeric characters", () => {
    const id = generateFactId();

    expect(id).toMatch(/^fact_[a-z0-9]+_[a-z0-9]+$/);
  });
});

describe("FACT_EXTRACTION_PROMPT", () => {
  it("should be defined", () => {
    expect(FACT_EXTRACTION_PROMPT).not.toBe(undefined);
  });

  it("should contain placeholder for message", () => {
    expect(FACT_EXTRACTION_PROMPT).toContain("{{message}}");
  });

  it("should mention all fact categories", () => {
    expect(FACT_EXTRACTION_PROMPT).toContain("preference");
    expect(FACT_EXTRACTION_PROMPT).toContain("context");
    expect(FACT_EXTRACTION_PROMPT).toContain("decision");
    expect(FACT_EXTRACTION_PROMPT).toContain("constraint");
    expect(FACT_EXTRACTION_PROMPT).toContain("entity");
    expect(FACT_EXTRACTION_PROMPT).toContain("relationship");
    expect(FACT_EXTRACTION_PROMPT).toContain("event");
  });

  it("should mention confidence levels", () => {
    expect(FACT_EXTRACTION_PROMPT).toContain("high");
    expect(FACT_EXTRACTION_PROMPT).toContain("medium");
    expect(FACT_EXTRACTION_PROMPT).toContain("low");
  });
});

describe("createFactExtractor", () => {
  it("should create a fact extractor", () => {
    const mockLLM = createMockLLM();

    const extractor = createFactExtractor(mockLLM);

    expect(extractor).toBeInstanceOf(FactExtractor);
  });
});
