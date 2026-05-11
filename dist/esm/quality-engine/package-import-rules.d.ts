/**
 * Package Import Rules
 *
 * Pure shared detection logic for identifying duplicate shared-function definitions.
 * No hook-specific types or Claude runtime dependencies.
 *
 * Consumed by:
 * - @webpresso/claude-hooks (pretool-guard validator, thin adapter)
 * - CI scripts (future)
 *
 * @module
 */
/** Single shared function definition */
export interface SharedFunction {
    /** Function name to detect */
    name: string;
    /** Package to import from */
    package: string;
    /** Subpath export (e.g., 'string', 'date'); empty string means package root */
    source: string;
    /** Category for grouping */
    category: 'string' | 'date' | 'duration' | 'format' | 'id' | 'error' | 'validation';
}
/** Structured blocked result for machine parsing */
export interface BlockedResult {
    /** Function name that was duplicated */
    functionName: string;
    /** Suggested import statement */
    suggestion: string;
    /** Package to import from */
    package: string;
    /** Source module path */
    source: string;
    /** Human-readable message */
    message: string;
}
/**
 * Shared function registry - single source of truth for detectable utilities.
 * These functions are available in shared packages and should not be redefined locally.
 */
export declare const SHARED_FUNCTIONS: SharedFunction[];
/** Set of function names for O(1) lookup */
export declare const SHARED_FUNCTION_NAMES: Set<string>;
/**
 * Extracts function definitions from TypeScript code content.
 * Detects:
 * - Function declarations: `function capitalize(...)`
 * - Const arrow functions: `const capitalize = (...)`
 * - Const function expressions: `const capitalize = function(...)`
 */
export declare function extractFunctionDefinitions(content: string): string[];
/**
 * Finds duplicate functions that exist in shared packages.
 * Pure function — accepts file content string, returns matching registry entries.
 */
export declare function findDuplicateFunctions(fileContent: string): SharedFunction[];
/**
 * Creates a blocked result for a duplicate function.
 * Returns a plain object suitable for use by CI scripts and hook adapters.
 */
export declare function createBlockedResult(sharedFunc: SharedFunction): BlockedResult;
//# sourceMappingURL=package-import-rules.d.ts.map