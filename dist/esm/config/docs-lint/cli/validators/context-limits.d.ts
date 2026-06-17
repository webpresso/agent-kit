import type { ContextFileLimits, ValidationError } from '#config/docs-lint/index';
/**
 * Context file size limits based on best practices.
 *
 * Research sources:
 * - HumanLayer: <60 lines ideal, <300 max for CLAUDE.md
 * - Anthropic: Keep concise, ~150-200 instruction limit (Claude uses ~50)
 * - Token budget: 200k total, ~20k baseline, 180k available
 *
 * @see https://www.humanlayer.dev/blog/writing-a-good-claude-md
 * @see https://www.anthropic.com/engineering/claude-code-best-practices
 */
export declare const CONTEXT_FILE_LIMITS: Record<string, ContextFileLimits>;
/**
 * Pattern-based limits for files matching globs.
 */
export declare const CONTEXT_FILE_PATTERNS: Array<{
    pattern: RegExp;
    limits: ContextFileLimits;
}>;
/**
 * Estimate token count from content.
 * Uses rough approximation of 1 token ≈ 4 characters.
 * This is conservative - actual tokenization varies by content.
 */
export declare function estimateTokens(content: string): number;
/**
 * Count lines in content.
 */
export declare function countLines(content: string): number;
/**
 * Get limits for a file path.
 * Returns undefined if file is not a context file.
 */
export declare function getLimitsForFile(filePath: string): ContextFileLimits | undefined;
/**
 * Validate context file size limits.
 * Returns empty array if file is not a context file.
 */
export declare function validateContextLimits(filePath: string, content: string): ValidationError[];
/**
 * Generate a summary of context file usage.
 * Useful for understanding total context budget consumption.
 */
export declare function summarizeContextUsage(files: Array<{
    path: string;
    content: string;
}>): {
    totalLines: number;
    totalTokens: number;
    files: Array<{
        path: string;
        lines: number;
        tokens: number;
        limits?: ContextFileLimits;
    }>;
};
//# sourceMappingURL=context-limits.d.ts.map