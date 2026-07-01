import type { ValidationError } from "./types.js";
/**
 * Result of finding wrong task headers.
 */
interface WrongTaskHeaderResult {
    count: number;
    firstLineNumber: number | null;
}
/**
 * Find tasks using ### (3 hashes) instead of #### (4 hashes).
 * Exported for testability.
 */
export declare function findWrongTaskHeaders(content: string): WrongTaskHeaderResult;
/**
 * Find malformed task IDs (#### Task without X.Y format).
 * Exported for testability.
 */
export declare function findMalformedTaskIds(content: string): number;
/**
 * Result of checking dependency format.
 */
interface DependencyCheckResult {
    hasBareReferences: boolean;
    exampleLine: string | null;
}
/**
 * Check if dependencies use bare "X.Y" instead of "Task X.Y".
 * Exported for testability.
 */
export declare function checkDependencyFormat(content: string): DependencyCheckResult;
/**
 * Extract frontmatter from document content.
 * Exported for testability.
 */
export declare function extractFrontmatter(content: string): Record<string, string> | null;
/**
 * Detect if plan is completed based on frontmatter and file path.
 * Exported for testability.
 */
export declare function isCompleted(filePath: string, content: string): boolean;
/**
 * Extract complexity from frontmatter, defaulting to 'M'.
 * Exported for testability.
 */
export declare function extractComplexity(content: string): string;
/**
 * Check if Completion Summary section exists.
 * Exported for testability.
 */
export declare function hasCompletionSummary(content: string): boolean;
/**
 * Extract Lessons Learned content from document.
 * Returns null if section not found, otherwise returns content after heading.
 * Exported for testability.
 */
export declare function extractLessonsLearnedContent(content: string): string | null;
/**
 * Validate Lessons Learned content length (≥50 non-whitespace chars).
 * Exported for testability.
 */
export declare function validateLessonsLearnedContent(content: string | null): boolean;
/**
 * Check if Lessons Learned appears after Completion Summary.
 * Exported for testability.
 */
export declare function validateLessonsLearnedPlacement(content: string): boolean;
/**
 * Validate Blueprint plan format for implementation plans.
 *
 * Only runs on files with doc type `blueprint`.
 * Returns array of validation errors found.
 *
 * @param filePath - File path for error reporting
 * @param content - File content to validate
 * @param docType - Document type from frontmatter
 * @returns Array of validation errors (empty if valid)
 */
export declare function validateBlueprintPlan(filePath: string, content: string, docType: string): ValidationError[];
export {};
//# sourceMappingURL=blueprint-plan.d.ts.map