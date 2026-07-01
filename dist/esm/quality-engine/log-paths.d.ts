import { type ResolvedTarget } from "./target-resolver.js";
export interface GenerateLogPathOptions {
    context?: string;
    logsDir?: string;
    includeDateFolder?: boolean;
    now?: Date;
}
export interface ExtractLogContextOptions {
    packageContext?: (filters: string[]) => string | undefined;
    fileContext?: (files: string[]) => string | undefined;
}
/**
 * Generate a timestamped log file path for quality commands.
 *
 * Log naming convention:
 *   logs/DD-MM-YYYY/HH-MM-SS_command[-context].log
 *
 * Examples:
 *   logs/12-02-2026/14-23-45_lint.log              # Full workspace lint
 *   logs/12-02-2026/14-25-30_lint-cli2.log         # Package-scoped lint
 *   logs/12-02-2026/14-30-08_test-1770922337.log   # File-scoped test (unix timestamp)
 *   logs/12-02-2026/19-52-00_typecheck.log         # Full workspace typecheck
 *
 * @param command - The quality command being run
 * @param options - Configuration options
 * @returns Relative path to log file (e.g., "logs/12-02-2026/14-23-45_test.log")
 */
export declare function generateLogPath(command: "test" | "lint" | "typecheck" | "qa" | "build", options?: GenerateLogPathOptions): string;
export declare function extractPackageLogContext(filter: string): string | undefined;
export declare function defaultPackageLogContext(filters: string[]): string | undefined;
/**
 * Extract context string from resolved target for log naming.
 *
 * Context extraction rules:
 * - Full workspace (no targets): No context suffix
 * - Package scope: Use package name(s) - "cli2" or "cli2-config"
 * - File scope: Use unix timestamp (paths too complex to encode)
 * - QA command: No context (always full workspace)
 *
 * @param resolved - Resolved command target
 * @returns Context string for log filename, or undefined for no context
 */
export declare function extractLogContext(resolved: ResolvedTarget, options?: ExtractLogContextOptions): string | undefined;
//# sourceMappingURL=log-paths.d.ts.map