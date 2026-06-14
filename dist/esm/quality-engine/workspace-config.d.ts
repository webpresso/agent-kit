/**
 * Workspace Configuration
 *
 * Single source of truth for workspace path patterns and path-based checks.
 * Consolidates duplicated patterns from typecheck.ts, qa.ts, test.ts, and pre-commit hook.
 *
 * @module
 */
/**
 * Patterns to extract package paths from file paths.
 * Used by typecheck, qa, and lint commands to scope checks to affected packages.
 *
 * Previously duplicated in:
 * - apps/cli2/src/commands/typecheck.ts (PACKAGE_PATTERNS)
 * - apps/cli2/src/commands/qa.ts (PACKAGE_PATTERNS)
 */
export declare const PACKAGE_PATTERNS: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
/**
 * Extract the package path from a file path.
 */
export declare function extractPackagePath(filePath: string): string | null;
/**
 * Detect which project root a file belongs to based on its path.
 * Uses PACKAGE_PATTERNS to auto-detect — all packages with # support work automatically.
 */
export declare function detectProjectRoot(filePath: string): string | undefined;
/**
 * Configuration for a path-based check.
 * Used by pre-commit hook to run targeted tests when specific files change.
 *
 * Previously in: .husky/pre-commit (PATH_CHECKS array with § delimiter - fragile!)
 */
export interface PathCheck {
    /** Regex pattern to match staged file paths */
    pattern: RegExp;
    /** Emoji for display */
    emoji: string;
    /** Human-readable name */
    name: string;
    /** Command to execute (use 'just' commands) */
    command: string;
    /** Optional setup command (run in background before tests) */
    setupCommand?: string;
    /** Optional health check URL for setup verification */
    healthUrl?: string;
}
/**
 * Path-based checks configuration.
 * When staged files match the pattern, the corresponding command runs.
 *
 * Note: All commands should use 'just' (Just-First principle).
 */
export declare const PATH_CHECKS: PathCheck[];
/**
 * Validate a path check configuration.
 * Returns error message if invalid, undefined if valid.
 */
export declare function validatePathCheck(check: PathCheck): string | undefined;
/**
 * Validate all path checks.
 * Throws if any check is invalid.
 */
export declare function validateAllPathChecks(): void;
/**
 * Find matched path checks for a list of files.
 */
export declare function getMatchedPathChecks(files: string[]): PathCheck[];
//# sourceMappingURL=workspace-config.d.ts.map