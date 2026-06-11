/**
 * Package Import Rules
 *
 * Pure shared detection logic for identifying duplicate shared-function definitions.
 * No hook-specific types or Claude runtime dependencies.
 *
 * Consumed by:
 * - hook validators (thin adapters)
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
export type PackageImportProfile = 'generic' | 'webpresso';
export interface PackageImportRuleOptions {
    profile?: PackageImportProfile;
}
export declare const SHARED_FUNCTION_PROFILES: Record<PackageImportProfile, SharedFunction[]>;
/**
 * Default generic shared function registry. Product-specific rules must opt into
 * a profile explicitly instead of leaking through the generic surface.
 */
export declare const SHARED_FUNCTIONS: SharedFunction[];
/** Set of function names for O(1) lookup in the default generic profile */
export declare const SHARED_FUNCTION_NAMES: Set<string>;
export declare function getSharedFunctions(profile?: PackageImportProfile): SharedFunction[];
export declare function getSharedFunctionNames(profile?: PackageImportProfile): Set<string>;
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
export declare function findDuplicateFunctions(fileContent: string, options?: PackageImportRuleOptions): SharedFunction[];
/**
 * Creates a blocked result for a duplicate function.
 * Returns a plain object suitable for use by CI scripts and hook adapters.
 */
export declare function createBlockedResult(sharedFunc: SharedFunction): BlockedResult;
//# sourceMappingURL=package-import-rules.d.ts.map