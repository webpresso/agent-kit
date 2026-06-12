/**
 * Context information for inferring code language
 */
export interface CodeBlockContext {
    /** Text preceding the code block (e.g., heading, paragraph) */
    precedingText?: string;
    /** File path if mentioned in context */
    filePath?: string;
    /** Line number where code block starts */
    line?: number;
}
/**
 * Result of language inference
 */
export interface LanguageInference {
    /** Inferred language identifier */
    language: string;
    /** Confidence level (0-1) */
    confidence: number;
    /** Reason for inference */
    reason: string;
}
/**
 * Infer the programming language of a code block
 */
export declare function inferCodeLanguage(codeContent: string, context?: CodeBlockContext): LanguageInference;
/**
 * Find and fix code blocks without language specifiers in markdown content
 */
export declare function fixCodeBlockLanguages(content: string, filePath: string, minConfidence?: number): {
    fixed: string;
    changes: number;
};
//# sourceMappingURL=code-language.d.ts.map